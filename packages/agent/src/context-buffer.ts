// packages/agent/src/context-buffer.ts
/**
 * Context Buffer - 调试用上下文环形缓冲区
 *
 * 保留最近 N 轮对话的 context，用于问题定位。
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import type { Message } from '@tramber/shared';

export interface ContextSnapshot {
  timestamp: string;
  taskId: string;
  description: string;
  messages: Message[];
  iterations: number;
  success: boolean;
  terminatedReason?: string;
  /** 意识体树快照（Stage 8） */
  consciousnessTree?: object;
  /** 记忆索引快照（Stage 8） */
  memoryIndex?: Array<{ id: string; phase: string; type: string; summary: string }>;
}

export interface ContextBufferOptions {
  /** 保存目录 */
  saveDir: string;
  /** 保留数量 */
  maxFiles: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 上下文缓冲区
 */
export class ContextBuffer {
  private buffer: ContextSnapshot[] = [];
  private options: ContextBufferOptions;

  constructor(options: ContextBufferOptions) {
    this.options = options;
    if (options.enabled && !existsSync(options.saveDir)) {
      mkdirSync(options.saveDir, { recursive: true });
    }
  }

  /**
   * 添加一个上下文快照
   */
  push(snapshot: ContextSnapshot): void {
    if (!this.options.enabled) return;

    this.buffer.push(snapshot);

    // 限制内存中保留数量
    if (this.buffer.length > this.options.maxFiles) {
      this.buffer.shift();
    }

    // 保存到文件
    this.saveSnapshot(snapshot);

    // 清理旧文件
    this.cleanupOldFiles();
  }

  /**
   * 检测异常：LLM 返回文本中表明要执行操作但没有实际 tool_calls
   */
  static detectAnomaly(messages: Message[]): boolean {
    // 检查最后一条 assistant 消息后是否缺少工具结果
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.content) {
        // 检查是否包含类似工具调用的文本描述（智谱bug的表现）
        if (msg.content.includes('调用:') || msg.content.match(/\w+\([^)]*\)/)) {
          // 检查下一条是否是工具结果
          if (i + 1 < messages.length && messages[i + 1].role === 'user') {
            if (messages[i + 1].content.includes('工具执行结果:')) {
              return false;
            }
          }
          return true;
        }
        break;
      }
    }
    return false;
  }

  /**
   * 立即保存当前上下文（用于异常时 dump）
   */
  dump(snapshot: ContextSnapshot, suffix: string = 'anomaly'): string {
    if (!this.options.enabled) return '';

    const filename = `${snapshot.timestamp}-${snapshot.taskId}-${suffix}.json`;
    const filepath = join(this.options.saveDir, filename);

    const content = JSON.stringify(snapshot, null, 2);
    writeFileSync(filepath, content, 'utf-8');

    return filepath;
  }

  /**
   * 获取所有快照
   */
  getAll(): ContextSnapshot[] {
    return [...this.buffer];
  }

  /**
   * 获取最后一个快照
   */
  getLast(): ContextSnapshot | undefined {
    return this.buffer[this.buffer.length - 1];
  }

  private saveSnapshot(snapshot: ContextSnapshot): void {
    try {
      const filename = `${snapshot.timestamp}-${snapshot.taskId}.json`;
      const filepath = join(this.options.saveDir, filename);
      const content = JSON.stringify(snapshot, null, 2);
      writeFileSync(filepath, content, 'utf-8');
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }

  private cleanupOldFiles(): void {
    try {
      const files = readdirSync(this.options.saveDir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: join(this.options.saveDir, f),
          time: statSync(join(this.options.saveDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 删除超过保留数量的文件
      for (let i = this.options.maxFiles; i < files.length; i++) {
        unlinkSync(files[i].path);
      }
    } catch (error) {
      // 静默失败
    }
  }
}