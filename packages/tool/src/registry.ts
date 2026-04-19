// packages/tool/src/registry.ts
/**
 * Tool Registry - 工具注册表
 */

import type { Tool, ToolInfo, ToolRegistry, ToolResult } from './types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor() {}

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
    debug(NAMESPACE.TOOL_REGISTRY, LogLevel.TRACE, 'Tool registered', {
      id: tool.id,
      name: tool.name,
      category: tool.category
    });
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
    debug(NAMESPACE.TOOL_REGISTRY, LogLevel.TRACE, 'Tool unregistered', { toolId });
  }

  get(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  list(): ToolInfo[] {
    const tools = Array.from(this.tools.values()).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: tool.inputSchema,
      silent: tool.silent
    }));
    debug(NAMESPACE.TOOL_REGISTRY, LogLevel.TRACE, 'Tools listed', { count: tools.length });
    return tools;
  }

  listByCategory(category: string): ToolInfo[] {
    return this.list().filter(t => t.category === category);
  }

  async execute(toolId: string, input: unknown): Promise<ToolResult> {
    const tool = this.get(toolId);
    if (!tool) {
      debugError(NAMESPACE.TOOL_REGISTRY, `Tool not found: ${toolId}`, { toolId });
      return {
        success: false,
        error: `Tool ${toolId} not found`
      };
    }

    debug(NAMESPACE.TOOL_REGISTRY, LogLevel.VERBOSE, 'Executing tool', {
      toolId,
      inputKeys: Object.keys(input as Record<string, unknown> ?? {})
    });

    try {
      const result = await tool.execute(input);
      debug(NAMESPACE.TOOL_REGISTRY, LogLevel.VERBOSE, 'Tool execution completed', {
        toolId,
        success: result.success
      });
      return result;
    } catch (error) {
      debugError(NAMESPACE.TOOL_REGISTRY, `Tool execution failed: ${toolId}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
