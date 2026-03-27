// packages/agent/src/loop.ts
/**
 * Agent Loop - Agent 执行引擎
 *
 * 实现核心的 Agent 执行循环：
 * 1. Gather Context - 收集上下文
 * 2. Take Action - 执行动作（调用 LLM 或工具）
 * 3. 执行工具并继续
 *
 * 简化控制逻辑：
 * - 有工具调用 → 执行并继续
 * - 无工具调用 → 输出给用户，等待回应
 */

import type { Agent, AgentContext, Task } from '@tramber/shared';
import type { AIProvider } from '@tramber/provider';
import type { ToolRegistry } from '@tramber/tool';
import type { PermissionChecker } from '@tramber/permission';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export interface AgentLoopOptions {
  agent: Agent;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  permissionChecker?: PermissionChecker | undefined;
  maxIterations?: number;
  onStep?: (step: AgentLoopStep) => void;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
}

export interface AgentLoopStep {
  iteration: number;
  phase: 'context' | 'action' | 'verify';
  content?: string;
  toolCall?: { name: string; parameters: Record<string, unknown> };
  toolResult?: { success: boolean; data?: unknown; error?: string };
  thinking?: string;
}

/**
 * Agent Loop 执行结果 - 使用 discriminated union 确保类型安全
 */
export type AgentLoopResult =
  | AgentLoopSuccess
  | AgentLoopFailed
  | AgentLoopMaxIterations;

/**
 * 成功完成
 */
export interface AgentLoopSuccess {
  success: true;
  finalAnswer: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'completed';
}

/**
 * 执行失败
 */
export interface AgentLoopFailed {
  success: false;
  error: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'error';
}

/**
 * 达到最大迭代次数
 */
export interface AgentLoopMaxIterations {
  success: false;
  error: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'max_iterations';
}

export class AgentLoop {
  private options: Omit<AgentLoopOptions, 'maxIterations' | 'onStep'> & {
    maxIterations: number;
    onStep: (step: AgentLoopStep) => void;
  };
  private steps: AgentLoopStep[] = [];

  constructor(options: AgentLoopOptions) {
    this.options = {
      maxIterations: options.maxIterations ?? 10,
      onStep: options.onStep ?? (() => { }),
      agent: options.agent,
      provider: options.provider,
      toolRegistry: options.toolRegistry,
      permissionChecker: options.permissionChecker,
      onPermissionRequired: options.onPermissionRequired
    };
  }

  /**
   * 运行主循环
   *
   * 简化逻辑：
   * - 有工具调用 → 执行并继续
   * - 无工具调用 → 输出给用户，等待回应
   */
  private async runLoop(context: AgentContext): Promise<AgentLoopResult> {
    // 从当前迭代次数继续
    const startIteration = context.iterations ?? 0;

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Agent loop started', {
      maxIterations: this.options.maxIterations,
      startIteration
    });

    for (let i = startIteration; i < this.options.maxIterations; i++) {
      context.iterations = i + 1;

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Iteration ${i + 1}/${this.options.maxIterations} started`);

      // Phase 1: Gather Context
      await this.gatherContext(context);

      // Phase 2: 调用 LLM
      const response = await this.callLLM(context);
      const content = response.content || '';

      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, 'LLM response received', {
        hasContent: !!content,
        contentLength: content.length,
        toolCallsCount: response.toolCalls?.length ?? 0
      });

      // Phase 3: 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Processing ${response.toolCalls.length} tool calls`);

        // 先检查权限（如果有权限检查器）
        if (this.options.permissionChecker) {
          const permissionCheck = await this.checkPermissions(response.toolCalls);

          // 检查权限是否被明确拒绝
          if (permissionCheck.allowed === false) {
            debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Permission denied, stopping execution');
            return {
              success: false,
              error: permissionCheck.reason || '权限被拒绝',
              steps: [...this.steps],
              iterations: i + 1,
              terminatedReason: 'error'
            };
          }

          if (permissionCheck.requiresConfirmation) {
            debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Requesting user permission confirmation');
            // 调用回调请求用户确认
            debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Checking onPermissionRequired callback', {
              hasCallback: !!this.options.onPermissionRequired
            });

            if (this.options.onPermissionRequired) {
              debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Calling onPermissionRequired callback', {
                tool: response.toolCalls[0].name,
                operation: permissionCheck.operation
              });

              const confirmed = await this.options.onPermissionRequired(
                response.toolCalls[0],
                permissionCheck.operation || 'unknown',
                permissionCheck.reason
              );

              debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'User permission decision', { confirmed });

              if (!confirmed) {
                debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'User rejected permission request');
                // 用户拒绝
                return {
                  success: false,
                  error: '用户拒绝了权限请求',
                  steps: [...this.steps],
                  iterations: i + 1,
                  terminatedReason: 'error'
                };
              }
              // 用户确认，继续执行工具
            } else {
              // 没有回调，默认拒绝
              debug(NAMESPACE.AGENT_LOOP, LogLevel.ERROR, 'No onPermissionRequired callback provided');
              return {
                success: false,
                error: `需要权限确认: ${permissionCheck.operation || 'unknown'}`,
                steps: [...this.steps],
                iterations: i + 1,
                terminatedReason: 'error'
              };
            }
          }
        }

        // 执行工具前，发送 step 通知（让用户知道要做什么）
        for (const toolCall of response.toolCalls) {
          const preStep: AgentLoopStep = {
            iteration: i + 1,
            phase: 'action',
            content: `调用工具: ${toolCall.name}`,
            toolCall: { name: toolCall.name, parameters: toolCall.parameters }
          };
          this.addStep(preStep);
          this.options.onStep(preStep);
        }

        const toolResult = await this.executeToolCalls(response.toolCalls);

        debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, 'Tool execution completed', {
          total: toolResult.results.length,
          successful: toolResult.results.filter((r: any) => r.success).length,
          failed: toolResult.results.filter((r: any) => !r.success).length
        });

        // 执行工具后，发送 step 通知（让用户知道结果）
        for (const result of toolResult.results) {
          const postStep: AgentLoopStep = {
            iteration: i + 1,
            phase: 'verify',
            content: result.success ? `${result.toolCall.name} 执行成功` : `${result.toolCall.name} 执行失败: ${result.error}`,
            toolResult: { success: result.success, data: result.data, error: result.error }
          };
          this.addStep(postStep);
          this.options.onStep(postStep);
        }

        // 将助手消息（包含工具调用）添加到上下文
        context.messages.push({
          role: 'assistant',
          content: content || `[调用 ${response.toolCalls.length} 个工具]`
        });

        // 将工具结果添加到上下文
        const toolResultsText = toolResult.results.map((r: { toolCall: { name: string }; success: boolean; data?: unknown; error?: string }) => {
          if (r.success) {
            const dataStr = JSON.stringify(r.data ?? 'null');
            return `- ${r.toolCall.name}: ${dataStr.slice(0, 500)}${dataStr.length > 500 ? '...' : ''}`;
          }
          return `- ${r.toolCall.name}: 失败 - ${r.error}`;
        }).join('\n');

        context.messages.push({
          role: 'user',
          content: `工具执行结果:\n${toolResultsText}`
        });

        // 继续循环，让 AI 基于工具结果生成新的响应
        debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Continuing to next iteration');
        continue;
      }

      // 没有工具调用 - 输出给用户，等待回应
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'No tool calls, returning final answer to user');
      return {
        success: true,
        finalAnswer: content,
        steps: [...this.steps],
        iterations: i + 1,
        terminatedReason: 'completed'
      };
    }

    // 达到最大迭代次数
    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Max iterations reached', {
      maxIterations: this.options.maxIterations
    });
    return {
      success: false,
      steps: [...this.steps],
      iterations: this.options.maxIterations,
      terminatedReason: 'max_iterations',
      error: 'Maximum iterations reached without completion'
    };
  }

  /**
   * 执行一次用户请求
   *
   * 自动执行工具调用，直到 AI 不再使用工具
   * 然后将输出返回给用户，等待用户下一步指令
   */
  async execute(task: Task): Promise<AgentLoopResult> {
    this.steps = [];

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Executing task', {
      taskId: task.id,
      description: task.description
    });

    try {
      // 初始化 Agent 上下文
      const context: AgentContext = {
        task,
        messages: [],
        memory: new Map(),
        iterations: 0,
        files: [],
        projectInfo: {
          rootPath: process.cwd(),
          name: 'project'
        },
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0
        },
        experiences: []
      };

      // 添加系统提示和用户任务
      context.messages.push({
        role: 'system',
        content: this.buildSystemPrompt()
      });
      context.messages.push({
        role: 'user',
        content: task.description
      });

      debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Agent context initialized', {
        messageCount: context.messages.length,
        projectRoot: context.projectInfo.rootPath
      });

      // 运行主循环
      const result = await this.runLoop(context);

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Task execution completed', {
        success: result.success,
        iterations: result.iterations,
        reason: result.terminatedReason
      });

      return result;

    } catch (error) {
      debugError(NAMESPACE.AGENT_LOOP, 'Task execution failed', error);
      return {
        success: false,
        steps: [...this.steps],
        iterations: this.steps.length,
        terminatedReason: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(context: AgentContext): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; parameters: Record<string, unknown> }> }> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'action'
    };

    try {
      const toolDefinitions = this.options.toolRegistry.list().map(tool => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as Record<string, unknown>
      }));

      const response = await this.options.provider.chat({
        messages: context.messages,
        tools: toolDefinitions,
        temperature: this.options.agent.temperature ?? 0.7,
        maxTokens: this.options.agent.maxTokens ?? 4096
      });

      step.thinking = response.content;
      this.addStep(step);
      this.options.onStep(step);

      return response;
    } catch (error) {
      step.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.addStep(step);
      this.options.onStep(step);
      return { content: '', toolCalls: undefined };
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(toolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }>): Promise<{
    results: Array<{ toolCall: typeof toolCalls[0]; success: boolean; data?: unknown; error?: string }>;
  }> {
    const results: Array<{ toolCall: typeof toolCalls[0]; success: boolean; data?: unknown; error?: string }> = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.options.toolRegistry.execute(toolCall.name, toolCall.parameters);
        results.push({
          toolCall,
          success: result.success,
          data: result.data,
          error: result.error
        });
      } catch (error) {
        results.push({
          toolCall,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { results };
  }

  /**
   * 检查工具调用权限
   */
  private async checkPermissions(toolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }>): Promise<{
    allowed?: boolean;
    requiresConfirmation: boolean;
    operation?: string;
    reason?: string;
  }> {
    if (!this.options.permissionChecker) {
      debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'No permission checker, skipping check');
      return { requiresConfirmation: false };
    }

    for (const toolCall of toolCalls) {
      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, 'Checking permission for tool', {
        tool: toolCall.name,
        parameters: Object.keys(toolCall.parameters)
      });

      // 优先从 Tool 定义获取权限类型
      const tool = this.options.toolRegistry.get(toolCall.name);
      let operation: keyof import('@tramber/shared').ToolPermissions;

      if (tool?.permission?.operation) {
        operation = tool.permission.operation;
      } else {
        // 回退到基于工具名称的推断
        operation = this.getOperationType(toolCall.name) as keyof import('@tramber/shared').ToolPermissions;
      }

      debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Permission operation type', {
        tool: toolCall.name,
        operation
      });

      const permissionResult = await this.options.permissionChecker.checkToolPermission(
        toolCall.name,
        operation,
        toolCall.parameters
      );

      debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Permission check result', {
        tool: toolCall.name,
        allowed: permissionResult.allowed,
        requiresConfirmation: permissionResult.requiresConfirmation
      });

      if (permissionResult.requiresConfirmation) {
        debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Permission requires user confirmation', {
          tool: toolCall.name,
          operation
        });
        return {
          allowed: true,
          requiresConfirmation: true,
          operation: String(operation)
        };
      }

      if (!permissionResult.allowed) {
        debugError(NAMESPACE.AGENT_LOOP, `Permission denied for tool: ${toolCall.name}`, {
          tool: toolCall.name,
          operation,
          reason: permissionResult.reason
        });
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: permissionResult.reason
        };
      }
    }

    debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, 'All permissions granted');
    return { allowed: true, requiresConfirmation: false };
  }

  /**
   * 获取工具对应的操作类型（回退方法）
   * 当 Tool 没有声明 permission 时使用
   */
  private getOperationType(toolId: string): string {
    if (toolId.startsWith('read') || toolId.startsWith('get')) {
      return 'file_read';
    }
    if (toolId.startsWith('write') || toolId.startsWith('create') || toolId.startsWith('edit')) {
      return 'file_write';
    }
    if (toolId.startsWith('delete') || toolId.startsWith('remove')) {
      return 'file_delete';
    }
    if (toolId.startsWith('rename') || toolId.startsWith('move')) {
      return 'file_rename';
    }
    return 'command_execute';
  }

  private async gatherContext(context: AgentContext): Promise<void> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'context'
    };

    // 收集工具可用性信息
    const availableTools = this.options.toolRegistry.list();
    context.memory?.set('available_tools', availableTools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category
    })));

    step.content = `Gathered context: ${availableTools.length} tools available`;
    this.addStep(step);
    this.options.onStep(step);
  }

  private buildSystemPrompt(): string {
    const cwd = process.cwd();
    return `你是一个编程助手 ${this.options.agent.name}，${this.options.agent.description}。

## 工作环境
- 当前工作目录: ${cwd}
- 文件路径可以是相对路径（相对于当前工作目录）或绝对路径

## 你的能力
- 使用工具读取文件、搜索内容、执行命令
- 分析代码结构，理解项目需求
- 帮助用户完成编程任务

## 工作方式
1. 当需要执行操作时（如读取文件、写入文件、搜索内容），调用相应工具
2. 工具执行完毕后，系统会自动将结果返回给你
3. 基于工具结果继续执行任务，或向用户报告进度
4. 当需要用户提供更多信息时，直接询问
5. 使用 pwd 工具可以获取当前工作目录

## 可用工具
${this.options.toolRegistry.list().map(t => `- **${t.id}**: ${t.description}`).join('\n')}

## 示例

用户：读取 package.json
助手：[调用 read_file 工具]
系统：[返回文件内容]
助手：✓ 已读取 package.json，包含以下依赖：
- react: ^18.2.0
- typescript: ^5.0.0
`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
