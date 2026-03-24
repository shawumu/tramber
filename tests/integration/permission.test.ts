// tests/integration/permission.test.ts
/**
 * Permission System Integration Tests
 * 验证权限控制与工具执行的集成
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistryImpl } from '@tramber/tool';
import { PermissionChecker } from '@tramber/permission';
import { readFileTool, writeFileTool, execTool } from '@tramber/tool';
import { writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Permission Integration', () => {
  let toolRegistry: ToolRegistryImpl;
  let testDir: string;
  let testFile: string;
  let testTimestamp: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testTimestamp = Date.now().toString();
    testDir = join(tmpdir(), `tramber-test-${testTimestamp}`);
    testFile = join(testDir, 'test.txt');

    // 确保测试目录存在
    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, 'test content', 'utf-8');

    // 创建权限检查器
    const permissionConfig = {
      toolPermissions: {
        file_read: true,
        file_write: 'confirm',
        file_delete: false,
        command_execute: ['npm', 'git', 'ls', 'rm'], // 添加 rm 以测试危险模式检查
        command_dangerous: 'deny'
      },
      sandbox: {
        enabled: true,
        allowedPaths: [testDir],
        deniedPaths: [],
        deniedPatterns: ['rm -rf', 'format', 'del /q'],
        maxFileSize: 1024 * 1024,
        maxExecutionTime: 30000
      }
    };

    const checker = new PermissionChecker(permissionConfig);

    // 创建工具注册表
    toolRegistry = new ToolRegistryImpl({ permissionChecker: checker });
    toolRegistry.register(readFileTool);
    toolRegistry.register(writeFileTool);
    toolRegistry.register(execTool);
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  it('should allow reading files in allowed paths', async () => {
    const result = await toolRegistry.execute('read_file', { path: testFile });
    expect(result.success).toBe(true);
    expect(result.data).toBe('test content');
  });

  it('should deny reading files outside allowed paths', async () => {
    const result = await toolRegistry.execute('read_file', { path: '/etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('不在允许列表中');
  });

  it('should require confirmation for write operations', async () => {
    const result = await toolRegistry.execute('write_file', {
      path: join(testDir, 'new.txt'),
      content: 'new content'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('需要用户确认');
  });

  it('should deny dangerous command patterns', async () => {
    const result = await toolRegistry.execute('exec', {
      command: 'rm -rf /home/user'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('危险模式');
  });

  it('should allow safe commands in whitelist', async () => {
    const result = await toolRegistry.execute('exec', {
      command: 'ls -la',
      cwd: testDir
    });
    // 命令应该被允许执行（虽然可能会因为没有文件而失败，但不是因为权限）
    expect(result.success).toBe(true);
  });

  it('should deny commands not in whitelist', async () => {
    const result = await toolRegistry.execute('exec', {
      command: 'docker ps'
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('不在白名单中');
  });

  it('should allow all access when sandbox is disabled', async () => {
    const noSandboxConfig = {
      toolPermissions: {
        file_read: true,
        file_write: true,
        file_delete: true,
        command_execute: true
      },
      sandbox: {
        enabled: false,
        allowedPaths: [],
        deniedPaths: [],
        deniedPatterns: [],
        maxFileSize: 0,
        maxExecutionTime: 0
      }
    };

    const checker = new PermissionChecker(noSandboxConfig);
    const registry = new ToolRegistryImpl({ permissionChecker: checker });
    registry.register(readFileTool);
    registry.register(execTool);

    const readResult = await registry.execute('read_file', { path: testFile });
    expect(readResult.success).toBe(true);

    // 沙箱禁用时，不会检查危险模式
    const execResult = await registry.execute('exec', { command: 'rm -rf test' });
    expect(execResult.success).toBe(true); // 沙箱禁用，命令被允许执行
  });
});
