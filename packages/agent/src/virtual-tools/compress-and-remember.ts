// packages/agent/src/virtual-tools/compress-and-remember.ts
/**
 * compress_and_remember — 守护意识的分析总结标记工具
 *
 * 守护意识在 dispatch_task 返回后调用此工具，标记分析完成。
 * 实际的 memory 写入在 engine 后处理阶段从 conversation 同步，保证 context 和 memory 一致。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class CompressAndRememberTool implements Tool {
  id = 'compress_and_remember';
  name = 'compress_and_remember';
  description = 'dispatch_task 返回后，你用此工具确认分析总结已完成。你在下一条消息中输出你的分析总结文本。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      domain: { type: 'string', description: '路由到的领域' },
      relatedFiles: {
        type: 'array',
        items: { type: 'string', description: '文件路径' },
        description: '涉及到的文件'
      }
    },
    required: ['domain']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      domain: string;
      relatedFiles?: string[];
    };

    if (!params.domain) {
      return { success: false, error: 'domain is required' };
    }

    const { consciousnessManager } = this.context;

    // 记录文件
    if (params.relatedFiles) {
      for (const f of params.relatedFiles) {
        consciousnessManager.addFileTouched(f);
      }
    }

    debug(NS, LogLevel.BASIC, 'Analysis confirmed', {
      domain: params.domain
    });

    return {
      success: true,
      data: { domain: params.domain }
    };
  }
}
