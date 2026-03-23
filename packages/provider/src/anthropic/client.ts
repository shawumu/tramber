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
    try {
      const messages = this.convertMessages(options.messages);
      const systemMessages = (this as any)._systemMessages || [];

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: this.getDefaultModel() as Anthropic.Model,
        messages,
        max_tokens: options.maxTokens || 4096
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

      const content = response.content
        .filter(this.isTextBlock)
        .map(block => (block as Anthropic.TextBlock).text)
        .join('\n');

      return {
        content,
        toolCalls: this.extractToolCalls(response.content),
        usage: this.extractUsage(response.usage),
        finishReason: response.stop_reason ?? undefined
      };
    } catch (error) {
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
        max_tokens: options.maxTokens || 4096,
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
        switch (event.type) {
          case 'message_start':
            break;

          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: (event.content_block as any).id,
                name: (event.content_block as any).name,
                input: ''
              };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              yield {
                content: event.delta.text,
                delta: { content: event.delta.text }
              };
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.input += (event.delta as any).partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentToolUse && currentToolUse.id && currentToolUse.name) {
              let parameters: Record<string, unknown> = {};
              try {
                if (currentToolUse.input.trim()) {
                  parameters = JSON.parse(currentToolUse.input);
                }
              } catch {
                // Invalid JSON, keep empty
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
