// packages/agent/src/llm-caller.ts
/**
 * LLMCaller - LLM 调用封装
 *
 * 从 AgentLoop 抽取的 LLM 调用逻辑，包含：
 * - 非流式调用（call）
 * - 流式调用（callStream）
 * - 重试机制（429/529 指数退避）
 */

import type { AIProvider } from '@tramber/provider';
import type { ToolRegistry } from '@tramber/tool';
import type { Agent, Message } from '@tramber/shared';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export interface LLMCallerOptions {
  provider: AIProvider;
  agent: Agent;
  toolRegistry: ToolRegistry;
  verboseStreamLog?: boolean;
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{ id: string; name: string; parameters: Record<string, unknown> }>;
  usage?: { input?: number; output?: number; total?: number };
}

/** 流式 delta 回调 */
export type OnDelta = (delta: string, iteration: number) => void;

/** 构建工具定义列表 */
function buildToolDefinitions(toolRegistry: ToolRegistry, allowedTools: string[] | null) {
  const allTools = toolRegistry.list();
  const filteredTools = allowedTools
    ? allTools.filter(tool => allowedTools.includes(tool.id))
    : allTools;
  return filteredTools.map(tool => ({
    name: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema as unknown as Record<string, unknown>
  }));
}

export class LLMCaller {
  private options: LLMCallerOptions;

  constructor(options: LLMCallerOptions) {
    this.options = options;
  }

  /**
   * 非流式 LLM 调用
   */
  async call(
    messages: Message[],
    allowedTools: string[] | null = null,
    _iteration: number = 0
  ): Promise<LLMResponse> {
    const maxRetries = 3;
    const baseDelay = 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== CALL LLM DEBUG ===', {
          messageCount: messages.length,
          messages: messages.map((m, i) => ({
            index: i,
            role: m.role,
            contentPreview: m.content.slice(0, 200).replace(/\n/g, '\\n')
          }))
        });

        const toolDefinitions = buildToolDefinitions(this.options.toolRegistry, allowedTools);

        const response = await this.options.provider.chat({
          messages,
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

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        const isRetryable = errorMessage.includes('429') || errorMessage.includes('529');

        if (isRetryable && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `LLM request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
            error: errorMessage.slice(0, 200)
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        debugError(NAMESPACE.AGENT_LOOP, 'LLM call failed', error);
        return { content: '', toolCalls: undefined };
      }
    }

    debugError(NAMESPACE.AGENT_LOOP, 'LLM call failed unexpectedly');
    return { content: '', toolCalls: undefined };
  }

  /**
   * 流式 LLM 调用
   */
  async callStream(
    messages: Message[],
    allowedTools: string[] | null = null,
    _iteration: number = 0,
    onDelta?: OnDelta
  ): Promise<LLMResponse> {
    const streamMethod = this.options.provider.stream;
    if (!streamMethod) {
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Provider does not support streaming, falling back to chat()');
      return this.call(messages, allowedTools, _iteration);
    }

    debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== CALL LLM STREAM DEBUG ===', {
      messageCount: messages.length,
      messages: messages.map((m, i) => ({
        index: i,
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.slice(0, 150).replace(/\n/g, '\\n')
      }))
    });

    try {
      const toolDefinitions = buildToolDefinitions(this.options.toolRegistry, allowedTools);

      const chatOptions = {
        messages,
        tools: toolDefinitions,
        temperature: this.options.agent.temperature ?? 0.7,
        maxTokens: this.options.agent.maxTokens ?? 4096,
        verboseStreamLog: this.options.verboseStreamLog
      };

      const maxRetries = 3;
      const baseDelay = 1000;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          let fullContent = '';
          const allToolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }> = [];
          let streamUsage: { input?: number; output?: number; total?: number } | undefined;

          const stream = streamMethod.call(this.options.provider, chatOptions);

          for await (const chunk of stream) {
            if (chunk.delta?.content) {
              onDelta?.(chunk.delta.content, _iteration);
              fullContent += chunk.delta.content;
            }

            if (chunk.toolCalls) {
              allToolCalls.push(...chunk.toolCalls);
            }

            if (chunk.usage) {
              streamUsage = chunk.usage;
            }
          }

          debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, '=== LLM STREAM RESPONSE DEBUG ===', {
            contentLength: fullContent.length,
            contentPreview: fullContent.slice(0, 200)?.replace(/\n/g, '\\n'),
            toolCallsCount: allToolCalls.length,
            toolCalls: allToolCalls
          });

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
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorMessage = lastError.message;

          const isRetryable = errorMessage.includes('429') || errorMessage.includes('529');

          if (isRetryable && attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `LLM request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
              error: errorMessage.slice(0, 200)
            });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          debugError(NAMESPACE.AGENT_LOOP, 'LLM stream failed', error);
          return { content: '', toolCalls: undefined };
        }
      }

      debugError(NAMESPACE.AGENT_LOOP, 'LLM stream failed unexpectedly');
      return { content: '', toolCalls: undefined };
    } catch (outerError) {
      debugError(NAMESPACE.AGENT_LOOP, 'LLM stream failed (outer)', outerError);
      return { content: '', toolCalls: undefined };
    }
  }
}
