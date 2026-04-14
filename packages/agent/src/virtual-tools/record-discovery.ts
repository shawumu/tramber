// packages/agent/src/virtual-tools/record-discovery.ts
/**
 * record_discovery — 执行意识的发现记录工具（Stage 9 重构）
 *
 * 执行意识每轮执行返回时调用，记录发现的资源：
 * - [r:xxx] 资源实体（带结构化 summary）
 *
 * 支持资源去重：同一 uri 合并到同一实体，version 递增，relations 去重
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
      subtaskRef: { type: 'string', description: '关联子任务 ID（如 s:xxx）' },
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
      }
    },
    required: ['subtaskRef']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      subtaskRef: string;
      resources?: ResourceInput[];
      // 兼容旧参数名
      taskRef?: string;
    };

    // 兼容旧参数名
    const subtaskRef = params.subtaskRef || params.taskRef;
    if (!subtaskRef) {
      return { success: false, error: 'subtaskRef is required' };
    }

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();
      const entities: string[] = [];

      // 处理资源（去重合并）
      if (params.resources && params.resources.length > 0) {
        for (const resource of params.resources) {
          // Stage 9 重构：使用正确的语义
          // 资源由子任务产出，使用 produced_by 表示反向关系
          const relations: Relation[] = [
            { type: 'produced_by' as RelationType, target: subtaskRef }
          ];

          // 检查 uri 是否已存在
          const existing = memoryStore.findByUri(taskId, resource.uri);
          if (existing) {
            // 合并：version 递增，relations 去重合并
            const merged = memoryStore.mergeResource(
              taskId,
              resource.uri,
              resource.summary || existing.summary,
              relations
            );
            if (merged) {
              entities.push(merged.id);

              // 更新 subtask 的 resourceIds（关键修复）
              const subtask = memoryStore.getEntity(taskId, subtaskRef);
              if (subtask && subtask.type === 'subtask') {
                const existingResourceIds = (subtask as any).resourceIds || [];
                if (!existingResourceIds.includes(merged.id)) {
                  memoryStore.updateEntity(taskId, subtaskRef, {
                    resourceIds: [...existingResourceIds, merged.id]
                  });
                }
              }
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

            // 更新 subtask 的 resourceIds（关键修复）
            const subtask = memoryStore.getEntity(taskId, subtaskRef);
            if (subtask && subtask.type === 'subtask') {
              const existingResourceIds = (subtask as any).resourceIds || [];
              memoryStore.updateEntity(taskId, subtaskRef, {
                resourceIds: [...existingResourceIds, resourceEntity.id]
              });
            }
          }
        }
      }

      debug(NS, LogLevel.BASIC, 'Discovery recorded', {
        entities,
        subtaskRef,
        resourceCount: params.resources?.length || 0
      });

      return {
        success: true,
        data: {
          entities,
          subtaskRef
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