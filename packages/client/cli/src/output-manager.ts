// packages/client/cli/src/output-manager.ts
/**
 * Output Manager - 统一输出管理
 *
 * 职责：
 * - 统一管理所有输出（stdout/stderr）
 * - 提供格式化的输出方法
 * - 控制 Spinner 显示
 * - 支持日志流分离
 */

import chalk from 'chalk';
import { debug, LogLevel, NAMESPACE } from '@tramber/shared';

/**
 * 输出管理器接口
 */
export interface OutputManagerInterface {
  // 基础输出方法
  write(content: string): void;
  writeln(content: string): void;
  writeError(content: string): void;

  // 用户输入提示（不换行，等待用户输入在同一行）
  writePrompt(prompt: string): void;

  // 格式化输出方法
  writeProgress(content: string): void;
  writeTextDelta(content: string): void;
  writeResult(result: string): void;
  writeErrorResult(error: string): void;

  // Spinner 控制
  startSpinner(message?: string): void;
  stopSpinner(): void;
  updateSpinner(message?: string): void;

  // 清屏
  clear(): void;
}

/**
 * 输出管理器实现（单例）
 */
class OutputManagerImpl implements OutputManagerInterface {
  private static instance: OutputManagerImpl;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;
  private spinnerMessage = '';
  private isDebugMode = false;

  private constructor() {
    // 从环境变量读取是否是 debug 模式
    this.isDebugMode = process.env.TRAMBER_DEBUG === 'true';
  }

  static getInstance(): OutputManagerImpl {
    if (!OutputManagerImpl.instance) {
      OutputManagerImpl.instance = new OutputManagerImpl();
    }
    return OutputManagerImpl.instance;
  }

  /**
   * 写入内容（不换行）
   */
  write(content: string): void {
    process.stdout.write(content);
  }

  /**
   * 写入内容并换行
   */
  writeln(content: string): void {
    console.log(content);
  }

  /**
   * 写入用户输入提示（不换行）
   */
  writePrompt(prompt: string): void {
    process.stdout.write(prompt + ' ');
  }

  /**
   * 写入错误内容（stderr）
   */
  writeError(content: string): void {
    console.error(content);
  }

  /**
   * 写入进度信息（带灰色前缀）
   */
  writeProgress(content: string): void {
    this.stopSpinner();
    console.log(chalk.gray('▸') + ' ' + chalk.white(content));
  }

  /**
   * 写入流式文本增量（不换行，直接输出）
   */
  writeTextDelta(content: string): void {
    this.stopSpinner();
    process.stdout.write(content);
  }

  /**
   * 写入工具调用信息（带青色前缀）
   */
  writeToolCall(toolName: string, parameters?: Record<string, unknown>): void {
    this.stopSpinner();
    // debug 模式下显示详细信息，普通模式只显示工具名称
    if (this.isDebugMode) {
      console.log(chalk.cyan('▸') + ' ' + chalk.white(`[调用 ${toolName}]`));
      if (parameters) {
        const paramsStr = JSON.stringify(parameters).slice(0, 200);
        console.log(chalk.gray('  参数: ') + paramsStr);
      }
    } else {
      console.log(chalk.cyan('▸') + ' ' + chalk.white(`[调用 ${toolName}]`));
    }
  }

  /**
   * 写入工具结果（带颜色）
   */
  writeToolResult(success: boolean, data?: unknown, error?: string): void {
    this.stopSpinner();
    if (success) {
      // 非 debug 模式下只显示简洁的成功标记
      // debug 模式下显示详细数据
      if (this.isDebugMode) {
        const dataStr = JSON.stringify(data ?? 'null');
        const truncated = dataStr.length > 200 ? dataStr.slice(0, 200) + '...' : dataStr;
        console.log(chalk.green('▸') + ' ' + chalk.white(`[结果] ${truncated}`));
      } else {
        // 非 debug 模式：简洁输出（不显示详细 JSON）
        console.log(chalk.green('▸') + ' ' + chalk.white(`[成功]`));
      }
    } else if (!success && error) {
      console.log(chalk.red('▸') + ' ' + chalk.white(`[错误] ${error}`));
    }
  }

  /**
   * 写入任务结果（带格式化）
   */
  writeResult(result: string): void {
    this.stopSpinner();
    console.log('');
    console.log(chalk.green('✓') + ' ' + chalk.white(result));
    console.log('');
  }

  /**
   * 写入错误结果（带格式化）
   */
  writeErrorResult(error: string): void {
    this.stopSpinner();
    console.log('');
    console.log(chalk.red('✗ Error:'));
    console.log(chalk.gray(error));
    console.log('');
  }

  /**
   * 写入异常结果（带格式化）
   */
  writeException(error: Error | string): void {
    this.stopSpinner();
    console.log('');
    console.log(chalk.red('✗ Exception:'));
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.gray(errorMsg));
    console.log('');
  }

  /**
   * 启动 Spinner
   */
  startSpinner(message?: string): void {
    if (this.spinnerInterval) {
      return; // 已经在运行
    }

    this.spinnerMessage = message || 'Thinking...';
    this.spinnerIndex = 0;

    this.spinnerInterval = setInterval(() => {
      const frame = this.spinnerFrames[this.spinnerIndex % this.spinnerFrames.length];
      process.stdout.write('\r' + chalk.cyan(frame) + ' ' + chalk.white(this.spinnerMessage));
      this.spinnerIndex++;
    }, 100);
  }

  /**
   * 停止 Spinner
   */
  stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      // 清除 spinner 行
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
  }

  /**
   * 更新 Spinner 消息
   */
  updateSpinner(message?: string): void {
    this.spinnerMessage = message || 'Thinking...';
  }

  /**
   * 清屏
   */
  clear(): void {
    console.clear();
  }

  /**
   * 写入调试日志（仅在 debug 模式下）
   */
  writeDebug(level: LogLevel, namespace: string, message: string, data?: unknown): void {
    if (!this.isDebugMode) {
      return;
    }

    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const levelTag = this.levelTag(level);
    const fullMessage = `[${timestamp}] [${namespace}] ${levelTag} ${message}`;

    // 所有 debug 日志输出到 stderr
    console.error(fullMessage);
    if (data !== undefined) {
      console.error(JSON.stringify(data, null, 2));
    }
  }

  /**
   * 格式化日志级别标签
   */
  private levelTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '[ERROR]';
      case LogLevel.BASIC: return '[INFO]';
      case LogLevel.VERBOSE: return '[VERBOSE]';
      case LogLevel.TRACE: return '[TRACE]';
      default: return '[INFO]';
    }
  }
}

/**
 * 导出单例实例
 */
export const outputManager = OutputManagerImpl.getInstance();
