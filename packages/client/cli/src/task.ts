// packages/client/cli/src/task.ts
/**
 * Task Executor - 任务执行器
 *
 * 职责：
 * - 执行单个任务
 * - 处理进度更新
 * - 处理权限确认
 * - 管理 Conversation（接收并返回，由调用方保存）
 */

import type { TramberEngine } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import type { CliContext } from './config.js';
import { interactionManager } from './interaction-manager.js';
import { outputManager } from './output-manager.js';
import { debug, LogLevel, NAMESPACE } from '@tramber/shared';

/**
 * 执行任务，返回更新后的 conversation 供调用方保存
 */
export async function executeTask(
  input: string,
  client: TramberEngine,
  context: CliContext,
  autoConfirm = false,
  conversation?: Conversation
): Promise<Conversation> {
  outputManager.writeln('');

  // 启动 spinner
  outputManager.startSpinner('思考中...');

  try {
    const result = await client.execute(input, {
      sceneId: context.config.scene,
      maxIterations: context.config.maxIterations,
      stream: true,
      onProgress: (update: any) => {
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
      onPermissionRequired: async (toolCall: any, operation: string, reason?: string) => {
        if (autoConfirm) {
          return true;
        }

        // 停止 spinner
        outputManager.stopSpinner();

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

        // 使用 InteractionManager 请求输入
        const answer = await interactionManager.requestInput(message + '? (y/N)');
        const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

        debug(NAMESPACE.CLI, LogLevel.BASIC, 'Permission decision', { confirmed });

        return confirmed;
      }
    }, conversation);

    outputManager.stopSpinner();

    if (result.success) {
      if (result.result && String(result.result).trim() !== '') {
        outputManager.writeResult(String(result.result));
      }
    } else {
      outputManager.writeErrorResult(result.error ?? 'Unknown error');
    }

    return result.conversation!;
  } catch (error) {
    outputManager.stopSpinner();
    outputManager.writeException(error instanceof Error ? error.message : String(error));
    return conversation ?? createFallbackConversation();
  }

  outputManager.writeln('');
}

function createFallbackConversation(): Conversation {
  return {
    id: 'fallback',
    createdAt: new Date(),
    updatedAt: new Date(),
    systemPrompt: '',
    messages: [],
    tokenUsage: { input: 0, output: 0, total: 0 },
    totalIterations: 0,
    projectInfo: { rootPath: process.cwd(), name: 'project' },
    contextWindow: { maxTokens: 128000, summaryThreshold: 20, maxToolResults: 10 },
    hasSummary: false
  };
}
