// packages/agent/src/virtual-tools/analyze-turn.ts
/**
 * analyze_turn — 守护意识的分析总结工具（Stage 9 重构）
 *
 * 守护意识在 dispatch_task 返回后调用此工具：
 * - [u:xxx] 用户需求实体
 * - [a:xxx] 分析实体（关联到已完成 subtask）
 * - [rl:xxx] 规则实体
 * - 更新 domain_task summary
 *
 * 注意：subtask 已由 dispatch_task 预创建，analyze_turn 不再创建 subtask。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { RelationType, AnalysisEntity, RuleEntity, SubtaskEntity } from '@tramber/shared';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

/** analyze_turn 输入参数 */
interface AnalyzeTurnInput {
  userRequest: string;
  domain: string;
  summary: string;
  // 分析（关联到最近完成的 subtask）
  analyses?: Array<{
    content: string;
    category: 'discovery' | 'conclusion' | 'insight' | 'action_plan';
  }>;
  // 规则
  rules?: Array<{
    content: string;
    source: 'user' | 'analysis';
    scope: 'local' | 'global';
  }>;
}

export class AnalyzeTurnTool implements Tool {
  id = 'analyze_turn';
  name = 'analyze_turn';
  description = '分析本轮交互，更新领域任务图谱。dispatch_task 返回后必须调用。你在下一条消息中输出简短的分析总结（一行）。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      userRequest: { type: 'string' as const, description: '用户本轮原始输入' },
      domain: { type: 'string' as const, description: '所属领域' },
      summary: { type: 'string' as const, description: '本轮分析总结（一行）' },
      analyses: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            content: { type: 'string' as const, description: '分析内容' },
            category: { type: 'string' as const, enum: ['discovery', 'conclusion', 'insight', 'action_plan'], description: '分析类型' }
          }
        },
        description: '本轮分析结论'
      },
      rules: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            content: { type: 'string' as const, description: '规则内容' },
            source: { type: 'string' as const, enum: ['user', 'analysis'], description: '规则来源' },
            scope: { type: 'string' as const, enum: ['local', 'global'], description: '作用范围' }
          }
        },
        description: '本轮发现的规则'
      }
    },
    required: ['userRequest', 'domain', 'summary']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as AnalyzeTurnInput;

    if (!params.userRequest || !params.domain || !params.summary) {
      return { success: false, error: 'userRequest, domain, and summary are required' };
    }

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();
      const entities: string[] = [];
      const now = new Date().toISOString();

      // 1. 生成用户需求实体 [u:xxx]
      const userRequestEntity = memoryStore.storeEntity(taskId, {
        type: 'user_request',
        domain: params.domain,
        content: params.userRequest,
        relations: []
      });
      entities.push(userRequestEntity.id);

      // 2. 更新 domain_task summary
      const domainTasks = memoryStore.queryEntities({ taskId, type: 'domain_task', domain: params.domain });
      const activeDomainTask = domainTasks.find(dt => (dt as any).status === 'active');

      if (activeDomainTask) {
        memoryStore.updateEntity(taskId, activeDomainTask.id, {
          updatedAt: now,
          summary: params.summary
        });
      }

      // 3. 查找最近完成的 subtask（用于关联 analysis/rule）
      const subtasks = memoryStore.queryEntities({ taskId, type: 'subtask', domain: params.domain });
      const recentSubtask = subtasks
        .filter(s => (s as SubtaskEntity).status === 'completed')
        .sort((a, b) => b.order - a.order)[0] as SubtaskEntity | undefined;

      // 4. 生成分析实体 [a:xxx]
      if (params.analyses && params.analyses.length > 0 && recentSubtask) {
        for (const analysis of params.analyses) {
          const analysisEntity = memoryStore.storeEntity(taskId, {
            type: 'analysis',
            domain: params.domain,
            content: analysis.content,
            subtaskId: recentSubtask.id,
            category: analysis.category,
            relations: [{ type: 'analyzes' as RelationType, target: recentSubtask.id }]
          }) as AnalysisEntity;
          entities.push(analysisEntity.id);

          // 更新 subtask 的 analysisIds
          const existingAnalysisIds = recentSubtask.analysisIds || [];
          memoryStore.updateEntity(taskId, recentSubtask.id, {
            analysisIds: [...existingAnalysisIds, analysisEntity.id]
          });
        }
      }

      // 5. 生成规则实体 [rl:xxx]
      if (params.rules && params.rules.length > 0 && recentSubtask) {
        for (const rule of params.rules) {
          const ruleEntity = memoryStore.storeEntity(taskId, {
            type: 'rule',
            domain: params.domain,
            content: rule.content,
            subtaskId: recentSubtask.id,
            source: rule.source,
            scope: rule.scope,
            relations: [{ type: 'constrained_by' as RelationType, target: recentSubtask.id }]
          }) as RuleEntity;
          entities.push(ruleEntity.id);

          // 更新 subtask 的 ruleIds
          const existingRuleIds = recentSubtask.ruleIds || [];
          memoryStore.updateEntity(taskId, recentSubtask.id, {
            ruleIds: [...existingRuleIds, ruleEntity.id]
          });
        }
      }

      debug(NS, LogLevel.BASIC, 'Analyze turn completed', {
        entities,
        domain: params.domain,
        domainTaskId: activeDomainTask?.id,
        subtaskId: recentSubtask?.id
      });

      return {
        success: true,
        data: {
          entities,
          userRequestId: userRequestEntity.id,
          domainTaskId: activeDomainTask?.id,
          subtaskId: recentSubtask?.id,
          domain: params.domain,
          summary: params.summary
        }
      };
    } catch (err) {
      debug(NS, LogLevel.BASIC, 'Failed to analyze turn', { error: String(err) });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}