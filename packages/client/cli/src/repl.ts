// packages/client/cli/src/repl.ts
/**
 * REPL - 交互式命令行界面
 *
 * 重构后使用 InteractionManager 管理交互状态
 */

import chalk from 'chalk';
import type { TramberEngine } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import type { CliContext } from './config.js';
import { interactionManager } from './interaction-manager.js';
import { ioManager } from './io-manager.js';
import { outputManager } from './output-manager.js';
import { executeTask } from './task.js';
import { CommandHandler } from './command-handler.js';
import { debug, LogLevel, NAMESPACE } from '@tramber/shared';

export interface ReplOptions {
  prompt?: string;
  welcomeMessage?: string;
  exitCommand?: string[];
  autoConfirm?: boolean;
}

const HISTORY: string[] = [];

/**
 * 创建 REPL 界面
 */
export async function createRepl(client: TramberEngine, context: CliContext, options: ReplOptions = {}) {
  const {
    prompt = 'You',
    welcomeMessage = generateWelcomeMessage(),
    exitCommand = ['exit', 'quit', 'q'],
    autoConfirm = false
  } = options;

  // 创建命令处理器
  const commandHandler = new CommandHandler();

  // Client 持有 Conversation（跨轮复用）
  let conversation: Conversation | undefined;

  // 使用 ioManager 创建 readline
  const rl = ioManager.init({
    input: process.stdin,
    output: process.stdout,
    prompt: formatPrompt(prompt),
    history: HISTORY,
    historySize: 100
  });

  // 初始化 interactionManager（传递 ioManager，不是 rl）
  interactionManager.init(ioManager);

  // 设置空闲状态回调
  interactionManager.onIdle(async (input) => {
    debug(NAMESPACE.CLI, LogLevel.VERBOSE, '[REPL] line received', {
      input: input.substring(0, 50)
    });

    const trimmed = input.trim();

    // 添加到历史
    if (trimmed && HISTORY[HISTORY.length - 1] !== trimmed) {
      HISTORY.push(trimmed);
    }

    // 检查退出命令
    if (exitCommand.includes(trimmed.toLowerCase())) {
      outputManager.writeln('Goodbye!');
      interactionManager.close();
      return;
    }

    // 处理空输入
    if (!trimmed) {
      return;
    }

    // 处理命令
    if (trimmed.startsWith('/')) {
      await commandHandler.handle(trimmed, client, context);
      // /clear 命令需要清除 conversation
      if (trimmed === '/clear') {
        conversation = undefined;
      }
      return;
    }

    // 执行任务（传入 conversation，保存返回的）
    await interactionManager.startTask(async () => {
      conversation = await executeTask(trimmed, client, context, autoConfirm, conversation);
    });
  });

  // 显示欢迎消息
  outputManager.writeln(welcomeMessage);
  outputManager.writeln('');

  // 开始
  rl.prompt();
}

/**
 * 生成欢迎消息
 */
function generateWelcomeMessage(): string {
  return [
    chalk.cyan.bold('┌─────────────────────────────────────────────────┐'),
    chalk.cyan.bold('│') + chalk.white.bold('  Welcome to Tramber ') + chalk.gray('(MVP v0.1.0)') + ' '.repeat(18) + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + '  Coding Scene - AI Assisted Programming     ' + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + '                                                 ' + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + '  Commands:                                      ' + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /help      - Show available commands           ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /scene     - List/switch scenes                  ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /skills    - List available skills               ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /routines  - List available routines             ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /config    - Show/set configuration              ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /clear     - Clear screen                         ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('│') + chalk.gray('    /exit      - Exit REPL                            ') + chalk.cyan.bold('│'),
    chalk.cyan.bold('└─────────────────────────────────────────────────┘')
  ].join('\n');
}

/**
 * 格式化提示符
 */
function formatPrompt(name: string): string {
  return `${chalk.green(name + ':')} `;
}
