// packages/client/cli/src/task.ts
/**
 * Task Executor - 任务执行器
 *
 * 职责：
 * - 执行单个任务
 * - 处理进度更新
 * - 处理权限确认
 */

import type { TramberClient } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { interactionManager } from './interaction-manager.js';
import { outputManager } from './output-manager.js';
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
  outputManager.writeln('');

  // 启动 spinner
  outputManager.startSpinner('思考中...');

  try {
    const result = await client.execute(input, {
      sceneId: context.config.scene,
      maxIterations: context.config.maxIterations,
      onProgress: (update) => {
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
          return true;
        }

        // 停止 spinner
        outputManager.stopSpinner();

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

    outputManager.stopSpinner();

    if (result.success) {
      // finalAnswer 只包含结构化数据结果，AI 文本已通过 writeProgress 显示
      if (result.result && String(result.result).trim() !== '') {
        outputManager.writeResult(String(result.result));
      }
    } else {
      outputManager.writeErrorResult(result.error ?? 'Unknown error');
    }
  } catch (error) {
    outputManager.stopSpinner();
    outputManager.writeException(error instanceof Error ? error.message : String(error));
  }

  outputManager.writeln('');
}
