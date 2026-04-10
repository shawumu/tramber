// packages/agent/src/virtual-tools/compress-and-remember.ts
/**
 * compress_and_remember — 压缩当前对话信息并存入记忆
 *
 * 仅自我感知意识可用。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class CompressAndRememberTool implements Tool {
  id = 'compress_and_remember';
  name = 'compress_and_remember';
  description = '将子意识完成后的结果记入记忆流水账。summary 必须是你（守护意识）写的简短摘要，用一句话概括用户请求和结果，不要复制子意识的原文。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      phase: { type: 'string', description: '子任务描述（简短标签）' },
      summary: { type: 'string', description: '你写的简短摘要：用户请求了什么 + 最终结果（一句话，≤50字）' },
      keyDecisions: {
        type: 'array',
        items: { type: 'string', description: '关键决策' },
        description: '关键决策列表'
      },
      relatedFiles: {
        type: 'array',
        items: { type: 'string', description: '文件路径' },
        description: '相关文件列表'
      }
    },
    required: ['phase', 'summary']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      phase: string;
      summary: string;
      keyDecisions?: string[];
      relatedFiles?: string[];
    };

    if (!params.phase || !params.summary) {
      return { success: false, error: 'phase and summary are required' };
    }

    const { consciousnessManager } = this.context;

    // 存入记忆
    const state = consciousnessManager.getRoot();
    if (!state) {
      return { success: false, error: 'No active root consciousness' };
    }

    // 通过 memoryStore 直接存储
    const memoryStore = (consciousnessManager as any).memoryStore;
    const currentTaskId = (consciousnessManager as any).currentTaskId;
    if (memoryStore) {
      memoryStore.store({
        taskId: currentTaskId ?? undefined,
        phase: params.phase,
        type: 'conversation_summary',
        summary: params.summary,
        content: params.summary,
        relatedFiles: params.relatedFiles ?? []
      });
    }

    // 记录关键决策
    if (params.keyDecisions) {
      for (const d of params.keyDecisions) {
        consciousnessManager.addDecision(d);
      }
    }

    // 更新记忆索引
    if (memoryStore) {
      state.memoryIndex = memoryStore.getIndex();
    }

    debug(NS, LogLevel.BASIC, 'Compressed and remembered', {
      phase: params.phase,
      decisions: params.keyDecisions?.length ?? 0,
      files: params.relatedFiles?.length ?? 0
    });

    return {
      success: true,
      data: {
        message: `已压缩并存储到记忆（阶段: ${params.phase}）`,
        memoryCount: state.memoryIndex.length
      }
    };
  }
}
