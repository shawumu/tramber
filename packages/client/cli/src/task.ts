// packages/client/cli/src/task.ts
/**
 * Task Executor - 任务执行器
 *
 * 职责：
 * - 执行单个任务
 * - 处理进度更新
 * - 处理权限确认
 */

import chalk from 'chalk';
import type { TramberClient } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { interactionManager } from './interaction-manager.js';
import { debug, LogLevel, NAMESPACE } from '@tramber/shared';

/**
 * 执行任务
 */
export async function executeTask(
  input: string,
  client: TramberClient,
  context: CliContext,
  autoConfirm = false
): Promise<void> {
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
        if (update.type === 'tool_call' && update.toolCall) {
          clearInterval(spinnerInterval);
          process.stdout.write('\r' + chalk.cyan('▸ ') + chalk.white(`[调用 ${update.toolCall.name}]`) + '\n');
          process.stdout.write(chalk.gray('  参数: ') + JSON.stringify(update.toolCall.parameters).slice(0, 200) + '\n');
        }
        if (update.type === 'tool_result' && update.toolResult) {
          clearInterval(spinnerInterval);
          if (update.toolResult.success) {
            const dataStr = JSON.stringify(update.toolResult.data ?? 'null');
            process.stdout.write('\r' + chalk.green('▸ ') + chalk.white(`[结果] ${dataStr.slice(0, 200)}${dataStr.length > 200 ? '...' : ''}`) + '\n');
          } else {
            process.stdout.write('\r' + chalk.red('▸ ') + chalk.white(`[错误] ${update.toolResult.error}`) + '\n');
          }
        }
      },
      onPermissionRequired: async (toolCall, operation, reason) => {
        if (autoConfirm) {
          return true;
        }

        // 停止 spinner
        clearInterval(spinnerInterval);

        // 构建确认消息
        let message = `允许操作 "${operation}" (${toolCall.name})`;
        if (toolCall.parameters.command) {
          message += `\n命令: ${toolCall.parameters.command}`;
        }
        if (reason) {
          message += `\n原因: ${reason}`;
        }

        // 使用 InteractionManager 请求输入
        const answer = await interactionManager.requestInput(message + '? (y/N)');
        const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

        debug(NAMESPACE.CLI, LogLevel.BASIC, 'Permission decision', { confirmed });

        return confirmed;
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
