// packages/agent/src/loop.ts
/**
 * Agent Loop - Agent 执行引擎
 *
 * 实现核心的 Agent 执行循环：
 * 1. Gather Context - 收集上下文
 * 2. Take Action - 执行动作（调用 LLM 或工具）
 * 3. Verify Results - 验证结果
 *
 * 最多执行 10 次迭代，确保任务完成或达到最大限制
 */

import type { Agent, AgentContext, Task } from '@tramber/shared';
import type { AIProvider } from '@tramber/provider';
import type { ToolRegistry } from '@tramber/tool';
import type { PermissionChecker } from '@tramber/permission';

export interface AgentLoopOptions {
  agent: Agent;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  permissionChecker?: PermissionChecker | undefined;
  maxIterations?: number;
  onStep?: (step: AgentLoopStep) => void;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string) => Promise<boolean>;
}

export interface AgentLoopStep {
  iteration: number;
  phase: 'context' | 'action' | 'verify';
  content?: string;
  toolCall?: { name: string; parameters: Record<string, unknown> };
  toolResult?: { success: boolean; data?: unknown; error?: string };
  thinking?: string;
}

export interface AgentLoopResult {
  success: boolean;
  finalAnswer?: string;
  steps: AgentLoopStep[];
  iterations: number;
  error?: string;
  terminatedReason?: 'completed' | 'max_iterations' | 'error';
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
   */
  private async runLoop(context: AgentContext): Promise<AgentLoopResult> {
    // 从当前迭代次数继续
    const startIteration = context.iterations ?? 0;

    for (let i = startIteration; i < this.options.maxIterations; i++) {
      context.iterations = i + 1;

      // Phase 1: Gather Context
      await this.gatherContext(context);

      // Phase 2: 调用 LLM
      const response = await this.callLLM(context);
      const content = response.content || '';

      // Phase 2.5: 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        console.error('[DEBUG] Tool calls received:', response.toolCalls.map(t => t.name));

        // 先检查权限（如果有权限检查器）
        if (this.options.permissionChecker) {
          console.error('[DEBUG] Checking permissions...');
          const permissionCheck = await this.checkPermissions(response.toolCalls);
          console.error('[DEBUG] Permission check result:', JSON.stringify(permissionCheck));

          if (permissionCheck.requiresConfirmation) {
            console.error('[DEBUG] Requires confirmation, calling callback...');

            // 调用回调请求用户确认
            if (this.options.onPermissionRequired) {
              const confirmed = await this.options.onPermissionRequired(
                response.toolCalls[0],
                permissionCheck.operation || 'unknown'
              );

              if (!confirmed) {
                // 用户拒绝
                return {
                  success: false,
                  error: '用户拒绝了权限请求',
                  steps: [...this.steps],
                  iterations: i + 1,
                  terminatedReason: 'completed'
                };
              }
              // 用户确认，继续执行工具
            } else {
              // 没有回调，默认拒绝
              return {
                success: false,
                error: `需要权限确认: ${permissionCheck.operation || 'unknown'}`,
                steps: [...this.steps],
                iterations: i + 1,
                terminatedReason: 'completed'
              };
            }
          }
        }

        console.error('[DEBUG] Executing tools...');
        const toolResult = await this.executeToolCalls(response.toolCalls);
        console.error('[DEBUG] Tool results:', JSON.stringify(toolResult));

        // 将助手消息（包含工具调用）添加到上下文
        context.messages.push({
          role: 'assistant',
          content: content || `[调用 ${response.toolCalls.length} 个工具]`
        });

        // 将工具结果添加到上下文
        const toolResultsText = toolResult.results.map((r: { toolCall: { name: string }; success: boolean; data?: unknown; error?: string }) => {
          if (r.success) {
            return `- ${r.toolCall.name}: ${JSON.stringify(r.data).slice(0, 500)}`;
          }
          return `- ${r.toolCall.name}: 失败 - ${r.error}`;
        }).join('\n');

        context.messages.push({
          role: 'user',
          content: `工具执行结果:\n${toolResultsText}`
        });

        // 继续循环，让 AI 基于工具结果生成新的响应
        continue;
      }

      // Phase 3: 解析响应标记
      const marker = this.extractMarker(content);

      // 没有标记 - 接受响应，返回给用户
      if (!marker) {
        return {
          success: true,
          finalAnswer: content,
          steps: [...this.steps],
          iterations: i + 1,
          terminatedReason: 'completed'
        };
      }

      // 检查是否是有效标记
      if (!this.isValidMarker(marker)) {
        // 无效标记，要求重新生成
        context.messages.push({
          role: 'assistant',
          content
        });
        context.messages.push({
          role: 'user',
          content: `错误：标记 "[${marker}]" 无效。可用的对话控制标记：[task-summary], [wait-user-choice], [task-complete]。请重新生成响应。`
        });
        continue;
      }

      // 处理对话控制标记 - 返回给用户
      if (this.isConversationMarker(marker)) {
        return {
          success: true,
          finalAnswer: content,
          steps: [...this.steps],
          iterations: i + 1,
          terminatedReason: 'completed'
        };
      }

      // 未知标记 - 要求重新生成
      context.messages.push({
        role: 'assistant',
        content
      });
      context.messages.push({
        role: 'user',
        content: `错误：标记 "[${marker}]" 无效。可用的对话控制标记：[task-summary], [wait-user-choice], [task-complete]。请重新生成响应。`
      });
      continue;
    }

    // 达到最大迭代次数
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
   * 解析响应标记并自动执行工具，直到遇到对话控制标记
   */
  async execute(task: Task): Promise<AgentLoopResult> {
    this.steps = [];

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

      // 运行主循环
      return await this.runLoop(context);

    } catch (error) {
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
   * 提取响应开头的标记
   */
  private extractMarker(content: string): string | null {
    const match = content.match(/^\[([\w-]+)\]/);
    return match ? match[1] : null;
  }

  /**
   * 检查是否是有效标记
   */
  private isValidMarker(marker: string | null): marker is string {
    if (!marker) return false;
    const validMarkers = [
      'task-summary', 'wait-user-choice', 'task-complete'
    ];
    return validMarkers.includes(marker);
  }

  /**
   * 检查是否是对话控制标记
   */
  private isConversationMarker(marker: string | null): boolean {
    if (!marker) return false;
    return ['task-summary', 'wait-user-choice', 'task-complete'].includes(marker);
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
    requiresConfirmation: boolean;
    operation?: string;
  }> {
    if (!this.options.permissionChecker) {
      return { requiresConfirmation: false };
    }

    for (const toolCall of toolCalls) {
      const operation = this.getOperationType(toolCall.name) as keyof import('@tramber/shared').ToolPermissions;
      const permissionResult = await this.options.permissionChecker.checkToolPermission(
        toolCall.name,
        operation,
        toolCall.parameters
      );

      if (permissionResult.requiresConfirmation) {
        return {
          requiresConfirmation: true,
          operation: String(operation)
        };
      }

      if (!permissionResult.allowed) {
        return {
          requiresConfirmation: false
        };
      }
    }

    return { requiresConfirmation: false };
  }

  /**
   * 获取工具对应的操作类型
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

  /**
   * 从错误信息中提取操作类型
   */
  private extractOperationFromError(error: string): string {
    const match = error.match(/操作\s+(\S+)\s+需要用户确认/);
    return match ? match[1] : 'unknown';
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
    return `你是一个编程助手 ${this.options.agent.name}，${this.options.agent.description}。

## 你的能力
- 使用工具读取文件、搜索内容、执行命令
- 分析代码结构，理解项目需求
- 帮助用户完成编程任务

## 对话控制标记

当需要与用户交互时，使用以下标记开头：

### [task-summary]
报告操作结果或当前进度。
使用场景：执行完操作后，向用户报告结果。

### [wait-user-choice]
需要用户提供更多信息或做出选择。
使用场景：需要用户补充信息、选择选项、确认操作等。

### [task-complete]
任务完全完成，给出最终总结。
使用场景：任务已完成，可以结束对话。

## 工具使用

系统已配置以下工具，你可以在需要时调用：
${this.options.toolRegistry.list().map(t => `- **${t.id}**: ${t.description}`).join('\n')}

## 响应规则

1. **直接执行操作**：使用工具时直接输出结果，无需使用标记
2. **对话时使用标记**：需要与用户交互时，使用上述对话控制标记
3. **清晰简洁**：报告结果时清晰明了，避免冗余

## 示例

用户：读取 package.json
助手：[task-summary]
✓ 已读取 package.json，包含以下依赖：
- react: ^18.2.0
- typescript: ^5.0.0

用户：帮我分析这个项目
助手：[wait-user-choice]
为了更好地帮你分析，请告诉我：
1. 你想了解项目的哪些方面？（架构/技术栈/功能）
2. 有没有特定的问题需要解决？
`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
