// packages/tool/test/search.test.ts
/**
 * Search 工具单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { globTool, grepTool } from '../src/builtin/search/index.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

describe('Search Tools', () => {
  const testDir = 'test/fixtures';
  const testFiles = [
    join(testDir, 'test1.txt'),
    join(testDir, 'test2.ts'),
    join(testDir, 'nested', 'test3.txt')
  ];

  beforeEach(async () => {
    await writeFile(testFiles[0], 'Hello World', 'utf-8');
    await writeFile(testFiles[1], 'export function test() {}', 'utf-8');
    await writeFile(testFiles[2], 'Nested file', 'utf-8');
  });

  afterEach(async () => {
    for (const file of testFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore
      }
    }
  });

  describe('globTool', () => {
    it('should find files by pattern', async () => {
      const result = await globTool.execute({ pattern: '**/*.txt', cwd: testDir });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data).toContain('test/fixtures/test1.txt');
    });

    it('should support wildcards', async () => {
      const result = await globTool.execute({ pattern: '**/*.ts', cwd: testDir });
      expect(result.success).toBe(true);
      expect(result.data).toContain('test/fixtures/test2.ts');
    });
  });

  describe('grepTool', () => {
    it('should search content in files', async () => {
      const result = await grepTool.execute({
        pattern: 'Hello',
        glob: `${testDir}/*.txt`
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].content).toContain('Hello');
    });

    it('should return file and line number', async () => {
      const result = await grepTool.execute({
        pattern: 'export',
        glob: `${testDir}/*.ts`
      });
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        file: expect.any(String),
        line: expect.any(Number),
        content: expect.stringContaining('export')
      });
    });

    it('should handle empty results', async () => {
      const result = await grepTool.execute({
        pattern: 'NonExistent',
        glob: `${testDir}/*.txt`
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});
