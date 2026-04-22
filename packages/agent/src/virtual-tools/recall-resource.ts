// packages/agent/src/virtual-tools/recall-resource.ts
/**
 * recall_resource — 执行意识的资源检索工具（Stage 10 重构）
 *
 * 与 read_file 同构：支持 startLine/endLine 分段读取，
 * 返回带行号内容 + 文件元信息（totalLines, hasMore 等）。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { ResourceEntity } from '@tramber/shared';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

const DEFAULT_MAX_LINES = 200;
const HARD_MAX_LINES = 1000;

export class RecallResourceTool implements Tool {
  id = 'recall_resource';
  name = 'recall_resource';
  description = '检索资源详情（与 read_file 同构，支持 startLine/endLine 分段读取）。传入 uri 获取指定资源，传入 keyword 搜索匹配资源。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      uri: { type: 'string', description: '资源 URI（file://demos/xxx.html）' },
      startLine: { type: 'number', description: '起始行号（从1开始，含）。不传则从第1行开始' },
      endLine: { type: 'number', description: '结束行号（含）。不传则到文件末尾' },
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
      startLine?: number;
      endLine?: number;
      keyword?: string;
    };

    const { consciousnessManager } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId) {
      return { success: false, error: 'No active task context' };
    }

    try {
      const memoryStore = consciousnessManager.getMemoryStore();

      if (params.uri) {
        const resourceEntity = memoryStore.findByUri(taskId, params.uri);
        if (resourceEntity) {
          return this.formatResourceRead(resourceEntity, params.startLine, params.endLine);
        }
        // uri 不在图谱，尝试直接读取
        if (params.uri.startsWith('file://')) {
          const filePath = params.uri.replace('file://', '');
          const resolved = resolve(filePath);
          if (existsSync(resolved)) {
            return this.formatRawRead(params.uri, resolved, params.startLine, params.endLine);
          }
          return { success: false, error: `File not found: ${filePath}` };
        }
        return { success: false, error: `Resource not found: ${params.uri}` };
      }

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

        const results = entities
          .filter(e => e.type === 'resource')
          .map(entity => {
            const resource = entity as ResourceEntity;
            return {
              id: resource.id,
              uri: resource.uri,
              summary: resource.summary
            };
          });

        return { success: true, data: { results, count: results.length } };
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

  /** 格式化已记录资源的文件读取（与 read_file 同构） */
  private formatResourceRead(entity: ResourceEntity, startLine?: number, endLine?: number): ToolResult {
    if (!entity.uri.startsWith('file://')) {
      return {
        success: true,
        data: {
          content: `Resource type ${entity.resourceType} content not available for line-based reading`,
          uri: entity.uri,
          summary: entity.summary,
          id: entity.id
        }
      };
    }

    const filePath = entity.uri.replace('file://', '');
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const raw = readFileSync(resolved, 'utf-8');
    return this.formatRawContent(entity.uri, raw, startLine, endLine, entity.summary, entity.id);
  }

  /** 直接读取未记录的文件（与 read_file 同构） */
  private formatRawRead(uri: string, resolved: string, startLine?: number, endLine?: number): ToolResult {
    const raw = readFileSync(resolved, 'utf-8');
    return this.formatRawContent(uri, raw, startLine, endLine);
  }

  /** 核心格式化逻辑（与 read_file 完全同构） */
  private formatRawContent(
    uri: string,
    raw: string,
    startLine?: number,
    endLine?: number,
    summary?: unknown,
    id?: string
  ): ToolResult {
    const allLines = raw.split('\n');
    const totalLines = allLines.length;
    const totalChars = raw.length;

    const s = Math.max(1, Math.min(startLine ?? 1, totalLines));
    const requestedEnd = endLine !== undefined ? Math.min(endLine, totalLines) : Math.min(s + DEFAULT_MAX_LINES - 1, totalLines);
    const e = Math.min(requestedEnd, s + HARD_MAX_LINES - 1);
    const selectedLines = allLines.slice(s - 1, e);

    const maxLineNumWidth = String(e).length;
    const numberedContent = selectedLines
      .map((line, i) => `${String(s + i).padStart(maxLineNumWidth, ' ')} | ${line}`)
      .join('\n');

    const truncated = requestedEnd > e;
    const hasMore = e < totalLines;
    const header = `[资源: ${uri}] 共 ${totalLines} 行, ${totalChars} 字符。显示第 ${s}-${e} 行。${truncated ? `（请求超出单次上限 ${HARD_MAX_LINES} 行，已截断。请用 startLine=${e + 1} 继续读取）` : hasMore ? `（还有 ${totalLines - e} 行未显示，请用 startLine=${e + 1} 继续读取）` : ''}`;

    return {
      success: true,
      data: {
        content: `${header}\n${numberedContent}`,
        totalLines,
        totalChars,
        startLine: s,
        endLine: e,
        hasMore: e < totalLines || truncated,
        uri,
        summary: summary ?? null,
        id: id ?? null
      }
    };
  }
}
