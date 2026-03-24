// tests/integration/tool-system.test.ts
/**
 * Tool System Integration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistryImpl } from '@tramber/tool';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool, bashTool } from '@tramber/tool';

describe('Tool System Integration', () => {
  let registry: ToolRegistryImpl;

  beforeEach(() => {
    registry = new ToolRegistryImpl();
  });

  describe('Tool Registration', () => {
    it('should register all core tools', () => {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(editFileTool);
      registry.register(globTool);
      registry.register(grepTool);
      registry.register(bashTool);

      const tools = registry.list();
      expect(tools).toHaveLength(6);
      expect(tools.map(t => t.id)).toContain('read_file');
      expect(tools.map(t => t.id)).toContain('write_file');
      expect(tools.map(t => t.id)).toContain('edit_file');
      expect(tools.map(t => t.id)).toContain('glob');
      expect(tools.map(t => t.id)).toContain('grep');
      expect(tools.map(t => t.id)).toContain('bash');
    });

    it('should list tools by category', () => {
      registry.register(readFileTool);
      registry.register(globTool);
      registry.register(bashTool);

      const fileTools = registry.listByCategory('file');
      const searchTools = registry.listByCategory('search');
      const execTools = registry.listByCategory('execution');

      expect(fileTools.length).toBeGreaterThan(0);
      expect(searchTools.length).toBeGreaterThan(0);
      expect(execTools.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute glob tool to find files', async () => {
      registry.register(globTool);

      const result = await registry.execute('glob', {
        pattern: 'packages/**/*.ts',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should execute grep tool to search content', async () => {
      registry.register(grepTool);

      const result = await registry.execute('grep', {
        pattern: 'export',
        glob: 'packages/shared/**/*.ts',
        limit: 5
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute bash tool to run commands', async () => {
      registry.register(bashTool);

      const result = await registry.execute('bash', {
        command: 'echo "Hello, Tramber!"',
        cwd: process.cwd()
      });

      expect(result.success).toBe(true);
      expect(result.data).toContain('Hello, Tramber!');
    });

    it('should handle tool execution errors gracefully', async () => {
      registry.register(readFileTool);

      const result = await registry.execute('read_file', {
        path: '/nonexistent/file.txt'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Tool Composition', () => {
    it('should combine multiple tools in a workflow', async () => {
      registry.register(globTool);
      registry.register(readFileTool);

      // Step 1: Find package.json
      const findResult = await registry.execute('glob', {
        pattern: 'package.json',
        limit: 1
      });

      expect(findResult.success).toBe(true);

      // Step 2: Read the found file
      if (findResult.success && findResult.data && Array.isArray(findResult.data) && findResult.data.length > 0) {
        const filePath = (findResult.data as Array<{ path: string }>)[0].path;
        const readResult = await registry.execute('read_file', { path: filePath });

        expect(readResult.success).toBe(true);
        expect(readResult.data).toBeDefined();
      }
    });
  });
});
