// packages/agent/src/virtual-tools/escalate.ts
/**
 * escalate — 子意识判断超出领域时上升给守护意识
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class EscalateTool implements Tool {
  id = 'escalate';
  name = 'escalate';
  description = '当用户请求超出你的领域范围时，向守护意识报告。守护意识会封存你并路由到合适的子意识。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      reason: {
        type: 'string',
        description: '为什么超出你的领域'
      },
      suggestedDomain: {
        type: 'string',
        description: '建议的新领域'
      },
      userMessage: {
        type: 'string',
        description: '用户的原始请求'
      }
    },
    required: ['reason', 'userMessage']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      reason: string;
      suggestedDomain?: string;
      userMessage: string;
    };

    if (!params.reason || !params.userMessage) {
      return { success: false, error: 'reason and userMessage are required' };
    }

    const { consciousnessManager, currentConsciousnessId } = this.context;

    // 记录到 memory 流水账
    consciousnessManager.recordMemory({
      taskId: undefined,
      sourceId: currentConsciousnessId,
      domain: 'global',
      type: 'escalation',
      summary: `子意识 ${currentConsciousnessId} 判断超出领域: ${params.reason}`,
      content: `用户请求: ${params.userMessage}\n建议领域: ${params.suggestedDomain ?? '未知'}`,
      relatedFiles: []
    });

    debug(NS, LogLevel.BASIC, 'Escalation received', {
      from: currentConsciousnessId,
      reason: params.reason.slice(0, 80),
      suggestedDomain: params.suggestedDomain
    });

    return {
      success: true,
      data: {
        escalated: true,
        message: `已向守护意识报告：${params.reason}。守护意识会处理领域切换。`
      }
    };
  }
}
