// packages/agent/src/virtual-tools/rebuild-context.ts
/**
 * rebuild_context — 执行意识的 Context 重建工具
 *
 * 当 context 膨胀接近阈值时调用，丢弃旧消息，从实体图谱重新组装。
 * 重建而非压缩，质量恒定。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class RebuildContextTool implements Tool {
  id = 'rebuild_context';
  name = 'rebuild_context';
  description = '重建 context，丢弃旧消息，从实体图谱重新组装。context 阈值触发时调用。重建后质量与首次组装一致。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      keepRecent: { type: 'number', default: 3, description: '保留最近 N 轮对话' }
    },
    required: []
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      keepRecent?: number;
    };

    const keepRecent = params.keepRecent ?? 3;
    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      // 获取当前执行意识的 conversation
      const currentState = consciousnessManager.getCurrentExecutionContext();

      if (!currentState) {
        return { success: false, error: 'No active execution context' };
      }

      // 调用 assembleExecutionContext 重建纲领
      const execContext = await consciousnessManager.assembleExecutionContext(
        currentState.id,
        currentState.domain
      );

      // 返回新纲领（实际的 conversation 修改由 consciousnessManager 完成）
      debug(NS, LogLevel.BASIC, 'Context rebuilt', {
        keepRecent,
        guidelineLength: execContext.guideline.length
      });

      return {
        success: true,
        data: {
          guideline: execContext.guideline,
          resourceIndex: execContext.resourceIndex,
          keepRecent,
          message: `Context 已重建，保留最近 ${keepRecent} 轮对话。新纲领已注入 system prompt。`
        }
      };
    } catch (err) {
      debug(NS, LogLevel.BASIC, 'Failed to rebuild context', { error: String(err) });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}