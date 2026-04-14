// packages/agent/src/memory-store.ts
/**
 * MemoryStore - 双层记忆存储
 *
 * Offline Memory：磁盘全量流水账（.tramber/memory/）
 * Online Memory：守护意识实时持有的子集（LRU 策略）
 *
 * 策略：
 * - 总量 ≤ ONLINE_THRESHOLD（默认 1000）：Online = 全量
 * - 总量 > ONLINE_THRESHOLD：早期概括 + 最近 RECENT_KEEP 条原样保留
 * - 每增 100 条，滚动重概括一次
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type {
  MemoryEntry, MemoryIndexEntry, MemoryQuery, MemoryType, OnlineMemory,
  BaseEntity, EntityQuery, EntityType, ResourceEntity, ResourceSummary, Relation,
  DomainTaskEntity, SubtaskEntity, AnalysisEntity, RuleEntity
} from '@tramber/shared';
import { generateId, debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MEMORY;

export interface MemoryStoreOptions {
  rootDir: string;
  /** Online Memory 阈值（默认 1000） */
  onlineThreshold?: number;
  /** Online Memory 保留近期条目数（默认 500） */
  recentKeep?: number;
}

/** Offline Memory 索引中的条目（比 MemoryEntry 轻） */
interface OfflineIndexEntry {
  id: string;
  taskId?: string;
  domain: string;
  type: MemoryType;
  summary: string;
}

/** 实体索引条目 */
interface EntityIndexEntry {
  id: string;           // 类型前缀 ID
  type: EntityType;
  domain: string;
  order: number;
}

export class MemoryStore {
  private rootDir: string;
  private onlineThreshold: number;
  private recentKeep: number;

  private indexCache: Map<string, OfflineIndexEntry[]> = new Map(); // taskId -> index
  private entityIndexCache: Map<string, EntityIndexEntry[]> = new Map(); // taskId -> entity index
  /** Online Memory 缓存 */
  private onlineCache: OnlineMemory | null = null;
  /** 上次概括时的 Offline 总量（用于判断是否需要重新概括） */
  private lastSummarizedCount = 0;
  /** 全局实体计数器 */
  private entityOrderCounter: number = 0;

  constructor(options: MemoryStoreOptions) {
    this.rootDir = options.rootDir;
    this.onlineThreshold = options.onlineThreshold ?? 1000;
    this.recentKeep = options.recentKeep ?? 500;
    this.ensureRootDir();
  }

  // === 写入 ===

  /** 写入一条 Offline Memory */
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const taskId = entry.taskId;
    if (!taskId) {
      debugError(NS, 'Memory store requires taskId', { entry });
      throw new Error('Memory store requires taskId');
    }

    const fullEntry: MemoryEntry = {
      ...entry,
      id: generateId('mem'),
      createdAt: new Date().toISOString()
    };

    // 按任务分目录存储
    const taskDir = this.getTaskDir(taskId);
    const entriesDir = join(taskDir, 'entries');
    if (!existsSync(entriesDir)) {
      mkdirSync(entriesDir, { recursive: true });
    }

    // 写入条目文件
    const entryPath = join(entriesDir, `${fullEntry.id}.json`);
    try {
      writeFileSync(entryPath, JSON.stringify(fullEntry, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to write memory entry', err);
      throw err;
    }

    // 更新该任务的索引
    const indexEntry: OfflineIndexEntry = {
      id: fullEntry.id,
      taskId: fullEntry.taskId,
      domain: fullEntry.domain,
      type: fullEntry.type,
      summary: fullEntry.summary
    };
    const index = this.loadTaskIndex(taskId);
    index.push(indexEntry);
    this.saveTaskIndex(taskId, index);

    // 清除缓存
    this.indexCache.delete(taskId);
    this.onlineCache = null;

    debug(NS, LogLevel.BASIC, 'Memory stored', { id: fullEntry.id, type: fullEntry.type, domain: fullEntry.domain, taskId });
    return fullEntry;
  }

  // === Online Memory ===

  /** 获取 Online Memory（守护意识 Context 使用） */
  getOnlineMemory(taskId?: string): OnlineMemory {
    const effectiveTaskId = taskId;
    if (!effectiveTaskId) {
      // 没有 taskId 时返回空的 Online Memory
      return { earlySummary: '', recentEntries: [], totalCount: 0 };
    }

    const cacheKey = effectiveTaskId;
    if (this.onlineCache && this.onlineCache.taskId === cacheKey) return this.onlineCache;

    const index = this.loadTaskIndex(effectiveTaskId);
    const totalCount = index.length;

    if (totalCount <= this.onlineThreshold) {
      // 全量加载
      const allEntries = index.map(e => this.loadEntry(e.taskId!, e.id)).filter((e): e is MemoryEntry => e !== null);
      this.onlineCache = {
        taskId: cacheKey,
        earlySummary: '',
        recentEntries: allEntries,
        totalCount
      };
      return this.onlineCache;
    }

    // LRU 策略：早期概括 + 近期原样
    const recentIndex = index.slice(-this.recentKeep);
    const recentEntries = recentIndex.map(e => this.loadEntry(e.taskId!, e.id)).filter((e): e is MemoryEntry => e !== null);

    this.onlineCache = {
      taskId: cacheKey,
      earlySummary: this.getOrGenerateEarlySummary(index, effectiveTaskId),
      recentEntries,
      totalCount
    };
    return this.onlineCache;
  }

  /** 获取索引（用于 prompt 注入） */
  getIndex(taskId?: string): MemoryIndexEntry[] {
    if (!taskId) return [];
    return this.loadTaskIndex(taskId).map(e => ({
      id: e.id,
      taskId: e.taskId,
      domain: e.domain,
      type: e.type,
      summary: e.summary
    }));
  }

  // === 检索 ===

  query(query: MemoryQuery & { taskId?: string } = {}): MemoryEntry[] {
    const { taskId, domain, type, keyword, limit = 5 } = query;
    if (!taskId) return [];

    const index = this.loadTaskIndex(taskId);

    let matchedIds = index
      .filter(entry => {
        if (domain && entry.domain !== domain) return false;
        if (type && entry.type !== type) return false;
        if (keyword && !entry.summary.toLowerCase().includes(keyword.toLowerCase())) return false;
        return true;
      })
      .map(entry => ({ id: entry.id, taskId: entry.taskId }));

    matchedIds = matchedIds.slice(-limit); // 最近优先

    return matchedIds.map(item => this.loadEntry(item.taskId!, item.id)).filter((e): e is MemoryEntry => e !== null);
  }

  get(taskId: string, id: string): MemoryEntry | null {
    return this.loadEntry(taskId, id);
  }

  clear(taskId?: string): void {
    if (taskId) {
      // 清除指定任务的 memory
      const taskDir = this.getTaskDir(taskId);
      try {
        if (existsSync(taskDir)) {
          const entriesDir = join(taskDir, 'entries');
          if (existsSync(entriesDir)) {
            const files = readdirSync(entriesDir);
            for (const f of files) {
              if (f.endsWith('.json')) {
                unlinkSync(join(entriesDir, f));
              }
            }
          }
          this.saveTaskIndex(taskId, []);
        }
      } catch (err) {
        debugError(NS, 'Failed to clear task memory', err);
      }
    } else {
      // 清除所有（兼容旧行为）
      this.clearAll();
    }
    this.indexCache.clear();
    this.onlineCache = null;
  }

  private clearAll(): void {
    try {
      if (!existsSync(this.rootDir)) return;
      const taskDirs = readdirSync(this.rootDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('conv-') || d.name.startsWith('task-'));
      for (const d of taskDirs) {
        const taskDir = join(this.rootDir, d.name);
        const entriesDir = join(taskDir, 'entries');
        if (existsSync(entriesDir)) {
          const files = readdirSync(entriesDir);
          for (const f of files) {
            if (f.endsWith('.json')) {
              unlinkSync(join(entriesDir, f));
            }
          }
        }
        const indexPath = join(taskDir, 'index.json');
        if (existsSync(indexPath)) {
          unlinkSync(indexPath);
        }
      }
    } catch (err) {
      debugError(NS, 'Failed to clear all memory', err);
    }
  }

  // === 内部方法 ===

  private getTaskDir(taskId: string): string {
    return join(this.rootDir, taskId);
  }

  private getOrGenerateEarlySummary(index: OfflineIndexEntry[], taskId: string): string {
    const earlyCount = index.length - this.recentKeep;
    if (earlyCount <= 0) return '';

    // 检查是否需要重新概括（每 100 条重概括一次）
    if (this.lastSummarizedCount > 0 && Math.abs(earlyCount - this.lastSummarizedCount) < 100) {
      // 尝试读取已保存的概括
      const summaryPath = join(this.getTaskDir(taskId), 'early-summary.txt');
      if (existsSync(summaryPath)) {
        return readFileSync(summaryPath, 'utf-8');
      }
    }

    // 简单概括：按领域分组统计
    const earlyEntries = index.slice(0, earlyCount);
    const domainGroups: Record<string, number> = {};

    for (const e of earlyEntries) {
      domainGroups[e.domain] = (domainGroups[e.domain] || 0) + 1;
    }

    // 取每个领域的最后几条 summary 作为代表
    const domainSummaries: string[] = [];
    for (const [domain, count] of Object.entries(domainGroups)) {
      const domainEntries = earlyEntries.filter(e => e.domain === domain).slice(-3);
      const samples = domainEntries.map(e => e.summary).join('；');
      domainSummaries.push(`[${domain}] 共${count}条交互，最近：${samples}`);
    }

    const summary = `早期交互概括（共${earlyCount}条）：\n${domainSummaries.join('\n')}`;
    this.lastSummarizedCount = earlyCount;

    // 保存概括到磁盘
    try {
      writeFileSync(join(this.getTaskDir(taskId), 'early-summary.txt'), summary, 'utf-8');
    } catch { /* ignore */ }

    return summary;
  }

  private ensureRootDir(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private loadTaskIndex(taskId: string): OfflineIndexEntry[] {
    if (this.indexCache.has(taskId)) return this.indexCache.get(taskId)!;
    try {
      const indexPath = join(this.getTaskDir(taskId), 'index.json');
      if (!existsSync(indexPath)) return [];
      const raw = readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(raw);
      this.indexCache.set(taskId, index);
      return index;
    } catch {
      return [];
    }
  }

  private saveTaskIndex(taskId: string, index: OfflineIndexEntry[]): void {
    try {
      const taskDir = this.getTaskDir(taskId);
      if (!existsSync(taskDir)) {
        mkdirSync(taskDir, { recursive: true });
      }
      const indexPath = join(taskDir, 'index.json');
      writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      this.indexCache.set(taskId, index);
    } catch (err) {
      debugError(NS, 'Failed to save memory index', err);
    }
  }

  private loadEntry(taskId: string, id: string): MemoryEntry | null {
    try {
      const entryPath = join(this.getTaskDir(taskId), 'entries', `${id}.json`);
      if (!existsSync(entryPath)) return null;
      const raw = readFileSync(entryPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // === 实体图谱方法（Stage 9） ===

  /** 存储实体（支持扩展字段） */
  storeEntity(taskId: string, entity: Record<string, unknown> & { type: EntityType; domain: string; content: string; relations: Relation[] }): BaseEntity {
    // 生成唯一 ID：类型前缀 + 时间戳36进制 + 随机后缀（避免毫秒级碰撞）
    // 结果格式：u:mnwsh3ju-tevi5, dt:mnwsh3jx-97rre, s:mnwsh3k4-1udwi
    const prefix = this.getTypePrefix(entity.type as EntityType);
    const rawId = generateId(prefix); // 返回 "u-mnwsh3ju-tevi5yf"
    // 使用完整的后半部分（时间戳+随机），避免截断导致碰撞
    const uniquePart = rawId.split('-').slice(1).join('-') || rawId;
    const id = `${prefix}:${uniquePart}`;

    // 获取并递增 order
    const order = this.getNextEntityOrder(taskId);

    // 根据类型决定版本策略
    const version = this.getVersionStrategy(entity.type as EntityType);

    const fullEntity: BaseEntity = {
      ...(entity as Record<string, unknown>),
      id,
      order,
      version,
      createdAt: new Date().toISOString()
    } as BaseEntity;

    // 确保目录存在
    const taskDir = this.getTaskDir(taskId);
    const entitiesDir = join(taskDir, 'entities');
    if (!existsSync(entitiesDir)) {
      mkdirSync(entitiesDir, { recursive: true });
    }

    // 写入实体文件（文件名用 ID，前缀中的冒号替换为横线）
    const fileName = id.replace(':', '-');
    const entityPath = join(entitiesDir, `${fileName}.json`);
    try {
      writeFileSync(entityPath, JSON.stringify(fullEntity, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to write entity', err);
      throw err;
    }

    // 更新实体索引
    const indexEntry: EntityIndexEntry = {
      id: fullEntity.id,
      type: fullEntity.type,
      domain: fullEntity.domain,
      order: fullEntity.order
    };
    const index = this.loadEntityIndex(taskId);
    index.push(indexEntry);
    this.saveEntityIndex(taskId, index);

    // 清除缓存
    this.entityIndexCache.delete(taskId);

    debug(NS, LogLevel.BASIC, 'Entity stored', { id: fullEntity.id, type: fullEntity.type, domain: fullEntity.domain, taskId });
    return fullEntity;
  }

  /**
   * 合并关系（去重）
   * 确保 (type, target) 组合唯一
   */
  mergeRelations(existing: Relation[], newRelations: Relation[]): Relation[] {
    // 构建 existing 的唯一 key 集合
    const existingKeys = new Set(
      existing.map(r => `${r.type}:${r.target}`)
    );

    // 只添加不存在的关系
    const dedupedNew = newRelations.filter(r => {
      const key = `${r.type}:${r.target}`;
      if (existingKeys.has(key)) {
        debug(NS, LogLevel.BASIC, 'Relation deduplicated', { type: r.type, target: r.target });
        return false;
      }
      existingKeys.add(key); // 添加到集合，防止 newRelations 内部重复
      return true;
    });

    return [...existing, ...dedupedNew];
  }

  /** 获取实体 */
  getEntity(taskId: string, id: string): BaseEntity | null {
    try {
      const fileName = id.replace(':', '-');
      const entityPath = join(this.getTaskDir(taskId), 'entities', `${fileName}.json`);
      if (!existsSync(entityPath)) return null;
      const raw = readFileSync(entityPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 查询实体 */
  queryEntities(query: EntityQuery): BaseEntity[] {
    const { taskId, type, domain, keyword, limit = 20 } = query;
    if (!taskId) return [];

    const index = this.loadEntityIndex(taskId);

    let matchedIds = index
      .filter(entry => {
        if (type && entry.type !== type) return false;
        if (domain && entry.domain !== domain) return false;
        return true;
      })
      .map(entry => entry.id);

    // 按顺序倒序（最新的优先）
    matchedIds = matchedIds.reverse().slice(0, limit);

    const entities = matchedIds.map(id => this.getEntity(taskId, id)).filter((e): e is BaseEntity => e !== null);

    // keyword 过滤需要加载实体内容
    if (keyword) {
      return entities.filter(e => e.content.toLowerCase().includes(keyword.toLowerCase()));
    }

    return entities;
  }

  /** 按领域查询实体 */
  queryByDomain(taskId: string, domain: string): BaseEntity[] {
    return this.queryEntities({ taskId, domain });
  }

  /** 按类型查询实体 */
  queryByType(taskId: string, type: EntityType): BaseEntity[] {
    return this.queryEntities({ taskId, type });
  }

  /** 按领域任务查询子任务 */
  queryByDomainTask(taskId: string, domainTaskId: string): SubtaskEntity[] {
    const index = this.loadEntityIndex(taskId);
    const subtaskIds = index
      .filter(entry => entry.type === 'subtask')
      .map(entry => entry.id);

    const subtasks = subtaskIds
      .map(id => this.getEntity(taskId, id))
      .filter((e): e is BaseEntity => e !== null && e.type === 'subtask')
      .filter(e => (e as SubtaskEntity).domainTaskId === domainTaskId);

    return subtasks as SubtaskEntity[];
  }

  /** 查找资源实体（用于去重） */
  findByUri(taskId: string, uri: string): ResourceEntity | null {
    const index = this.loadEntityIndex(taskId);
    for (const entry of index) {
      if (entry.type === 'resource') {
        const entity = this.getEntity(taskId, entry.id);
        if (entity && entity.type === 'resource' && (entity as ResourceEntity).uri === uri) {
          return entity as ResourceEntity;
        }
      }
    }
    return null;
  }

  /** 合并资源实体（用于去重更新） */
  mergeResource(taskId: string, uri: string, newSummary: ResourceSummary, newRelations: Relation[]): ResourceEntity | null {
    const existing = this.findByUri(taskId, uri);
    if (!existing) return null;

    // 更新版本（数字版本递增）
    const versionNum = parseInt(existing.version.replace('v', '')) + 1;
    existing.version = `v${versionNum}`;

    // 【关键修改】使用去重方法合并关系
    existing.relations = this.mergeRelations(existing.relations, newRelations);

    // 更新摘要
    existing.summary = newSummary;

    // 保存
    const fileName = existing.id.replace(':', '-');
    const entityPath = join(this.getTaskDir(taskId), 'entities', `${fileName}.json`);
    try {
      writeFileSync(entityPath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to merge resource', err);
      throw err;
    }

    debug(NS, LogLevel.BASIC, 'Resource merged', { id: existing.id, uri, version: existing.version });
    return existing;
  }

  /** 更新实体（支持扩展字段） */
  updateEntity(taskId: string, id: string, updates: Record<string, unknown>): BaseEntity | null {
    const entity = this.getEntity(taskId, id);
    if (!entity) return null;

    // 如果更新包含 relations，需要去重
    if (updates.relations && Array.isArray(updates.relations)) {
      updates.relations = this.mergeRelations(entity.relations, updates.relations as Relation[]);
    }

    const updated = { ...entity, ...updates } as BaseEntity;

    // 写回
    const fileName = id.replace(':', '-');
    const entityPath = join(this.getTaskDir(taskId), 'entities', `${fileName}.json`);
    try {
      writeFileSync(entityPath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to update entity', err);
      throw err;
    }

    return updated;
  }

  // === 实体内部方法 ===

  private getTypePrefix(type: EntityType): string {
    const prefixes: Record<EntityType, string> = {
      user_request: 'u',
      domain_task: 'dt',
      subtask: 's',
      analysis: 'a',
      rule: 'rl',
      resource: 'r'
    };
    return prefixes[type];
  }

  private getVersionStrategy(type: EntityType): string {
    // 数字版本：user_request, domain_task, subtask, resource
    // 时间版本：analysis, rule
    const numericTypes = ['user_request', 'domain_task', 'subtask', 'resource'];
    if (numericTypes.includes(type)) {
      return 'v1';
    }
    return new Date().toISOString();
  }

  private getNextEntityOrder(taskId: string): number {
    // 从索引文件读取计数器
    const counterPath = join(this.getTaskDir(taskId), 'entity-counter.json');
    try {
      if (existsSync(counterPath)) {
        const raw = readFileSync(counterPath, 'utf-8');
        const data = JSON.parse(raw);
        this.entityOrderCounter = data.counter || 0;
      }
    } catch {
      this.entityOrderCounter = 0;
    }

    this.entityOrderCounter++;
    this.saveEntityOrderCounter(taskId, this.entityOrderCounter);
    return this.entityOrderCounter;
  }

  private saveEntityOrderCounter(taskId: string, counter: number): void {
    try {
      const taskDir = this.getTaskDir(taskId);
      if (!existsSync(taskDir)) {
        mkdirSync(taskDir, { recursive: true });
      }
      writeFileSync(join(taskDir, 'entity-counter.json'), JSON.stringify({ counter }), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to save entity counter', err);
    }
  }

  private loadEntityIndex(taskId: string): EntityIndexEntry[] {
    if (this.entityIndexCache.has(taskId)) return this.entityIndexCache.get(taskId)!;
    try {
      const indexPath = join(this.getTaskDir(taskId), 'entity-index.json');
      if (!existsSync(indexPath)) return [];
      const raw = readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(raw);
      this.entityIndexCache.set(taskId, index);
      return index;
    } catch {
      return [];
    }
  }

  private saveEntityIndex(taskId: string, index: EntityIndexEntry[]): void {
    try {
      const taskDir = this.getTaskDir(taskId);
      if (!existsSync(taskDir)) {
        mkdirSync(taskDir, { recursive: true });
      }
      writeFileSync(join(taskDir, 'entity-index.json'), JSON.stringify(index, null, 2), 'utf-8');
      this.entityIndexCache.set(taskId, index);
    } catch (err) {
      debugError(NS, 'Failed to save entity index', err);
    }
  }
}
