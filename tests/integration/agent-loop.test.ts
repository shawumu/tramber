// tests/integration/agent-loop.test.ts
/**
 * Agent Loop Integration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentLoop } from '@tramber/agent';
import { ToolRegistryImpl } from '@tramber/tool';
import { MockAnthropicProvider } from '../helpers/mock-provider.js';

describe('Agent Loop Integration', () => {
  let agentLoop: AgentLoop;
  let toolRegistry: ToolRegistryImpl;
  let mockProvider: MockAnthropicProvider;

  beforeEach(() => {
    toolRegistry = new ToolRegistryImpl();
    mockProvider = new MockAnthropicProvider();
  });

  describe('Basic Execution', () => {
    it('should execute a simple task without tools', async () => {
      mockProvider.setResponse({
        content: 'The answer is 42',
        toolCalls: []
      });

      agentLoop = new AgentLoop({
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
        id: 'task-1',
        description: 'What is the meaning of life?',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);
      expect(result.finalAnswer).toBe('The answer is 42');
      expect(result.terminatedReason).toBe('completed');
    });

    it('should execute a task with tool calls', async () => {
      mockProvider.setResponse({
        content: 'Reading file...',
        toolCalls: [{
          name: 'read_file',
          parameters: { path: 'test.txt' }
        }]
      });

      // 添加 read_file 工具（mock）
      toolRegistry.register({
        id: 'read_file',
        name: 'Read File',
        description: 'Read a file',
        category: 'file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        },
        execute: async () => ({
          success: true,
          data: 'File content'
        })
      });

      agentLoop = new AgentLoop({
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
        id: 'task-2',
        description: 'Read test.txt',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.steps.length).toBeGreaterThan(0);
      expect(mockProvider.getToolCallHistory().length).toBeGreaterThan(0);
    });
  });

  describe('Iteration Control', () => {
    it('should respect max iterations limit', async () => {
      mockProvider.setResponse({
        content: 'Still working...',
        toolCalls: []
      });

      agentLoop = new AgentLoop({
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
        maxIterations: 2
      });

      const result = await agentLoop.execute({
        id: 'task-3',
        description: 'Complex task',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('should complete early when task is done', async () => {
      mockProvider.setResponse({
        content: 'Final answer: Task complete',
        toolCalls: []
      });

      agentLoop = new AgentLoop({
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
        id: 'task-4',
        description: 'Simple task',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(true);
      expect(result.iterations).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      mockProvider.setError(new Error('Provider error'));

      agentLoop = new AgentLoop({
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
        id: 'task-5',
        description: 'Test task',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.terminatedReason).toBe('error');
    });
  });

  describe('Step Tracking', () => {
    it('should track all execution steps', async () => {
      mockProvider.setResponse({
        content: 'Done',
        toolCalls: []
      });

      agentLoop = new AgentLoop({
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
        maxIterations: 3,
        onStep: (step) => {
          // Track steps
          expect(step).toBeDefined();
          expect(step.iteration).toBeGreaterThan(0);
          expect(step.phase).toBeDefined();
        }
      });

      const result = await agentLoop.execute({
        id: 'task-6',
        description: 'Test task',
        sceneId: 'coding',
        isComplete: false
      });

      expect(result.steps).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });
});
