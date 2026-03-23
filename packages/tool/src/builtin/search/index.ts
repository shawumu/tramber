// packages/tool/src/builtin/search/index.ts
/**
 * 搜索工具集
 */

import { glob as globSync } from 'glob';
import type { Tool } from '../../types.js';

export const globTool: Tool = {
  id: 'glob',
  name: 'glob',
  description: 'Find files by pattern',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts")'
      },
      cwd: {
        type: 'string',
        description: 'Current working directory (optional)'
      }
    },
    required: ['pattern']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const { pattern, cwd = process.cwd() } = input as { pattern: string; cwd?: string };

    try {
      const files = await globSync(pattern, { cwd });
      return {
        success: true,
        data: files
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

export const grepTool: Tool = {
  id: 'grep',
  name: 'grep',
  description: 'Search content in files',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (regex)'
      },
      glob: {
        type: 'string',
        description: 'File pattern to search in (optional)'
      }
    },
    required: ['pattern']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: GrepResult[]; error?: string }> {
    const { pattern, glob: globPattern } = input as { pattern: string; glob?: string };

    try {
      // 简化实现：先用 glob 找文件，再用简单的字符串匹配
      let files: string[] = [];
      if (globPattern) {
        const globResult = await globSync(globPattern, { cwd: process.cwd() });
        files = globResult as string[];
      }

      const results: GrepResult[] = [];

      for (const file of files) {
        try {
          const { readFile } = await import('fs/promises');
          const content = await readFile(file, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, index) => {
            if (line.includes(pattern)) {
              results.push({
                file,
                line: index + 1,
                content: line.trim()
              });
            }
          });
        } catch {
          // 跳过无法读取的文件
        }
      }

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

interface GrepResult {
  file: string;
  line: number;
  content: string;
}
