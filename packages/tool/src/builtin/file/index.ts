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
    const params = input as Record<string, unknown>;
    const path = (params.path ?? params.filePath ?? params.file_path) as string | undefined;

    if (!path) {
      return { success: false, error: 'Missing required parameter: path (or filePath)' };
    }

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
  async execute(input: unknown): Promise<{ success: boolean; data?: { path: string; bytes: number }; error?: string }> {
    const params = input as Record<string, unknown>;
    const path = (params.path ?? params.filePath ?? params.file_path) as string | undefined;
    const content = (params.content ?? params.text ?? '') as string;

    if (!path) {
      return { success: false, error: 'Missing required parameter: path (or filePath)' };
    }

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

      await writeFile(filePath, content, 'utf-8');

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File written successfully', { filePath });

      return { success: true, data: { path: filePath, bytes: content.length } };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to write file: ${path}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

interface EditItem {
  oldString: string;
  newString: string;
}

interface EditFileResult {
  success: boolean;
  data?: {
    editsApplied: number;
    changes: Array<{ index: number; oldLines: number; newLines: number }>;
  };
  error?: string;
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

function countLines(text: string): number {
  return text.split('\n').length;
}

function resolvePath(path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(process.cwd(), path);
}

function findNonUniqueEdit(content: string, edits: EditItem[]): { index: number; count: number } | null {
  for (let i = 0; i < edits.length; i++) {
    const count = countOccurrences(content, edits[i].oldString);
    if (count > 1) {
      return { index: i, count };
    }
  }
  return null;
}

function getOccurrenceContext(content: string, search: string, maxContext: number = 3): string[] {
  const contexts: string[] = [];
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    const lineNum = content.substring(0, pos).split('\n').length;
    const preview = search.split('\n')[0].slice(0, 60);
    contexts.push(`  line ${lineNum}: ...${preview}...`);
    pos += search.length;
    if (contexts.length >= maxContext) break;
  }
  return contexts;
}

export const editFileTool: Tool = {
  id: 'edit_file',
  name: 'edit_file',
  description: 'Edit file by replacing exact string segments. Supports single or multiple replacements in one call. Each old_string must be unique in the file.',
  category: 'file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit (relative or absolute)'
      },
      edits: {
        type: 'array',
        description: 'Array of replacements to apply. Each replacement must have a unique old_string in the file.',
        items: {
          type: 'object',
          properties: {
            oldString: { type: 'string', description: 'Exact string to find and replace' },
            newString: { type: 'string', description: 'String to replace with' }
          },
          required: ['oldString', 'newString']
        }
      },
      oldString: {
        type: 'string',
        description: 'Old string to replace (shorthand for single edit, use "edits" for multiple)'
      },
      newString: {
        type: 'string',
        description: 'New string to replace with (shorthand for single edit)'
      }
    },
    required: ['path']
  },
  async execute(input: unknown): Promise<EditFileResult> {
    const params = input as Record<string, unknown>;
    const path = (params.path ?? params.filePath ?? params.file_path) as string | undefined;
    const editsRaw = params.edits as EditItem[] | undefined;
    const oldString = params.oldString as string | undefined;
    const newString = params.newString as string | undefined;

    const edits: EditItem[] = editsRaw
      ? editsRaw
      : oldString !== undefined && newString !== undefined
        ? [{ oldString, newString }]
        : [];

    if (!path) {
      return { success: false, error: 'Missing required parameter: path (or filePath)' };
    }

    if (edits.length === 0) {
      return { success: false, error: 'No edits provided. Use "edits" array or "oldString"/"newString" pair.' };
    }

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Editing file', {
      path,
      editCount: edits.length,
      isAbsolute: isAbsolute(path)
    });

    try {
      const filePath = resolvePath(path);

      const content = await readFile(filePath, 'utf-8');

      // 验证所有 oldString 都存在
      const missing: number[] = [];
      for (let i = 0; i < edits.length; i++) {
        if (!content.includes(edits[i].oldString)) {
          missing.push(i);
        }
      }
      if (missing.length > 0) {
        const details = missing.map(i => `  edit[${i}]: "${edits[i].oldString.split('\n')[0].slice(0, 50)}..." not found`).join('\n');
        debug(NAMESPACE.TOOL_FILE, LogLevel.BASIC, 'oldString(s) not found', { filePath, missing });
        return {
          success: false,
          error: `${missing.length} edit(s) not found in file:\n${details}\nHint: Re-read the file to get the current content.`
        };
      }

      // 验证唯一性
      const nonUnique = findNonUniqueEdit(content, edits);
      if (nonUnique) {
        const edit = edits[nonUnique.index];
        const contexts = getOccurrenceContext(content, edit.oldString);
        debug(NAMESPACE.TOOL_FILE, LogLevel.BASIC, 'oldString not unique', {
          filePath,
          editIndex: nonUnique.index,
          count: nonUnique.count
        });
        return {
          success: false,
          error: `edit[${nonUnique.index}] old_string is not unique (${nonUnique.count} occurrences). Include more surrounding context to make it unique.\nMatches found at:\n${contexts.join('\n')}`
        };
      }

      // 从后往前替换，避免位置偏移
      let newContent = content;
      const changes: Array<{ index: number; oldLines: number; newLines: number }> = [];

      for (let i = edits.length - 1; i >= 0; i--) {
        const oldLines = countLines(edits[i].oldString);
        const newLines = countLines(edits[i].newString);
        newContent = newContent.replace(edits[i].oldString, edits[i].newString);
        changes.unshift({ index: i, oldLines, newLines });
      }

      if (newContent === content) {
        return { success: true, data: { editsApplied: 0, changes } };
      }

      await writeFile(filePath, newContent, 'utf-8');

      const summary = changes.map(c => `edit[${c.index}]: ${c.oldLines} lines -> ${c.newLines} lines`).join(', ');
      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File edited successfully', {
        filePath,
        editsApplied: edits.length,
        summary
      });

      return { success: true, data: { editsApplied: edits.length, changes } };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to edit file: ${path}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
