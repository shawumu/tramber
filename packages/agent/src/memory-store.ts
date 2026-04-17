// packages/agent/src/memory-store.ts
/**
 * MemoryStore - 对话记忆 + 实体图谱存储
 *
 * 对话记忆（Memory entries）：磁盘全量流水账（过渡期保留）
 * 实体图谱（Entity graph）：委托给 EntityStore
 *
 * 外部调用方通过 MemoryStore 统一访问，实体操作自动委托给 EntityStore。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type {
  MemoryEntry, MemoryIndexEntry, MemoryQuery, MemoryType, OnlineMemory,
  BaseEntity, EntityQuery, EntityType, ResourceEntity, ResourceSummary, Relation,
  SubtaskEntity
} from '@tramber/shared';
import { generateId, debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { EntityStore } from './entity-store.js';

const NS = NAMESPACE.CONSCIOUSNESS_MEMORY;

export interface MemoryStoreOptions {
  rootDir: string;
  onlineThreshold?: number;
  recentKeep?: number;
}

interface OfflineIndexEntry {
  id: string;
  taskId?: string;
  domain: string;
  type: MemoryType;
  summary: string;
}

export class MemoryStore {
  private rootDir: string;
  private onlineThreshold: number;
  private recentKeep: number;
  private indexCache: Map<string, OfflineIndexEntry[]> = new Map();
  private onlineCache: OnlineMemory | null = null;
  private lastSummarizedCount = 0;

  /** 实体图谱存储 */
  private entityStore: EntityStore;

  constructor(options: MemoryStoreOptions) {
    this.rootDir = options.rootDir;
    this.onlineThreshold = options.onlineThreshold ?? 1000;
    this.recentKeep = options.recentKeep ?? 500;
    this.entityStore = new EntityStore(options.rootDir);
    this.ensureRootDir();
  }

  /** 获取 EntityStore 实例 */
  getEntityStore(): EntityStore {
    return this.entityStore;
  }

  // === Memory Entries（过渡期保留） ===

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

    const taskDir = this.getTaskDir(taskId);
    const entriesDir = join(taskDir, 'entries');
    if (!existsSync(entriesDir)) mkdirSync(entriesDir, { recursive: true });

    const entryPath = join(entriesDir, `${fullEntry.id}.json`);
    try {
      writeFileSync(entryPath, JSON.stringify(fullEntry, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to write memory entry', err);
      throw err;
    }

    const indexEntry: OfflineIndexEntry = {
      id: fullEntry.id, taskId: fullEntry.taskId,
      domain: fullEntry.domain, type: fullEntry.type, summary: fullEntry.summary
    };
    const index = this.loadTaskIndex(taskId);
    index.push(indexEntry);
    this.saveTaskIndex(taskId, index);

    this.indexCache.delete(taskId);
    this.onlineCache = null;

    debug(NS, LogLevel.BASIC, 'Memory stored', { id: fullEntry.id, type: fullEntry.type, domain: fullEntry.domain, taskId });
    return fullEntry;
  }

  getOnlineMemory(taskId?: string): OnlineMemory {
    const effectiveTaskId = taskId;
    if (!effectiveTaskId) return { earlySummary: '', recentEntries: [], totalCount: 0 };

    if (this.onlineCache && this.onlineCache.taskId === effectiveTaskId) return this.onlineCache;

    const index = this.loadTaskIndex(effectiveTaskId);
    const totalCount = index.length;

    if (totalCount <= this.onlineThreshold) {
      const allEntries = index.map(e => this.loadEntry(e.taskId!, e.id)).filter((e): e is MemoryEntry => e !== null);
      this.onlineCache = { taskId: effectiveTaskId, earlySummary: '', recentEntries: allEntries, totalCount };
      return this.onlineCache;
    }

    const recentIndex = index.slice(-this.recentKeep);
    const recentEntries = recentIndex.map(e => this.loadEntry(e.taskId!, e.id)).filter((e): e is MemoryEntry => e !== null);

    this.onlineCache = {
      taskId: effectiveTaskId,
      earlySummary: this.getOrGenerateEarlySummary(index, effectiveTaskId),
      recentEntries, totalCount
    };
    return this.onlineCache;
  }

  getIndex(taskId?: string): MemoryIndexEntry[] {
    if (!taskId) return [];
    return this.loadTaskIndex(taskId).map(e => ({
      id: e.id, taskId: e.taskId, domain: e.domain, type: e.type, summary: e.summary
    }));
  }

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

    matchedIds = matchedIds.slice(-limit);
    return matchedIds.map(item => this.loadEntry(item.taskId!, item.id)).filter((e): e is MemoryEntry => e !== null);
  }

  get(taskId: string, id: string): MemoryEntry | null {
    return this.loadEntry(taskId, id);
  }

  clear(taskId?: string): void {
    if (taskId) {
      const taskDir = this.getTaskDir(taskId);
      try {
        if (existsSync(taskDir)) {
          const entriesDir = join(taskDir, 'entries');
          if (existsSync(entriesDir)) {
            for (const f of readdirSync(entriesDir)) {
              if (f.endsWith('.json')) unlinkSync(join(entriesDir, f));
            }
          }
          this.saveTaskIndex(taskId, []);
        }
      } catch (err) {
        debugError(NS, 'Failed to clear task memory', err);
      }
    } else {
      this.clearAll();
    }
    this.indexCache.clear();
    this.onlineCache = null;
  }

  // === 实体图谱（委托给 EntityStore） ===

  storeEntity(taskId: string, entity: Record<string, unknown> & { type: EntityType; domain: string; content: string; relations: Relation[] }): BaseEntity {
    return this.entityStore.storeEntity(taskId, entity);
  }

  getEntity(taskId: string, id: string): BaseEntity | null {
    return this.entityStore.getEntity(taskId, id);
  }

  updateEntity(taskId: string, id: string, updates: Record<string, unknown>): BaseEntity | null {
    return this.entityStore.updateEntity(taskId, id, updates);
  }

  queryEntities(query: EntityQuery): BaseEntity[] {
    return this.entityStore.queryEntities(query);
  }

  queryByDomain(taskId: string, domain: string): BaseEntity[] {
    return this.entityStore.queryByDomain(taskId, domain);
  }

  queryByType(taskId: string, type: EntityType): BaseEntity[] {
    return this.entityStore.queryByType(taskId, type);
  }

  queryByDomainTask(taskId: string, domainTaskId: string): SubtaskEntity[] {
    return this.entityStore.queryByDomainTask(taskId, domainTaskId);
  }

  findByUri(taskId: string, uri: string): ResourceEntity | null {
    return this.entityStore.findByUri(taskId, uri);
  }

  mergeResource(taskId: string, uri: string, newSummary: ResourceSummary, newRelations: Relation[]): ResourceEntity | null {
    return this.entityStore.mergeResource(taskId, uri, newSummary, newRelations);
  }

  mergeRelations(existing: Relation[], newRelations: Relation[]): Relation[] {
    return this.entityStore.mergeRelations(existing, newRelations);
  }

  // === 内部方法（Memory entries） ===

  private getTaskDir(taskId: string): string {
    return join(this.rootDir, taskId);
  }

  private getOrGenerateEarlySummary(index: OfflineIndexEntry[], taskId: string): string {
    const earlyCount = index.length - this.recentKeep;
    if (earlyCount <= 0) return '';

    if (this.lastSummarizedCount > 0 && Math.abs(earlyCount - this.lastSummarizedCount) < 100) {
      const summaryPath = join(this.getTaskDir(taskId), 'early-summary.txt');
      if (existsSync(summaryPath)) return readFileSync(summaryPath, 'utf-8');
    }

    const earlyEntries = index.slice(0, earlyCount);
    const domainGroups: Record<string, number> = {};
    for (const e of earlyEntries) domainGroups[e.domain] = (domainGroups[e.domain] || 0) + 1;

    const domainSummaries: string[] = [];
    for (const [domain, count] of Object.entries(domainGroups)) {
      const samples = earlyEntries.filter(e => e.domain === domain).slice(-3).map(e => e.summary).join('；');
      domainSummaries.push(`[${domain}] 共${count}条交互，最近：${samples}`);
    }

    const summary = `早期交互概括（共${earlyCount}条）：\n${domainSummaries.join('\n')}`;
    this.lastSummarizedCount = earlyCount;

    try { writeFileSync(join(this.getTaskDir(taskId), 'early-summary.txt'), summary, 'utf-8'); } catch { /* ignore */ }
    return summary;
  }

  private ensureRootDir(): void {
    if (!existsSync(this.rootDir)) mkdirSync(this.rootDir, { recursive: true });
  }

  private loadTaskIndex(taskId: string): OfflineIndexEntry[] {
    if (this.indexCache.has(taskId)) return this.indexCache.get(taskId)!;
    try {
      const indexPath = join(this.getTaskDir(taskId), 'index.json');
      if (!existsSync(indexPath)) return [];
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      this.indexCache.set(taskId, index);
      return index;
    } catch { return []; }
  }

  private saveTaskIndex(taskId: string, index: OfflineIndexEntry[]): void {
    try {
      const taskDir = this.getTaskDir(taskId);
      if (!existsSync(taskDir)) mkdirSync(taskDir, { recursive: true });
      writeFileSync(join(taskDir, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
      this.indexCache.set(taskId, index);
    } catch (err) {
      debugError(NS, 'Failed to save memory index', err);
    }
  }

  private loadEntry(taskId: string, id: string): MemoryEntry | null {
    try {
      const entryPath = join(this.getTaskDir(taskId), 'entries', `${id}.json`);
      if (!existsSync(entryPath)) return null;
      return JSON.parse(readFileSync(entryPath, 'utf-8'));
    } catch { return null; }
  }

  private clearAll(): void {
    try {
      if (!existsSync(this.rootDir)) return;
      const taskDirs = readdirSync(this.rootDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('conv-') || d.name.startsWith('task-'));
      for (const d of taskDirs) {
        const entriesDir = join(this.rootDir, d.name, 'entries');
        if (existsSync(entriesDir)) {
          for (const f of readdirSync(entriesDir)) {
            if (f.endsWith('.json')) unlinkSync(join(entriesDir, f));
          }
        }
        const indexPath = join(this.rootDir, d.name, 'index.json');
        if (existsSync(indexPath)) unlinkSync(indexPath);
      }
    } catch (err) {
      debugError(NS, 'Failed to clear all memory', err);
    }
  }
}
