// packages/client/cli/src/debug-bridge.ts
/**
 * DebugBridge - 日志 ring buffer
 *
 * 纯数据类，无 React 依赖。
 * 同步 push，O(1) 操作。
 */

import type { DebugLogEntry } from '@tramber/shared';

export class DebugBridge {
  private buffer: DebugLogEntry[] = [];
  private readonly maxItems: number;

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  /** 同步 push，< 0.01ms */
  push(entry: DebugLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxItems) {
      this.buffer = this.buffer.slice(-this.maxItems);
    }
  }

  /** 返回最近 n 条 */
  recent(n: number): DebugLogEntry[] {
    return this.buffer.slice(-n);
  }

  /** 总条目数 */
  get count(): number {
    return this.buffer.length;
  }

  /** 清空 */
  clear(): void {
    this.buffer = [];
  }
}
