// packages/client/cli/src/single-command-executor.ts
/**
 * Single Command Executor - 单次命令执行器
 *
 * 职责：
 * - 执行单次命令（非 REPL 模式）
 * - 独立管理输入输出（不依赖 InteractionManager）
 * - 处理权限确认
 */

import readline from 'node:readline';
import type { TramberEngine } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { outputManager } from './output-manager.js';
import { debug, LogLevel, NAMESPACE } from '@tramber/shared';

/**
 * 单次命令执行器
 */
export class SingleCommandExecutor {
  private rl: readline.Interface | null = null;

  /**
   * 执行单次命令
   */
  async execute(
    command: string,
    client: TramberEngine,
    context: CliContext,
    autoConfirm: boolean
  ): Promise<void> {
    // 创建专用的 readline（不使用 InteractionManager）
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const result = await client.execute(command, {
        sceneId: context.config.scene,
        maxIterations: context.config.maxIterations,
        stream: true,
        onProgress: (update) => {
          if (update.type === 'text_delta' && update.content) {
            outputManager.writeTextDelta(update.content);
          }
          if (update.type === 'step' && update.content) {
            outputManager.writeProgress(update.content);
          }
          if (update.type === 'tool_call' && update.toolCall) {
            outputManager.writeToolCall(update.toolCall.name, update.toolCall.parameters);
          }
          if (update.type === 'tool_result' && update.toolResult) {
            outputManager.writeToolResult(update.toolResult.success, update.toolResult.data, update.toolResult.error);
          }
        },
        onPermissionRequired: async (toolCall, operation, reason) => {
          if (autoConfirm) {
            debug(NAMESPACE.CLI, LogLevel.BASIC, 'Auto-confirming permission', { operation, tool: toolCall.name });
            return true;
          }

          // 构建确认消息
          const params = toolCall.parameters || {};
          let message = `允许操作 "${operation}" (${toolCall.name})`;
          if (params.path) {
            message += `\n文件: ${params.path}`;
          } else if (params.command) {
            message += `\n命令: ${params.command}`;
          }
          if (params.content) {
            const preview = String(params.content).slice(0, 100);
            message += `\n内容: ${preview}${String(params.content).length > 100 ? '...' : ''}`;
          }
          if (reason) {
            message += `\n原因: ${reason}`;
          }

          // 使用 question() 请求输入
          const answer = await this.question(message + '? (y/N)');
          const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

          debug(NAMESPACE.CLI, LogLevel.BASIC, 'Permission decision', { confirmed });

          return confirmed;
        }
      });

      outputManager.writeln('');

      if (result.success) {
        outputManager.writeResult(String(result.result ?? 'Done'));
      } else {
        outputManager.writeErrorResult(result.error ?? 'Unknown error');
      }
    } catch (error) {
      outputManager.writeln('');
      outputManager.writeException(error instanceof Error ? error.message : String(error));
    } finally {
      this.close();
    }
  }

  /**
   * 请求用户输入
   */
  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve('');
        return;
      }

      this.rl.question(prompt + ' ', (answer) => {
        resolve(answer);
      });
    });
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
}
