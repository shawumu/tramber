// packages/tool/src/builtin/file/index.ts
/**
 * 文件操作工具集
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool } from '../../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

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
        description: 'Path to the file to read (relative or absolute)'
      }
    },
    required: ['path']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: string; error?: string }> {
    const { path } = input as { path: string };

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Reading file', { path, isAbsolute: isAbsolute(path) });

    try {
      // 处理相对路径：如果是相对路径，在当前工作目录中查找
      let filePath = path;
      if (!isAbsolute(path)) {
        // 先尝试直接打开（可能在当前工作目录）
        try {
          const content = await readFile(path, 'utf-8');
          debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File read from current directory', { path });
          return {
            success: true,
            data: content
          };
        } catch (directError) {
          // 如果直接打开失败，尝试在工作目录中查找
          const cwd = process.cwd();
          const resolvedPath = resolve(cwd, path);
          debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Trying resolved path', {
            originalPath: path,
            resolvedPath
          });
          filePath = resolvedPath;
        }
      }

      const content = await readFile(filePath, 'utf-8');

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File read successfully', {
        filePath,
        contentLength: content.length
      });

      return {
        success: true,
        data: content
      };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to read file: ${path}`, error);
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
        description: 'Path to the file to write (relative or absolute)'
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

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Writing file', {
      path,
      isAbsolute: isAbsolute(path),
      contentLength: content.length
    });

    try {
      // 处理相对路径：如果是相对路径，解析为当前工作目录的绝对路径
      let filePath = path;
      if (!isAbsolute(path)) {
        const cwd = process.cwd();
        filePath = resolve(cwd, path);
        debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Resolved relative path', {
          originalPath: path,
          resolvedPath: filePath
        });
      }

      // 确保目录存在
      const dir = resolve(filePath, '..');
      await writeFile(filePath, content, 'utf-8');

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File written successfully', { filePath });

      return { success: true };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to write file: ${path}`, error);
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
        description: 'Path to the file to edit (relative or absolute)'
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

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Editing file', {
      path,
      isAbsolute: isAbsolute(path),
      oldStringLength: oldString.length,
      newStringLength: newString.length
    });

    try {
      // 处理相对路径：如果是相对路径，解析为当前工作目录的绝对路径
      let filePath = path;
      if (!isAbsolute(path)) {
        const cwd = process.cwd();
        filePath = resolve(cwd, path);
        debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Resolved relative path', {
          originalPath: path,
          resolvedPath: filePath
        });
      }

      const content = await readFile(filePath, 'utf-8');
      if (!content.includes(oldString)) {
        debug(NAMESPACE.TOOL_FILE, LogLevel.BASIC, 'oldString not found in file', { filePath });
        return {
          success: false,
          error: 'old_string not found in file'
        };
      }

      const newContent = content.replace(oldString, newString);
      await writeFile(filePath, newContent, 'utf-8');

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File edited successfully', { filePath });

      return { success: true };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to edit file: ${path}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
