// packages/agent/src/virtual-tools/recall-memory.ts
/**
 * recall_memory — 从记忆系统中检索历史信息（守护意识使用）
 *
 * Stage 9 重构：检索实体摘要而非完整内容
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';

export class RecallMemoryTool implements Tool {
  id = 'recall_memory';
  name = 'recall_memory';
  description = '检索历史实体摘要（用户需求、领域任务、子任务、分析、规则）。守护意识使用。';
  category = 'search' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string' as const,
        enum: ['user_request', 'domain_task', 'subtask', 'analysis', 'rule', 'resource', 'all'],
        description: '按实体类型过滤'
      },
      domain: {
        type: 'string' as const,
        description: '按领域过滤'
      },
      keyword: {
        type: 'string' as const,
        description: '关键词搜索'
      },
      limit: {
        type: 'number' as const,
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
      type?: 'user_request' | 'domain_task' | 'subtask' | 'analysis' | 'rule' | 'resource' | 'all';
      domain?: string;
      keyword?: string;
      limit?: number;
    };

    const taskId = this.context.consciousnessManager.getTaskId();
    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    const memoryStore = this.context.consciousnessManager.getMemoryStore();

    // 查询实体
    const entities = memoryStore.queryEntities({
      taskId,
      type: params.type === 'all' ? undefined : params.type,
      domain: params.domain,
      keyword: params.keyword,
      limit: params.limit ?? 5
    });

    // 返回摘要（id + type + content 前 100 字符）
    return {
      success: true,
      data: entities.map(e => ({
        id: e.id,
        type: e.type,
        domain: e.domain,
        summary: e.content.slice(0, 100),
        createdAt: e.createdAt
      }))
    };
  }
}