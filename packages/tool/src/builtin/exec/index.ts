// packages/tool/src/builtin/exec/index.ts
/**
 * 命令执行工具
 */

import { spawn } from 'child_process';
import type { Tool, ToolResult } from '../../types.js';

export interface ExecResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const execTool: Tool = {
  id: 'exec',
  name: 'exec',
  description: 'Execute shell command',
  category: 'execution',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute'
      },
      cwd: {
        type: 'string',
        description: 'Working directory (optional)'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)'
      },
      env: {
        type: 'object',
        description: 'Environment variables (optional)'
      }
    },
    required: ['command']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: ExecResult; error?: string }> {
    const { command, cwd = process.cwd(), timeout = 120000, env = {} } = input as {
      command: string;
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    };

    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`
        });
      }, timeout);

      const child = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env, ...env },
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        resolve({
          success: code === 0,
          data: {
            command,
            exitCode: code,
            stdout,
            stderr
          }
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }
};

export const execBackgroundTool: Tool = {
  id: 'exec_background',
  name: 'exec_background',
  description: 'Execute shell command in background',
  category: 'execution',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute'
      },
      cwd: {
        type: 'string',
        description: 'Working directory (optional)'
      },
      env: {
        type: 'object',
        description: 'Environment variables (optional)'
      }
    },
    required: ['command']
  },
  async execute(input: unknown): Promise<{ success: boolean; data?: { pid: number }; error?: string }> {
    const { command, cwd = process.cwd(), env = {} } = input as {
      command: string;
      cwd?: string;
      env?: Record<string, string>;
    };

    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');

      const child = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env, ...env },
        detached: true,
        windowsHide: true,
        stdio: 'ignore'
      });

      // Unref to allow parent to exit independently
      child.unref();

      resolve({
        success: true,
        data: {
          pid: child.pid ?? -1
        }
      });
    });
  }
};
