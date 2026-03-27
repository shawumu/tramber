// packages/client/cli/src/repl.ts
/**
 * REPL - 交互式命令行界面
 *
 * 重构后使用 InteractionManager 管理交互状态
 */

import chalk from 'chalk';
import type { TramberClient } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { interactionManager } from './interaction-manager.js';
import { ioManager } from './io-manager.js';
import { executeTask } from './task.js';
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
export async function createRepl(client: TramberClient, context: CliContext, options: ReplOptions = {}) {
  const {
    prompt = 'You',
    welcomeMessage = generateWelcomeMessage(),
    exitCommand = ['exit', 'quit', 'q'],
    autoConfirm = false
  } = options;

  // 使用 ioManager 创建 readline
  const rl = ioManager.init({
    input: process.stdin,
    output: process.stdout,
    prompt: formatPrompt(prompt),
    history: HISTORY,
    historySize: 100
  });

  // 初始化 interactionManager
  interactionManager.init(rl);

  // 设置 REPL 的 line 处理函数
  interactionManager.setLineHandler(async (input) => {
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
      console.log(chalk.gray('Goodbye!'));
      interactionManager.close();
      return;
    }

    // 处理空输入
    if (!trimmed) {
      return;
    }

    // 处理命令
    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, client, context);
      return;
    }

    // 执行任务
    await interactionManager.startTask(async () => {
      await executeTask(trimmed, client, context, autoConfirm);
    });
  });

  // 显示欢迎消息
  console.log(welcomeMessage);
  console.log('');

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

/**
 * 处理命令
 */
async function handleCommand(command: string, client: TramberClient, context: CliContext) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case '/help':
      showHelp();
      break;

    case '/scene':
      await handleSceneCommand(args, client, context);
      break;

    case '/skills':
      await handleSkillsCommand(client, context);
      break;

    case '/routines':
      await handleRoutinesCommand(client, context);
      break;

    case '/config':
      handleConfigCommand(args, context);
      break;

    case '/clear':
      console.clear();
      break;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      console.log(chalk.gray('Type /help for available commands.'));
  }
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log('');
  console.log(chalk.cyan.bold('Available Commands:'));
  console.log('  ' + chalk.white('/help') + '      - Show this help message');
  console.log('  ' + chalk.white('/scene') + '     - List or switch scenes');
  console.log('  ' + chalk.white('/skills') + '    - List available skills');
  console.log('  ' + chalk.white('/routines') + '  - List available routines');
  console.log('  ' + chalk.white('/config') + '    - Show or set configuration');
  console.log('  ' + chalk.white('/clear') + '     - Clear the screen');
  console.log('  ' + chalk.white('/exit') + '      - Exit the REPL');
  console.log('');
}

/**
 * 处理场景命令
 */
async function handleSceneCommand(args: string[], client: TramberClient, context: CliContext) {
  if (args.length === 0) {
    const scenes = await client.listScenes();
    console.log('');
    console.log(chalk.cyan.bold('Available Scenes:'));
    for (const scene of scenes) {
      console.log(`  ${chalk.green('•')} ${chalk.white(scene.name)} ${chalk.gray(`(${scene.id})`)}`);
      console.log(`    ${chalk.gray(scene.description)}`);
    }
    console.log('');
    console.log(`Current: ${chalk.yellow(context.config.scene ?? 'coding')}`);
    console.log('');
  } else {
    const sceneId = args[0];
    context.config.scene = sceneId;
    console.log(chalk.green(`✓ Scene switched to: ${sceneId}`));
  }
}

/**
 * 处理技能命令
 */
async function handleSkillsCommand(client: TramberClient, context: CliContext) {
  const skills = await client.listSkills({ sceneId: context.config.scene });
  console.log('');
  console.log(chalk.cyan.bold('Available Skills:'));
  for (const skill of skills) {
    console.log(`  ${chalk.green('•')} ${chalk.white(skill.name)} ${chalk.gray(`(${skill.id})`)}`);
    console.log(`    ${chalk.gray(skill.description)}`);
  }
  console.log('');
}

/**
 * 处理例程命令
 */
async function handleRoutinesCommand(client: TramberClient, context: CliContext) {
  const routines = await client.listRoutines();
  console.log('');
  console.log(chalk.cyan.bold('Available Routines:'));
  if (routines.length === 0) {
    console.log('  ' + chalk.gray('No routines available yet.'));
    console.log('  ' + chalk.gray('Routines are automatically created from successful skills.'));
  } else {
    for (const routine of routines) {
      console.log(`  ${chalk.green('•')} ${chalk.white(routine.name)} ${chalk.gray(`(${routine.id})`)}`);
      console.log(`    ${chalk.gray(routine.description)}`);
      console.log(`    ${chalk.cyan(`Success rate: ${(routine.stats.successRate * 100).toFixed(0)}%`)}`);
    }
  }
  console.log('');
}

/**
 * 处理配置命令
 */
function handleConfigCommand(args: string[], context: CliContext) {
  if (args.length === 0) {
    console.log('');
    console.log(chalk.cyan.bold('Current Configuration:'));
    console.log(`  Provider:   ${chalk.yellow(context.config.provider ?? 'anthropic')}`);
    console.log(`  Model:      ${chalk.yellow(context.config.model ?? 'claude-sonnet-4-6')}`);
    console.log(`  Scene:      ${chalk.yellow(context.config.scene ?? 'coding')}`);
    console.log(`  Max Iter:   ${chalk.yellow(String(context.config.maxIterations ?? 10))}`);
    console.log(`  Experience: ${chalk.yellow(context.config.enableExperience ? 'enabled' : 'disabled')}`);
    console.log(`  Routine:    ${chalk.yellow(context.config.enableRoutine ? 'enabled' : 'disabled')}`);
    console.log('');
  } else {
    const [key, value] = args;
    if (key && value) {
      (context.config as any)[key] = value;
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    }
  }
}
