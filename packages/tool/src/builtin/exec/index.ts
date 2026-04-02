// packages/tool/src/builtin/exec/index.ts
/**
 * 命令执行工具
 */

import { spawn } from 'child_process';
import type { Tool, ToolResult } from '../../types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

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

    debug(NAMESPACE.TOOL_EXEC, LogLevel.VERBOSE, 'Executing command', { command, cwd });

    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      let child: ReturnType<typeof spawn>;
      let timeoutHandle: NodeJS.Timeout | undefined;
      let resolved = false;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (!resolved) {
          resolved = true;
        }
      };

      timeoutHandle = setTimeout(() => {
        debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Command timed out', { command, timeout });
        child.kill('SIGTERM');
        cleanup();
        resolve({
          success: false,
          error: `命令超时 (${timeout}ms): ${command}`
        });
      }, timeout);

      try {
        // Windows 特殊处理：使用 cmd.exe /c 执行内置命令
        const isWindows = process.platform === 'win32';
        // Windows: 切换到 UTF-8 代码页避免中文乱码
        const windowsPrefix = isWindows ? 'chcp 65001 >nul && ' : '';
        const spawnCmd = isWindows && !cmd.includes('.exe') && !cmd.includes('.bat')
          ? `cmd.exe /c ${windowsPrefix}${command}`
          : command;

        debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Spawning command', {
          originalCommand: command,
          spawnCmd,
          isWindows,
          shell: true
        });

        child = spawn(spawnCmd, [], {
          cwd,
          shell: true,
          env: { ...process.env, ...env },
          windowsHide: true
        });

        debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Child process spawned', {
          pid: child.pid
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
          debug(NAMESPACE.TOOL_EXEC, LogLevel.TRACE, 'stdout data', { length: data.toString().length });
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
          debug(NAMESPACE.TOOL_EXEC, LogLevel.TRACE, 'stderr data', { length: data.toString().length });
        });

        child.on('close', (code) => {
          debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Child process close event', {
            pid: child.pid,
            exitCode: code,
            wasResolved: resolved
          });

          // 检查是否已经被处理过
          if (resolved) return;

          // 标记为已处理
          resolved = true;

          // 清理 timeout
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Command completed successfully', {
            command,
            exitCode: code,
            stdoutLength: stdout.length,
            stderrLength: stderr.length
          });

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
          // 检查是否已经被处理过
          if (resolved) return;

          // 标记为已处理
          resolved = true;

          // 清理 timeout
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          const errorMsg = error.message.includes('ENOENT')
            ? `命令不存在: ${cmd} (${error.message})`
            : error.message;

          debugError(NAMESPACE.TOOL_EXEC, `Command error: ${errorMsg}`, error);
          resolve({
            success: false,
            error: errorMsg
          });
        });
      } catch (error) {
        // 检查是否已经被处理过
        if (resolved) return;

        // 标记为已处理
        resolved = true;

        // 清理 timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const errorMsg = error instanceof Error ? error.message : String(error);
        debugError(NAMESPACE.TOOL_EXEC, 'Spawn error', error);
        resolve({
          success: false,
          error: `启动命令失败: ${errorMsg}`
        });
      }
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
