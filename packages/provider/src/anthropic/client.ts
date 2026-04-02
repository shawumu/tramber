// packages/provider/src/anthropic/client.ts
/**
 * Anthropic Claude Provider 实现
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
  TokenUsage
} from '../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

// Import types from the messages module directly
type MessageCreateParamsBase = Anthropic.MessageCreateParamsNonStreaming & Anthropic.MessageCreateParamsStreaming;

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(private config: {
    apiKey: string;
    model?: string;
    baseURL?: string;
  }) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, 'AnthropicProvider initialized', {
      model: this.getDefaultModel(),
      baseURL: config.baseURL
    });
  }

  private getDefaultModel(): string {
    return this.config.model || 'claude-sonnet-4-6';
  }

  private convertMessages(messages: ChatOptions['messages']): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    const systemMessages: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
      } else {
        result.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      }
    }

    // Store system messages for later use
    (this as any)._systemMessages = systemMessages;
    return result;
  }

  private convertTools(tools?: ChatOptions['tools']): Array<Anthropic.Tool> | undefined {
    if (!tools) return undefined;
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
    }));
  }

  private extractUsage(usage?: { input_tokens: number; output_tokens: number }): TokenUsage | undefined {
    if (!usage) return undefined;
    return {
      input: usage.input_tokens,
      output: usage.output_tokens,
      total: usage.input_tokens + usage.output_tokens
    };
  }

  private isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
    return (block as Anthropic.ToolUseBlock).type === 'tool_use';
  }

  private isTextBlock(block: Anthropic.ContentBlock): block is Anthropic.TextBlock {
    return (block as Anthropic.TextBlock).type === 'text';
  }

  private extractToolCalls(contentBlocks: Anthropic.ContentBlock[]): ToolCall[] | undefined {
    const toolUseBlocks = contentBlocks.filter(this.isToolUseBlock);

    if (toolUseBlocks.length === 0) return undefined;

    return toolUseBlocks.map(block => ({
      id: (block as Anthropic.ToolUseBlock).id,
      name: (block as Anthropic.ToolUseBlock).name,
      parameters: (block as Anthropic.ToolUseBlock).input as Record<string, unknown>
    }));
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'Sending chat request', {
      messageCount: options.messages.length,
      toolsCount: options.tools?.length ?? 0,
      model: this.getDefaultModel()
    });

    try {
      const messages = this.convertMessages(options.messages);
      const systemMessages = (this as any)._systemMessages || [];

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: this.getDefaultModel() as Anthropic.Model,
        messages,
        max_tokens: options.maxTokens || 16384
      };

      if (systemMessages.length > 0) {
        (params as any).system = systemMessages.join('\n\n');
      }

      if (options.tools) {
        (params as any).tools = this.convertTools(options.tools);
      }

      if (options.temperature !== undefined) {
        (params as any).temperature = options.temperature;
      }

      const response = await this.client.messages.create(params);

      debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.TRACE, 'Raw API response', {
        stopReason: response.stop_reason,
        usage: response.usage
      });

      const content = response.content
        .filter(this.isTextBlock)
        .map(block => (block as Anthropic.TextBlock).text)
        .join('\n');

      const toolCalls = this.extractToolCalls(response.content);

      debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'Chat response received', {
        contentLength: content.length,
        toolCallsCount: toolCalls?.length ?? 0,
        usage: this.extractUsage(response.usage)
      });

      return {
        content,
        toolCalls,
        usage: this.extractUsage(response.usage),
        finishReason: response.stop_reason ?? undefined
      };
    } catch (error) {
      debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'API request failed', error);
      if (error instanceof Error) {
        throw new Error(`Anthropic API error: ${error.message}`);
      }
      throw new Error('Unknown error occurred while calling Anthropic API');
    }
  }

  async *stream(options: ChatOptions): AsyncIterable<ChatResponseChunk> {
    try {
      const messages = this.convertMessages(options.messages);
      const systemMessages = (this as any)._systemMessages || [];

      const params: Anthropic.MessageCreateParamsStreaming = {
        model: this.getDefaultModel() as Anthropic.Model,
        messages,
        max_tokens: options.maxTokens || 16384,
        stream: true
      };

      if (systemMessages.length > 0) {
        (params as any).system = systemMessages.join('\n\n');
      }

      if (options.tools) {
        (params as any).tools = this.convertTools(options.tools);
      }

      if (options.temperature !== undefined) {
        (params as any).temperature = options.temperature;
      }

      const stream = await this.client.messages.create(params);

      let currentToolUse: { id?: string; name?: string; input: string } | null = null;

      for await (const event of stream) {
        // 记录每个事件的原始内容
        debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, '[STREAM EVENT]', {
          type: event.type,
          event: JSON.stringify(event).slice(0, 500)
        });

        switch (event.type) {
          case 'message_start':
            break;

          case 'content_block_start':
            debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, '[CONTENT_BLOCK_START]', {
              type: event.content_block.type,
              block: JSON.stringify(event.content_block)
            });
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: (event.content_block as any).id,
                name: (event.content_block as any).name,
                input: ''
              };
            }
            break;

          case 'content_block_delta':
            debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, '[CONTENT_BLOCK_DELTA]', {
              deltaType: event.delta.type,
              delta: JSON.stringify(event.delta).slice(0, 200)
            });
            if (event.delta.type === 'text_delta') {
              yield {
                content: event.delta.text,
                delta: { content: event.delta.text }
              };
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              const partialJson = (event.delta as any).partial_json || '';
              debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, '[INPUT_JSON_DELTA]', {
                partialJson: partialJson.slice(0, 100)
              });
              // Anthropic API sends incremental partial_json chunks — always append
              currentToolUse.input += partialJson;
            }
            break;

          case 'content_block_stop':
            if (currentToolUse && currentToolUse.id && currentToolUse.name) {
              debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, '[TOOL_USE_COMPLETE]', {
                id: currentToolUse.id,
                name: currentToolUse.name,
                inputLength: currentToolUse.input.length,
                inputPreview: currentToolUse.input.slice(0, 100)
              });
              let parameters: Record<string, unknown> = {};
              try {
                if (currentToolUse.input.trim()) {
                  parameters = JSON.parse(currentToolUse.input);
                }
              } catch (parseError) {
                const msg = parseError instanceof Error ? parseError.message : String(parseError);
                debugError(NAMESPACE.PROVIDER_ANTHROPIC, `JSON.parse failed for tool input: ${msg}`, parseError);
                if (msg?.includes('Unterminated') || msg?.includes('position')) {
                  debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'Likely caused by max_tokens truncation. Tool input was cut off before the complete JSON was received.', {
                    inputLength: currentToolUse.input.length,
                    hint: 'Consider increasing agent.maxTokens (current default: 4096 -> 16384)'
                  });
                }
                debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, '[TOOL INPUT PARSE FAILED - full content]', {
                  inputLength: currentToolUse.input.length,
                  fullInput: currentToolUse.input
                });
              }
              yield {
                content: '',
                toolCalls: [{
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  parameters
                }]
              };
              currentToolUse = null;
            }
            break;

          case 'message_delta':
            if ((event as any).delta?.stop_reason === 'max_tokens') {
              debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'Response truncated: stop_reason is max_tokens. Consider increasing maxTokens.', {
                stopReason: (event as any).delta?.stop_reason
              });
            }
            yield {
              content: '',
              delta: {}
            };
            break;

          case 'message_stop':
            break;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Anthropic API streaming error: ${error.message}`);
      }
      throw new Error('Unknown error occurred while streaming from Anthropic API');
    }
  }
}
