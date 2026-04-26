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
import type { ExecutionContext, RelationType, ResourceSummary } from '@tramber/shared';
import { buildExecutionPrompt, buildResourceIndexerPrompt, buildExistingResourcesMessage, formatStructureTree, StructureNode } from '../consciousness-prompts.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { createConversation, addMessage } from '../conversation.js';
import type { Task } from '@tramber/shared';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_MAX_LINES = 200;
const HARD_MAX_LINES = 1000;

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

      // 8.2 Stage 10: 注入资源（两阶段：有实体→概览，无实体→内容+自动创建）
      const attachedOverviewParts: string[] = [];
      const attachedContentParts: string[] = [];
      // 自动附加的小文件（已有内容）
      if (execContext && execContext.resourceContent.length > 0) {
        attachedContentParts.push(
          ...execContext.resourceContent.map(r => `### ${r.uri}\n\`\`\`\n${r.content}\n\`\`\``)
        );
      }
      // 守护意识指定的 attachResources（两阶段注入）
      if (taskId && params.attachResources && params.attachResources.length > 0) {
        const memoryStore = consciousnessManager.getMemoryStore();
        const subtaskRef = this.context.currentSubtaskId;

        for (const uri of params.attachResources) {
          // 跳过已自动附加的
          if (execContext?.resourceContent.some(r => r.uri === uri)) continue;
          if (!uri.startsWith('file://')) continue;

          // 阶段1：查找已有资源实体 → 注入概览
          const existing = memoryStore.findByUri(taskId, uri);
          if (existing) {
            const summary = existing.summary as unknown as Record<string, unknown> | undefined;
            const title = summary?.title ? ` — ${summary.title}` : '';
            const structure = summary?.structure
              ? `\n  ${formatStructureTree(summary.structure as StructureNode[])}`
              : '';
            attachedOverviewParts.push(`- [${existing.id}] ${uri}${title}${structure}`);
            continue;
          }

          // 阶段2：无实体 → 读取文件内容（受行数限制）→ 自动创建资源实体
          const filePath = uri.replace('file://', '');
          try {
            const resolved = resolve(filePath);
            const raw = readFileSync(resolved, 'utf-8');
            const { content: numberedContent, startLine, endLine, totalLines } = applyLineLimits(raw);
            attachedContentParts.push(`### ${uri}\n共 ${totalLines} 行，显示第 ${startLine}-${endLine} 行\n\`\`\`\n${numberedContent}\n\`\`\``);

            // 自动创建资源实体（基本摘要，执行意识后续会通过 record_resource 更新）
            if (subtaskRef) {
              const fileName = filePath.split(/[/\\]/).pop() || filePath;
              memoryStore.storeEntity(taskId, {
                type: 'resource',
                domain: 'execution',
                content: uri,
                relations: [{ type: 'produced_by' as RelationType, target: subtaskRef }],
                uri,
                resourceType: 'file',
                summary: { type: 'auto_created', title: fileName, structure: [] } as unknown as ResourceSummary
              });
              debug(NS, LogLevel.BASIC, 'Auto-created resource entity', { uri, subtaskRef });
            }
          } catch (err) {
            debug(NS, LogLevel.BASIC, 'attachResource file not found, skipped', {
              uri, error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }
      // 注入到 conversation
      if (attachedContentParts.length > 0) {
        addMessage(conversation, { role: 'system', content: `## 已加载资源（直接可用，无需再次读取）\n${attachedContentParts.join('\n')}` });
      }
      if (attachedOverviewParts.length > 0) {
        addMessage(conversation, { role: 'system', content: `## 资源概览（已记录，用 recall_resource 按段落读取）\n${attachedOverviewParts.join('\n')}` });
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

      // 10.0 保存执行意识 context
      if (taskId && currentSubtaskId) {
        const contextStorage = consciousnessManager.getContextStorage();
        const execSteps = (result as any).steps as Array<{
          toolCall?: { name: string; parameters: Record<string, unknown> };
        }> | undefined;
        contextStorage.saveRound(taskId, currentSubtaskId, 'execution', {
          systemPrompt: conversation.systemPrompt,
          messages: conversation.messages.map(m => ({ role: m.role, content: m.content })),
          iterations: result.iterations,
          success: result.success,
          tokenUsage: result.conversation?.tokenUsage,
          toolCalls: execSteps?.filter(s => s.toolCall).map(s => ({
            name: s.toolCall!.name,
            parameters: s.toolCall!.parameters
          }))
        });
      }

      // 10.1 Phase 2: 执行知识分析孙意识（执行成功且有资源访问时触发）
      if (result.success && taskId && currentSubtaskId) {
        const steps = (result as any).steps as Array<{
          toolCall?: { name: string; parameters: Record<string, unknown> };
        }> | undefined;

        const accessedResources = this.extractAccessedResources(steps || []);

        if (accessedResources.length > 0) {
          try {
            // 创建孙意识节点
            const grandchildState = consciousnessManager.createGrandchild(
              execState.id,
              params.domain,
              `知识分析: ${accessedResources.map(r => r.uri.replace('file://', '')).join(', ')}`
            );

            if (grandchildState) {
              const memoryStore = consciousnessManager.getMemoryStore();

              // 查询当前任务的所有已有资源实体
              const allResources = memoryStore.queryEntities({ taskId, type: 'resource', limit: 50 });
              const existingResources = allResources.map(e => ({
                id: e.id,
                uri: (e as any).uri || '',
                summary: (e as any).summary
              }));

              // 构建知识分析 prompt
              const indexerPrompt = buildResourceIndexerPrompt();

              // 创建知识分析 loop（静默模式 + 只暴露 record_resource）
              const indexerLoop = createLoop({
                maxIterations: 2,
                silent: true,
                allowedTools: ['record_resource']
              });
              const indexerConversation = createConversation({
                systemPrompt: indexerPrompt,
                projectInfo: { rootPath: process.cwd(), name: 'project' }
              });

              // 注入已有资源列表为独立 system message
              const existingMsg = buildExistingResourcesMessage(existingResources);
              if (existingMsg) {
                addMessage(indexerConversation, { role: 'system', content: existingMsg });
              }

              // 继承执行意识的 messages（包含已读取的文件内容、目录列表、命令输出）
              for (const msg of conversation.messages) {
                addMessage(indexerConversation, { role: msg.role, content: msg.content });
              }

              // 确保 record_resource 能关联到正确的 subtask
              this.context.currentSubtaskId = currentSubtaskId;

              // 运行知识分析
              const indexerTask = {
                id: grandchildState.id,
                description: '分析执行知识并记录资源',
                sceneId: 'execution',
                isComplete: false
              };

              const indexerResult = await indexerLoop.execute(indexerTask, indexerConversation);

              // 保存 indexer context
              if (taskId && currentSubtaskId) {
                const contextStorage = consciousnessManager.getContextStorage();
                const indexerSteps = (indexerResult as any).steps as Array<{
                  toolCall?: { name: string; parameters: Record<string, unknown> };
                }> | undefined;
                contextStorage.saveRound(taskId, currentSubtaskId, 'indexer', {
                  systemPrompt: indexerPrompt,
                  messages: indexerConversation.messages.map(m => ({ role: m.role, content: m.content })),
                  iterations: indexerResult.iterations,
                  success: indexerResult.success,
                  tokenUsage: indexerResult.conversation?.tokenUsage,
                  toolCalls: indexerSteps?.filter(s => s.toolCall).map(s => ({
                    name: s.toolCall!.name,
                    parameters: s.toolCall!.parameters
                  }))
                });
              }

              consciousnessManager.finalizeGrandchild(grandchildState.id);

              debug(NS, LogLevel.BASIC, 'Resource indexer completed', {
                resourcesProcessed: accessedResources.length,
                existingResources: existingResources.length
              });
            }
          } catch (err) {
            debugError(NS, 'Resource indexer failed (non-fatal)', err);
          }
        }
      }

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

  /**
   * 从 loop steps 中提取已访问的资源（文件、目录、命令）
   * 只从 toolCall.parameters 提取路径，不依赖 toolResult.data
   * （文件内容/目录列表/命令输出已在 conversation messages 中，indexer 继承 messages 即可看到）
   */
  private extractAccessedResources(steps: Array<{
    toolCall?: { name: string; parameters: Record<string, unknown> };
  }>): Array<{ type: 'file' | 'directory' | 'command'; uri: string; detail?: string }> {
    const seen = new Map<string, { type: 'file' | 'directory' | 'command'; uri: string; detail?: string }>();

    for (const step of steps) {
      if (!step.toolCall) continue;

      if (step.toolCall.name === 'read_file' || step.toolCall.name === 'recall_resource') {
        const paramKey = step.toolCall.name === 'read_file' ? 'path' : 'uri';
        const pathOrUri = step.toolCall.parameters[paramKey] as string;
        if (!pathOrUri) continue;

        const uri = pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`;
        if (seen.has(uri)) continue;
        seen.set(uri, { type: 'file', uri });
      }

      if (step.toolCall.name === 'glob') {
        const pattern = step.toolCall.parameters.pattern as string;
        if (!pattern) continue;

        // 从 glob 模式提取目录路径（如 "demos/*" → "demos"）
        const dirPath = pattern.replace(/\/?\*\*?.*$/, '').replace(/\/$/, '');
        if (!dirPath) continue;

        const uri = `file://${dirPath}`;
        if (seen.has(uri)) continue;
        seen.set(uri, { type: 'directory', uri, detail: `glob: ${pattern}` });
      }

      if (step.toolCall.name === 'exec') {
        const command = step.toolCall.parameters.command as string;
        if (!command) continue;

        const uri = `cmd://${command.slice(0, 80)}`;
        if (seen.has(uri)) continue;
        seen.set(uri, { type: 'command', uri, detail: command });
      }
    }

    return Array.from(seen.values());
  }
}

// === 辅助函数 ===

/** 应用行数限制并返回带行号的内容（与 recall_resource 同构） */
function applyLineLimits(raw: string, startLine = 1, endLine?: number): {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
} {
  const allLines = raw.split('\n');
  const totalLines = allLines.length;

  const s = Math.max(1, Math.min(startLine, totalLines));
  const requestedEnd = endLine !== undefined
    ? Math.min(endLine, totalLines)
    : Math.min(s + DEFAULT_MAX_LINES - 1, totalLines);
  const e = Math.min(requestedEnd, s + HARD_MAX_LINES - 1);
  const selectedLines = allLines.slice(s - 1, e);

  const maxLineNumWidth = String(e).length;
  const numbered = selectedLines
    .map((line, i) => `${String(s + i).padStart(maxLineNumWidth, ' ')} | ${line}`)
    .join('\n');

  return { content: numbered, startLine: s, endLine: e, totalLines };
}
