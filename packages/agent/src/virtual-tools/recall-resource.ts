// packages/agent/src/virtual-tools/recall-resource.ts
/**
 * recall_resource — 执行意识的资源检索工具
 *
 * 检索资源详情（文件完整内容），返回给执行意识使用。
 * 与 recall_memory 区分：
 * - recall_memory: 守护意识使用，返回实体摘要
 * - recall_resource: 执行意识使用，返回完整内容
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { ResourceEntity } from '@tramber/shared';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';
import { readFileSync, existsSync } from 'fs';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class RecallResourceTool implements Tool {
  id = 'recall_resource';
  name = 'recall_resource';
  description = '检索资源详情（文件完整内容）。执行意识使用。返回完整内容而非摘要。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      uri: { type: 'string', description: '资源 URI（file://demos/xxx.html）' },
      resourceType: { type: 'string', enum: ['file', 'knowledge', 'api', 'pattern'], description: '资源类型' },
      keyword: { type: 'string', description: '关键词搜索' }
    },
    required: []
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      uri?: string;
      resourceType?: 'file' | 'knowledge' | 'api' | 'pattern';
      keyword?: string;
    };

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();

      // 如果提供了 uri，直接查找
      if (params.uri) {
        const resourceEntity = memoryStore.findByUri(taskId, params.uri);
        if (resourceEntity) {
          // 解析 uri，获取文件内容
          const content = await this.getResourceContent(resourceEntity);
          return {
            success: true,
            data: {
              uri: params.uri,
              content,
              summary: resourceEntity.summary,
              id: resourceEntity.id
            }
          };
        }
        // uri 不存在于实体图谱，尝试直接读取
        if (params.uri.startsWith('file://')) {
          const filePath = params.uri.replace('file://', '');
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8');
            return {
              success: true,
              data: {
                uri: params.uri,
                content,
                summary: null,
                id: null
              }
            };
          }
          return { success: false, error: `File not found: ${filePath}` };
        }
        return { success: false, error: `Resource not found: ${params.uri}` };
      }

      // 如果提供了 keyword，搜索匹配的资源
      if (params.keyword) {
        const entities = memoryStore.queryEntities({
          taskId,
          type: 'resource',
          keyword: params.keyword,
          limit: 5
        });

        if (entities.length === 0) {
          return { success: false, error: `No resources matching keyword: ${params.keyword}` };
        }

        // 返回匹配的资源列表（包含内容）
        const results = await Promise.all(
          entities
            .filter(e => e.type === 'resource')
            .map(async (entity) => {
              const resource = entity as ResourceEntity;
              const content = await this.getResourceContent(resource);
              return {
                uri: resource.uri,
                content,
                summary: resource.summary,
                id: resource.id
              };
            })
        );

        return {
          success: true,
          data: {
            results,
            count: results.length
          }
        };
      }

      return { success: false, error: 'Either uri or keyword is required' };
    } catch (err) {
      debug(NS, LogLevel.BASIC, 'Failed to recall resource', { error: String(err) });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async getResourceContent(entity: ResourceEntity): Promise<string> {
    if (entity.uri.startsWith('file://')) {
      const filePath = entity.uri.replace('file://', '');
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8');
      }
      return `File not found: ${filePath}`;
    }
    // 其他类型暂不支持
    return `Resource type ${entity.resourceType} content not available`;
  }
}