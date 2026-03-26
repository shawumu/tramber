// packages/agent/src/permission-guard.ts
/**
 * PermissionGuard - 封装权限检查逻辑
 */

import type { PermissionChecker } from '@tramber/permission';
import type { ToolRegistry } from '@tramber/tool';
import type { ToolCallRequest } from './tool-executor.js';

export interface PermissionCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  operation?: string;
  reason?: string;
}

export class PermissionGuard {
  constructor(
    private permissionChecker: PermissionChecker | undefined,
    private toolRegistry: ToolRegistry
  ) {}

  /**
   * 检查工具调用权限
   */
  async checkToolCalls(toolCalls: ToolCallRequest[]): Promise<PermissionCheckResult> {
    if (!this.permissionChecker) {
      return { allowed: true, requiresConfirmation: false };
    }

    for (const toolCall of toolCalls) {
      const result = await this.checkOne(toolCall);

      if (!result.allowed || result.requiresConfirmation) {
        return result;
      }
    }

    return { allowed: true, requiresConfirmation: false };
  }

  /**
   * 检查单个工具调用权限
   */
  private async checkOne(toolCall: ToolCallRequest): Promise<PermissionCheckResult> {
    // 优先从 Tool 定义获取权限类型
    const tool = this.toolRegistry.get(toolCall.name);
    let operation: keyof import('@tramber/shared').ToolPermissions;

    if (tool?.permission?.operation) {
      operation = tool.permission.operation;
    } else {
      // 回退到基于工具名称的推断
      operation = this.inferOperationType(toolCall.name);
    }

    if (!this.permissionChecker) {
      return { allowed: true, requiresConfirmation: false };
    }

    const result = await this.permissionChecker.checkToolPermission(
      toolCall.name,
      operation,
      toolCall.parameters
    );

    return {
      allowed: result.allowed,
      requiresConfirmation: result.requiresConfirmation,
      operation: String(operation),
      reason: result.reason
    };
  }

  /**
   * 基于工具名称推断操作类型（回退方法）
   */
  private inferOperationType(toolId: string): keyof import('@tramber/shared').ToolPermissions {
    if (toolId.startsWith('read') || toolId.startsWith('get')) {
      return 'file_read';
    }
    if (toolId.startsWith('write') || toolId.startsWith('create') || toolId.startsWith('edit')) {
      return 'file_write';
    }
    if (toolId.startsWith('delete') || toolId.startsWith('remove')) {
      return 'file_delete';
    }
    if (toolId.startsWith('rename') || toolId.startsWith('move')) {
      return 'file_rename';
    }
    return 'command_execute';
  }
}
