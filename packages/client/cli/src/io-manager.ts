// packages/client/cli/src/io-manager.ts
/**
 * IO Manager - IO 层（最底层）
 *
 * 职责：
 * - 管理 readline 接口
 * - 基本的输入输出
 * - 不涉及业务逻辑
 */

import readline from 'node:readline';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

/**
 * IO 配置
 */
export interface IOConfig {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  prompt?: string;
  history?: string[];
  historySize?: number;
}

/**
 * IO Manager 接口
 */
export interface IOInterface {
  // 初始化 readline
  init(config: IOConfig): readline.Interface;

  // 注册 line 事件监听器
  onLine(callback: (line: string) => void): void;

  // 显示 prompt
  showPrompt(): void;

  // 写入内容到 stdout
  write(content: string): void;

  // 写入内容到 stdout 并换行
  writeln(content: string): void;

  // 写入内容到 stderr（用于 debug 日志）
  writeError(content: string): void;

  // 清屏
  clear(): void;

  // 关闭
  close(): void;

  // 获取 readline（供外部引用）
  getReadline(): readline.Interface | null;
}

/**
 * IO Manager 实现（单例）
 */
class IOManagerImpl implements IOInterface {
  private static instance: IOManagerImpl;
  private rl: readline.Interface | null = null;
  private lineCallback: ((line: string) => void) | null = null;

  private constructor() {}

  static getInstance(): IOManagerImpl {
    if (!IOManagerImpl.instance) {
      IOManagerImpl.instance = new IOManagerImpl();
    }
    return IOManagerImpl.instance;
  }

  /**
   * 初始化 readline
   */
  init(config: IOConfig): readline.Interface {
    if (this.rl) {
      debug(NAMESPACE.CLI, LogLevel.VERBOSE, '[IO] readline already initialized');
      return this.rl;
    }

    this.rl = readline.createInterface({
      input: config.input,
      output: config.output,
      prompt: config.prompt ?? '> ',
      history: config.history ?? [],
      historySize: config.historySize ?? 100
    });

    // 设置 line 事件监听器
    this.rl.on('line', (line) => {
      if (this.lineCallback) {
        this.lineCallback(line);
      }
    });

    debug(NAMESPACE.CLI, LogLevel.BASIC, '[IO] initialized');
    return this.rl;
  }

  /**
   * 注册 line 事件监听器
   */
  onLine(callback: (line: string) => void): void {
    this.lineCallback = callback;
  }

  /**
   * 显示 prompt
   */
  showPrompt(): void {
    this.rl?.prompt();
  }

  /**
   * 写入内容到 readline
   */
  write(content: string): void {
    this.rl?.write(content);
  }

  /**
   * 写入并换行
   */
  writeln(content: string): void {
    console.log(content);
  }

  /**
   * 写入内容到 stderr（用于 debug 日志）
   */
  writeError(content: string): void {
    console.error(content);
  }

  /**
   * 清屏
   */
  clear(): void {
    console.clear();
  }

  /**
   * 关闭
   */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * 获取 readline（供外部引用）
   */
  getReadline(): readline.Interface | null {
    return this.rl;
  }
}

/**
 * 导出单例实例
 */
export const ioManager = IOManagerImpl.getInstance();

// 重新导出 readline 类型供外部使用
export type { Interface } from 'node:readline';
