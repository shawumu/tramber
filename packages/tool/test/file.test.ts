// packages/tool/test/file.test.ts
/**
 * File 工具单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileTool, writeFileTool, editFileTool } from '../src/builtin/file/index.js';
import { writeFile } from 'fs/promises';
import { unlink } from 'fs/promises';
import { join } from 'path';

describe('File Tools', () => {
  const testDir = 'test/fixtures';
  const testFile = join(testDir, 'test.txt');

  beforeEach(async () => {
    await writeFile(testFile, 'Hello World', 'utf-8');
  });

  afterEach(async () => {
    try {
      await unlink(testFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('readFileTool', () => {
    it('should read file content', async () => {
      const result = await readFileTool.execute({ path: testFile });
      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello World');
    });

    it('should return error for non-existent file', async () => {
      const result = await readFileTool.execute({ path: 'non_existent.txt' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('writeFileTool', () => {
    it('should write content to file', async () => {
      const result = await writeFileTool.execute({ path: testFile, content: 'New Content' });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: testFile });
      expect(readResult.data).toBe('New Content');
    });
  });

  describe('editFileTool', () => {
    it('should replace old string with new string', async () => {
      const result = await editFileTool.execute({
        path: testFile,
        oldString: 'Hello',
        newString: 'Goodbye'
      });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: testFile });
      expect(readResult.data).toBe('Goodbye World');
    });

    it('should return error when old string not found', async () => {
      const result = await editFileTool.execute({
        path: testFile,
        oldString: 'NonExistent',
        newString: 'Replacement'
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('old_string not found in file');
    });
  });
});
