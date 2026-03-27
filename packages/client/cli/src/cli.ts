// packages/client/cli/src/cli.ts
/**
 * Tramber CLI - 主入口
 */

import { Command } from 'commander';
import { TramberClient } from '@tramber/sdk';
import { createContext, loadConfig, saveConfig, getDefaultConfigPath } from './config.js';
import { createRepl } from './repl.js';
import { outputManager } from './output-manager.js';
import { SingleCommandExecutor } from './single-command-executor.js';
import { Logger, LogLevel, NAMESPACE, debug } from '@tramber/shared';

/**
 * 错误处理函数 - 根据终止原因显示不同的错误信息
 */
function handleError(error: string | undefined, terminatedReason?: 'completed' | 'max_iterations' | 'error'): void {
  if (!error) {
    outputManager.writeErrorResult('未知错误');
    return;
  }

  switch (terminatedReason) {
    case 'max_iterations':
      outputManager.writeError('任务未完成，达到最大迭代次数');
      outputManager.writeln('  ' + error);
      outputManager.writeln('提示: 使用 --max-iterations 增加限制');
      break;

    case 'error':
      outputManager.writeErrorResult(error);
      break;

    default:
      outputManager.writeErrorResult(error);
  }
}

const program = new Command();

program
  .name('tramber')
  .description('Tramber - AI Assisted Programming Tool (MVP v0.1.0)')
  .version('0.1.0');

// REPL 模式（默认）
program
  .argument('[input...]', 'Input to execute, or start REPL if no input provided')
  .option('-c, --config <path>', 'Path to config file')
  .option('-s, --scene <scene>', 'Scene to use')
  .option('-m, --model <model>', 'Model to use')
  .option('--no-experience', 'Disable experience')
  .option('--no-routine', 'Disable routine')
  .option('-y, --yes', 'Auto-confirm all permissions')
  .option('--debug', 'Enable debug mode')
  .option('--debug-level <level>', 'Debug level: error, basic, verbose, trace', 'basic')
  .option('--debug-namespace <ns...>', 'Debug namespaces: agent, tool, provider, permission, sdk, etc.')
  .option('--debug-file <path>', 'Write debug output to file')
  .action(async (input: string[], options) => {
    // 配置 Logger（在所有其他操作之前）
    if (options.debug) {
      Logger.getInstance().configure({
        enabled: true,
        level: options.debugLevel as LogLevel,
        namespaces: options.debugNamespace,
        output: options.debugFile ? 'file' : 'console',
        filePath: options.debugFile
      });
    }

    debug(NAMESPACE.CLI, LogLevel.BASIC, 'CLI started', {
      input: input.join(' ') || '[REPL mode]',
      debugEnabled: options.debug
    });

    const context = await createContext({
      configPath: options.config
    });

    // 应用命令行选项
    if (options.scene) context.config.scene = options.scene;
    if (options.model) context.config.model = options.model;
    if (options.noExperience) context.config.enableExperience = false;
    if (options.noRoutine) context.config.enableRoutine = false;

    // 创建客户端
    const client = new TramberClient({
      ...context.config,
      workspacePath: context.workspacePath,
      configPath: context.configPath
    });

    if (input.length > 0) {
      // 执行单次命令（使用 SingleCommandExecutor）
      const executor = new SingleCommandExecutor();
      const description = input.join(' ');

      await executor.execute(description, client, context, options.yes);
    } else {
      // 启动 REPL
      await createRepl(client, context, { autoConfirm: options.yes });
    }
  });

// config 命令
program
  .command('config')
  .description('Manage configuration')
  .option('-s, --set <key=value>', 'Set a config value')
  .option('-g, --get <key>', 'Get a config value')
  .option('-l, --list', 'List all config values')
  .option('--path', 'Show config file path')
  .action(async (options) => {
    const configPath = getDefaultConfigPath();
    const config = await loadConfig(configPath);

    if (options.path) {
      outputManager.writeln(configPath);
      return;
    }

    if (options.list) {
      outputManager.writeln('Configuration:');
      outputManager.writeln(JSON.stringify(config, null, 2));
      return;
    }

    if (options.get) {
      const value = (config as any)[options.get];
      outputManager.writeln(value ?? '');
      return;
    }

    if (options.set) {
      const [key, ...valueParts] = options.set.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        (config as any)[key] = value;
        await saveConfig(configPath, config);
        outputManager.writeln(`✓ Set ${key} = ${value}`);
      } else {
        outputManager.writeError('Invalid format. Use: key=value');
      }
      return;
    }

    // 默认显示所有配置
    outputManager.writeln('Configuration:');
    outputManager.writeln(JSON.stringify(config, null, 2));
  });

// scene 命令
program
  .command('scene')
  .description('List available scenes')
  .action(async () => {
    const client = new TramberClient();
    const scenes = await client.listScenes();

    outputManager.writeln('Available Scenes:');
    for (const scene of scenes) {
      outputManager.writeln(`  • ${scene.name} (${scene.id})`);
      outputManager.writeln(`    ${scene.description}`);
    }
  });

// skills 命令
program
  .command('skills')
  .description('List available skills')
  .option('-s, --scene <scene>', 'Filter by scene')
  .action(async (options) => {
    const client = new TramberClient();
    const skills = await client.listSkills({ sceneId: options.scene });

    outputManager.writeln('Available Skills:');
    for (const skill of skills) {
      outputManager.writeln(`  • ${skill.name} (${skill.id})`);
      outputManager.writeln(`    ${skill.description}`);
    }
  });

// routines 命令
program
  .command('routines')
  .description('List available routines')
  .action(async () => {
    const client = new TramberClient();
    const routines = await client.listRoutines();

    outputManager.writeln('Available Routines:');
    if (routines.length === 0) {
      outputManager.writeln('  No routines available yet.');
      outputManager.writeln('  Routines are automatically created from successful skills.');
    } else {
      for (const routine of routines) {
        outputManager.writeln(`  • ${routine.name} (${routine.id})`);
        outputManager.writeln(`    ${routine.description}`);
        outputManager.writeln(`    Success rate: ${(routine.stats.successRate * 100).toFixed(0)}%`);
      }
    }
  });

// experience 命令
program
  .command('experience')
  .description('Search experiences')
  .argument('<query>', 'Search query')
  .option('-l, --limit <number>', 'Max results', '5')
  .action(async (query: string, options) => {
    const client = new TramberClient();
    const experiences = await client.searchExperiences(query, parseInt(options.limit));

    outputManager.writeln(`Experiences for "${query}":`);
    if (experiences.length === 0) {
      outputManager.writeln('  No experiences found.');
    } else {
      for (const exp of experiences) {
        outputManager.writeln(`  • ${exp.name}`);
        outputManager.writeln(`    ${exp.description}`);
        outputManager.writeln(`    Effectiveness: ${((exp.effectiveness ?? 0.5) * 100).toFixed(0)}%`);
      }
    }
  });

// 解析参数
program.parse();
