// packages/agent/src/virtual-tools/report-status.ts
/**
 * report_status — 向父意识报告执行进度
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class ReportStatusTool implements Tool {
  id = 'report_status';
  name = 'report_status';
  description = '向父意识报告执行进度。用于提供更新、报告困难。';
  category = 'execution' as const;
  inputSchema = {
    type: 'object' as const,
    properties: {
      progress: { type: 'number', description: '进度 0-100' },
      summary: { type: 'string', description: '当前状态简述' },
      difficulties: {
        type: 'array',
        items: { type: 'string', description: '遇到的困难' },
        description: '遇到的困难列表'
      }
    },
    required: ['progress', 'summary']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      progress: number;
      summary: string;
      difficulties?: string[];
    };

    if (params.progress === undefined || !params.summary) {
      return { success: false, error: 'progress and summary are required' };
    }

    // 更新根意识的进度（近似）
    this.context.consciousnessManager.updateProgress(
      params.progress,
      params.summary
    );

    // 记录困难
    if (params.difficulties) {
      for (const d of params.difficulties) {
        this.context.consciousnessManager.addDifficulty(d);
      }
    }

    debug(NS, LogLevel.BASIC, 'Status reported', {
      from: this.context.currentConsciousnessId,
      progress: params.progress,
      summary: params.summary.slice(0, 80)
    });

    return {
      success: true,
      data: {
        acknowledged: true,
        message: '状态已记录'
      }
    };
  }
}
