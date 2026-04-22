// packages/tool/src/builtin/file/index.ts
/**
 * 文件操作工具集
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import type { Tool } from '../../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

interface ReadFileData {
  content: string;
  totalLines: number;
  totalChars: number;
  startLine: number;
  endLine: number;
  hasMore: boolean;
}

export const readFileTool: Tool = {
  id: 'read_file',
  name: 'read_file',
  description: '读取文件内容。大文件（>200行）请用 startLine/endLine 分段读取。返回带行号的内容及文件元信息（总行数、是否截断）。',
  category: 'file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对或绝对路径）'
      },
      startLine: {
        type: 'number',
        description: '起始行号（从1开始，含）。不传则从第1行开始'
      },
      endLine: {
        type: 'number',
        description: '结束行号（含）。不传则到文件末尾'
      }
    },
    required: ['path']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: ReadFileData; error?: string }> {
    const params = input as Record<string, unknown>;
    const path = (params.path ?? params.filePath ?? params.file_path) as string | undefined;
    const startLine = (params.startLine as number | undefined) ?? 1;
    const endLine = params.endLine as number | undefined;

    if (!path) {
      return { success: false, error: 'Missing required parameter: path (or filePath)' };
    }

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Reading file', { path, startLine, endLine });

    try {
      let filePath = path;
      if (!isAbsolute(path)) {
        try {
          await readFile(path, 'utf-8');
        } catch {
          const cwd = process.cwd();
          filePath = resolve(cwd, path);
          debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Resolved path', { path, resolvedPath: filePath });
        }
      }

      const raw = await readFile(filePath, 'utf-8');
      const allLines = raw.split('\n');
      const totalLines = allLines.length;
      const totalChars = raw.length;

      // 计算实际读取范围
      const DEFAULT_MAX_LINES = 200;
      const HARD_MAX_LINES = 1000;
      const s = Math.max(1, Math.min(startLine, totalLines));
      const requestedEnd = endLine !== undefined ? Math.min(endLine, totalLines) : Math.min(s + DEFAULT_MAX_LINES - 1, totalLines);
      const e = Math.min(requestedEnd, s + HARD_MAX_LINES - 1);
      const selectedLines = allLines.slice(s - 1, e);

      // 带行号格式化
      const maxLineNumWidth = String(e).length;
      const numberedContent = selectedLines
        .map((line, i) => {
          const lineNum = String(s + i).padStart(maxLineNumWidth, ' ');
          return `${lineNum} | ${line}`;
        })
        .join('\n');

      const truncated = requestedEnd > e;
      const hasMore = e < totalLines;
      const header = `[文件: ${path}] 共 ${totalLines} 行, ${totalChars} 字符。显示第 ${s}-${e} 行。${truncated ? `（请求超出单次上限 ${HARD_MAX_LINES} 行，已截断。请用 startLine=${e + 1} 继续读取）` : hasMore ? `（还有 ${totalLines - e} 行未显示，请用 startLine=${e + 1} 继续读取）` : ''}`;

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File read successfully', {
        filePath, totalLines, showing: `${s}-${e}`
      });

      return {
        success: true,
        data: {
          content: `${header}\n${numberedContent}`,
          totalLines,
          totalChars,
          startLine: s,
          endLine: e,
          hasMore: e < totalLines || truncated
        }
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
