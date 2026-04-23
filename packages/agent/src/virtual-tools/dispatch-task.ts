// packages/agent/src/virtual-tools/dispatch-task.ts
/**
 * dispatch_task — 领域路由工具
 *
 * 守护意识通过此工具将用户请求路由到领域子意识。
 * 支持查找已有子意识、激活封存子意识、创建新子意识。
 *
 * Stage 9 新增：组装执行纲领注入子意识 system prompt
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { ExecutionContext, RelationType } from '@tramber/shared';
import { buildExecutionPrompt } from '../consciousness-prompts.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { createConversation, addMessage } from '../conversation.js';
import type { Task } from '@tramber/shared';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
        description: '任务描述。忠实概括用户请求，不要自行添加额外要求'
      },
      contextForChild: {
        type: 'string',
        description: '传递给子意识的背景信息。只传必要上下文，不要扩展用户意图（如用户说"查看目录"就不要加"说明每个文件用途"）'
      },
      allowedTools: {
        type: 'array',
        description: '允许子意识使用的工具列表',
        items: { type: 'string' }
      },
      attachResources: {
        type: 'array',
        description: '需要预加载给子意识的资源 URI 列表。当任务与已有资源相关时，主动指定以避免子意识重复读取。从已有资源索引中选择。',
        items: { type: 'string' }
      },
      maxIterations: {
        type: 'number',
        description: '最大迭代次数（默认 30）'
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
      attachResources?: string[];
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

        debug(NS, LogLevel.BASIC, 'Created new domain child', { domain: params.domain });
      } else if (!this.isChildActive(params.domain)) {
        // 3. 存在但封存 → 激活
        consciousnessManager.reactivateChild(params.domain);

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

      // 5. 创建子 AgentLoop（子意识的 onStep 将输出直接发给用户）
      const childLoop = createLoop({
        allowedTools: params.allowedTools,
        maxIterations: params.maxIterations ?? 30
      });

      // 6. Stage 9: 组装执行纲领（从实体图谱）
      const taskId = consciousnessManager.getTaskId();
      let execContext: ExecutionContext | undefined;
      let currentSubtaskId: string | undefined;

      if (taskId) {
        execContext = await consciousnessManager.assembleExecutionContext(taskId, params.domain);

        // 6.1 创建 subtask 实体（pending 状态）
        const memoryStore = consciousnessManager.getMemoryStore();

        // 查找活跃 domain_task
        const domainTasks = memoryStore.queryEntities({ taskId, type: 'domain_task', domain: params.domain });
        let domainTaskEntity = domainTasks.find(dt => (dt as any).status === 'active');

        if (!domainTaskEntity) {
          // 没有活跃的 domain_task → 创建新的
          const now = new Date().toISOString();
          domainTaskEntity = memoryStore.storeEntity(taskId, {
            type: 'domain_task',
            domain: params.domain,
            content: params.taskDescription,
            title: params.domainDescription ?? params.domain,
            status: 'active',
            subtaskIds: [],
            startedAt: now,
            updatedAt: now,
            summary: '',
            relations: []
          });
        }

        // 创建 subtask（pending）
        const subtaskEntity = memoryStore.storeEntity(taskId, {
          type: 'subtask',
          domain: params.domain,
          content: params.taskDescription,
          domainTaskId: domainTaskEntity.id,
          description: params.taskDescription,
          status: 'pending',
          analysisIds: [],
          ruleIds: [],
          resourceIds: [],
          requires: [],
          relations: [{ type: 'contains' as RelationType, target: domainTaskEntity.id }]
        });
        currentSubtaskId = subtaskEntity.id;
        this.context.currentSubtaskId = currentSubtaskId;

        // 更新 domain_task 的 subtaskIds
        const existingSubtaskIds = (domainTaskEntity as any).subtaskIds || [];
        memoryStore.updateEntity(taskId, domainTaskEntity.id, {
          subtaskIds: [...existingSubtaskIds, subtaskEntity.id]
        });

        debug(NS, LogLevel.BASIC, 'Execution context assembled', {
          domain: params.domain,
          domainTaskId: domainTaskEntity.id,
          subtaskId: currentSubtaskId,
          纲领长度: execContext.guideline.length,
          资源数: execContext.resourceIndex.length
        });
      }

      // 7. 构建子意识 system prompt（注入执行纲领 + 当前 subtask ID）
      const basePrompt = childLoop.buildSystemPrompt();
      const execPrompt = buildExecutionPrompt(basePrompt, execState, undefined, execContext, currentSubtaskId);

      // 8. 创建/复用子意识 conversation
      const conversation = createConversation({
        systemPrompt: execPrompt,
        projectInfo: { rootPath: process.cwd(), name: 'project' }
      });

      // 8.1 Stage 10: 注入前序对话和资源为独立 system message
      if (execContext) {
        if (execContext.recentHistory.length > 0) {
          const historyText = execContext.recentHistory
            .map(m => m.role === 'user' ? `用户: ${m.content.replace('[前序子任务] ', '')}` : `Tramber: ${m.content}`)
            .join('\n');
          addMessage(conversation, { role: 'system', content: `## 前序对话（本轮任务之前的历史）\n${historyText}` });
        }
      }

      // 8.2 Stage 10: 注入资源（自动附加 + 守护意识指定 attachResources）
      const attachedResourceParts: string[] = [];
      // 自动附加的小文件
      if (execContext && execContext.resourceContent.length > 0) {
        attachedResourceParts.push(
          ...execContext.resourceContent.map(r => `### ${r.uri}\n\`\`\`\n${r.content}\n\`\`\``)
        );
      }
      // 守护意识指定的 attachResources
      if (taskId && params.attachResources && params.attachResources.length > 0) {
        for (const uri of params.attachResources) {
          // 跳过已自动附加的
          if (execContext?.resourceContent.some(r => r.uri === uri)) continue;
          if (!uri.startsWith('file://')) continue;
          const filePath = uri.replace('file://', '');
          try {
            const resolved = resolve(filePath);
            const content = readFileSync(resolved, 'utf-8');
            // 限制单个文件最大 20K 字符
            const trimmed = content.length > 20000 ? content.slice(0, 20000) + '\n... (截断)' : content;
            attachedResourceParts.push(`### ${uri}\n\`\`\`\n${trimmed}\n\`\`\``);
          } catch (err) {
            debug(NS, LogLevel.BASIC, 'attachResource file not found, skipped', {
              uri, error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }
      if (attachedResourceParts.length > 0) {
        addMessage(conversation, { role: 'system', content: `## 已加载资源（直接可用，无需再次读取）\n${attachedResourceParts.join('\n')}` });
      }

      // 9. 创建任务
      const task: Task = {
        id: execState.id,
        description: params.taskDescription,
        sceneId: 'execution',
        isComplete: false
      };

      // 10. 执行子 loop
      consciousnessManager.updateStatus(execState.id, 'thinking');
      const result = await childLoop.execute(task, conversation);

      // 11. 更新状态
      consciousnessManager.updateStatus(
        execState.id,
        result.success ? 'active' : 'failed'
      );

      // 11.1 更新 subtask 状态（result 留空，由 analyze_turn 回填有意义的结果总结）
      if (taskId && currentSubtaskId) {
        const memoryStore = consciousnessManager.getMemoryStore();
        memoryStore.updateEntity(taskId, currentSubtaskId, {
          status: result.success ? 'completed' : 'blocked',
          result: result.success ? '' : result.error
        });
      }

      // 12. 压缩结果，记入 memory
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

      // 13. 子意识输出已通过子 loop 的 onStep（流式/非流式）直接发给用户
      // 不再通过 onChildStep 重复发送

      // 14. 返回结果给守护意识（守护意识 LLM 调用 analyze_turn 写分析总结）
      // 包含实际执行内容，避免守护意识因信息缺失而产生幻觉
      const childFinalAnswer = result.success ? (result as any).finalAnswer || '' : '';
      const toolCallSummary = result.success
        ? (result as any).steps
            ?.filter((s: any) => s.toolCall)
            .map((s: any) => `${s.toolCall.name}(${JSON.stringify(s.toolCall.parameters).slice(0, 100)})`)
            .join('\n') || ''
        : '';

      return {
        success: result.success,
        data: {
          domain: params.domain,
          taskDescription: params.taskDescription,
          iterations: result.iterations,
          finalAnswer: childFinalAnswer,
          toolCallSummary,
          error: result.success ? undefined : result.error
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
