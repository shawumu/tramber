// packages/agent/src/virtual-tools/dispatch-task.ts
/**
 * dispatch_task — 领域路由工具
 *
 * 守护意识通过此工具将用户请求路由到领域子意识。
 * 支持查找已有子意识、激活封存子意识、创建新子意识。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { buildExecutionPrompt } from '../consciousness-prompts.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { createConversation, addMessage } from '../conversation.js';
import type { Task } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class DispatchTaskTool implements Tool {
  id = 'dispatch_task';
  name = 'dispatch_task';
  description = '将用户请求路由到领域子意识。如果该领域已有活跃子意识则直接路由，有封存子意识则激活，否则创建新的。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      domain: {
        type: 'string',
        description: '任务所属领域（如"编码"、"文档"、"部署"、"闲聊"）'
      },
      domainDescription: {
        type: 'string',
        description: '领域描述，帮助子意识判断边界（如"代码编写、修改、调试相关"）'
      },
      taskDescription: {
        type: 'string',
        description: '具体任务描述'
      },
      contextForChild: {
        type: 'string',
        description: '传递给子意识的关键上下文（记忆摘要、用户规则）'
      },
      allowedTools: {
        type: 'array',
        description: '允许子意识使用的工具列表',
        items: { type: 'string' }
      },
      maxIterations: {
        type: 'number',
        description: '最大迭代次数（默认 10）'
      }
    },
    required: ['domain', 'taskDescription']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      domain: string;
      domainDescription?: string;
      taskDescription: string;
      contextForChild?: string;
      allowedTools?: string[];
      maxIterations?: number;
    };

    if (!params.domain || !params.taskDescription) {
      return { success: false, error: 'domain and taskDescription are required' };
    }

    const { consciousnessManager, createLoop } = this.context;

    try {
      // 1. 查找领域子意识
      let execState = consciousnessManager.getDomainChild(params.domain);
      let isNew = false;

      if (!execState) {
        // 2. 不存在 → 创建新领域子意识
        execState = consciousnessManager.createDomainChild(
          params.domain,
          params.domainDescription ?? params.domain,
          params.taskDescription,
          {
            constraints: [],
            contextForChild: params.contextForChild,
            allowedTools: params.allowedTools,
            maxIterations: params.maxIterations
          }
        );
        isNew = true;

        // 记录领域创建
        consciousnessManager.recordMemory({
          taskId: undefined,
          sourceId: 'guardian',
          domain: params.domain,
          type: 'domain_switch',
          summary: `新领域：${params.domain} — ${params.taskDescription.slice(0, 100)}`,
          content: params.taskDescription,
          relatedFiles: []
        });

        debug(NS, LogLevel.BASIC, 'Created new domain child', { domain: params.domain });
      } else if (!this.isChildActive(params.domain)) {
        // 3. 存在但封存 → 激活
        consciousnessManager.reactivateChild(params.domain);

        consciousnessManager.recordMemory({
          taskId: undefined,
          sourceId: 'guardian',
          domain: 'global',
          type: 'domain_switch',
          summary: `激活领域：${params.domain}`,
          content: `用户回到${params.domain}领域`,
          relatedFiles: []
        });

        // 更新任务描述
        execState.taskDescription = params.taskDescription;
        if (params.contextForChild) {
          execState.parentContext = params.contextForChild;
        }
        execState.isNew = false;

        debug(NS, LogLevel.BASIC, 'Reactivated domain child', { domain: params.domain });
      } else {
        // 4. 存在且活跃 → 直接路由，更新任务
        execState.taskDescription = params.taskDescription;
        if (params.contextForChild) {
          execState.parentContext = params.contextForChild;
        }
        execState.isNew = false;

        debug(NS, LogLevel.BASIC, 'Routed to existing domain child', { domain: params.domain });
      }

      // 5. 创建子 AgentLoop
      const childLoop = createLoop({
        allowedTools: params.allowedTools,
        maxIterations: params.maxIterations ?? 10
      });

      // 6. 构建子意识 system prompt
      const basePrompt = childLoop.buildSystemPrompt();
      const execPrompt = buildExecutionPrompt(basePrompt, execState);

      // 7. 创建/复用子意识 conversation
      const conversation = createConversation({
        systemPrompt: execPrompt,
        projectInfo: { rootPath: process.cwd(), name: 'project' }
      });

      // 8. 创建任务
      const task: Task = {
        id: execState.id,
        description: params.taskDescription,
        sceneId: 'execution',
        isComplete: false
      };

      // 9. 执行子 loop
      consciousnessManager.updateStatus(execState.id, 'thinking');
      const result = await childLoop.execute(task, conversation);

      // 10. 更新状态
      consciousnessManager.updateStatus(
        execState.id,
        result.success ? 'active' : 'failed'
      );

      // 11. 压缩结果，记入 memory
      consciousnessManager.updateStatus('root', 'compressing');
      const fullMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: conversation.systemPrompt },
        ...conversation.messages.map(m => ({ role: m.role, content: m.content }))
      ];
      const summary = consciousnessManager.compressResult(
        execState.id,
        {
          consciousnessId: execState.id,
          success: result.success,
          finalAnswer: result.success ? result.finalAnswer : '',
          filesTouched: [],
          tokenUsage: result.conversation.tokenUsage,
          iterations: result.iterations,
          error: result.success ? undefined : result.error
        },
        fullMessages
      );
      consciousnessManager.updateStatus('root', 'thinking');

      return {
        success: result.success,
        data: {
          consciousnessId: execState.id,
          domain: params.domain,
          summary,
          iterations: result.iterations,
          error: result.success ? undefined : result.error,
          // 标记这是最终回复，不需要守护意识转发
          isFinalAnswer: true
        }
      };
    } catch (err) {
      debugError(NS, 'Failed to dispatch task', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private isChildActive(domain: string): boolean {
    const node = this.context.consciousnessManager.findChildByDomain(domain);
    return node !== null && node.active;
  }
}
