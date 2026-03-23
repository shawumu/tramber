// packages/tool/test/exec.test.ts
/**
 * Exec 工具单元测试
 */

import { describe, it, expect } from '@jest/globals';
import { execTool, execBackgroundTool } from '../src/builtin/exec/index.js';

describe('Exec Tools', () => {
  describe('execTool', () => {
    it('should execute command successfully', async () => {
      const result = await execTool.execute({
        command: 'echo "Hello World"'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.stdout).toContain('Hello World');
      expect(result.data!.exitCode).toBe(0);
    });

    it('should handle command errors', async () => {
      const result = await execTool.execute({
        command: 'exit 1'
      });

      expect(result.success).toBe(false);
      expect(result.data!.exitCode).toBe(1);
    });

    it('should handle invalid commands', async () => {
      const result = await execTool.execute({
        command: 'nonexistentcommand12345'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should support custom working directory', async () => {
      const result = await execTool.execute({
        command: 'pwd',
        cwd: '/'
      });

      expect(result.success).toBe(true);
    });

    it('should support timeout', async () => {
      const result = await execTool.execute({
        command: process.platform === 'win32' ? 'timeout 10' : 'sleep 10',
        timeout: 1000
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);

    it('should support custom environment variables', async () => {
      const result = await execTool.execute({
        command: process.platform === 'win32' ? 'echo %TEST_VAR%' : 'echo $TEST_VAR',
        env: { TEST_VAR: 'test_value' }
      });

      expect(result.success).toBe(true);
      expect(result.data!.stdout).toContain('test_value');
    });
  });

  describe('execBackgroundTool', () => {
    it('should start command in background', async () => {
      const result = await execBackgroundTool.execute({
        command: process.platform === 'win32' ? 'timeout 5' : 'sleep 5'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.pid).toBeDefined();
      expect(typeof result.data!.pid).toBe('number');
    });

    it('should return valid process id', async () => {
      const result = await execBackgroundTool.execute({
        command: 'echo "background process"'
      });

      expect(result.data!.pid).toBeGreaterThan(0);
    });
  });
});
