// packages/agent/src/context-storage.ts
/**
 * ContextStorage - 意识体 Context 文件夹存储
 *
 * 按任务 → 按意识体组织的文件夹结构，保存完整的消息历史供调试。
 * 替代原来扁平的 ContextBuffer，支持多层意识体树。
 *
 * 目录结构：
 * .tramber/contexts/
 * ├── task-{id}/              # 一个任务（根意识）
 * │   ├── root.json           # 根意识完整 context
 * │   ├── exec-research.json  # 子意识
 * │   └── exec-builder.json   # 子意识
 * └── task-{id}/              # 另一个任务
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import type { ConsciousnessContextSnapshot, ContextStorageOptions } from '@tramber/shared';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_CONTEXT;

/**
 * 意识体 Context 文件夹存储
 */
export class ContextStorage {
  private rootDir: string;
  private maxSnapshotsPerTask: number;
  private enabled: boolean;

  constructor(options: ContextStorageOptions) {
    this.rootDir = options.rootDir;
    this.maxSnapshotsPerTask = options.maxSnapshotsPerTask ?? 20;
    this.enabled = options.enabled ?? true;

    if (this.enabled && !existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  /**
   * 保存一个意识体的 context 快照
   *
   * @param taskId - 任务 ID（决定目录名）
   * @param snapshot - 意识体 context 快照
   */
  save(taskId: string, snapshot: ConsciousnessContextSnapshot): string | null {
    if (!this.enabled) return null;

    try {
      const taskDir = this.ensureTaskDir(taskId);
      const filename = `${snapshot.consciousnessId}.json`;
      const filepath = join(taskDir, filename);

      writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');

      debug(NS, LogLevel.BASIC, 'Context snapshot saved', {
        taskId,
        consciousnessId: snapshot.consciousnessId,
        level: snapshot.level,
        success: snapshot.success
      });

      // 清理旧任务
      this.cleanupOldTasks();

      return filepath;
    } catch (err) {
      debugError(NS, 'Failed to save context snapshot', err);
      return null;
    }
  }

  /**
   * 保存根意识的 context（便捷方法）
   */
  saveRoot(taskId: string, snapshot: Omit<ConsciousnessContextSnapshot, 'consciousnessId' | 'parentConsciousnessId' | 'level'> & {
    consciousnessId?: string;
  }): string | null {
    const fullSnapshot: ConsciousnessContextSnapshot = {
      ...snapshot,
      consciousnessId: snapshot.consciousnessId ?? 'root',
      parentConsciousnessId: undefined,
      level: 'self_awareness'
    };
    return this.save(taskId, fullSnapshot);
  }

  /**
   * 保存执行意识的 context（便捷方法）
   */
  saveExecution(taskId: string, parentId: string, snapshot: Omit<ConsciousnessContextSnapshot, 'parentConsciousnessId' | 'level'>): string | null {
    const fullSnapshot: ConsciousnessContextSnapshot = {
      ...snapshot,
      parentConsciousnessId: parentId,
      level: 'execution'
    };
    return this.save(taskId, fullSnapshot);
  }

  /**
   * 按轮次保存 context（每个 subtask 一个子文件夹）
   *
   * 结构：{taskDir}/{subtaskId}/execution.json 或 indexer.json
   */
  saveRound(
    taskId: string,
    subtaskId: string,
    phase: 'execution' | 'indexer',
    data: {
      systemPrompt: string;
      messages: Array<{ role: string; content: string }>;
      iterations: number;
      success: boolean;
      tokenUsage?: { input: number; output: number; total: number };
      toolCalls?: Array<{ name: string; parameters: Record<string, unknown>; result?: unknown }>;
    }
  ): string | null {
    if (!this.enabled) return null;

    try {
      const taskDir = this.ensureTaskDir(taskId);
      const safeSubtaskId = this.sanitize(subtaskId);
      const roundDir = join(taskDir, safeSubtaskId);
      if (!existsSync(roundDir)) {
        mkdirSync(roundDir, { recursive: true });
      }

      const filepath = join(roundDir, `${phase}.json`);
      writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

      debug(NS, LogLevel.BASIC, 'Round context saved', {
        taskId,
        subtaskId,
        phase,
        messageCount: data.messages.length
      });

      return filepath;
    } catch (err) {
      debugError(NS, 'Failed to save round context', err);
      return null;
    }
  }

  /**
   * 获取任务目录下所有快照
   */
  listSnapshots(taskId: string): string[] {
    const safeId = this.sanitize(taskId);
    const dirName = safeId.startsWith('task-') ? safeId : `task-${safeId}`;
    const taskDir = join(this.rootDir, dirName);
    if (!existsSync(taskDir)) return [];
    return readdirSync(taskDir).filter(f => f.endsWith('.json'));
  }

  /**
   * 读取一个快照
   */
  load(taskId: string, consciousnessId: string): ConsciousnessContextSnapshot | null {
    try {
      const safeId = this.sanitize(taskId);
      const dirName = safeId.startsWith('task-') ? safeId : `task-${safeId}`;
      const filepath = join(this.rootDir, dirName, `${consciousnessId}.json`);
      if (!existsSync(filepath)) return null;
      const raw = readFileSync(filepath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      debugError(NS, `Failed to load context: ${taskId}/${consciousnessId}`, err);
      return null;
    }
  }

  // --- 内部方法 ---

  private ensureTaskDir(taskId: string): string {
    // taskId 本身可能已包含 "task-" 前缀，避免重复
    const safeId = this.sanitize(taskId);
    const dirName = safeId.startsWith('task-') ? safeId : `task-${safeId}`;
    const taskDir = join(this.rootDir, dirName);
    if (!existsSync(taskDir)) {
      mkdirSync(taskDir, { recursive: true });
    }
    return taskDir;
  }

  private sanitize(name: string): string {
    // 只保留安全字符
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  }

  private cleanupOldTasks(): void {
    try {
      if (!existsSync(this.rootDir)) return;

      const tasks = readdirSync(this.rootDir)
        .filter(f => {
          const p = join(this.rootDir, f);
          return statSync(p).isDirectory() && f.startsWith('task-');
        })
        .map(f => ({
          name: f,
          path: join(this.rootDir, f),
          time: statSync(join(this.rootDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 删除超出限制的旧任务目录
      for (let i = this.maxSnapshotsPerTask; i < tasks.length; i++) {
        rmSync(tasks[i].path, { recursive: true, force: true });
        debug(NS, LogLevel.VERBOSE, 'Cleaned up old task context', { task: tasks[i].name });
      }
    } catch (err) {
      // 静默失败
    }
  }
}
