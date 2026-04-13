// packages/agent/src/virtual-tools/record-discovery.ts
/**
 * record_discovery — 执行意识的发现记录工具
 *
 * 执行意识每轮执行返回时调用，记录发现和资源：
 * - [r:xxx] 资源实体（带结构化 summary）
 * - [e:xxx] 进度事件
 *
 * 支持资源去重：同一 uri 合并到同一实体，version 递增
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { Relation, RelationType, ResourceSummary, ResourceEntity } from '@tramber/shared';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

interface ResourceInput {
  uri: string;
  resourceType: 'file' | 'knowledge' | 'api' | 'pattern';
  summary?: ResourceSummary;
}

export class RecordDiscoveryTool implements Tool {
  id = 'record_discovery';
  name = 'record_discovery';
  description = '记录执行中的发现，生成资源实体。每轮工具调用后调用。同一文件自动去重合并。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskRef: { type: 'string', description: '关联任务 ID（如 t:a3x7f）' },
      resources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: '资源 URI（file://path）' },
            resourceType: { type: 'string', enum: ['file', 'knowledge', 'api', 'pattern'], description: '资源类型' },
            summary: { type: 'object', description: '结构化摘要' }
          }
        },
        description: '本轮读取/发现的资源'
      },
      discoveries: { type: 'array', items: { type: 'string', description: '发现内容' }, description: '本轮发现' },
      progress: { type: 'number', description: '进度 0-100' }
    },
    required: ['taskRef']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      taskRef: string;
      resources?: ResourceInput[];
      discoveries?: string[];
      progress?: number;
    };

    if (!params.taskRef) {
      return { success: false, error: 'taskRef is required' };
    }

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();
      const entities: string[] = [];

      // 1. 处理资源（去重合并）
      if (params.resources && params.resources.length > 0) {
        for (const resource of params.resources) {
          const relations: Relation[] = [
            { type: 'produced_by' as RelationType, target: params.taskRef },
            { type: 'discovered_in' as RelationType, target: params.taskRef }
          ];

          // 检查 uri 是否已存在
          const existing = memoryStore.findByUri(taskId, resource.uri);
          if (existing) {
            // 合并：version 递增，relations 累加
            const merged = memoryStore.mergeResource(
              taskId,
              resource.uri,
              resource.summary || existing.summary,
              relations
            );
            if (merged) {
              entities.push(merged.id);
            }
          } else {
            // 创建新资源实体
            const resourceEntity = memoryStore.storeEntity(taskId, {
              type: 'resource',
              domain: 'execution',
              content: resource.uri,
              relations,
              uri: resource.uri,
              resourceType: resource.resourceType,
              summary: resource.summary || { type: 'unknown' }
            }) as ResourceEntity;
            entities.push(resourceEntity.id);
          }
        }
      }

      // 2. 记录发现
      if (params.discoveries && params.discoveries.length > 0) {
        for (const discovery of params.discoveries) {
          const eventEntity = memoryStore.storeEntity(taskId, {
            type: 'event',
            domain: 'execution',
            content: discovery,
            relations: [
              { type: 'discovered_in' as RelationType, target: params.taskRef }
            ]
          });
          entities.push(eventEntity.id);
        }
      }

      // 3. 生成进度事件
      if (params.progress !== undefined) {
        const progressEntity = memoryStore.storeEntity(taskId, {
          type: 'event',
          domain: 'execution',
          content: `进度: ${params.progress}%`,
          relations: [
            { type: 'triggers' as RelationType, target: params.taskRef }
          ]
        });
        entities.push(progressEntity.id);
      }

      debug(NS, LogLevel.BASIC, 'Discovery recorded', {
        entities,
        taskRef: params.taskRef,
        progress: params.progress
      });

      return {
        success: true,
        data: {
          entities,
          taskRef: params.taskRef
        }
      };
    } catch (err) {
      debug(NS, LogLevel.BASIC, 'Failed to record discovery', { error: String(err) });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}