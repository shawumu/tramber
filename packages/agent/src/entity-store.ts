// packages/agent/src/entity-store.ts
/**
 * EntityStore - 实体图谱存储
 *
 * 从 MemoryStore 抽取的实体图谱操作：
 * - 实体 CRUD（storeEntity / getEntity / updateEntity）
 * - 实体查询（queryEntities / queryByDomain / queryByType）
 * - 资源去重（findByUri / mergeResource）
 * - 关系去重（mergeRelations）
 *
 * 目录结构：
 * {rootDir}/{taskId}/entities/{id}.json
 * {rootDir}/{taskId}/entity-index.json
 * {rootDir}/{taskId}/entity-counter.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  BaseEntity, EntityQuery, EntityType, ResourceEntity, ResourceSummary,
  Relation, DomainTaskEntity, SubtaskEntity
} from '@tramber/shared';
import { generateId, debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MEMORY;

/** 实体索引条目 */
interface EntityIndexEntry {
  id: string;
  type: EntityType;
  domain: string;
  order: number;
}

export class EntityStore {
  private rootDir: string;
  private entityIndexCache: Map<string, EntityIndexEntry[]> = new Map();
  private entityOrderCounter: number = 0;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /** 存储实体 */
  storeEntity(taskId: string, entity: Record<string, unknown> & { type: EntityType; domain: string; content: string; relations: Relation[] }): BaseEntity {
    const prefix = this.getTypePrefix(entity.type);
    const rawId = generateId(prefix);
    const uniquePart = rawId.split('-').slice(1).join('-') || rawId;
    const id = `${prefix}:${uniquePart}`;

    const order = this.getNextEntityOrder(taskId);
    const version = this.getVersionStrategy(entity.type);

    const fullEntity: BaseEntity = {
      ...(entity as Record<string, unknown>),
      id, order, version,
      createdAt: new Date().toISOString()
    } as BaseEntity;

    const taskDir = this.getTaskDir(taskId);
    const entitiesDir = join(taskDir, 'entities');
    if (!existsSync(entitiesDir)) {
      mkdirSync(entitiesDir, { recursive: true });
    }

    const fileName = id.replace(':', '-');
    const entityPath = join(entitiesDir, `${fileName}.json`);
    try {
      writeFileSync(entityPath, JSON.stringify(fullEntity, null, 2), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to write entity', err);
      throw err;
    }

    const indexEntry: EntityIndexEntry = { id: fullEntity.id, type: fullEntity.type, domain: fullEntity.domain, order: fullEntity.order };
    const index = this.loadEntityIndex(taskId);
    index.push(indexEntry);
    this.saveEntityIndex(taskId, index);
    this.entityIndexCache.delete(taskId);

    debug(NS, LogLevel.BASIC, 'Entity stored', { id: fullEntity.id, type: fullEntity.type, domain: fullEntity.domain, taskId });
    return fullEntity;
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

  /** 更新实体 */
  updateEntity(taskId: string, id: string, updates: Record<string, unknown>): BaseEntity | null {
    const entity = this.getEntity(taskId, id);
    if (!entity) return null;

    if (updates.relations && Array.isArray(updates.relations)) {
      updates.relations = this.mergeRelations(entity.relations, updates.relations as Relation[]);
    }

    const updated = { ...entity, ...updates } as BaseEntity;

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

    matchedIds = matchedIds.reverse().slice(0, limit);

    const entities = matchedIds.map(id => this.getEntity(taskId, id)).filter((e): e is BaseEntity => e !== null);

    if (keyword) {
      return entities.filter(e => e.content.toLowerCase().includes(keyword.toLowerCase()));
    }

    return entities;
  }

  /** 按领域查询 */
  queryByDomain(taskId: string, domain: string): BaseEntity[] {
    return this.queryEntities({ taskId, domain });
  }

  /** 按类型查询 */
  queryByType(taskId: string, type: EntityType): BaseEntity[] {
    return this.queryEntities({ taskId, type });
  }

  /** 按领域任务查询子任务 */
  queryByDomainTask(taskId: string, domainTaskId: string): SubtaskEntity[] {
    const index = this.loadEntityIndex(taskId);
    return index
      .filter(entry => entry.type === 'subtask')
      .map(entry => this.getEntity(taskId, entry.id))
      .filter((e): e is BaseEntity => e !== null && e.type === 'subtask')
      .filter(e => (e as SubtaskEntity).domainTaskId === domainTaskId) as SubtaskEntity[];
  }

  /** 按 URI 查找资源（去重用） */
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

  /** 合并资源（去重更新） */
  mergeResource(taskId: string, uri: string, newSummary: ResourceSummary, newRelations: Relation[]): ResourceEntity | null {
    const existing = this.findByUri(taskId, uri);
    if (!existing) return null;

    const versionNum = parseInt(existing.version.replace('v', '')) + 1;
    existing.version = `v${versionNum}`;
    existing.relations = this.mergeRelations(existing.relations, newRelations);
    existing.summary = newSummary;

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

  /** 跨会话查询全局资源（按 URI 去重） */
  queryGlobalResources(): ResourceEntity[] {
    const resourceMap = new Map<string, ResourceEntity>();

    try {
      const dirs = readdirSync(this.rootDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('conv-'))
        .map(d => d.name);

      for (const taskId of dirs) {
        const index = this.loadEntityIndex(taskId);
        for (const entry of index) {
          if (entry.type !== 'resource') continue;
          const entity = this.getEntity(taskId, entry.id);
          if (!entity || entity.type !== 'resource') continue;
          const resource = entity as ResourceEntity;
          // 用 URI 去重，保留最新版本
          const existing = resourceMap.get(resource.uri);
          if (!existing || (resource.version && existing.version && resource.version >= existing.version)) {
            resourceMap.set(resource.uri, resource);
          }
        }
      }
    } catch (err) {
      debug(NS, LogLevel.BASIC, 'Failed to query global resources', { error: String(err) });
    }

    return Array.from(resourceMap.values());
  }

  /** 合并关系（去重） */
  mergeRelations(existing: Relation[], newRelations: Relation[]): Relation[] {
    const existingKeys = new Set(existing.map(r => `${r.type}:${r.target}`));

    const dedupedNew = newRelations.filter(r => {
      const key = `${r.type}:${r.target}`;
      if (existingKeys.has(key)) {
        debug(NS, LogLevel.BASIC, 'Relation deduplicated', { type: r.type, target: r.target });
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    return [...existing, ...dedupedNew];
  }

  // === 内部方法 ===

  private getTaskDir(taskId: string): string {
    return join(this.rootDir, taskId);
  }

  private getTypePrefix(type: EntityType): string {
    const prefixes: Record<EntityType, string> = {
      user_request: 'u', domain_task: 'dt', subtask: 's',
      analysis: 'a', rule: 'rl', resource: 'r'
    };
    return prefixes[type];
  }

  private getVersionStrategy(type: EntityType): string {
    const numericTypes = ['user_request', 'domain_task', 'subtask', 'resource'];
    return numericTypes.includes(type) ? 'v1' : new Date().toISOString();
  }

  private getNextEntityOrder(taskId: string): number {
    const counterPath = join(this.getTaskDir(taskId), 'entity-counter.json');
    try {
      if (existsSync(counterPath)) {
        const raw = readFileSync(counterPath, 'utf-8');
        this.entityOrderCounter = JSON.parse(raw).counter || 0;
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
      if (!existsSync(taskDir)) mkdirSync(taskDir, { recursive: true });
      writeFileSync(join(taskDir, 'entity-counter.json'), JSON.stringify({ counter }), 'utf-8');
    } catch (err) {
      debugError(NS, 'Failed to save entity counter', err);
    }
  }

  loadEntityIndex(taskId: string): EntityIndexEntry[] {
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
      if (!existsSync(taskDir)) mkdirSync(taskDir, { recursive: true });
      writeFileSync(join(taskDir, 'entity-index.json'), JSON.stringify(index, null, 2), 'utf-8');
      this.entityIndexCache.set(taskId, index);
    } catch (err) {
      debugError(NS, 'Failed to save entity index', err);
    }
  }
}
