// packages/provider/src/types.ts
/**
 * AI Provider 类型定义
 */

export interface ProviderConfig {
  type: 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export interface AIProvider {
  chat(options: ChatOptions): Promise<ChatResponse>;
  stream?(options: ChatOptions): AsyncIterable<ChatResponseChunk>;
}

export interface ChatOptions {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ChatResponseChunk {
  content: string;
  toolCalls?: ToolCall[];
  delta?: {
    role?: string;
    content?: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}
