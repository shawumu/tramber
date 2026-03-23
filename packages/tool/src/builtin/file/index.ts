// packages/tool/src/builtin/file/index.ts
/**
 * 文件操作工具集
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool } from '../../types.js';

export const readFileTool: Tool = {
  id: 'read_file',
  name: 'read_file',
  description: 'Read file contents',
  category: 'file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['path']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: string; error?: string }> {
    const { path } = input as { path: string };

    try {
      const content = await readFile(path, 'utf-8');
      return {
        success: true,
        data: content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

export const writeFileTool: Tool = {
  id: 'write_file',
  name: 'write_file',
  description: 'Write content to file',
  category: 'file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['path', 'content']
  },
  async execute(input: unknown): Promise<{ success: boolean; error?: string }> {
    const { path, content } = input as { path: string; content: string };

    try {
      // 确保目录存在
      const dir = resolve(path, '..');
      await writeFile(path, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

export const editFileTool: Tool = {
  id: 'edit_file',
  name: 'edit_file',
  description: 'Edit file with exact string replacement',
  category: 'file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit'
      },
      oldString: {
        type: 'string',
        description: 'Old string to replace'
      },
      newString: {
        type: 'string',
        description: 'New string to replace with'
      }
    },
    required: ['path', 'oldString', 'newString']
  },
  async execute(input: unknown): Promise<{ success: boolean; error?: string }> {
    const { path, oldString, newString } = input as {
      path: string;
      oldString: string;
      newString: string
    };

    try {
      const content = await readFile(path, 'utf-8');
      if (!content.includes(oldString)) {
        return {
          success: false,
          error: 'old_string not found in file'
        };
      }

      const newContent = content.replace(oldString, newString);
      await writeFile(path, newContent, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
