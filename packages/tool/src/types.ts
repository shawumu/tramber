// packages/tool/src/types.ts
/**
 * Tool 系统类型定义
 */

import type { ToolCategory, ToolInputSchema, ToolResult, ToolPermissions } from '@tramber/shared';

export type { ToolResult };

/**
 * 工具权限声明
 */
export interface ToolPermission {
  /** 权限级别 */
  level: 'safe' | 'dangerous' | 'critical';
  /** 所需权限类型 */
  operation: keyof ToolPermissions;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ToolInputSchema;
  /** 权限声明（可选）*/
  permission?: ToolPermission;
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
  /** 权限声明（可选）*/
  permission?: ToolPermission;
}
