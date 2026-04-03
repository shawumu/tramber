// packages/provider/src/gemini/client.ts
/**
 * Google Gemini Provider 实现
 */

import { GoogleGenerativeAI, SchemaType, type Content, type FunctionDeclaration, type Part, type GenerateContentRequest } from '@google/generative-ai';
import type {
  AIProvider,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
  TokenUsage
} from '../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(config: {
    apiKey: string;
    model?: string;
  }) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.defaultModel = config.model || 'gemini-2.0-flash';
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.BASIC, 'GeminiProvider initialized', {
      model: this.defaultModel
    });
  }

  private convertMessages(messages: ChatOptions['messages']): { contents: Content[]; systemInstruction?: string } {
    const contents: Content[] = [];
    let systemInstruction: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    return { contents, systemInstruction };
  }

  private convertTools(tools?: ChatOptions['tools']): FunctionDeclaration[] | undefined {
    if (!tools) return undefined;
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: (tool.inputSchema.properties as Record<string, any>) || {},
        required: (tool.inputSchema.required as string[]) || []
      }
    }));
  }

  private extractUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }): TokenUsage | undefined {
    const usage = response.usageMetadata;
    if (!usage) return undefined;
    return {
      input: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
      total: usage.totalTokenCount ?? 0
    };
  }

  private extractToolCalls(response: { candidates?: Array<{ content?: { parts?: Part[] } }> }): ToolCall[] | undefined {
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) return undefined;

    const functionCalls = parts
      .filter((part): part is Part & { functionCall: { name: string; args: Record<string, unknown> } } =>
        'functionCall' in part && (part as any).functionCall != null
      )
      .map((part) => {
        const fc = part.functionCall;
        return {
          id: `tc-${fc.name}-${Date.now()}`,
          name: fc.name,
          parameters: fc.args as Record<string, unknown>
        };
      });

    return functionCalls.length > 0 ? functionCalls : undefined;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'Gemini chat request', {
      messageCount: options.messages.length,
      toolsCount: options.tools?.length ?? 0
    });

    try {
      const { contents, systemInstruction } = this.convertMessages(options.messages);

      const modelOptions: Record<string, any> = {};
      if (systemInstruction) {
        modelOptions.systemInstruction = systemInstruction;
      }

      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
        ...modelOptions
      });

      const requestOptions: GenerateContentRequest = { contents };
      if (options.tools) {
        requestOptions.tools = [{ functionDeclarations: this.convertTools(options.tools) }];
      }

      if (options.maxTokens || options.temperature !== undefined) {
        requestOptions.generationConfig = {};
        if (options.maxTokens) requestOptions.generationConfig.maxOutputTokens = options.maxTokens;
        if (options.temperature !== undefined) requestOptions.generationConfig.temperature = options.temperature;
      }

      const result = await model.generateContent(requestOptions);
      const response = result.response;

      const textContent = response.text();
      const toolCalls = this.extractToolCalls(response);

      debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'Gemini response', {
        contentLength: textContent?.length ?? 0,
        toolCallsCount: toolCalls?.length ?? 0
      });

      return {
        content: textContent || '',
        toolCalls,
        usage: this.extractUsage(response),
        finishReason: response.candidates?.[0]?.finishReason ?? undefined
      };
    } catch (error) {
      debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'Gemini API error', error);
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *stream(options: ChatOptions): AsyncIterable<ChatResponseChunk> {
    try {
      const { contents, systemInstruction } = this.convertMessages(options.messages);

      const modelOptions: Record<string, any> = {};
      if (systemInstruction) {
        modelOptions.systemInstruction = systemInstruction;
      }

      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
        ...modelOptions
      });

      const requestOptions: GenerateContentRequest = { contents };
      if (options.tools) {
        requestOptions.tools = [{ functionDeclarations: this.convertTools(options.tools) }];
      }

      if (options.maxTokens || options.temperature !== undefined) {
        requestOptions.generationConfig = {};
        if (options.maxTokens) requestOptions.generationConfig.maxOutputTokens = options.maxTokens;
        if (options.temperature !== undefined) requestOptions.generationConfig.temperature = options.temperature;
      }

      const result = await model.generateContentStream(requestOptions);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield {
            content: text,
            delta: { content: text }
          };
        }

        // Check for function calls in chunks
        const toolCalls = this.extractToolCalls(chunk);
        if (toolCalls && toolCalls.length > 0) {
          yield { content: '', toolCalls };
        }
      }
    } catch (error) {
      throw new Error(`Gemini streaming error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
