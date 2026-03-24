// packages/permission/test/checker.test.ts
/**
 * Permission Checker 单元测试
 */

import { PermissionChecker } from '../src/checker.js';
import type { PermissionConfig } from '../src/config-loader.js';

describe('PermissionChecker', () => {
  let checker: PermissionChecker;
  const mockConfig: PermissionConfig = {
    toolPermissions: {
      file_read: true,
      file_write: 'confirm',
      file_delete: false,
      command_execute: ['npm', 'git', 'ls'],
      command_dangerous: 'deny'
    },
    sandbox: {
      enabled: true,
      allowedPaths: ['./src', './tests'],
      deniedPaths: ['~/.ssh', '/etc'],
      deniedPatterns: ['rm -rf', 'format'],
      maxFileSize: 1024 * 1024,
      maxExecutionTime: 30000
    }
  };

  beforeEach(() => {
    checker = new PermissionChecker(mockConfig);
  });

  describe('checkToolPermission', () => {
    it('should allow file_read when permission is true', async () => {
      const result = await checker.checkToolPermission('read_file', 'file_read');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
    });

    it('should require confirmation for file_write', async () => {
      const result = await checker.checkToolPermission('write_file', 'file_write');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('should deny file_delete when permission is false', async () => {
      const result = await checker.checkToolPermission('delete_file', 'file_delete');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should check command whitelist', async () => {
      const result = await checker.checkToolPermission('exec', 'command_execute', { command: 'npm test' });
      expect(result.allowed).toBe(true);
    });

    it('should reject command not in whitelist', async () => {
      const result = await checker.checkToolPermission('exec', 'command_execute', { command: 'dangerous-cmd' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('不在白名单中');
    });
  });

  describe('checkPathAccess', () => {
    it('should allow access to allowed paths', async () => {
      const result = await checker.checkPathAccess('./src/index.ts');
      expect(result.allowed).toBe(true);
      expect(result.normalizedPath).toBeDefined();
    });

    it('should deny access to denied paths', async () => {
      const result = await checker.checkPathAccess('~/.ssh/id_rsa');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should allow all access when sandbox is disabled', async () => {
      const noSandboxChecker = new PermissionChecker({
        toolPermissions: mockConfig.toolPermissions,
        sandbox: { ...mockConfig.sandbox, enabled: false }
      });

      const result = await noSandboxChecker.checkPathAccess('/etc/passwd');
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkCommandSafety', () => {
    it('should detect dangerous command patterns', () => {
      const result = checker.checkCommandSafety('rm -rf /home/user');
      expect(result.safe).toBe(false);
      expect(result.matchedPattern).toBe('rm -rf');
    });

    it('should pass safe commands', () => {
      const result = checker.checkCommandSafety('ls -la');
      expect(result.safe).toBe(true);
    });
  });

  describe('checkFileSize', () => {
    it('should allow files under max size', async () => {
      // Create a mock small file check (real check would need actual file)
      const result = await checker.checkFileSize('test.txt');
      expect(result.allowed).toBe(true);
    });

    it('should create timeout with configured time', () => {
      const timeout = checker.createExecutionTimeout();
      expect(timeout).toBe(30000);
    });

    it('should return infinite timeout when sandbox disabled', () => {
      const noSandboxChecker = new PermissionChecker({
        toolPermissions: mockConfig.toolPermissions,
        sandbox: { ...mockConfig.sandbox, enabled: false }
      });

      const timeout = noSandboxChecker.createExecutionTimeout();
      expect(timeout).toBe(Infinity);
    });
  });
});
