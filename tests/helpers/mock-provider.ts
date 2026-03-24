// tests/helpers/mock-provider.ts
/**
 * Mock Anthropic Provider for Testing
 */

import type { AIProvider, ChatRequest, ChatResponse } from '@tramber/provider';

export class MockAnthropicProvider implements AIProvider {
  private response: ChatResponse | null = null;
  private error: Error | null = null;
  private toolCallHistory: Array<{ name: string; parameters: Record<string, unknown> }> = [];

  setResponse(response: ChatResponse): void {
    this.response = response;
    this.error = null;
  }

  setError(error: Error): void {
    this.error = error;
    this.response = null;
  }

  getToolCallHistory(): Array<{ name: string; parameters: Record<string, unknown> }> {
    return [...this.toolCallHistory];
  }

  clearHistory(): void {
    this.toolCallHistory = [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (this.error) {
      throw this.error;
    }

    if (!this.response) {
      throw new Error('No response set. Call setResponse() first.');
    }

    // 记录工具调用
    if (this.response.toolCalls) {
      for (const toolCall of this.response.toolCalls) {
        this.toolCallHistory.push({
          name: toolCall.name,
          parameters: toolCall.parameters
        });
      }
    }

    return this.response;
  }

  async stream(_request: ChatRequest): AsyncGenerator<string, void, unknown> {
    if (this.error) {
      throw this.error;
    }

    if (!this.response) {
      throw new Error('No response set. Call setResponse() first.');
    }

    // 模拟流式输出
    const content = this.response.content ?? '';
    const words = content.split(' ');

    for (const word of words) {
      yield word + ' ';
    }
  }
}
