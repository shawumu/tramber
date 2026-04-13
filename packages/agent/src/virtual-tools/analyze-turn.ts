// packages/agent/src/virtual-tools/analyze-turn.ts
/**
 * analyze_turn — 守护意识的分析总结工具
 *
 * 守护意识在 dispatch_task 返回后调用此工具，生成结构化实体：
 * - [u:xxx] 用户需求实体
 * - [t:xxx] 任务实体
 * - [d:xxx] 决策实体
 * - [c:xxx] 约束实体
 * - [e:xxx] 事件实体
 *
 * 替代原 compress_and_remember，实体写入实体图谱而非纯文本流水账。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { Relation, RelationType } from '@tramber/shared';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class AnalyzeTurnTool implements Tool {
  id = 'analyze_turn';
  name = 'analyze_turn';
  description = '分析本轮交互，生成用户需求、任务、决策、约束实体。dispatch_task 返回后必须调用。你在下一条消息中输出简短的分析总结（一行）。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      userRequest: { type: 'string', description: '用户本轮原始输入' },
      domain: { type: 'string', description: '所属领域' },
      task: { type: 'string', description: '任务描述' },
      taskStatus: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'], description: '任务状态' },
      decisions: { type: 'array', items: { type: 'string' }, description: '本轮做出的决策' },
      constraints: { type: 'array', items: { type: 'string' }, description: '用户提出的约束' },
      summary: { type: 'string', description: '本轮分析总结（一行）' }
    },
    required: ['userRequest', 'domain', 'task', 'summary']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      userRequest: string;
      domain: string;
      task: string;
      taskStatus?: 'pending' | 'in_progress' | 'completed' | 'blocked';
      decisions?: string[];
      constraints?: string[];
      summary: string;
    };

    if (!params.userRequest || !params.domain || !params.task) {
      return { success: false, error: 'userRequest, domain, and task are required' };
    }

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();
      const entities: string[] = [];

      // 1. 生成用户需求实体 [u:xxx]
      const userRequestEntity = memoryStore.storeEntity(taskId, {
        type: 'user_request',
        domain: params.domain,
        content: params.userRequest,
        relations: []
      });
      entities.push(userRequestEntity.id);

      // 2. 生成任务实体 [t:xxx]（关联用户需求）
      const taskRelations: Relation[] = [
        { type: 'initiates' as RelationType, target: userRequestEntity.id }
      ];
      const taskEntity = memoryStore.storeEntity(taskId, {
        type: 'task',
        domain: params.domain,
        content: params.task,
        relations: taskRelations
      });
      entities.push(taskEntity.id);

      // 3. 为 decisions 每条生成决策实体 [d:xxx]
      if (params.decisions && params.decisions.length > 0) {
        for (const decision of params.decisions) {
          const decisionEntity = memoryStore.storeEntity(taskId, {
            type: 'decision',
            domain: params.domain,
            content: decision,
            relations: [
              { type: 'triggers' as RelationType, target: taskEntity.id }
            ]
          });
          entities.push(decisionEntity.id);
        }
      }

      // 4. 为 constraints 每条生成约束实体 [c:xxx]
      if (params.constraints && params.constraints.length > 0) {
        for (const constraint of params.constraints) {
          const constraintEntity = memoryStore.storeEntity(taskId, {
            type: 'constraint',
            domain: params.domain,
            content: constraint,
            relations: [
              { type: 'blocked_by' as RelationType, target: taskEntity.id }
            ]
          });
          entities.push(constraintEntity.id);
        }
      }

      // 5. 生成事件实体 [e:xxx]（领域交互）
      const eventEntity = memoryStore.storeEntity(taskId, {
        type: 'event',
        domain: params.domain,
        content: `领域 [${params.domain}] 执行任务: ${params.summary}`,
        relations: [
          { type: 'triggers' as RelationType, target: taskEntity.id }
        ]
      });
      entities.push(eventEntity.id);

      debug(NS, LogLevel.BASIC, 'Analyze turn completed', {
        entities,
        domain: params.domain
      });

      return {
        success: true,
        data: {
          entities,
          userRequestId: userRequestEntity.id,
          taskId: taskEntity.id,
          domain: params.domain
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