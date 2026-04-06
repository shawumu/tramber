// packages/agent/src/memory-store.ts
/**
 * MemoryStore - 意识体记忆存储与检索
 *
 * 结构化存储，按阶段/类型分类，索引与内容分离。
 * 存储在 .tramber/memory/ 目录下，JSON 文件格式。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { MemoryEntry, MemoryIndexEntry, MemoryQuery, MemoryType } from '@tramber/shared';
import { generateId, debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MEMORY;

export interface MemoryStoreOptions {
  /** 存储根目录（默认 .tramber/memory/） */
  rootDir: string;
}

/**
 * 记忆存储
 *
 * 目录结构：
 * .tramber/memory/
 * ├── index.json          # 全局索引（所有条目的摘要）
 * ├── entries/            # 详细内容，每个条目一个 JSON 文件
 * │   ├── mem-xxxxx.json
 * │   └── mem-yyyyy.json
 */
export class MemoryStore {
  private rootDir: string;
  private entriesDir: string;
  private indexPath: string;
  /** 内存缓存索引 */
  private indexCache: MemoryIndexEntry[] | null = null;

  constructor(options: MemoryStoreOptions) {
    this.rootDir = options.rootDir;
    this.entriesDir = join(options.rootDir, 'entries');
    this.indexPath = join(options.rootDir, 'index.json');
    this.ensureDirs();
  }

  /**
   * 存储一条记忆
   */
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const fullEntry: MemoryEntry = {
      ...entry,
      id: generateId('mem'),
      createdAt: new Date().toISOString()
    };

    // 写入条目文件
    const entryPath = join(this.entriesDir, `${fullEntry.id}.json`);
    try {
      writeFileSync(entryPath, JSON.stringify(fullEntry, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to write memory entry', err);
      throw err;
    }

    // 更新索引
    const indexEntry: MemoryIndexEntry = {
      id: fullEntry.id,
      phase: fullEntry.phase,
      type: fullEntry.type,
      summary: fullEntry.summary
    };
    const index = this.loadIndex();
    index.push(indexEntry);
    this.saveIndex(index);

    // 清除缓存
    this.indexCache = null;

    debug(NS, LogLevel.BASIC, 'Memory stored', { id: fullEntry.id, type: fullEntry.type, phase: fullEntry.phase });
    return fullEntry;
  }

  /**
   * 检索记忆
   */
  query(query: MemoryQuery = {}): MemoryEntry[] {
    const { phase, type, keyword, limit = 5 } = query;
    const index = this.loadIndex();

    // 先在索引中过滤
    let matchedIds = index
      .filter(entry => {
        if (phase && entry.phase !== phase) return false;
        if (type && entry.type !== type) return false;
        if (keyword && !entry.summary.toLowerCase().includes(keyword.toLowerCase())) return false;
        return true;
      })
      .map(entry => entry.id);

    // 限制数量
    matchedIds = matchedIds.slice(0, limit);

    // 加载详细内容
    return matchedIds.map(id => this.loadEntry(id)).filter((e): e is MemoryEntry => e !== null);
  }

  /**
   * 获取索引（用于注入自我感知意识的 prompt）
   */
  getIndex(): MemoryIndexEntry[] {
    return this.loadIndex();
  }

  /**
   * 获取某条记忆
   */
  get(id: string): MemoryEntry | null {
    return this.loadEntry(id);
  }

  /**
   * 按阶段获取所有记忆索引
   */
  getByPhase(phase: string): MemoryIndexEntry[] {
    return this.loadIndex().filter(e => e.phase === phase);
  }

  /**
   * 获取所有阶段标签
   */
  getPhases(): string[] {
    const phases = new Set(this.loadIndex().map(e => e.phase));
    return [...phases];
  }

  /**
   * 清除所有记忆（测试用）
   */
  clear(): void {
    try {
      const files = readdirSync(this.entriesDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          unlinkSync(join(this.entriesDir, f));
        }
      }
      this.saveIndex([]);
      this.indexCache = null;
    } catch (err) {
      debugError(NS, 'Failed to clear memory store', err);
    }
  }

  // --- 内部方法 ---

  private ensureDirs(): void {
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
    if (!existsSync(this.entriesDir)) {
      mkdirSync(this.entriesDir, { recursive: true });
    }
    if (!existsSync(this.indexPath)) {
      this.saveIndex([]);
    }
  }

  private loadIndex(): MemoryIndexEntry[] {
    if (this.indexCache) return this.indexCache;

    try {
      const raw = readFileSync(this.indexPath, 'utf-8');
      this.indexCache = JSON.parse(raw);
      return this.indexCache!;
    } catch (err) {
      debugError(NS, 'Failed to load memory index', err);
      return [];
    }
  }

  private saveIndex(index: MemoryIndexEntry[]): void {
    try {
      writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
      this.indexCache = index;
    } catch (err) {
      debugError(NS, 'Failed to save memory index', err);
    }
  }

  private loadEntry(id: string): MemoryEntry | null {
    try {
      const entryPath = join(this.entriesDir, `${id}.json`);
      if (!existsSync(entryPath)) return null;
      const raw = readFileSync(entryPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      debugError(NS, `Failed to load memory entry: ${id}`, err);
      return null;
    }
  }
}
