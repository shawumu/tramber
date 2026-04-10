// packages/shared/src/types/consciousness.ts
/**
 * 意识体类型定义 — 领域感知与 Context 分层管理
 *
 * 守护意识（Guardian）：只做调度，不直接执行
 * 领域子意识（Domain Child）：按领域持久，可封存/激活
 */

// === 基础类型 ===

/** 意识体层级 */
export type ConsciousnessLevel = 'self_awareness' | 'execution';

/** 意识体状态 */
export type ConsciousnessStatus =
  | 'spawning'          // 创建中
  | 'thinking'          // LLM 推理中
  | 'executing'         // 执行工具调用
  | 'active'            // 领域子意识活跃中（跨多轮对话）
  | 'sealed'            // 封存（领域暂不活跃，可重新激活）
  | 'waiting_approval'  // 等待审批
  | 'compressing'       // 压缩结果
  | 'completed'         // 已完成
  | 'failed'            // 执行失败
  | 'cancelled';        // 被父意识取消

// === 守护意识状态 ===

/**
 * 守护意识的状态 — 调度器，不直接执行
 */
export interface SelfAwarenessState {
  id: string;
  level: 'self_awareness';
  status: ConsciousnessStatus;

  /** 当前活跃领域 */
  activeDomain: string | null;
  /** 领域 → 子意识 ID 映射（包含 active + sealed） */
  domains: Record<string, string>;

  /** 用户明确提出的规则（单独管理、持久传递） */
  rules: string[];

  /** 当前环境概况 */
  environment: {
    project: string;
    branch?: string;
    sceneId: string;
  };

  /** 迭代计数 */
  iteration: number;
  maxIterations: number;

  /** Online Memory 索引（注入 prompt 的子集） */
  memoryIndex: MemoryIndexEntry[];

  // --- 内部维护 ---
  recentDecisions: string[];
  recentResults: string[];
  difficulties: string[];
  filesTouched: string[];
}

// === 领域子意识状态 ===

/**
 * 领域子意识的状态 — 按领域持久存在
 */
export interface ExecutionContextState {
  id: string;
  level: 'execution';
  status: ConsciousnessStatus;
  /** 父意识 ID */
  parentId: string;

  /** 所属领域 */
  domain: string;
  /** 领域描述（帮助 LLM 判断边界） */
  domainDescription: string;
  /** 是否为新创建的子意识（首次需要介绍） */
  isNew: boolean;

  /** 当前任务描述 */
  taskDescription: string;
  /** 执行约束 */
  constraints: string[];
  /** 允许使用的工具 */
  allowedTools: string[];
  /** 父意识提供的精要上下文 */
  parentContext: string;
  /** 最大迭代数 */
  maxIterations: number;
}

// === 记忆系统：双层架构 ===

/** 记忆类型 */
export type MemoryType =
  | 'user_turn'         // 用户对话概括（守护意识写入）
  | 'progress_report'   // 子意识阶段性回报
  | 'result_summary'    // 子意识最终结果
  | 'escalation'        // 子意识判断超出领域
  | 'rule_extracted'    // 用户提出的规则
  | 'domain_switch';    // 领域切换记录

/**
 * Offline Memory 条目 — 磁盘全量流水账
 */
export interface MemoryEntry {
  id: string;
  /** 所属会话 ID */
  taskId?: string;
  /** 来源：子意识 ID 或 'guardian' */
  sourceId: string;
  /** 所属领域 */
  domain: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 摘要（≤ 300 字符） */
  summary: string;
  /** 详细内容（过长会被二次概括） */
  content: string;
  /** 相关文件 */
  relatedFiles: string[];
  /** 创建时间 */
  createdAt: string;
}

/**
 * Online Memory — 守护意识实时持有的子集
 */
export interface OnlineMemory {
  /** 所属任务 ID */
  taskId?: string;
  /** 早期概括（Offline 前部分的压缩摘要） */
  earlySummary: string;
  /** 近期原始条目（保持原样） */
  recentEntries: MemoryEntry[];
  /** Offline 总条目数 */
  totalCount: number;
}

/**
 * 记忆索引条目 — 注入守护意识 prompt
 */
export interface MemoryIndexEntry {
  id: string;
  taskId?: string;
  domain: string;
  type: MemoryType;
  summary: string;
}

/**
 * 记忆检索请求
 */
export interface MemoryQuery {
  domain?: string;
  type?: MemoryType;
  keyword?: string;
  limit?: number;
}

// === Context 持久化 ===

/**
 * Context 快照 — 意识体的完整消息快照
 */
export interface ConsciousnessContextSnapshot {
  /** 意识体 ID */
  consciousnessId: string;
  /** 父意识体 ID（根意识为空） */
  parentConsciousnessId?: string;
  /** 意识体层级 */
  level: ConsciousnessLevel;
  /** 任务描述 */
  taskDescription: string;
  /** 所属领域（子意识才有） */
  domain?: string;
  /** 完整消息历史 */
  messages: Array<{ role: string; content: string }>;
  /** 迭代次数 */
  iterations: number;
  /** 是否成功 */
  success: boolean;
  /** 终止原因 */
  terminatedReason?: string;
  /** token 消耗 */
  tokenUsage?: { input: number; output: number; total: number };
  /** 创建时间 */
  createdAt: string;
}

/**
 * Context 存储配置
 */
export interface ContextStorageOptions {
  rootDir: string;
  maxSnapshotsPerTask: number;
  enabled: boolean;
}

// === 意识体树 ===

/**
 * 意识体树节点
 */
export interface ConsciousnessNode {
  id: string;
  agentId: string;
  state: SelfAwarenessState | ExecutionContextState;
  children: Map<string, ConsciousnessNode>;
  active: boolean;
}

/**
 * 子意识执行结果
 */
export interface ConsciousnessResult {
  consciousnessId: string;
  success: boolean;
  finalAnswer: string;
  filesTouched: string[];
  tokenUsage: { input: number; output: number; total: number };
  iterations: number;
  compressedSummary?: string;
  error?: string;
}

// === 审批 ===

export interface ApprovalRequest {
  id: string;
  requesterId: string;
  action: string;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  toolCall?: { name: string; parameters: Record<string, unknown> };
  createdAt: string;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  feedback?: string;
  modifiedParameters?: Record<string, unknown>;
}
