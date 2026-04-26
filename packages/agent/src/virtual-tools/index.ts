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
 * - record_resource: 记录执行发现的资源
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
import { RecordResourceTool } from './record-resource.js';
import { RecallResourceTool } from './recall-resource.js';
import { RebuildContextTool } from './rebuild-context.js';

export interface VirtualToolContext {
  consciousnessManager: ConsciousnessManager;
  /** 创建子 AgentLoop 的工厂 */
  createLoop: (options: {
    allowedTools?: string[];
    maxIterations?: number;
    /** 静默模式：不向用户转发 LLM 输出（孙意识/索引器用） */
    silent?: boolean;
  }) => AgentLoop;
  /** 当前意识体 ID */
  currentConsciousnessId: string;
  /** 当前 subtask ID（dispatch_task 创建后自动设置，record_resource 自动使用） */
  currentSubtaskId?: string;
  /** 当前用户请求（Stage 9: 用于自动生成实体） */
  userRequest?: string;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
  /** 子意识输出直接发给用户的回调（不经过守护意识 conversation） */
  onChildStep?: (step: AgentLoopStep) => void;
}

/**
 * 注册虚拟工具（支持 allowedTools 过滤）
 */
export function registerVirtualTools(
  registry: ToolRegistry,
  context: VirtualToolContext,
  level: 'self_awareness' | 'execution',
  allowedTools?: string[]
): void {
  if (level === 'self_awareness') {
    registry.register(new DispatchTaskTool(context));
    registry.register(new RecallMemoryTool(context));
    registry.register(new AnalyzeTurnTool(context));
  }

  // 子意识工具（按 allowedTools 过滤）
  // record_resource 专属 indexer 孙意识，必须显式指定才注册
  const tools = [
    new ReportStatusTool(context),
    new RequestApprovalTool(context),
    new EscalateTool(context),
    new RecallResourceTool(context),
    new RebuildContextTool(context),
  ];

  for (const tool of tools) {
    if (!allowedTools || allowedTools.includes(tool.name)) {
      registry.register(tool);
    }
  }

  // record_resource 仅在显式指定时注册（indexer 孙意识用）
  if (allowedTools && allowedTools.includes('record_resource')) {
    registry.register(new RecordResourceTool(context));
  }
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
    'record_resource',  // Stage 9 新增
    'recall_resource',   // Stage 9 新增
    'rebuild_context',   // Stage 9 新增
    'escalate'
  ];
  for (const id of virtualToolIds) {
    registry.unregister(id);
  }
}
