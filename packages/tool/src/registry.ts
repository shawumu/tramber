// packages/tool/src/registry.ts
/**
 * Tool Registry - 工具注册表
 */

import type { Tool, ToolInfo, ToolRegistry, ToolResult } from './types.js';

export class ToolRegistryImpl implements ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  get(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  list(): ToolInfo[] {
    return Array.from(this.tools.values()).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: tool.inputSchema
    }));
  }

  listByCategory(category: string): ToolInfo[] {
    return this.list().filter(t => t.category === category);
  }

  async execute(toolId: string, input: unknown): Promise<ToolResult> {
    const tool = this.get(toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`
      };
    }

    try {
      return await tool.execute(input);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
