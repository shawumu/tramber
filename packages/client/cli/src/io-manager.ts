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

  // 显示 prompt
  showPrompt(): void;

  // 写入内容到 readline
  write(content: string): void;

  // 写入并换行
  writeln(content: string): void;

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

    debug(NAMESPACE.CLI, LogLevel.BASIC, '[IO] initialized');
    return this.rl;
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
