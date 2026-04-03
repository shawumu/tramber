// packages/provider/src/openai/client.ts
/**
 * OpenAI GPT Provider 实现
 */

import OpenAI from 'openai';
import type {
  AIProvider,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
  TokenUsage
} from '../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: {
    apiKey: string;
    model?: string;
    baseURL?: string;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    this.defaultModel = config.model || 'gpt-4o';
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, 'OpenAIProvider initialized', {
      model: this.defaultModel,
      baseURL: config.baseURL
    });
  }

  private convertMessages(messages: ChatOptions['messages']): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return { role: 'system' as const, content: msg.content };
      }
      if (msg.role === 'assistant') {
        return { role: 'assistant' as const, content: msg.content };
      }
      return { role: 'user' as const, content: msg.content };
    });
  }

  private convertTools(tools?: ChatOptions['tools']): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools) return undefined;
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>
      }
    }));
  }

  private extractUsage(usage?: OpenAI.CompletionUsage): TokenUsage | undefined {
    if (!usage) return undefined;
    return {
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
      total: usage.total_tokens
    };
  }

  private extractToolCalls(message: OpenAI.ChatCompletionMessage): ToolCall[] | undefined {
    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return undefined;

    // Filter to function tool calls only (v6 union type: FunctionToolCall | CustomToolCall)
    const functionCalls = toolCalls.filter(
      (tc): tc is OpenAI.ChatCompletionMessageFunctionToolCall => tc.type === 'function'
    );
    if (functionCalls.length === 0) return undefined;

    return functionCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      parameters: JSON.parse(tc.function.arguments || '{}')
    }));
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'OpenAI chat request', {
      messageCount: options.messages.length,
      toolsCount: options.tools?.length ?? 0
    });

    try {
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: this.defaultModel,
        messages: this.convertMessages(options.messages),
        max_tokens: options.maxTokens || 16384
      };

      if (options.tools) {
        params.tools = this.convertTools(options.tools);
      }

      if (options.temperature !== undefined) {
        params.temperature = options.temperature;
      }

      const response = await this.client.chat.completions.create(params);
      const choice = response.choices[0];

      const content = choice?.message?.content || '';
      const toolCalls = choice?.message ? this.extractToolCalls(choice.message) : undefined;

      debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'OpenAI response', {
        contentLength: content.length,
        toolCallsCount: toolCalls?.length ?? 0,
        usage: this.extractUsage(response.usage)
      });

      return {
        content,
        toolCalls,
        usage: this.extractUsage(response.usage),
        finishReason: choice?.finish_reason ?? undefined
      };
    } catch (error) {
      debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'OpenAI API error', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *stream(options: ChatOptions): AsyncIterable<ChatResponseChunk> {
    try {
      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        model: this.defaultModel,
        messages: this.convertMessages(options.messages),
        max_tokens: options.maxTokens || 16384,
        stream: true
      };

      if (options.tools) {
        params.tools = this.convertTools(options.tools);
      }

      if (options.temperature !== undefined) {
        params.temperature = options.temperature;
      }

      const stream = await this.client.chat.completions.create(params);

      // Accumulate tool calls across chunks
      const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield {
            content: delta.content,
            delta: { content: delta.content }
          };
        }

        // Accumulate tool call deltas
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: ''
              });
            }
            const entry = toolCallMap.get(idx)!;
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.arguments += tc.function.arguments;
          }
        }

        // On finish, yield complete tool calls
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason === 'tool_calls' || finishReason === 'stop') {
          if (toolCallMap.size > 0) {
            const toolCalls: ToolCall[] = [];
            for (const [, entry] of toolCallMap) {
              let parameters: Record<string, unknown> = {};
              try {
                if (entry.arguments.trim()) {
                  parameters = JSON.parse(entry.arguments);
                }
              } catch {
                debugError(NAMESPACE.PROVIDER_ANTHROPIC, `Failed to parse tool arguments: ${entry.arguments}`);
              }
              toolCalls.push({
                id: entry.id,
                name: entry.name,
                parameters
              });
            }
            yield { content: '', toolCalls };
            toolCallMap.clear();
          }
        }
      }
    } catch (error) {
      throw new Error(`OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
