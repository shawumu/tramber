// packages/tool/src/builtin/pwd/index.ts
/**
 * PWD - Print Working Directory 工具
 */

import type { Tool } from '../../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export const pwdTool: Tool = {
  id: 'pwd',
  name: 'pwd',
  description: 'Print current working directory',
  category: 'execution',
  permission: {
    level: 'safe',
    operation: 'file_read' // 读取工作目录信息
  },
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  async execute(): Promise<{ success: boolean; data?: string; error?: string }> {
    debug(NAMESPACE.TOOL_EXEC, LogLevel.VERBOSE, 'Getting current working directory');

    try {
      return {
        success: true,
        data: process.cwd()
      };
    } catch (error) {
      debugError(NAMESPACE.TOOL_EXEC, 'Failed to get working directory', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
