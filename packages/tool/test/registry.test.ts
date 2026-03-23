// packages/tool/test/registry.test.ts
/**
 * ToolRegistry 单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ToolRegistryImpl } from '../src/registry.js';
import type { Tool } from '../src/types.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistryImpl;
  let mockTool: Tool;

  beforeEach(() => {
    registry = new ToolRegistryImpl();
    mockTool = {
      id: 'test_tool',
      name: 'Test Tool',
      description: 'A test tool',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => ({ success: true, data: 'test' })
    };
  });

  describe('register', () => {
    it('should register a tool successfully', () => {
      registry.register(mockTool);
      expect(registry.get('test_tool')).toBe(mockTool);
    });

    it('should throw error when registering duplicate tool', () => {
      registry.register(mockTool);
      expect(() => registry.register(mockTool)).toThrow('Tool test_tool already registered');
    });
  });

  describe('unregister', () => {
    it('should unregister a tool', () => {
      registry.register(mockTool);
      registry.unregister('test_tool');
      expect(registry.get('test_tool')).toBeUndefined();
    });

    it('should not throw when unregistering non-existent tool', () => {
      expect(() => registry.unregister('non_existent')).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent tool', () => {
      expect(registry.get('non_existent')).toBeUndefined();
    });

    it('should return the tool when it exists', () => {
      registry.register(mockTool);
      expect(registry.get('test_tool')).toBe(mockTool);
    });
  });

  describe('list', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered tools', () => {
      registry.register(mockTool);
      const tools = registry.list();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        id: 'test_tool',
        name: 'Test Tool',
        description: 'A test tool',
        category: 'file'
      });
    });
  });

  describe('listByCategory', () => {
    it('should filter tools by category', () => {
      const fileTool: Tool = { ...mockTool, id: 'file_tool', category: 'file' as const };
      const searchTool: Tool = { ...mockTool, id: 'search_tool', category: 'search' as const };

      registry.register(fileTool);
      registry.register(searchTool);

      const fileTools = registry.listByCategory('file');
      expect(fileTools).toHaveLength(1);
      expect(fileTools[0].id).toBe('file_tool');
    });
  });

  describe('execute', () => {
    it('should execute tool and return result', async () => {
      registry.register(mockTool);
      const result = await registry.execute('test_tool', {});
      expect(result).toEqual({ success: true, data: 'test' });
    });

    it('should return error when tool not found', async () => {
      const result = await registry.execute('non_existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool non_existent not found');
    });

    it('should handle tool execution errors', async () => {
      const errorTool: Tool = {
        ...mockTool,
        id: 'error_tool',
        execute: async () => { throw new Error('Execution failed'); }
      };
      registry.register(errorTool);

      const result = await registry.execute('error_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });
});
