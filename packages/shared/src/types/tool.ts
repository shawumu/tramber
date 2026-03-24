// packages/shared/src/types/tool.ts
/**
 * Tool 相关类型定义
 */

import type { PermissionDeclaration } from './permission.js';

export type ToolCategory = 'file' | 'search' | 'execution' | 'media' | 'git' | 'lsp';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ToolInputSchema;
  /** 权限声明 */
  permissions?: PermissionDeclaration;
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
  }>;
  required: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
