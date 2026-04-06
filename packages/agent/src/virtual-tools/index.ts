// packages/agent/src/virtual-tools/index.ts
/**
 * 虚拟工具注册 — 意识体的虚拟工具
 *
 * 虚拟工具是意识体系统的核心能力：
 * - spawn_sub_task: 派生执行意识
 * - recall_memory: 检索历史记忆
 * - request_approval: 请求审批
 * - report_status: 报告状态
 * - compress_and_remember: 压缩并存入记忆
 *
 * 这些工具注册在 ToolRegistry 中，LLM 像使用物理工具一样使用它们。
 */

import type { ToolRegistry } from '@tramber/tool';
import type { ConsciousnessManager } from '../consciousness-manager.js';
import type { AgentLoop } from '../loop.js';
import { SpawnSubTaskTool } from './spawn-sub-task.js';
import { RecallMemoryTool } from './recall-memory.js';
import { RequestApprovalTool } from './request-approval.js';
import { ReportStatusTool } from './report-status.js';
import { CompressAndRememberTool } from './compress-and-remember.js';

export interface VirtualToolContext {
  consciousnessManager: ConsciousnessManager;
  /** 创建子 AgentLoop 的工厂 */
  createLoop: (options: {
    allowedTools?: string[];
    maxIterations?: number;
  }) => AgentLoop;
  /** 当前意识体 ID */
  currentConsciousnessId: string;
  /** 根意识的权限确认回调（用于审批路由到用户） */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
}

/**
 * 注册所有虚拟工具到 ToolRegistry
 *
 * 自我感知意识注册全部 5 个工具，
 * 执行意识注册 request_approval + report_status。
 */
export function registerVirtualTools(
  registry: ToolRegistry,
  context: VirtualToolContext,
  level: 'self_awareness' | 'execution'
): void {
  if (level === 'self_awareness') {
    registry.register(new SpawnSubTaskTool(context));
    registry.register(new RecallMemoryTool(context));
    registry.register(new CompressAndRememberTool(context));
  }

  // 两种意识都注册审批和报告
  registry.register(new RequestApprovalTool(context));
  registry.register(new ReportStatusTool(context));
}

/**
 * 注销所有虚拟工具
 */
export function unregisterVirtualTools(registry: ToolRegistry): void {
  const virtualToolIds = [
    'spawn_sub_task',
    'recall_memory',
    'request_approval',
    'report_status',
    'compress_and_remember'
  ];
  for (const id of virtualToolIds) {
    registry.unregister(id);
  }
}
