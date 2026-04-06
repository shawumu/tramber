// packages/agent/src/virtual-tools/recall-memory.ts
/**
 * recall_memory — 从记忆系统中检索历史信息
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';

export class RecallMemoryTool implements Tool {
  id = 'recall_memory';
  name = 'recall_memory';
  description = '从记忆系统中检索历史信息。当需要回忆之前的决策、执行结果或对话概况时使用。';
  category = 'search' as const;
  inputSchema = {
    type: 'object' as const,
    properties: {
      phase: {
        type: 'string',
        description: '按任务阶段过滤（如"调研"、"实现"、"测试"）'
      },
      type: {
        type: 'string',
        enum: ['decision', 'result_summary', 'difficulty', 'file_change', 'conversation_summary'],
        description: '按记忆类型过滤'
      },
      keyword: {
        type: 'string',
        description: '关键词搜索'
      },
      limit: {
        type: 'number',
        description: '最多返回条数（默认 5）'
      }
    },
    required: []
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      phase?: string;
      type?: string;
      keyword?: string;
      limit?: number;
    };

    const entries = this.context.consciousnessManager.recallMemory({
      phase: params.phase,
      type: params.type as any,
      keyword: params.keyword,
      limit: params.limit ?? 5
    });

    return {
      success: true,
      data: entries.map(e => ({
        id: e.id,
        phase: e.phase,
        type: e.type,
        summary: e.summary,
        content: e.content,
        relatedFiles: e.relatedFiles,
        createdAt: e.createdAt
      }))
    };
  }
}
