// packages/client/cli/src/repl.ts
/**
 * REPL - 交互式命令行界面
 */

import readline from 'readline';
import chalk from 'chalk';
import type { TramberClient } from '@tramber/sdk';
import type { CliContext } from './config.js';

export interface ReplOptions {
  prompt?: string;
  welcomeMessage?: string;
  exitCommand?: string[];
}

const HISTORY: string[] = [];
let historyIndex = -1;

/**
 * 创建 REPL 界面
 */
export async function createRepl(client: TramberClient, context: CliContext, options: ReplOptions = {}) {
  const {
    prompt = 'You',
    welcomeMessage = generateWelcomeMessage(),
    exitCommand = ['exit', 'quit', 'q']
  } = options;

  // 创建 readline 接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: formatPrompt(prompt),
    history: HISTORY,
    historySize: 100
  });

  // 显示欢迎消息
  console.log(welcomeMessage);
  console.log('');

  // 处理输入
  rl.on('line', async (input) => {
    const trimmed = input.trim();

    // 添加到历史
    if (trimmed && HISTORY[HISTORY.length - 1] !== trimmed) {
      HISTORY.push(trimmed);
      historyIndex = HISTORY.length;
    }

    // 检查退出命令
    if (exitCommand.includes(trimmed.toLowerCase())) {
      console.log(chalk.gray('Goodbye!'));
      rl.close();
      return;
    }

    // 处理空输入
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // 处理命令
    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, client, context);
      rl.prompt();
      return;
    }

    // 执行任务
    await executeTask(trimmed, client, context);
    rl.prompt();
  });

  // 处理 Ctrl+C
  rl.on('SIGINT', () => {
    console.log('\n' + chalk.yellow('Type "exit" to quit.'));
    rl.prompt();
  });

  // 处理关闭
  rl.on('close', async () => {
    await client.close();
    process.exit(0);
  });

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

/**
 * 执行任务
 */
async function executeTask(input: string, client: TramberClient, context: CliContext) {
  console.log('');

  // 显示思考状态
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;
  const spinnerInterval = setInterval(() => {
    process.stdout.write('\r' + chalk.cyan(spinner[spinnerIndex % spinner.length]) + ' Thinking...');
    spinnerIndex++;
  }, 100);

  try {
    const result = await client.execute(input, {
      sceneId: context.config.scene,
      maxIterations: context.config.maxIterations,
      onProgress: (update) => {
        if (update.type === 'step') {
          clearInterval(spinnerInterval);
          process.stdout.write('\r' + chalk.gray('▸ ') + chalk.white(update.content ?? '') + '\n');
        }
      }
    });

    clearInterval(spinnerInterval);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    if (result.success) {
      console.log(chalk.green('✓ ') + chalk.white('Result:'));
      console.log(chalk.gray(String(result.result ?? 'Done')));
    } else {
      console.log(chalk.red('✗ Error:'));
      console.log(chalk.gray(result.error ?? 'Unknown error'));
    }
  } catch (error) {
    clearInterval(spinnerInterval);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    console.log(chalk.red('✗ Exception:'));
    console.log(chalk.gray(error instanceof Error ? error.message : String(error)));
  }

  console.log('');
}
