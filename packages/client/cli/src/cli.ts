// packages/client/cli/src/cli.ts
/**
 * Tramber CLI - 主入口
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TramberClient } from '@tramber/sdk';
import { createContext, loadConfig, saveConfig, getDefaultConfigPath } from './config.js';
import { createRepl } from './repl.js';

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
  .action(async (input: string[], options) => {
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
      // 执行单次命令
      const description = input.join(' ');

      const executeTask = async (): Promise<void> => {
        const result = await client.execute(description, {
          sceneId: context.config.scene,
          maxIterations: context.config.maxIterations,
          onProgress: (progress) => {
            // 显示工具调用和结果
            if (progress.type === 'step' && progress.content) {
              console.log(chalk.gray('▸') + ' ' + chalk.white(progress.content));
            }
            if (progress.type === 'tool_call' && progress.toolCall) {
              console.log(chalk.cyan('▸') + ' ' + chalk.white(`[调用 ${progress.toolCall.name}]`));
              console.log(chalk.gray('  参数:') + ' ' + JSON.stringify(progress.toolCall.parameters).slice(0, 200));
            }
            if (progress.type === 'tool_result' && progress.toolResult) {
              if (progress.toolResult.success) {
                console.log(chalk.green('▸') + ' ' + chalk.white(`[结果] ${JSON.stringify(progress.toolResult.data).slice(0, 200)}`));
              } else {
                console.error(chalk.red('▸') + ' ' + chalk.white(`[错误] ${progress.toolResult.error}`));
              }
            }
          },
          onPermissionRequired: async (toolCall, operation) => {
            if (options.yes) {
              return true;
            }
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: `允许操作 "${operation}" (${toolCall.name})?`,
                default: false
              }
            ]);
            return confirm;
          }
        });

        if (result.success) {
          console.log(chalk.green('✓') + ' ' + chalk.white(result.result));
        } else {
          console.error(chalk.red('✗') + ' ' + chalk.white(result.error));
          process.exit(1);
        }
      };

      await executeTask();
    } else {
      // 启动 REPL
      await createRepl(client, context);
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
      console.log(configPath);
      return;
    }

    if (options.list) {
      console.log(chalk.cyan.bold('Configuration:'));
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    if (options.get) {
      const value = (config as any)[options.get];
      console.log(value ?? '');
      return;
    }

    if (options.set) {
      const [key, ...valueParts] = options.set.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        (config as any)[key] = value;
        await saveConfig(configPath, config);
        console.log(chalk.green(`✓ Set ${key} = ${value}`));
      } else {
        console.error(chalk.red('Invalid format. Use: key=value'));
      }
      return;
    }

    // 默认显示所有配置
    console.log(chalk.cyan.bold('Configuration:'));
    console.log(JSON.stringify(config, null, 2));
  });

// scene 命令
program
  .command('scene')
  .description('List available scenes')
  .action(async () => {
    const client = new TramberClient();
    const scenes = await client.listScenes();

    console.log(chalk.cyan.bold('Available Scenes:'));
    for (const scene of scenes) {
      console.log(`  ${chalk.green('•')} ${chalk.white(scene.name)} ${chalk.gray(`(${scene.id})`)}`);
      console.log(`    ${chalk.gray(scene.description)}`);
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

    console.log(chalk.cyan.bold('Available Skills:'));
    for (const skill of skills) {
      console.log(`  ${chalk.green('•')} ${chalk.white(skill.name)} ${chalk.gray(`(${skill.id})`)}`);
      console.log(`    ${chalk.gray(skill.description)}`);
    }
  });

// routines 命令
program
  .command('routines')
  .description('List available routines')
  .action(async () => {
    const client = new TramberClient();
    const routines = await client.listRoutines();

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

    console.log(chalk.cyan.bold(`Experiences for "${query}":`));
    if (experiences.length === 0) {
      console.log('  ' + chalk.gray('No experiences found.'));
    } else {
      for (const exp of experiences) {
        console.log(`  ${chalk.green('•')} ${chalk.white(exp.name)}`);
        console.log(`    ${chalk.gray(exp.description)}`);
        console.log(`    ${chalk.cyan(`Effectiveness: ${((exp.effectiveness ?? 0.5) * 100).toFixed(0)}%`)}`);
      }
    }
  });

// 解析参数
program.parse();
