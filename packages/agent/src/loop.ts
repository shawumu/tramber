// packages/agent/src/loop.ts
/**
 * Agent Loop - Agent 执行引擎
 *
 * 实现核心的 Agent 执行循环：
 * 1. Gather Context - 收集上下文
 * 2. Take Action - 执行动作（调用 LLM 或工具）
 * 3. Verify Results - 验证结果
 *
 * 最多执行 10 次迭代，确保任务完成或达到最大限制
 */

import type { Agent, AgentContext, Message, Task } from '@tramber/shared';
import type { AIProvider, ChatResponse } from '@tramber/provider';
import type { ToolRegistry } from '@tramber/tool';

export interface AgentLoopOptions {
  agent: Agent;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  maxIterations?: number;
  onStep?: (step: AgentLoopStep) => void;
}

export interface AgentLoopStep {
  iteration: number;
  phase: 'context' | 'action' | 'verify';
  content?: string;
  toolCall?: { name: string; parameters: Record<string, unknown> };
  toolResult?: { success: boolean; data?: unknown; error?: string };
  thinking?: string;
}

export interface AgentLoopResult {
  success: boolean;
  finalAnswer?: string;
  steps: AgentLoopStep[];
  iterations: number;
  error?: string;
  terminatedReason?: 'completed' | 'max_iterations' | 'error';
}

export class AgentLoop {
  private options: Required<AgentLoopOptions>;
  private steps: AgentLoopStep[] = [];

  constructor(options: AgentLoopOptions) {
    this.options = {
      maxIterations: 10,
      onStep: () => {},
      ...options
    };
  }

  async execute(task: Task): Promise<AgentLoopResult> {
    this.steps = [];

    try {
      // 初始化 Agent 上下文
      const context: AgentContext = {
        task,
        messages: [],
        memory: new Map(),
        iterations: 0,
        files: [],
        projectInfo: {
          rootPath: process.cwd(),
          name: 'project'
        },
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0
        },
        experiences: []
      };

      // 添加系统提示和任务描述
      context.messages.push({
        role: 'system',
        content: this.buildSystemPrompt()
      });

      context.messages.push({
        role: 'user',
        content: this.buildTaskPrompt(task)
      });

      // 主循环
      for (let i = 0; i < this.options.maxIterations; i++) {
        context.iterations = i + 1;

        // Phase 1: Gather Context
        await this.gatherContext(context);

        // Phase 2: Take Action
        const actionResult = await this.takeAction(context);
        if (actionResult.done) {
          return {
            success: true,
            finalAnswer: actionResult.answer,
            steps: [...this.steps],
            iterations: i + 1,
            terminatedReason: 'completed'
          };
        }

        // Phase 3: Verify Results
        const verified = await this.verifyResults(context);
        if (!verified) {
          // 验证失败，继续下一轮迭代
          continue;
        }

        // 检查是否完成
        if (this.isTaskComplete(context)) {
          const answer = this.extractFinalAnswer(context);
          return {
            success: true,
            finalAnswer: answer,
            steps: [...this.steps],
            iterations: i + 1,
            terminatedReason: 'completed'
          };
        }
      }

      // 达到最大迭代次数
      return {
        success: false,
        steps: [...this.steps],
        iterations: this.options.maxIterations,
        terminatedReason: 'max_iterations',
        error: 'Maximum iterations reached without completion'
      };

    } catch (error) {
      return {
        success: false,
        steps: [...this.steps],
        iterations: this.steps.length,
        terminatedReason: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async gatherContext(context: AgentContext): Promise<void> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'context'
    };

    // 收集工具可用性信息
    const availableTools = this.options.toolRegistry.list();
    context.memory?.set('available_tools', availableTools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category
    })));

    step.content = `Gathered context: ${availableTools.length} tools available`;
    this.addStep(step);
    this.options.onStep(step);
  }

  private async takeAction(context: AgentContext): Promise<{ done: boolean; answer?: string }> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'action'
    };

    try {
      // 准备工具定义
      const toolDefinitions = this.options.toolRegistry.list().map(tool => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as Record<string, unknown>
      }));

      // 调用 LLM
      const response = await this.options.provider.chat({
        messages: context.messages,
        tools: toolDefinitions,
        temperature: this.options.agent.temperature ?? 0.7,
        maxTokens: this.options.agent.maxTokens ?? 4096
      });

      step.thinking = response.content;

      // 检查是否有工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          step.toolCall = {
            name: toolCall.name,
            parameters: toolCall.parameters
          };

          // 执行工具
          const toolResult = await this.options.toolRegistry.execute(toolCall.name, toolCall.parameters);
          step.toolResult = toolResult;

          // 添加工具结果到消息历史
          context.messages.push({
            role: 'assistant',
            content: response.content
          });

          context.messages.push({
            role: 'user',
            content: `Tool ${toolCall.name} returned: ${JSON.stringify(toolResult)}`
          });
        }
      } else {
        // 没有工具调用，可能是最终答案
        context.messages.push({
          role: 'assistant',
          content: response.content
        });

        // 检查是否是最终答案
        if (this.isFinalAnswer(response.content)) {
          return { done: true, answer: response.content };
        }
      }

      this.addStep(step);
      this.options.onStep(step);
      return { done: false };

    } catch (error) {
      step.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.addStep(step);
      this.options.onStep(step);
      return { done: false };
    }
  }

  private async verifyResults(context: AgentContext): Promise<boolean> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'verify'
    };

    // 简单验证：检查最后的工具执行是否成功
    const lastMessage = context.messages[context.messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      const toolResultMatch = lastMessage.content.match(/Tool (\w+) returned: ({.*})/);
      if (toolResultMatch) {
        try {
          const result = JSON.parse(toolResultMatch[2]);
          step.content = `Verification: ${result.success ? 'Passed' : 'Failed'}`;
          this.addStep(step);
          this.options.onStep(step);
          return result.success === true;
        } catch {
          // 解析失败，继续
        }
      }
    }

    step.content = 'Verification: Skipped (no tool result to verify)';
    this.addStep(step);
    this.options.onStep(step);
    return true;
  }

  private isTaskComplete(context: AgentContext): boolean {
    // 检查最后一条消息是否包含完成信号
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) return false;

    const content = lastMessage.content.toLowerCase();
    return content.includes('task complete') ||
           content.includes('finished') ||
           content.includes('done') ||
           content.includes('final answer');
  }

  private extractFinalAnswer(context: AgentContext): string {
    const lastMessage = context.messages[context.messages.length - 1];
    return lastMessage?.content || 'No final answer generated';
  }

  private isFinalAnswer(content: string): boolean {
    const lower = content.toLowerCase();
    return lower.includes('final answer') ||
           lower.includes('the answer is') ||
           lower.includes('conclusion:');
  }

  private buildSystemPrompt(): string {
    return `You are ${this.options.agent.name}, ${this.options.agent.description}.

Your capabilities:
- Use available tools to accomplish tasks
- Think step by step before taking action
- Verify results before proceeding
- Provide clear final answers

When to use tools:
- When you need information you don't have
- When you need to perform actions
- When you need to verify assumptions

When to provide final answer:
- When the task is complete
- When you have sufficient information
- After verifying all results

Respond concisely and focus on results.`;
  }

  private buildTaskPrompt(task: Task): string {
    return `Task: ${task.description}

${task.inputs ? `Inputs: ${JSON.stringify(task.inputs)}` : ''}

Please accomplish this task step by step.`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
