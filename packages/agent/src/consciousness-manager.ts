// packages/agent/src/consciousness-manager.ts
/**
 * ConsciousnessManager - 意识体管理器
 *
 * 守护意识（Guardian）：调度、环境感知、记忆管理
 * 领域子意识（Domain Child）：按领域持久，可封存/激活
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
import { buildSelfAwarenessPrompt } from './consciousness-prompts.js';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export interface ConsciousnessManagerOptions {
  agentId: string;
  memoryStore: MemoryStore;
  contextStorage: ContextStorage;
  maxIterations?: number;
}

export class ConsciousnessManager {
  private agentId: string;
  private memoryStore: MemoryStore;
  private contextStorage: ContextStorage;
  private maxIterations: number;
  private root: ConsciousnessNode | null = null;
  private activeNode: ConsciousnessNode | null = null;
  private currentTaskId: string | null = null;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(options: ConsciousnessManagerOptions) {
    this.agentId = options.agentId;
    this.memoryStore = options.memoryStore;
    this.contextStorage = options.contextStorage;
    this.maxIterations = options.maxIterations ?? 30;
  }

  // === 守护意识 ===

  /** 创建守护意识 */
  createRoot(taskId: string, taskDescription: string, sceneId: string): SelfAwarenessState {
    this.currentTaskId = taskId;

    const state: SelfAwarenessState = {
      id: 'root',
      level: 'self_awareness',
      status: 'thinking',
      activeDomain: null,
      domains: {},
      rules: [],
      environment: {
        project: process.cwd(),
        sceneId
      },
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

    debug(NS, LogLevel.BASIC, 'Guardian consciousness created', { taskId, sceneId });
    return state;
  }

  getRoot(): SelfAwarenessState | null {
    if (!this.root) return null;
    return this.root.state as SelfAwarenessState;
  }

  /** 重建守护意识系统提示词（反映当前领域状态） */
  buildGuardianPrompt(): string {
    if (!this.root) return '';
    return buildSelfAwarenessPrompt(
      '',
      this.root.state as SelfAwarenessState,
      this.root.children
    );
  }

  // === 领域子意识管理 ===

  /** 查找领域对应的子意识节点 */
  findChildByDomain(domain: string): ConsciousnessNode | null {
    if (!this.root) return null;
    for (const child of this.root.children.values()) {
      const state = child.state as ExecutionContextState;
      if (state.domain === domain) return child;
    }
    return null;
  }

  /** 创建领域子意识 */
  createDomainChild(
    domain: string,
    domainDescription: string,
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
      parentId: 'root',
      domain,
      domainDescription,
      isNew: true,
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

    this.root!.children.set(id, node);

    // 更新守护意识的领域映射
    const rootState = this.root!.state as SelfAwarenessState;
    rootState.domains[domain] = id;
    rootState.activeDomain = domain;

    this.activeNode = node;

    debug(NS, LogLevel.BASIC, 'Domain child created', { id, domain, task: taskDescription.slice(0, 80) });
    return state;
  }

  /** 激活已封存的领域子意识 */
  reactivateChild(domain: string): ExecutionContextState | null {
    const node = this.findChildByDomain(domain);
    if (!node) return null;

    node.active = true;
    const state = node.state as ExecutionContextState;
    state.status = 'active';
    state.isNew = false;

    // 更新守护意识
    const rootState = this.root!.state as SelfAwarenessState;
    rootState.activeDomain = domain;

    this.activeNode = node;

    debug(NS, LogLevel.BASIC, 'Domain child reactivated', { id: state.id, domain });
    return state;
  }

  /** 封存领域子意识 */
  sealChild(domain: string): void {
    const node = this.findChildByDomain(domain);
    if (!node) return;

    node.active = false;
    const state = node.state as ExecutionContextState;
    state.status = 'sealed';

    // 更新守护意识
    const rootState = this.root!.state as SelfAwarenessState;
    if (rootState.activeDomain === domain) {
      rootState.activeDomain = null;
    }

    debug(NS, LogLevel.BASIC, 'Domain child sealed', { id: state.id, domain });
  }

  /** 获取领域子意识（活跃或封存） */
  getDomainChild(domain: string): ExecutionContextState | null {
    const node = this.findChildByDomain(domain);
    if (!node) return null;
    return node.state as ExecutionContextState;
  }

  /** 获取所有领域信息 */
  getDomainList(): Array<{ domain: string; childId: string; status: string }> {
    if (!this.root) return [];
    const result: Array<{ domain: string; childId: string; status: string }> = [];
    for (const child of this.root.children.values()) {
      const state = child.state as ExecutionContextState;
      result.push({
        domain: state.domain,
        childId: state.id,
        status: child.active ? 'active' : 'sealed'
      });
    }
    return result;
  }

  // === 状态更新 ===

  updateStatus(consciousnessId: string, status: ConsciousnessStatus): void {
    const node = this.findNode(consciousnessId);
    if (!node) return;
    node.state.status = status;
  }

  updateProgress(progress: number, phase: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    // progress 和 phase 可用于 domain tracking
  }

  addRule(rule: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    if (!state.rules.includes(rule)) {
      state.rules.push(rule);
    }
  }

  addDecision(decision: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.recentDecisions.push(decision);
    if (state.recentDecisions.length > 5) state.recentDecisions.shift();
  }

  addRecentResult(summary: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.recentResults.push(summary);
    if (state.recentResults.length > 5) state.recentResults.shift();
  }

  /**
   * 添加调度记录 — 领域+请求+结果的结构化摘要
   * 格式：用户：xxx → xxx子意识：xxx
   */
  addDispatchRecord(domain: string, userRequest: string, keyFinding: string): void {
    const record = `用户：${userRequest} → ${domain}子意识：${keyFinding}`;
    this.addRecentResult(record);
  }

  addFileTouched(filePath: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    if (!state.filesTouched.includes(filePath)) {
      state.filesTouched.push(filePath);
    }
  }

  addDifficulty(difficulty: string): void {
    if (!this.root) return;
    const state = this.root.state as SelfAwarenessState;
    state.difficulties.push(difficulty);
  }

  // === 记忆写入 ===

  /** 写入流水账条目（自动填充 currentTaskId） */
  recordMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): void {
    const fullEntry = {
      ...entry,
      taskId: entry.taskId ?? this.currentTaskId ?? undefined
    };
    this.memoryStore.store(fullEntry);

    // 更新守护意识的 memoryIndex
    if (this.root && fullEntry.taskId) {
      const state = this.root.state as SelfAwarenessState;
      state.memoryIndex = this.memoryStore.getIndex(fullEntry.taskId);
    }
  }

  /** 记录用户对话概括 */
  recordUserTurn(domain: string, userSummary: string): void {
    this.recordMemory({
      taskId: this.currentTaskId ?? undefined,
      sourceId: 'guardian',
      domain,
      type: 'user_turn',
      summary: userSummary,
      content: userSummary,
      relatedFiles: []
    });
  }

  /** 记录领域切换 */
  recordDomainSwitch(fromDomain: string | null, toDomain: string, reason: string): void {
    this.recordMemory({
      taskId: this.currentTaskId ?? undefined,
      sourceId: 'guardian',
      domain: 'global',
      type: 'domain_switch',
      summary: `${fromDomain ?? '新'} → ${toDomain}: ${reason}`,
      content: reason,
      relatedFiles: []
    });
  }

  // === 结果压缩 ===

  compressResult(
    consciousnessId: string,
    result: ConsciousnessResult,
    messages: Array<{ role: string; content: string }>
  ): string {
    // 1. 保存原始 context 到磁盘
    const node = this.findNode(consciousnessId);
    if (node && this.currentTaskId) {
      const execState = node.state as ExecutionContextState;
      this.contextStorage.save(this.currentTaskId, {
        consciousnessId,
        parentConsciousnessId: execState.parentId,
        level: execState.level,
        domain: execState.domain,
        taskDescription: execState.taskDescription,
        messages,
        iterations: result.iterations,
        success: result.success,
        terminatedReason: result.success ? 'completed' : 'error',
        tokenUsage: result.tokenUsage,
        createdAt: new Date().toISOString()
      });
    }

    // 2. 结果摘要（守护意识会通过 compress_and_remember 写简短摘要）
    const rawSummary = result.compressedSummary ?? result.finalAnswer;

    // 3. 记录文件（不写 memory — 守护意识通过 compress_and_remember 写自己的分析）
    for (const f of result.filesTouched) {
      this.addFileTouched(f);
    }

    debug(NS, LogLevel.BASIC, 'Result compressed', {
      consciousnessId,
      success: result.success,
      domain: node?.state.level === 'execution'
        ? (node.state as ExecutionContextState).domain
        : 'global'
    });

    return rawSummary;
  }

  // === 记忆检索 ===

  recallMemory(query: MemoryQuery): MemoryEntry[] {
    return this.memoryStore.query({
      ...query,
      taskId: this.currentTaskId ?? undefined
    });
  }

  // === 审批 ===

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

  resolveApproval(requestId: string, response: ApprovalResponse): void {
    this.pendingApprovals.delete(requestId);
  }

  getPendingApproval(requestId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId);
  }

  // === 迭代 ===

  incrementIteration(consciousnessId?: string): number {
    const id = consciousnessId ?? 'root';
    const node = this.findNode(id);
    if (!node || node.state.level !== 'self_awareness') return 0;
    const state = node.state as SelfAwarenessState;
    state.iteration++;
    return state.iteration;
  }

  // === 结束 ===

  finalize(messages: Array<{ role: string; content: string }>, success: boolean, overrideTaskId?: string): void {
    if (!this.root) return;

    const taskId = overrideTaskId ?? this.currentTaskId;
    if (!taskId) return;

    const state = this.root.state as SelfAwarenessState;
    this.updateStatus('root', success ? 'completed' : 'failed');

    // 保存守护意识 context
    this.contextStorage.saveRoot(taskId!, {
      consciousnessId: 'root',
      taskDescription: 'Guardian session',
      messages,
      iterations: state.iteration,
      success,
      terminatedReason: success ? 'completed' : 'error',
      createdAt: new Date().toISOString()
    });

    debug(NS, LogLevel.BASIC, 'Session finalized', {
      taskId: this.currentTaskId,
      success,
      domains: Object.keys(state.domains).length,
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
}
