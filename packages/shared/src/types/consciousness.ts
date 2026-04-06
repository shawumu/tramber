// packages/shared/src/types/consciousness.ts
/**
 * 意识体类型定义 — Context 分层管理
 *
 * 意识体 = context 管理策略
 * - 自我感知意识：始终轻量，维护压缩摘要和记忆索引
 * - 执行意识：短命聚焦，接收父意识特调的小而精 prompt
 */

// === 基础类型 ===

/** 意识体层级 */
export type ConsciousnessLevel = 'self_awareness' | 'execution';

/** 意识体状态 */
export type ConsciousnessStatus =
  | 'spawning'          // 创建中
  | 'thinking'          // LLM 推理中
  | 'executing'         // 执行工具调用
  | 'waiting_approval'  // 等待审批
  | 'compressing'       // 压缩子意识结果
  | 'completed'         // 已完成
  | 'failed'            // 执行失败
  | 'cancelled';        // 被父意识取消

// === 自我感知状态 ===

/**
 * 自我感知意识的状态 — 每轮注入 system prompt
 * 始终保持轻量，是压缩后的精华
 */
export interface SelfAwarenessState {
  id: string;
  level: 'self_awareness';
  status: ConsciousnessStatus;

  // --- 始终在 context 中的信息 ---

  /** 当前任务概况（一句话） */
  taskSummary: string;
  /** 进度 0-100 */
  progress: number;
  /** 当前所处阶段描述 */
  currentPhase: string;
  /** 与谁交互（用户/其他 agent） */
  interactingWith: string;
  /** 当前环境概况 */
  environment: {
    project: string;
    branch?: string;
    sceneId: string;
  };
  /** 不可违反的规则和约束 */
  rules: string[];
  /** 活跃的子意识数量 */
  activeChildren: number;
  /** 迭代计数 */
  iteration: number;
  maxIterations: number;

  // --- 通过 recall_memory 按需检索 ---

  /** 记忆索引（只有标题和 ID，不包含内容） */
  memoryIndex: MemoryIndexEntry[];

  // --- 内部维护（不注入 prompt） ---

  /** 已做关键决策（最近 5 条注入 prompt，完整列表存记忆） */
  recentDecisions: string[];
  /** 最近子意识结果摘要（最近 2 条） */
  recentResults: string[];
  /** 当前遇到的困难 */
  difficulties: string[];
  /** 已修改文件列表（注入 prompt） */
  filesTouched: string[];
}

// === 执行意识状态 ===

/**
 * 执行意识的状态 — 由父意识准备，保持极简
 */
export interface ExecutionContextState {
  id: string;
  level: 'execution';
  status: ConsciousnessStatus;
  /** 父意识 ID */
  parentId: string;

  /** 父意识特调的任务描述（精确、聚焦） */
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

// === 记忆系统 ===

/** 记忆类型 */
export type MemoryType = 'decision' | 'result_summary' | 'difficulty' | 'file_change' | 'conversation_summary';

/**
 * 记忆条目 — 存储在外部，按需检索
 */
export interface MemoryEntry {
  id: string;
  /** 所属任务阶段 */
  phase: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 一句话摘要（用于索引展示） */
  summary: string;
  /** 详细内容 */
  content: string;
  /** 相关文件 */
  relatedFiles: string[];
  /** 创建时间 */
  createdAt: string;
}

/**
 * 记忆索引条目 — 注入自我感知意识的 prompt
 */
export interface MemoryIndexEntry {
  id: string;
  phase: string;
  type: MemoryType;
  summary: string;
}

/**
 * 记忆检索请求
 */
export interface MemoryQuery {
  /** 按阶段过滤 */
  phase?: string;
  /** 按类型过滤 */
  type?: MemoryType;
  /** 关键词搜索 */
  keyword?: string;
  /** 最多返回条数 */
  limit?: number;
}

// === Context 持久化 ===

/**
 * Context 快照 — 意识体执行完成后的完整消息快照
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
  /** 完整消息历史（含 system prompt、工具调用和结果） */
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
  /** 根目录（默认 .tramber/contexts/） */
  rootDir: string;
  /** 每个任务最多保留多少个子意识 context（默认 20） */
  maxSnapshotsPerTask: number;
  /** 是否启用（默认 true） */
  enabled: boolean;
}

// === 意识体树 ===

/**
 * 意识体树节点
 */
export interface ConsciousnessNode {
  id: string;
  /** 所属智能体 ID */
  agentId: string;
  /** 状态 */
  state: SelfAwarenessState | ExecutionContextState;
  /** 子意识列表 */
  children: Map<string, ConsciousnessNode>;
  /** 是否活跃 */
  active: boolean;
}

/**
 * 子意识执行结果
 */
export interface ConsciousnessResult {
  consciousnessId: string;
  success: boolean;
  /** 子意识的最终输出 */
  finalAnswer: string;
  /** 子意识修改的文件 */
  filesTouched: string[];
  /** token 消耗 */
  tokenUsage: { input: number; output: number; total: number };
  /** 使用的迭代数 */
  iterations: number;
  /** 父意识压缩后的摘要（原始结果已丢弃） */
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
