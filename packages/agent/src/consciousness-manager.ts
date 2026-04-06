// packages/agent/src/consciousness-manager.ts
/**
 * ConsciousnessManager - 意识体树管理器
 *
 * 管理意识体的创建、状态更新、记忆存储和结果压缩。
 * 不直接执行 LLM 调用（由 AgentLoop 负责），只管理元数据和生命周期。
 */

import type {
  ConsciousnessNode,
  ConsciousnessStatus,
  ConsciousnessLevel,
  SelfAwarenessState,
  ExecutionContextState,
  ConsciousnessResult,
  MemoryEntry,
  MemoryQuery,
  ApprovalRequest,
  ApprovalResponse
} from '@tramber/shared';
import { generateId, debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import type { MemoryStore } from './memory-store.js';
import type { ContextStorage } from './context-storage.js';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export interface ConsciousnessManagerOptions {
  /** 当前 agent ID */
  agentId: string;
  /** 记忆存储 */
  memoryStore: MemoryStore;
  /** Context 存储 */
  contextStorage: ContextStorage;
  /** 根意识最大迭代 */
  maxIterations?: number;
}

/**
 * 意识体树管理器
 */
export class ConsciousnessManager {
  private agentId: string;
  private memoryStore: MemoryStore;
  private contextStorage: ContextStorage;
  private maxIterations: number;
  /** 意识体树根节点 */
  private root: ConsciousnessNode | null = null;
  /** 当前活跃的意识体 */
  private activeNode: ConsciousnessNode | null = null;
  /** 当前任务 ID */
  private currentTaskId: string | null = null;
  /** 审批请求映射 */
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(options: ConsciousnessManagerOptions) {
    this.agentId = options.agentId;
    this.memoryStore = options.memoryStore;
    this.contextStorage = options.contextStorage;
    this.maxIterations = options.maxIterations ?? 30;
  }

  // === 根意识管理 ===

  /**
   * 创建根意识（自我感知意识）
   */
  createRoot(taskId: string, taskDescription: string, sceneId: string): SelfAwarenessState {
    this.currentTaskId = taskId;

    const state: SelfAwarenessState = {
      id: 'root',
      level: 'self_awareness',
      status: 'thinking',
      taskSummary: taskDescription,
      progress: 0,
      currentPhase: '初始化',
      interactingWith: 'user',
      environment: {
        project: process.cwd(),
        sceneId
      },
      rules: [],
      activeChildren: 0,
      iteration: 0,
      maxIterations: this.maxIterations,
      memoryIndex: [],
      recentDecisions: [],
      recentResults: [],
      difficulties: [],
      filesTouched: []
    };

    this.root = {
      id: 'root',
      agentId: this.agentId,
      state,
      children: new Map(),
      active: true
    };

    this.activeNode = this.root;

    debug(NS, LogLevel.BASIC, 'Root consciousness created', { taskId, sceneId });
    return state;
  }

  /**
   * 获取根意识状态
   */
  getRoot(): SelfAwarenessState | null {
    if (!this.root) return null;
    return this.root.state as SelfAwarenessState;
  }

  // === 子意识（执行意识）管理 ===

  /**
   * 创建执行意识
   */
  spawnChild(
    parentId: string,
    taskDescription: string,
    options: {
      constraints?: string[];
      contextForChild?: string;
      allowedTools?: string[];
      maxIterations?: number;
    } = {}
  ): ExecutionContextState {
    const id = generateId('exec');
    const state: ExecutionContextState = {
      id,
      level: 'execution',
      status: 'spawning',
      parentId,
      taskDescription,
      constraints: options.constraints ?? [],
      allowedTools: options.allowedTools ?? [],
      parentContext: options.contextForChild ?? '',
      maxIterations: options.maxIterations ?? 10
    };

    const node: ConsciousnessNode = {
      id,
      agentId: this.agentId,
      state,
      children: new Map(),
      active: true
    };

    // 挂载到父节点
    const parent = this.findNode(parentId);
    if (parent) {
      parent.children.set(id, node);
      // 更新父意识的活跃子意识计数
      if (parent.state.level === 'self_awareness') {
        (parent.state as SelfAwarenessState).activeChildren = parent.children.size;
      }
    }

    this.activeNode = node;

    debug(NS, LogLevel.BASIC, 'Execution consciousness spawned', {
      id,
      parentId,
      task: taskDescription.slice(0, 80)
    });

    return state;
  }

  /**
   * 更新意识体状态
   */
  updateStatus(consciousnessId: string, status: ConsciousnessStatus): void {
    const node = this.findNode(consciousnessId);
    if (!node) return;

    node.state.status = status;

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      node.active = false;
      // 更新父意识的活跃子意识计数
      if (node.state.level === 'execution') {
        const parent = this.findNode((node.state as ExecutionContextState).parentId);
        if (parent && parent.state.level === 'self_awareness') {
          let activeCount = 0;
          for (const child of parent.children.values()) {
            if (child.active) activeCount++;
          }
          (parent.state as SelfAwarenessState).activeChildren = activeCount;
        }
      }
    }
  }

  /**
   * 更新自我感知意识的进度和阶段
   */
  updateProgress(progress: number, phase: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.progress = progress;
    state.currentPhase = phase;
  }

  /**
   * 添加近期决策
   */
  addDecision(decision: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.recentDecisions.push(decision);
    // 只保留最近 5 条在内存
    if (state.recentDecisions.length > 5) {
      state.recentDecisions.shift();
    }
  }

  /**
   * 添加近期结果
   */
  addRecentResult(summary: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.recentResults.push(summary);
    // 只保留最近 2 条
    if (state.recentResults.length > 2) {
      state.recentResults.shift();
    }
  }

  /**
   * 添加已修改文件
   */
  addFileTouched(filePath: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    if (!state.filesTouched.includes(filePath)) {
      state.filesTouched.push(filePath);
    }
  }

  /**
   * 添加困难记录
   */
  addDifficulty(difficulty: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.difficulties.push(difficulty);
  }

  // === 结果压缩 ===

  /**
   * 压缩子意识执行结果并存入记忆
   *
   * 原始 context 保存到磁盘，内存中只保留压缩摘要。
   */
  compressResult(
    consciousnessId: string,
    result: ConsciousnessResult,
    messages: Array<{ role: string; content: string }>
  ): string {
    // 1. 保存原始 context 到磁盘
    const node = this.findNode(consciousnessId);
    if (node && this.currentTaskId) {
      this.contextStorage.save(this.currentTaskId, {
        consciousnessId,
        parentConsciousnessId: node.state.level === 'execution'
          ? (node.state as ExecutionContextState).parentId
          : undefined,
        level: node.state.level,
        taskDescription: node.state.level === 'execution'
          ? (node.state as ExecutionContextState).taskDescription
          : (node.state as SelfAwarenessState).taskSummary,
        messages,
        iterations: result.iterations,
        success: result.success,
        terminatedReason: result.success ? 'completed' : 'error',
        tokenUsage: result.tokenUsage,
        createdAt: new Date().toISOString()
      });
    }

    // 2. 使用 result.compressedSummary 或 finalAnswer 作为摘要
    const summary = result.compressedSummary ?? result.finalAnswer;

    // 3. 存入记忆
    const phase = node?.state.level === 'execution'
      ? (node.state as ExecutionContextState).taskDescription.split(' ').slice(0, 3).join(' ')
      : '主任务';

    this.memoryStore.store({
      phase,
      type: 'result_summary',
      summary: summary.slice(0, 200),
      content: summary,
      relatedFiles: result.filesTouched
    });

    // 4. 更新根意识的近期结果
    this.addRecentResult(summary.slice(0, 100));
    for (const f of result.filesTouched) {
      this.addFileTouched(f);
    }

    // 5. 更新索引
    if (this.root) {
      const state = this.root.state as SelfAwarenessState;
      state.memoryIndex = this.memoryStore.getIndex();
    }

    debug(NS, LogLevel.BASIC, 'Result compressed and stored', {
      consciousnessId,
      success: result.success,
      filesTouched: result.filesTouched.length
    });

    return summary;
  }

  // === 记忆检索 ===

  /**
   * 检索记忆
   */
  recallMemory(query: MemoryQuery): MemoryEntry[] {
    return this.memoryStore.query(query);
  }

  // === 审批 ===

  /**
   * 创建审批请求
   */
  createApprovalRequest(
    requesterId: string,
    action: string,
    reason: string,
    riskLevel: 'low' | 'medium' | 'high',
    toolCall?: { name: string; parameters: Record<string, unknown> }
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      id: generateId('approval'),
      requesterId,
      action,
      reason,
      riskLevel,
      toolCall,
      createdAt: new Date().toISOString()
    };
    this.pendingApprovals.set(request.id, request);
    return request;
  }

  /**
   * 处理审批响应
   */
  resolveApproval(requestId: string, response: ApprovalResponse): void {
    this.pendingApprovals.delete(requestId);
  }

  /**
   * 获取挂起的审批请求
   */
  getPendingApproval(requestId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId);
  }

  // === 迭代管理 ===

  /**
   * 增加迭代计数
   */
  incrementIteration(consciousnessId?: string): number {
    const id = consciousnessId ?? 'root';
    const node = this.findNode(id);
    if (!node) return 0;

    if (node.state.level === 'self_awareness') {
      const state = node.state as SelfAwarenessState;
      state.iteration++;
      return state.iteration;
    }
    return 0;
  }

  /**
   * 检查是否达到最大迭代
   */
  isMaxIterations(consciousnessId?: string): boolean {
    const id = consciousnessId ?? 'root';
    const node = this.findNode(id);
    if (!node) return true;

    if (node.state.level === 'self_awareness') {
      const state = node.state as SelfAwarenessState;
      return state.iteration >= state.maxIterations;
    }
    return false;
  }

  // === 树操作 ===

  /**
   * 获取当前活跃的意识体
   */
  getActive(): ConsciousnessNode | null {
    return this.activeNode;
  }

  /**
   * 设置活跃意识体（用于恢复上下文）
   */
  setActive(consciousnessId: string): void {
    const node = this.findNode(consciousnessId);
    if (node) {
      this.activeNode = node;
    }
  }

  /**
   * 获取意识体树快照（调试用）
   */
  getTreeSnapshot(): object {
    if (!this.root) return {};
    return this.serializeNode(this.root);
  }

  /**
   * 结束任务，保存根意识 context
   */
  finalize(messages: Array<{ role: string; content: string }>, success: boolean, overrideTaskId?: string): void {
    if (!this.root) return;

    const taskId = overrideTaskId ?? this.currentTaskId;
    if (!taskId) return;

    const state = this.root.state as SelfAwarenessState;
    this.updateStatus('root', success ? 'completed' : 'failed');

    this.contextStorage.saveRoot(taskId!, {
      consciousnessId: 'root',
      taskDescription: state.taskSummary,
      messages,
      iterations: state.iteration,
      success,
      terminatedReason: success ? 'completed' : 'error',
      tokenUsage: undefined,
      createdAt: new Date().toISOString()
    });

    debug(NS, LogLevel.BASIC, 'Task finalized', {
      taskId: this.currentTaskId,
      success,
      iterations: state.iteration,
      memories: state.memoryIndex.length
    });
  }

  // === 内部方法 ===

  private findNode(id: string): ConsciousnessNode | null {
    if (this.root?.id === id) return this.root;
    return this.root ? this.findNodeInTree(this.root, id) : null;
  }

  private findNodeInTree(node: ConsciousnessNode, id: string): ConsciousnessNode | null {
    for (const child of node.children.values()) {
      if (child.id === id) return child;
      const found = this.findNodeInTree(child, id);
      if (found) return found;
    }
    return null;
  }

  private serializeNode(node: ConsciousnessNode): object {
    const state = node.state;
    return {
      id: node.id,
      active: node.active,
      status: state.status,
      level: state.level,
      ...(state.level === 'self_awareness'
        ? {
            taskSummary: (state as SelfAwarenessState).taskSummary,
            progress: (state as SelfAwarenessState).progress,
            currentPhase: (state as SelfAwarenessState).currentPhase,
            iteration: (state as SelfAwarenessState).iteration
          }
        : {
            taskDescription: (state as ExecutionContextState).taskDescription,
            parentId: (state as ExecutionContextState).parentId
          }),
      children: [...node.children.values()].map(c => this.serializeNode(c))
    };
  }
}
