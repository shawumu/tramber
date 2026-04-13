// packages/agent/src/virtual-tools/index.ts
/**
 * 虚拟工具注册 — 意识体的核心能力
 *
 * 守护意识工具：
 * - dispatch_task: 路由用户请求到领域子意识
 * - recall_memory: 检索历史实体摘要
 * - analyze_turn: 分析本轮交互，生成结构化实体（替代 compress_and_remember）
 *
 * 领域子意识工具：
 * - report_status: 阶段性回报
 * - request_approval: 请求审批
 * - escalate: 领域外请求上升
 * - record_discovery: 记录执行发现和资源
 * - recall_resource: 检索资源详情
 * - rebuild_context: 重建 context
 */

import type { ToolRegistry } from '@tramber/tool';
import type { ConsciousnessManager } from '../consciousness-manager.js';
import type { AgentLoop, AgentLoopStep } from '../loop.js';
import { DispatchTaskTool } from './dispatch-task.js';
import { RecallMemoryTool } from './recall-memory.js';
import { RequestApprovalTool } from './request-approval.js';
import { ReportStatusTool } from './report-status.js';
import { EscalateTool } from './escalate.js';
// Stage 9 新工具
import { AnalyzeTurnTool } from './analyze-turn.js';
import { RecordDiscoveryTool } from './record-discovery.js';
import { RecallResourceTool } from './recall-resource.js';
import { RebuildContextTool } from './rebuild-context.js';

export interface VirtualToolContext {
  consciousnessManager: ConsciousnessManager;
  /** 创建子 AgentLoop 的工厂 */
  createLoop: (options: {
    allowedTools?: string[];
    maxIterations?: number;
  }) => AgentLoop;
  /** 当前意识体 ID */
  currentConsciousnessId: string;
  /** 当前用户请求（Stage 9: 用于自动生成实体） */
  userRequest?: string;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
  /** 子意识输出直接发给用户的回调（不经过守护意识 conversation） */
  onChildStep?: (step: AgentLoopStep) => void;
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
    registry.register(new AnalyzeTurnTool(context)); // 替代 compress_and_remember
  }

  // 子意识工具
  registry.register(new ReportStatusTool(context));
  registry.register(new RequestApprovalTool(context));
  registry.register(new EscalateTool(context));
  // Stage 9: 执行意识新增工具
  registry.register(new RecordDiscoveryTool(context));
  registry.register(new RecallResourceTool(context));
  registry.register(new RebuildContextTool(context));
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
    'analyze_turn',      // Stage 9 新增
    'record_discovery',  // Stage 9 新增
    'recall_resource',   // Stage 9 新增
    'rebuild_context',   // Stage 9 新增
    'escalate'
  ];
  for (const id of virtualToolIds) {
    registry.unregister(id);
  }
}
