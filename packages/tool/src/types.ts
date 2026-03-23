// packages/tool/src/types.ts
/**
 * Tool 系统类型定义
 */

import type { ToolCategory, ToolInputSchema, ToolResult } from '@tramber/shared';

export type { ToolResult };

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ToolInputSchema;
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  unregister(toolId: string): void;
  get(toolId: string): Tool | undefined;
  list(): ToolInfo[];
  listByCategory(category: ToolCategory): ToolInfo[];
  execute(toolId: string, input: unknown): Promise<ToolResult>;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ToolInputSchema;
}
