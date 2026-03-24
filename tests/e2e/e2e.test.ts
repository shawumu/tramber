// tests/e2e/e2e.test.ts
/**
 * End-to-End Tests
 *
 * 测试完整的用户场景
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AgentLoop } from '@tramber/agent';
import { ToolRegistryImpl, bashTool, readFileTool, writeFileTool, editFileTool } from '@tramber/tool';
import { MockAnthropicProvider } from '../helpers/mock-provider.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');

describe('End-to-End Tests', () => {
  beforeAll(async () => {
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  describe('Scenario: Read File', () => {
    it('should complete "read file" task successfully', async () => {
      // 创建测试文件
      const testFile = join(TEST_DIR, 'test.txt');
      await fs.writeFile(testFile, 'Hello, Tramber!');

      const toolRegistry = new ToolRegistryImpl();
      toolRegistry.register(readFileTool);

      const mockProvider = new MockAnthropicProvider();
      mockProvider.setResponse({
        content: 'I read the file. It contains: Hello, Tramber!',
        toolCalls: [{
          name: 'read_file',
          parameters: { path: testFile }
        }]
      });

      const agentLoop = new AgentLoop({
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          sceneId: 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: mockProvider,
        toolRegistry,
        maxIterations: 5
      });

      const result = await agentLoop.execute({
        id: 'task-read-file',
        description: `Read the file at ${testFile}`,
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);
      expect(result.finalAnswer).toContain('Hello, Tramber!');

      // 清理
      await fs.unlink(testFile);
    });
  });

  describe('Scenario: Fix Bug', () => {
    it('should complete "fix bug" task successfully', async () => {
      // 创建包含 bug 的测试文件
      const buggyFile = join(TEST_DIR, 'buggy.js');
      await fs.writeFile(buggyFile, `
function add(a, b) {
  return a - b;  // Bug: should be a + b
}
`);

      const toolRegistry = new ToolRegistryImpl();
      toolRegistry.register(readFileTool);
      toolRegistry.register(editFileTool);

      const mockProvider = new MockAnthropicProvider();
      // 模拟 AI 修复 bug 的响应
      mockProvider.setResponse({
        content: 'I found the bug in the add function. The operator should be + instead of -. I have fixed it.',
        toolCalls: [
          {
            name: 'read_file',
            parameters: { path: buggyFile }
          },
          {
            name: 'edit_file',
            parameters: {
              path: buggyFile,
              oldText: 'return a - b;  // Bug: should be a + b',
              newText: 'return a + b;  // Fixed'
            }
          }
        ]
      });

      const agentLoop = new AgentLoop({
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          sceneId: 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: mockProvider,
        toolRegistry,
        maxIterations: 10
      });

      const result = await agentLoop.execute({
        id: 'task-fix-bug',
        description: 'Fix the bug in the add function',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);

      // 验证文件已修改
      const fixedContent = await fs.readFile(buggyFile, 'utf-8');
      expect(fixedContent).toContain('return a + b');
      expect(fixedContent).not.toContain('return a - b');

      // 清理
      await fs.unlink(buggyFile);
    });
  });

  describe('Scenario: Run Tests', () => {
    it('should complete "run tests" task successfully', async () => {
      const toolRegistry = new ToolRegistryImpl();
      toolRegistry.register(bashTool);

      const mockProvider = new MockAnthropicProvider();
      mockProvider.setResponse({
        content: 'Tests completed successfully. All 5 tests passed.',
        toolCalls: [{
          name: 'bash',
          parameters: {
            command: 'echo "Running tests..." && echo "5 tests passed"',
            cwd: process.cwd()
          }
        }]
      });

      const agentLoop = new AgentLoop({
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          sceneId: 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: mockProvider,
        toolRegistry,
        maxIterations: 5
      });

      const result = await agentLoop.execute({
        id: 'task-run-tests',
        description: 'Run the test suite',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);
      expect(result.finalAnswer).toContain('tests passed');
    });
  });

  describe('Scenario: Multi-Step Task', () => {
    it('should complete a multi-step task', async () => {
      // 创建测试文件
      const dataFile = join(TEST_DIR, 'data.json');
      await fs.writeFile(dataFile, '{"count": 0}');

      const toolRegistry = new ToolRegistryImpl();
      toolRegistry.register(readFileTool);
      toolRegistry.register(editFileTool);
      toolRegistry.register(bashTool);

      const mockProvider = new MockAnthropicProvider();
      mockProvider.setResponse({
        content: 'Task completed. I read the data file, incremented the count, and saved it back.',
        toolCalls: [
          {
            name: 'read_file',
            parameters: { path: dataFile }
          },
          {
            name: 'edit_file',
            parameters: {
              path: dataFile,
              oldText: '{"count": 0}',
              newText: '{"count": 1}'
            }
          },
          {
            name: 'bash',
            parameters: {
              command: `echo "Updated ${dataFile}"`,
              cwd: process.cwd()
            }
          }
        ]
      });

      const agentLoop = new AgentLoop({
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          sceneId: 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: mockProvider,
        toolRegistry,
        maxIterations: 10
      });

      const result = await agentLoop.execute({
        id: 'task-multi-step',
        description: 'Read the count in data.json, increment it, and save it back',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);
      expect(mockProvider.getToolCallHistory().length).toBe(3);

      // 验证文件已修改
      const content = await fs.readFile(dataFile, 'utf-8');
      expect(content).toContain('"count": 1');

      // 清理
      await fs.unlink(dataFile);
    });
  });

  describe('Scenario: Error Recovery', () => {
    it('should handle errors and retry', async () => {
      const toolRegistry = new ToolRegistryImpl();
      toolRegistry.register(readFileTool);

      const mockProvider = new MockAnthropicProvider();
      // 第一次调用返回工具调用（会失败）
      mockProvider.setResponse({
        content: 'Let me read that file for you.',
        toolCalls: [{
          name: 'read_file',
          parameters: { path: '/nonexistent/file.txt' }
        }]
      });

      const agentLoop = new AgentLoop({
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          sceneId: 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: mockProvider,
        toolRegistry,
        maxIterations: 5
      });

      const result = await agentLoop.execute({
        id: 'task-error-recovery',
        description: 'Read a file that does not exist',
        sceneId: 'coding',
        isComplete: false
      });

      // 应该有步骤记录，包括失败的
      expect(result.steps.length).toBeGreaterThan(0);

      // 检查是否有工具调用记录
      const toolCallSteps = result.steps.filter(s => s.toolCall);
      expect(toolCallSteps.length).toBeGreaterThan(0);
    });
  });
});
