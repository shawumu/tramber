// packages/agent/src/tool-executor.ts
/**
 * ToolExecutor - 封装工具执行逻辑
 */

import type { ToolRegistry } from '@tramber/tool';

/** 内部使用的工具调用类型 */
export interface ToolCallRequest {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolCallResult {
  toolCall: ToolCallRequest;
  result: ToolExecutionResult;
}

export class ToolExecutor {
  constructor(private toolRegistry: ToolRegistry) {}

  /**
   * 执行单个工具调用
   */
  async executeOne(toolCall: ToolCallRequest): Promise<ToolExecutionResult> {
    try {
      const result = await this.toolRegistry.execute(toolCall.name, toolCall.parameters);
      return {
        success: result.success,
        data: result.data,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 执行多个工具调用
   */
  async executeMany(toolCalls: ToolCallRequest[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeOne(toolCall);
      results.push({ toolCall, result });
    }

    return results;
  }

  /**
   * 格式化工具执行结果为文本
   */
  formatResults(results: ToolCallResult[]): string {
    return results.map(({ toolCall, result }) => {
      if (result.success) {
        return `- ${toolCall.name}: ${JSON.stringify(result.data).slice(0, 500)}`;
      }
      return `- ${toolCall.name}: 失败 - ${result.error}`;
    }).join('\n');
  }
}
