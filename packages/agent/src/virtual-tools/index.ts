// packages/agent/src/virtual-tools/index.ts
/**
 * 虚拟工具注册 — 意识体的核心能力
 *
 * 守护意识工具：
 * - dispatch_task: 路由用户请求到领域子意识
 * - recall_memory: 检索历史记忆
 * - compress_and_remember: 记录流水账
 *
 * 领域子意识工具：
 * - report_status: 阶段性回报
 * - request_approval: 请求审批
 * - escalate: 领域外请求上升
 */

import type { ToolRegistry } from '@tramber/tool';
import type { ConsciousnessManager } from '../consciousness-manager.js';
import type { AgentLoop } from '../loop.js';
import { DispatchTaskTool } from './dispatch-task.js';
import { RecallMemoryTool } from './recall-memory.js';
import { RequestApprovalTool } from './request-approval.js';
import { ReportStatusTool } from './report-status.js';
import { CompressAndRememberTool } from './compress-and-remember.js';
import { EscalateTool } from './escalate.js';

export interface VirtualToolContext {
  consciousnessManager: ConsciousnessManager;
  /** 创建子 AgentLoop 的工厂 */
  createLoop: (options: {
    allowedTools?: string[];
    maxIterations?: number;
  }) => AgentLoop;
  /** 当前意识体 ID */
  currentConsciousnessId: string;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
}

/**
 * 注册守护意识的虚拟工具
 */
export function registerVirtualTools(
  registry: ToolRegistry,
  context: VirtualToolContext,
  level: 'self_awareness' | 'execution'
): void {
  if (level === 'self_awareness') {
    registry.register(new DispatchTaskTool(context));
    registry.register(new RecallMemoryTool(context));
    registry.register(new CompressAndRememberTool(context));
  }

  // 子意识工具
  registry.register(new ReportStatusTool(context));
  registry.register(new RequestApprovalTool(context));
  registry.register(new EscalateTool(context));
}

/**
 * 注销所有虚拟工具
 */
export function unregisterVirtualTools(registry: ToolRegistry): void {
  const virtualToolIds = [
    'dispatch_task',
    'recall_memory',
    'request_approval',
    'report_status',
    'compress_and_remember',
    'escalate'
  ];
  for (const id of virtualToolIds) {
    registry.unregister(id);
  }
}
