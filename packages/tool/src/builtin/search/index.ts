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
  description: 'Search content in files using regex',
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
        description: 'File pattern to search in (default: "**/*.ts")'
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)'
      }
    },
    required: ['pattern']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: GrepResult[]; error?: string }> {
    const { pattern, glob: globPattern, path: searchPath } = input as { pattern: string; glob?: string; path?: string };

    try {
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'i');
      } catch {
        return { success: false, error: `Invalid regex pattern: ${pattern}` };
      }

      const cwd = searchPath || process.cwd();
      const filePattern = globPattern || '**/*.{ts,tsx,js,jsx,json,md,yaml,yml,sh,py}';
      let files: string[] = [];
      try {
        const globResult = await globSync(filePattern, { cwd });
        files = globResult as string[];
      } catch {
        return { success: true, data: [] };
      }

      const results: GrepResult[] = [];
      const { readFile } = await import('fs/promises');

      for (const file of files) {
        try {
          const content = await readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file,
                line: i + 1,
                content: lines[i].trim()
              });
            }
          }
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
