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

import type { Agent, AgentContext, Task } from '@tramber/shared';
import type { AIProvider } from '@tramber/provider';
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
  /** AI 响应的类型，用于 CLI 决定下一步 */
  responseType?: 'summary' | 'wait_choice' | 'complete' | 'unknown';
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

  /**
   * 执行一次用户请求
   * 解析响应标记并自动执行工具，直到遇到对话控制标记
   */
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

      // 添加系统提示和用户任务
      context.messages.push({
        role: 'system',
        content: this.buildSystemPrompt()
      });
      context.messages.push({
        role: 'user',
        content: task.description
      });

      // 循环处理 AI 响应，直到遇到对话控制标记
      for (let i = 0; i < this.options.maxIterations; i++) {
        context.iterations = i + 1;

        // Phase 1: Gather Context
        await this.gatherContext(context);

        // Phase 2: 调用 LLM
        const response = await this.callLLM(context);
        const content = response.content || '';

        // Phase 3: 解析响应标记
        const marker = this.extractMarker(content);

        // 检查是否是有效标记
        if (!this.isValidMarker(marker)) {
          // 无效标记，要求重新生成
          context.messages.push({
            role: 'assistant',
            content
          });
          context.messages.push({
            role: 'user',
            content: `错误：你的响应没有以有效标记开头。必须使用以下标记之一：[read_file], [write_file], [execute_command], [search_code], [task-summary], [wait-user-choice], [task-complete]。请重新生成响应。`
          });
          continue;
        }

        // 处理对话控制标记 - 返回给用户
        if (this.isConversationMarker(marker)) {
          return {
            success: true,
            finalAnswer: content,
            steps: [...this.steps],
            iterations: i + 1,
            terminatedReason: 'completed',
            responseType: this.getConversationResponseType(marker)
          };
        }

        // 处理工具标记 - 执行工具并继续
        const toolResult = await this.executeToolFromMarker(marker, content);
        if (!toolResult.success) {
          // 工具执行失败，返回错误
          return {
            success: false,
            finalAnswer: `工具执行失败：${toolResult.error}`,
            steps: [...this.steps],
            iterations: i + 1,
            terminatedReason: 'error',
            error: toolResult.error
          };
        }

        // 添加工具结果到上下文，继续循环
        context.messages.push({
          role: 'assistant',
          content
        });
        context.messages.push({
          role: 'user',
          content: `工具执行结果：${JSON.stringify(toolResult.data)}`
        });
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

  /**
   * 提取响应开头的标记
   */
  private extractMarker(content: string): string | null {
    const match = content.match(/^\[([\w-]+)\]/);
    return match ? match[1] : null;
  }

  /**
   * 检查是否是有效标记
   */
  private isValidMarker(marker: string | null): marker is string {
    if (!marker) return false;
    const validMarkers = [
      'read_file', 'write_file', 'execute_command', 'search_code',
      'task-summary', 'wait-user-choice', 'task-complete'
    ];
    return validMarkers.includes(marker);
  }

  /**
   * 检查是否是对话控制标记
   */
  private isConversationMarker(marker: string | null): boolean {
    if (!marker) return false;
    return ['task-summary', 'wait-user-choice', 'task-complete'].includes(marker);
  }

  /**
   * 获取对话响应类型
   */
  private getConversationResponseType(marker: string): 'summary' | 'wait_choice' | 'complete' {
    const typeMap: Record<string, 'summary' | 'wait_choice' | 'complete'> = {
      'task-summary': 'summary',
      'wait-user-choice': 'wait_choice',
      'task-complete': 'complete'
    };
    return typeMap[marker] ?? 'summary';
  }

  /**
   * 从标记执行工具
   */
  private async executeToolFromMarker(marker: string, content: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      // 提取标记后的参数
      const restContent = content.replace(/^\[[\w-]+\]\s*/, '').trim();

      switch (marker) {
        case 'read_file': {
          const filePath = restContent.split('\n')[0].trim();
          return await this.options.toolRegistry.execute('read_file', { path: filePath });
        }
        case 'write_file': {
          const lines = restContent.split('\n');
          const filePath = lines[0].trim();
          const fileContent = lines.slice(1).join('\n').trim();
          return await this.options.toolRegistry.execute('write_file', { path: filePath, content: fileContent });
        }
        case 'execute_command': {
          const command = restContent.trim();
          return await this.options.toolRegistry.execute('exec', { command });
        }
        case 'search_code': {
          const query = restContent.trim();
          return await this.options.toolRegistry.execute('search', { query });
        }
        default:
          return { success: false, error: `Unknown tool marker: ${marker}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(context: AgentContext): Promise<{ content: string; toolCalls?: Array<{ name: string; parameters: Record<string, unknown> }> }> {
    const step: AgentLoopStep = {
      iteration: context.iterations ?? 0,
      phase: 'action'
    };

    try {
      const toolDefinitions = this.options.toolRegistry.list().map(tool => ({
        name: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as Record<string, unknown>
      }));

      const response = await this.options.provider.chat({
        messages: context.messages,
        tools: toolDefinitions,
        temperature: this.options.agent.temperature ?? 0.7,
        maxTokens: this.options.agent.maxTokens ?? 4096
      });

      step.thinking = response.content;
      this.addStep(step);
      this.options.onStep(step);

      return response;
    } catch (error) {
      step.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.addStep(step);
      this.options.onStep(step);
      return { content: '', toolCalls: [] };
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

  private buildSystemPrompt(): string {
    return `你是一个编程助手 ${this.options.agent.name}，${this.options.agent.description}。

## 你的能力
- 使用工具读取文件、搜索内容、执行命令
- 分析代码结构，理解项目需求
- 帮助用户完成编程任务

## 重要：每次响应必须以有效标记开头

**你的每次响应必须以以下标记之一开头**，否则将被拒绝并要求重新生成。

### 工具执行标记（将自动执行对应的工具）

#### [read_file]
读取文件内容。
格式：[read_file] <文件路径>

#### [write_file]
写入文件内容。
格式：[write_file] <文件路径>
<文件内容>

#### [execute_command]
执行 shell 命令。
格式：[execute_command] <命令>

#### [search_code]
搜索代码。
格式：[search_code] <搜索内容>

### 对话控制标记

#### [task-summary]
报告操作结果或当前进度。
使用场景：执行完工具操作后，报告结果给用户。
示例：[task-summary]
✓ 已读取 package.json，包含以下依赖：
- react: ^18.2.0
- typescript: ^5.0.0

#### [wait-user-choice]
需要用户提供更多信息或做出选择。
使用场景：需要用户补充信息、选择选项、确认操作等。
示例：[wait-user-choice]
为了帮你修复 bug，请提供以下信息：
1. Bug 在哪个文件中？
2. Bug 的具体表现是什么？

#### [task-complete]
任务完全完成，给出最终总结。
使用场景：任务已完成，可以结束对话。
示例：[task-complete]
✓ 分析完成。这个项目是一个 React + TypeScript 的 monorepo，包含 5 个主要包。

## 响应规则

1. **必须使用有效标记开头**：每次响应必须使用上述标记之一
2. **工具操作简洁化**：使用工具标记时，只输出标记和必要参数，不需要额外说明
3. **报告结果使用 summary**：执行工具后，用 [task-summary] 报告结果
4. **等待用户使用 wait-choice**：需要用户输入时，用 [wait-user-choice]
5. **完成使用 complete**：任务结束时，用 [task-complete] 给出总结

## 可用工具
当前可用工具：${this.options.toolRegistry.list().map(t => `- ${t.id}: ${t.description}`).join('\n')}
`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
