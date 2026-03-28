// packages/client/cli/src/cli.ts
/**
 * Tramber CLI - 主入口
 */

import { Command } from 'commander';
import { TramberEngine } from '@tramber/sdk';
import { createContext, loadConfig, saveConfig, getDefaultConfigPath } from './config.js';
import { outputManager } from './output-manager.js';
import { render } from 'ink';
import React from 'react';
import { App } from './app.js';
import { Logger, LogLevel, NAMESPACE, debug } from '@tramber/shared';

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
      // REPL 模式下 debug 走 callback，由 Ink DebugPanel 渲染，不写 console
      const isRepl = input.length === 0;
      Logger.getInstance().configure({
        enabled: true,
        level: options.debugLevel as LogLevel,
        namespaces: options.debugNamespace,
        output: isRepl ? 'callback' : (options.debugFile ? 'file' : 'console'),
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

    const debugEnabled = !!options.debug;

    // 创建客户端
    const client = new TramberEngine({
      ...context.config,
      workspacePath: context.workspacePath,
      configPath: context.configPath
    });

    if (input.length > 0) {
      // 单次命令模式 — 直接执行并输出，不启动交互式 UI
      const userInput = input.join(' ');
      try {
        const result = await client.execute(userInput, {
          sceneId: context.config.scene,
          maxIterations: context.config.maxIterations,
          stream: false
        });
        if (result.result) {
          console.log(String(result.result));
        }
        if (!result.success && result.error) {
          console.error('✗ ' + result.error);
          process.exitCode = 1;
        }
      } catch (error) {
        console.error('✗ ' + (error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    } else {
      // 清屏，给 REPL 全屏感
      process.stdout.write('\x1B[2J\x1B[H');

      const { waitUntilExit } = render(
        React.createElement(App, {
          engine: client,
          context,
          autoConfirm: options.yes,
          debugEnabled
        }),
        {
          patchConsole: true,
          exitOnCtrlC: false
        }
      );
      await waitUntilExit();
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
    const client = new TramberEngine();
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
    const client = new TramberEngine();
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
    const client = new TramberEngine();
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
    const client = new TramberEngine();
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
