// packages/client/cli/src/interaction-manager.ts
/**
 * Interaction Manager - 交互层管理器
 *
 * 职责：
 * - 管理用户交互状态（IDLE/EXECUTING/WAITING_INPUT）
 * - 协调输入分发
 * - 追踪任务完成时机
 */

import { debug, debugError, LogLevel, NAMESPACE } from '@tramber/shared';
import readline from 'node:readline';

/**
 * 交互状态
 */
export enum InteractionState {
  IDLE = 'idle',                   // 空闲，可以开始新任务
  EXECUTING = 'executing',         // 执行任务中
  WAITING_INPUT = 'waiting_input'  // 等待用户输入
}

/**
 * 输入处理函数
 */
type LineHandler = (line: string) => void | Promise<void>;

/**
 * 交互管理器接口
 */
export interface InteractionManager {
  // 初始化（设置 readline）
  init(rl: readline.Interface): void;

  // 开始任务（返回 Promise，任务完成时 resolve）
  startTask(task: () => Promise<void>): Promise<void>;

  // 请求用户输入（只能在任务执行期间调用）
  requestInput(prompt: string): Promise<string>;

  // 设置 REPL 的 line 处理函数
  setLineHandler(handler: LineHandler): void;

  // 获取当前状态
  getState(): InteractionState;

  // 关闭
  close(): void;
}

/**
 * 交互管理器实现
 */
class InteractionManagerImpl implements InteractionManager {
  private rl: readline.Interface | null = null;
  private state: InteractionState = InteractionState.IDLE;
  private lineHandler: LineHandler | null = null;
  private inputResolve: ((value: string) => void) | null = null;
  private pendingInputQueue: string[] = [];  // 缓冲待处理的输入队列

  /**
   * 状态转换（带日志）
   */
  private setState(newState: InteractionState): void {
    if (this.state !== newState) {
      debug(NAMESPACE.CLI, LogLevel.VERBOSE, `[Interaction] ${this.state} -> ${newState}`);
      this.state = newState;
    }
  }

  /**
   * 处理缓冲的输入（如果有的话）
   */
  private processPendingInput(): void {
    if (this.pendingInputQueue.length > 0 && this.inputResolve) {
      const input = this.pendingInputQueue.shift()!;
      this.handleWaitingInput(input);
    }
  }

  init(rl: readline.Interface): void {
    this.rl = rl;

    // 设置 line 事件监听器
    this.rl.on('line', async (line) => {
      switch (this.state) {
        case InteractionState.WAITING_INPUT:
          await this.handleWaitingInput(line);
          break;

        case InteractionState.EXECUTING:
          // 如果在执行期间有 inputResolve，说明是权限确认的输入
          if (this.inputResolve) {
            await this.handleWaitingInput(line);
          } else {
            // 没有等待的 resolve，缓冲输入以备后用
            debug(NAMESPACE.CLI, LogLevel.TRACE, '[Interaction] buffering input', {
              input: line.substring(0, 50)
            });
            this.pendingInputQueue.push(line);
          }
          break;

        case InteractionState.IDLE:
          await this.handleIdle(line);
          break;
      }
    });

    // SIGINT 处理
    this.rl.on('SIGINT', () => {
      if (this.state === InteractionState.IDLE) {
        console.log('\nType "exit" to quit.');
        this.rl?.prompt();
      }
    });

    debug(NAMESPACE.CLI, LogLevel.BASIC, '[Interaction] initialized', { state: this.state });
  }

  /**
   * 处理等待输入状态的输入
   */
  private async handleWaitingInput(line: string): Promise<void> {
    // 如果有缓冲的输入，清空队列（使用当前输入）
    if (this.pendingInputQueue.length > 0) {
      this.pendingInputQueue = [];
    }

    if (this.inputResolve) {
      const resolve = this.inputResolve;
      this.inputResolve = null;
      resolve(line);
      this.setState(InteractionState.EXECUTING);
      return;
    }

    debugError(NAMESPACE.CLI, '[Interaction] Unexpected state: WAITING_INPUT but no resolve');
  }

  /**
   * 处理空闲状态的输入
   */
  private async handleIdle(line: string): Promise<void> {
    // 只在 TRACE 级别输出详细日志
    debug(NAMESPACE.CLI, LogLevel.TRACE, '[Interaction] handleIdle called', {
      line: line.substring(0, 50),
      hasLineHandler: !!this.lineHandler,
      currentState: this.state
    });

    if (!this.lineHandler) {
      debug(NAMESPACE.CLI, LogLevel.VERBOSE, '[Interaction] line ignored (no handler)');
      return;
    }

    this.setState(InteractionState.EXECUTING);

    try {
      await this.lineHandler(line);
    } catch (error) {
      debugError(NAMESPACE.CLI, '[Interaction] line handler error', error);
    } finally {
      // 任务执行完成，返回空闲状态
      this.setState(InteractionState.IDLE);
      // 延迟显示 prompt，让其他输出先完成
      setImmediate(() => {
        this.rl?.prompt();
      });
    }
  }

  /**
   * 开始任务
   */
  async startTask(task: () => Promise<void>): Promise<void> {
    debug(NAMESPACE.CLI, LogLevel.TRACE, '[Interaction] startTask called');

    try {
      await task();
    } catch (error) {
      debugError(NAMESPACE.CLI, '[Interaction] task error', error);
      throw error;
    }
  }

  /**
   * 请求用户输入
   */
  async requestInput(prompt: string): Promise<string> {
    this.setState(InteractionState.WAITING_INPUT);

    return new Promise((resolve) => {
      this.inputResolve = (answer: string) => {
        resolve(answer);
      };

      // 输出提示
      process.stdout.write(prompt + ' ');

      // 设置 inputResolve 后，检查是否有缓冲的输入需要处理
      setImmediate(() => this.processPendingInput());
    });
  }

  /**
   * 设置 REPL 的 line 处理函数
   */
  setLineHandler(handler: LineHandler): void {
    this.lineHandler = handler;
    debug(NAMESPACE.CLI, LogLevel.VERBOSE, '[Interaction] line handler set');
  }

  /**
   * 获取当前状态
   */
  getState(): InteractionState {
    return this.state;
  }

  /**
   * 关闭
   */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.state = InteractionState.IDLE;
    this.lineHandler = null;
    this.inputResolve = null;
    this.pendingInputQueue = [];
  }

  /**
   * 获取 readline（供 REPL 使用）
   */
  getReadline(): readline.Interface | null {
    return this.rl;
  }
}

/**
 * 单例实例
 */
const interactionManager = new InteractionManagerImpl();

export { interactionManager };
export type { LineHandler };
