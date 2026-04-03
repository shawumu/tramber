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
import type { SkillManifest } from '@tramber/skill';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import {
  createConversation,
  addMessage,
  getMessagesForLLM,
  updateTokenUsage,
  manageContextWindow,
  type Conversation
} from './conversation.js';
import { ContextBuffer, type ContextSnapshot } from './context-buffer.js';

export interface AgentLoopOptions {
  agent: Agent;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  permissionChecker?: PermissionChecker | undefined;
  maxIterations?: number;
  onStep?: (step: AgentLoopStep) => void;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
  /** 是否流式输出 */
  stream?: boolean;
  /** 用户安装的 Skill 列表（注入系统提示词） */
  userSkills?: SkillManifest[];
  /** 上下文缓冲区（调试用） */
  contextBuffer?: ContextBuffer;
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
    stream: boolean;
  };
  private steps: AgentLoopStep[] = [];
  private contextBuffer?: ContextBuffer;

  constructor(options: AgentLoopOptions) {
    this.options = {
      maxIterations: options.maxIterations ?? 10,
      onStep: options.onStep ?? (() => { }),
      stream: options.stream ?? false,
      agent: options.agent,
      provider: options.provider,
      toolRegistry: options.toolRegistry,
      permissionChecker: options.permissionChecker,
      onPermissionRequired: options.onPermissionRequired,
      userSkills: options.userSkills
    };
    this.contextBuffer = options.contextBuffer;
  }

  /**
   * 运行主循环
   *
   * 简化逻辑：
   * - 有工具调用 → 执行并继续
   * - 无工具调用 → 输出给用户，等待回应
   */
  private async runLoop(context: AgentContext, conversation: Conversation): Promise<AgentLoopResult> {
    // 从当前迭代次数继续
    const startIteration = context.iterations ?? 0;

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '=== RUNLOOP START DEBUG ===', {
      startIteration,
      maxIterations: this.options.maxIterations,
      contextMessageCount: context.messages.length,
      conversationMessageCount: conversation.messages.length,
      lastMessage: conversation.messages.length > 0
        ? {
            role: conversation.messages[conversation.messages.length - 1].role,
            contentPreview: conversation.messages[conversation.messages.length - 1].content.slice(0, 150).replace(/\n/g, '\\n')
          }
        : null
    });

    for (let i = startIteration; i < this.options.maxIterations; i++) {
      context.iterations = i + 1;

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Iteration ${i + 1}/${this.options.maxIterations} started`);

      // Phase 1: Gather Context
      await this.gatherContext(context);

      // Phase 2: 调用 LLM
      const response = this.options.stream
        ? await this.callLLMStream(context)
        : await this.callLLM(context);
      const content = response.content || '';

      // 更新 token 使用量
      if (response.usage) {
        updateTokenUsage(conversation, response.usage);
      }

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

        // 将助手消息添加到上下文和 conversation（仅当有内容时）
        if (content && content.trim()) {
          context.messages.push({ role: 'assistant', content });
          addMessage(conversation, { role: 'assistant', content });
        }

        // 将工具结果添加到上下文和 conversation
        const MAX_TOOL_RESULT_CHARS = 8000;
        const toolResultsText = toolResult.results.map((r: { toolCall: { name: string }; success: boolean; data?: unknown; error?: string }) => {
          if (r.success) {
            const dataStr = r.data ? JSON.stringify(r.data) : 'Success';
            return `${r.toolCall.name}: ${dataStr.slice(0, MAX_TOOL_RESULT_CHARS)}${dataStr.length > MAX_TOOL_RESULT_CHARS ? '... (truncated)' : ''}`;
          }
          // 失败时构造清晰的错误信息
          let errorMsg = r.error;
          if (!errorMsg && r.data) {
            // 从 data 中提取错误信息（适用于 exec 等工具）
            const d = r.data as { command?: string; exitCode?: number | null; stdout?: string; stderr?: string };
            if (d.stderr) {
              errorMsg = d.stderr.trim();
            } else if (d.exitCode !== null && d.exitCode !== 0) {
              errorMsg = `Exit code ${d.exitCode}`;
            } else {
              errorMsg = 'Unknown error';
            }
            if (d.command) {
              errorMsg = `Command "${d.command}" failed: ${errorMsg}`;
            }
          }
          if (!errorMsg) errorMsg = 'Unknown error';

          // 附加工具的 required 参数提示，帮助 LLM 自我修正
          const tool = this.options.toolRegistry.get(r.toolCall.name);
          const requiredHint = tool?.inputSchema?.required?.length
            ? `\n  Required parameters: ${tool.inputSchema.required.join(', ')}`
            : '';
          return `${r.toolCall.name}: 失败 - ${errorMsg}${requiredHint}`;
        }).join('\n');

        const toolResultMsg = `工具执行结果:\n${toolResultsText}`;
        context.messages.push({ role: 'user', content: toolResultMsg });
        addMessage(conversation, { role: 'user', content: toolResultMsg });

        // 记录工具结果到日志
        for (const r of toolResult.results) {
          if (r.success) {
            const dataStr = r.data ? JSON.stringify(r.data).slice(0, 500) : 'Success';
            debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[TOOL RESULT]', `${r.toolCall.name}: ${dataStr}`);
          } else {
            debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[TOOL RESULT]', `${r.toolCall.name}: FAILED - ${r.error}`);
          }
        }

        // DEBUG: 打印添加后的消息列表
        debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== TOOL RESULT ADDED DEBUG ===', {
          messageCount: context.messages.length,
          lastMessage: {
            role: context.messages[context.messages.length - 1].role,
            contentLength: context.messages[context.messages.length - 1].content.length,
            contentPreview: context.messages[context.messages.length - 1].content.slice(0, 200).replace(/\n/g, '\\n')
          }
        });

        // 继续循环，让 AI 基于工具结果生成新的响应
        debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Continuing to next iteration');
        continue;
      }

      // 没有工具调用 - 最终回答，存入 conversation
      if (content) {
        context.messages.push({ role: 'assistant', content });
        addMessage(conversation, { role: 'assistant', content });
      }

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'No tool calls, finalAnswer is empty (text sent via onStep)');
      return {
        success: true,
        finalAnswer: content || '',
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
   * 支持两种模式：
   * 1. 传入 conversation → 复用历史上下文（多轮对话）
   * 2. 不传 conversation → 创建新的（兼容单次命令模式）
   *
   * 返回结果中包含更新后的 conversation，供 Client 保存复用
   */
  async execute(task: Task, conversation?: Conversation): Promise<AgentLoopResult & { conversation: Conversation }> {
    this.steps = [];

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Executing task', {
      taskId: task.id,
      description: task.description,
      hasConversation: !!conversation,
      conversationId: conversation?.id
    });

    try {
      // 如果没有 conversation，创建一个新的（兼容单次命令模式）
      if (!conversation) {
        conversation = createConversation({
          systemPrompt: this.buildSystemPrompt(),
          projectInfo: { rootPath: process.cwd(), name: 'project' }
        });
        debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Created new conversation', {
          conversationId: conversation.id
        });
      } else {
        // DEBUG: 打印复用 conversation 的状态
        debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== REUSING CONVERSATION DEBUG ===', {
          conversationId: conversation.id,
          messageCount: conversation.messages.length,
          lastMessage: conversation.messages.length > 0
            ? {
                role: conversation.messages[conversation.messages.length - 1].role,
                contentPreview: conversation.messages[conversation.messages.length - 1].content.slice(0, 150).replace(/\n/g, '\\n')
              }
            : null
        });
      }

      // 初始化 Agent 上下文
      const context: AgentContext = {
        task,
        messages: getMessagesForLLM(conversation),
        memory: new Map(),
        iterations: 0,
        files: [],
        projectInfo: conversation.projectInfo,
        tokenUsage: { ...conversation.tokenUsage },
        experiences: []
      };

      // DEBUG: 打印 getMessagesForLLM 后的消息列表
      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== GETMESSAGESFORLLM DEBUG ===', {
        messageCount: context.messages.length,
        messages: context.messages.map((m, i) => ({
          index: i,
          role: m.role,
          contentLength: m.content.length,
          contentPreview: m.content.slice(0, 150).replace(/\n/g, '\\n')
        }))
      });

      // 添加当前用户输入
      context.messages.push({ role: 'user', content: task.description });
      addMessage(conversation, { role: 'user', content: task.description });

      // 记录用户消息到日志
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[USER]', task.description);

      debug(NAMESPACE.AGENT_LOOP, LogLevel.TRACE, 'Agent context initialized', {
        messageCount: context.messages.length,
        conversationMessages: conversation.messages.length,
        lastMessage: context.messages.length > 0
          ? {
              role: context.messages[context.messages.length - 1].role,
              contentPreview: context.messages[context.messages.length - 1].content.slice(0, 150).replace(/\n/g, '\\n')
            }
          : null,
        projectRoot: context.projectInfo.rootPath
      });

      // 管理上下文窗口（在执行前检查并截断/摘要）
      await manageContextWindow(conversation, async (prompt: string) => {
        const response = await this.options.provider.chat({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          maxTokens: 1024
        });
        return response.content;
      });

      // 运行主循环
      const result = await this.runLoop(context, conversation);

      // 累加 conversation 的总迭代次数
      conversation.totalIterations += result.iterations;

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Task execution completed', {
        success: result.success,
        iterations: result.iterations,
        reason: result.terminatedReason,
        conversationMessages: conversation.messages.length
      });

      // 保存上下文快照
      if (this.contextBuffer) {
        const snapshot: ContextSnapshot = {
          timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
          taskId: task.id,
          description: task.description,
          messages: [...context.messages],
          iterations: result.iterations,
          success: result.success,
          terminatedReason: result.terminatedReason
        };

        // 检测异常：LLM 输出包含工具标记但没有实际调用
        if (!result.success || ContextBuffer.detectAnomaly(context.messages)) {
          const dumpPath = this.contextBuffer.dump(snapshot, 'anomaly');
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[CONTEXT DUMP]', { path: dumpPath, reason: 'anomaly detected' });
        } else {
          this.contextBuffer.push(snapshot);
        }
      }

      return { ...result, conversation };

    } catch (error) {
      debugError(NAMESPACE.AGENT_LOOP, 'Task execution failed', error);
      // 如果 conversation 存在，仍然返回它（即使执行失败）
      const fallbackConversation = conversation ?? createConversation({
        systemPrompt: this.buildSystemPrompt(),
        projectInfo: { rootPath: process.cwd(), name: 'project' }
      });
      return {
        success: false,
        steps: [...this.steps],
        iterations: this.steps.length,
        terminatedReason: 'error',
        error: error instanceof Error ? error.message : String(error),
        conversation: fallbackConversation
      };
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(context: AgentContext): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; parameters: Record<string, unknown> }>; usage?: { input?: number; output?: number; total?: number } }> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'action'
    };

    try {
      // DEBUG: 打印发送给 LLM 的消息列表
      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== CALL LLM DEBUG ===', {
        messageCount: context.messages.length,
        messages: context.messages.map((m, i) => ({
          index: i,
          role: m.role,
          contentPreview: m.content.slice(0, 200).replace(/\n/g, '\\n')
        }))
      });

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

      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== LLM RESPONSE DEBUG ===', {
        contentLength: response.content?.length ?? 0,
        contentPreview: response.content?.slice(0, 200),
        toolCallsCount: response.toolCalls?.length ?? 0,
        toolCalls: response.toolCalls
      });

      // 记录LLM响应到日志
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[LLM]', response.content || '(tool calls only)');
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const tc of response.toolCalls) {
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[TOOL CALL]', `${tc.name}(${JSON.stringify(tc.parameters)})`);
        }
      }

      step.thinking = response.content;
      this.addStep(step);
      this.options.onStep(step);

      return response;
    } catch (error) {
      debugError(NAMESPACE.AGENT_LOOP, 'LLM call failed', error);
      step.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.addStep(step);
      this.options.onStep(step);
      return { content: '', toolCalls: undefined };
    }
  }

  /**
   * 流式调用 LLM
   *
   * 通过 onStep 逐步发送 text_delta，完整收集所有 tool_calls 后返回。
   */
  private async callLLMStream(context: AgentContext): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; parameters: Record<string, unknown> }>; usage?: { input?: number; output?: number; total?: number } }> {
    const streamMethod = this.options.provider.stream;
    if (!streamMethod) {
      // Provider 不支持流式，回退到非流式
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Provider does not support streaming, falling back to chat()');
      return this.callLLM(context);
    }

    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'action'
    };

    // DEBUG: 打印发送给 LLM 的消息列表
    debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== CALL LLM STREAM DEBUG ===', {
      messageCount: context.messages.length,
      messages: context.messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.slice(0, 150).replace(/\n/g, '\\n')
      }))
    });

    try {
      const toolDefinitions = this.options.toolRegistry.list().map(tool => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as Record<string, unknown>
      }));

      const chatOptions = {
        messages: context.messages,
        tools: toolDefinitions,
        temperature: this.options.agent.temperature ?? 0.7,
        maxTokens: this.options.agent.maxTokens ?? 4096
      };

      let fullContent = '';
      const allToolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }> = [];
      let streamUsage: { input?: number; output?: number; total?: number } | undefined;

      const stream = streamMethod.call(this.options.provider, chatOptions);

      for await (const chunk of stream) {
        // 文本增量 — 通过 onStep 的 text_delta 类型发送
        if (chunk.delta?.content) {
          const deltaStep: AgentLoopStep = {
            iteration: context.iterations ?? 0,
            phase: 'action',
            content: chunk.delta.content
          };
          this.addStep(deltaStep);
          this.options.onStep(deltaStep);
          fullContent += chunk.delta.content;
        }

        // 工具调用 — 完整收集
        if (chunk.toolCalls) {
          allToolCalls.push(...chunk.toolCalls);
        }

        // 收集 usage（通常在最后一个 chunk 中）
        if (chunk.usage) {
          streamUsage = chunk.usage;
        }
      }

      // 流式结束后，仅内部记录完整内容，不再通过 onStep 重复发送
      step.thinking = fullContent;
      this.addStep(step);

      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== LLM STREAM RESPONSE DEBUG ===', {
        contentLength: fullContent.length,
        contentPreview: fullContent.slice(0, 200)?.replace(/\n/g, '\\n'),
        toolCallsCount: allToolCalls.length,
        toolCalls: allToolCalls
      });

      // 记录LLM响应到日志
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[LLM]', fullContent || '(tool calls only)');
      if (allToolCalls.length > 0) {
        for (const tc of allToolCalls) {
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[TOOL CALL]', `${tc.name}(${JSON.stringify(tc.parameters)})`);
        }
      }

      return {
        content: fullContent,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: streamUsage
      };
    } catch (error) {
      debugError(NAMESPACE.AGENT_LOOP, 'LLM stream failed', error);
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
    if (toolId === 'glob' || toolId === 'grep') {
      return 'file_read';
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
    // 不通过 onStep 发送给用户，这是内部调试信息
  }

  /**
   * 构建系统提示词（公开方法，供 Client 创建 Conversation 时使用）
   */
  buildSystemPrompt(): string {
    const cwd = process.cwd();
    const tools = this.options.toolRegistry.list();
    const toolList = tools.map(t => `- ${t.id}: ${t.description}`).join('\n');

    const skillsSection = this.options.userSkills?.length
      ? `\n### 已安装技能\n${this.options.userSkills.map(s => `- ${s.slug}: ${s.description}`).join('\n')}\n`
      : '';

    // 操作系统信息
    const platform = process.platform;
    const isWindows = platform === 'win32';
    const isMac = platform === 'darwin';
    const osInfo = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';
    const shellHint = isWindows
      ? '\n**注意**: 当前是 Windows 系统，shell 命令应使用 cmd 语法（如 `dir`、`type`、`copy`）\n- 列出目录: `dir` 或 `dir /s /b`（递归）\n- 显示文件内容: `type <file>`\n- 或使用 PowerShell: `powershell -Command "Get-ChildItem"`'
      : isMac
      ? '\n**注意**: 当前是 macOS 系统，shell 命令使用 bash/Unix 语法\n- 列出目录: `ls` 或 `ls -la`\n- 显示文件内容: `cat <file>`\n- 或使用 zsh/macOS 特定命令'
      : '\n**注意**: 当前是 Linux 系统，shell 命令使用 bash/Unix 语法\n- 列出目录: `ls` 或 `ls -la`\n- 显示文件内容: `cat <file>`';

    return `你是编程助手 ${this.options.agent.name}。

## 工作环境
- 操作系统: ${osInfo}
- 当前目录: ${cwd}${shellHint}

## 重要：工具调用规范
- 调用工具时必须使用 tool_use 格式，不要在文本中描述工具调用
- 工具调用后系统会返回执行结果
- 不要在回复中写入工具名称和参数，系统会自动处理

## 工具与技能

### 内置工具
${toolList}

### 技能使用方法
技能是用户安装的扩展能力。使用步骤：
1. read_file 读取 \`.tramber/skills/<技能slug>/SKILL.md\` 查看用法
2. exec 执行脚本，例如 \`uv run .tramber/skills/<技能slug>/scripts/xxx.py\`

### 优先级
- 优先使用内置工具完成任务
- 内置工具无法完成时，才使用技能

## 工作准则
- 修改前先读取文件
- 优先 edit_file，创建新文件用 write_file
- 简洁回答，不重复已知信息
- 工具失败时分析错误并重试
${skillsSection}
`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
