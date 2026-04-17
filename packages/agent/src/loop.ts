// packages/agent/src/loop.ts
/**
 * Agent Loop - Agent 执行引擎
 *
 * 实现核心的 Agent 执行循环：
 * 1. Gather Context - 收集上下文
 * 2. Take Action - 执行动作（调用 LLM 或工具）
 * 3. 执行工具并继续
 *
 * 简化控制逻辑：
 * - 有工具调用 → 执行并继续
 * - 无工具调用 → 输出给用户，等待回应
 */

import type { Agent, AgentContext, Task, SelfAwarenessState } from '@tramber/shared';
import type { AIProvider } from '@tramber/provider';
import type { ToolRegistry } from '@tramber/tool';
import type { PermissionChecker } from '@tramber/permission';
import type { SkillManifest } from '@tramber/skill';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { buildSelfAwarenessPrompt } from './consciousness-prompts.js';
import {
  createConversation,
  addMessage,
  getMessagesForLLM,
  updateTokenUsage,
  manageContextWindow,
  type Conversation
} from './conversation.js';
import { ContextBuffer, type ContextSnapshot } from './context-buffer.js';
import { LLMCaller } from './llm-caller.js';

export interface AgentLoopOptions {
  agent: Agent;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  permissionChecker?: PermissionChecker | undefined;
  maxIterations?: number;
  onStep?: (step: AgentLoopStep) => void;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string, reason?: string) => Promise<boolean>;
  /** 是否流式输出 */
  stream?: boolean;
  /** 是否打印详细的 stream delta 日志（默认 false） */
  verboseStreamLog?: boolean;
  /** 用户安装的 Skill 列表（注入系统提示词） */
  userSkills?: SkillManifest[];
  /** 上下文缓冲区（调试用） */
  contextBuffer?: ContextBuffer;
  /** 意识体状态（注入自我感知意识的 system prompt） */
  consciousnessState?: SelfAwarenessState;
}

export interface AgentLoopStep {
  iteration: number;
  phase: 'context' | 'action' | 'verify';
  content?: string;
  toolCall?: { name: string; parameters: Record<string, unknown> };
  toolResult?: { success: boolean; data?: unknown; error?: string };
  thinking?: string;
}

/**
 * Agent Loop 执行结果 - 使用 discriminated union 确保类型安全
 */
export type AgentLoopResult =
  | AgentLoopSuccess
  | AgentLoopFailed
  | AgentLoopMaxIterations;

export interface AgentLoopSuccess {
  success: true;
  finalAnswer: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'completed';
}

export interface AgentLoopFailed {
  success: false;
  error: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'error';
}

export interface AgentLoopMaxIterations {
  success: false;
  error: string;
  steps: AgentLoopStep[];
  iterations: number;
  terminatedReason?: 'max_iterations';
}

/** 工具执行结果类型 */
interface ToolExecResult {
  toolCall: { id: string; name: string; parameters: Record<string, unknown> };
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 工具结果格式化（独立函数，便于维护） */
const MAX_TOOL_RESULT_CHARS = 8000;

function formatToolResults(
  results: ToolExecResult[],
  toolRegistry: ToolRegistry
): string {
  return results.map(r => {
    if (r.success) {
      const dataStr = r.data ? JSON.stringify(r.data) : 'Success';
      return `${r.toolCall.name}: ${dataStr.slice(0, MAX_TOOL_RESULT_CHARS)}${dataStr.length > MAX_TOOL_RESULT_CHARS ? '... (truncated)' : ''}`;
    }

    let errorMsg = r.error;
    if (!errorMsg && r.data) {
      const d = r.data as { command?: string; exitCode?: number | null; stdout?: string; stderr?: string };
      if (d.stderr) {
        errorMsg = d.stderr.trim();
      } else if (d.exitCode !== null && d.exitCode !== 0) {
        errorMsg = `Exit code ${d.exitCode}`;
      } else {
        errorMsg = 'Unknown error';
      }
      if (d.command) {
        errorMsg = `Command "${d.command}" failed: ${errorMsg}`;
      }
    }
    if (!errorMsg) errorMsg = 'Unknown error';

    const tool = toolRegistry.get(r.toolCall.name);
    const requiredHint = tool?.inputSchema?.required?.length
      ? `\n  Required parameters: ${tool.inputSchema.required.join(', ')}`
      : '';
    return `${r.toolCall.name}: 失败 - ${errorMsg}${requiredHint}`;
  }).join('\n');
}

export class AgentLoop {
  private options: Omit<AgentLoopOptions, 'maxIterations' | 'onStep'> & {
    maxIterations: number;
    onStep: (step: AgentLoopStep) => void;
    stream: boolean;
    verboseStreamLog: boolean;
  };
  private steps: AgentLoopStep[] = [];
  private contextBuffer?: ContextBuffer;
  private llmCaller: LLMCaller;

  constructor(options: AgentLoopOptions) {
    this.options = {
      maxIterations: options.maxIterations ?? 10,
      onStep: options.onStep ?? (() => { }),
      stream: options.stream ?? false,
      verboseStreamLog: options.verboseStreamLog ?? false,
      agent: options.agent,
      provider: options.provider,
      toolRegistry: options.toolRegistry,
      permissionChecker: options.permissionChecker,
      onPermissionRequired: options.onPermissionRequired,
      userSkills: options.userSkills,
      consciousnessState: options.consciousnessState
    };
    this.contextBuffer = options.contextBuffer;
    this.llmCaller = new LLMCaller({
      provider: options.provider,
      agent: options.agent,
      toolRegistry: options.toolRegistry,
      verboseStreamLog: options.verboseStreamLog
    });
  }

  /**
   * 运行主循环
   */
  private async runLoop(context: AgentContext, conversation: Conversation): Promise<AgentLoopResult> {
    const startIteration = context.iterations ?? 0;

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '=== RUNLOOP START DEBUG ===', {
      startIteration,
      maxIterations: this.options.maxIterations,
      contextMessageCount: context.messages.length,
      conversationMessageCount: conversation.messages.length,
      lastMessage: conversation.messages.length > 0
        ? {
            role: conversation.messages[conversation.messages.length - 1].role,
            contentPreview: conversation.messages[conversation.messages.length - 1].content.slice(0, 150).replace(/\n/g, '\\n')
          }
        : null
    });

    // 守护意识工具约束状态
    let guardianAllowedTools: string[] | null = null;
    const isGuardian = this.options.consciousnessState?.level === 'self_awareness';

    for (let i = startIteration; i < this.options.maxIterations; i++) {
      context.iterations = i + 1;
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Iteration ${i + 1}/${this.options.maxIterations} started`);

      // Phase 2: 调用 LLM
      const response = this.options.stream
        ? await this.llmCaller.callStream(context.messages, guardianAllowedTools, i + 1, (delta) => {
            const deltaStep: AgentLoopStep = { iteration: i + 1, phase: 'action', content: delta };
            this.addStep(deltaStep);
            this.options.onStep(deltaStep);
          })
        : await this.llmCaller.call(context.messages, guardianAllowedTools, i + 1);

      const content = response.content || '';

      // 记录 thinking step（非流式模式）
      if (!this.options.stream) {
        const thinkStep: AgentLoopStep = { iteration: i + 1, phase: 'action', thinking: content };
        this.addStep(thinkStep);
        this.options.onStep(thinkStep);
      }

      // 更新 token 使用量
      if (response.usage) {
        updateTokenUsage(conversation, response.usage);
      }

      // Phase 3: 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Processing ${response.toolCalls.length} tool calls`);

        // 权限检查
        const permissionResult = await this.checkPermissions(response.toolCalls);
        if (permissionResult === 'denied') {
          return { success: false, error: '权限被拒绝', steps: [...this.steps], iterations: i + 1, terminatedReason: 'error' };
        }
        if (permissionResult === 'no_callback') {
          return { success: false, error: '需要权限确认但未提供回调', steps: [...this.steps], iterations: i + 1, terminatedReason: 'error' };
        }
        if (permissionResult === 'rejected') {
          return { success: false, error: '用户拒绝了权限请求', steps: [...this.steps], iterations: i + 1, terminatedReason: 'error' };
        }

        // 执行工具前 step 通知
        for (const toolCall of response.toolCalls) {
          const preStep: AgentLoopStep = {
            iteration: i + 1, phase: 'action',
            content: `调用工具: ${toolCall.name}`,
            toolCall: { name: toolCall.name, parameters: toolCall.parameters }
          };
          this.addStep(preStep);
          this.options.onStep(preStep);
        }

        const toolResult = await this.executeToolCalls(response.toolCalls);

        // 执行工具后 step 通知
        for (const result of toolResult) {
          const postStep: AgentLoopStep = {
            iteration: i + 1, phase: 'verify',
            content: result.success ? `${result.toolCall.name} 执行成功` : `${result.toolCall.name} 执行失败: ${result.error}`,
            toolResult: { success: result.success, data: result.data, error: result.error }
          };
          this.addStep(postStep);
          this.options.onStep(postStep);
        }

        // 守护意识状态机
        if (isGuardian) {
          if (toolResult.some(r => r.toolCall.name === 'dispatch_task')) {
            guardianAllowedTools = ['analyze_turn'];
          }
          if (toolResult.some(r => r.toolCall.name === 'analyze_turn')) {
            guardianAllowedTools = [];
          }
        }

        // 添加助手消息（始终添加，避免连续 user 消息）
        const assistantContent = content && content.trim()
          ? content
          : `[执行工具: ${response.toolCalls!.map(tc => tc.name).join(', ')}]`;
        context.messages.push({ role: 'assistant', content: assistantContent });
        addMessage(conversation, { role: 'assistant', content: assistantContent });

        // 添加工具结果消息
        const toolResultMsg = `工具执行结果:\n${formatToolResults(toolResult, this.options.toolRegistry)}`;
        const toolNames = toolResult.map(r => r.toolCall.name);
        context.messages.push({ role: 'user', content: toolResultMsg });
        addMessage(conversation, { role: 'user', content: toolResultMsg, toolNames });

        // 记录工具结果到日志
        for (const r of toolResult) {
          const logData = r.success
            ? `${r.toolCall.name}: ${r.data ? JSON.stringify(r.data).slice(0, 500) : 'Success'}`
            : `${r.toolCall.name}: FAILED - ${r.error}`;
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[TOOL RESULT]', logData);
        }

        continue;
      }

      // 没有工具调用 - 最终回答
      if (content) {
        context.messages.push({ role: 'assistant', content });
        addMessage(conversation, { role: 'assistant', content });
      }

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'No tool calls, finalAnswer is empty (text sent via onStep)');
      return { success: true, finalAnswer: content || '', steps: [...this.steps], iterations: i + 1, terminatedReason: 'completed' };
    }

    // 达到最大迭代次数
    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Max iterations reached');
    return { success: false, steps: [...this.steps], iterations: this.options.maxIterations, terminatedReason: 'max_iterations', error: 'Maximum iterations reached without completion' };
  }

  /**
   * 执行一次用户请求
   */
  async execute(task: Task, conversation?: Conversation): Promise<AgentLoopResult & { conversation: Conversation }> {
    this.steps = [];

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Executing task', {
      taskId: task.id, description: task.description, hasConversation: !!conversation
    });

    try {
      if (!conversation) {
        conversation = createConversation({
          systemPrompt: this.buildSystemPrompt(),
          projectInfo: { rootPath: process.cwd(), name: 'project' }
        });
      }

      const context: AgentContext = {
        task,
        messages: getMessagesForLLM(conversation),
        memory: new Map(),
        iterations: 0,
        files: [],
        projectInfo: conversation.projectInfo,
        tokenUsage: { ...conversation.tokenUsage },
        experiences: []
      };

      context.messages.push({ role: 'user', content: task.description });
      addMessage(conversation, { role: 'user', content: task.description });
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[USER]', task.description);

      // 管理上下文窗口
      await manageContextWindow(conversation, async (prompt: string) => {
        const response = await this.options.provider.chat({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3, maxTokens: 1024
        });
        return response.content;
      });

      const result = await this.runLoop(context, conversation);
      conversation.totalIterations += result.iterations;

      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Task execution completed', {
        success: result.success, iterations: result.iterations, reason: result.terminatedReason
      });

      // 保存上下文快照
      if (this.contextBuffer) {
        const snapshot: ContextSnapshot = {
          timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
          taskId: task.id, description: task.description,
          messages: [...context.messages], iterations: result.iterations,
          success: result.success, terminatedReason: result.terminatedReason
        };

        if (!result.success || ContextBuffer.detectAnomaly(context.messages)) {
          const dumpPath = this.contextBuffer.dump(snapshot, 'anomaly');
          debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, '[CONTEXT DUMP]', { path: dumpPath, reason: 'anomaly detected' });
        } else {
          this.contextBuffer.push(snapshot);
        }
      }

      return { ...result, conversation };
    } catch (error) {
      debugError(NAMESPACE.AGENT_LOOP, 'Task execution failed', error);
      const fallbackConversation = conversation ?? createConversation({
        systemPrompt: this.buildSystemPrompt(),
        projectInfo: { rootPath: process.cwd(), name: 'project' }
      });
      return {
        success: false, steps: [...this.steps], iterations: this.steps.length,
        terminatedReason: 'error',
        error: error instanceof Error ? error.message : String(error),
        conversation: fallbackConversation
      };
    }
  }

  // === 工具执行 ===

  private async executeToolCalls(toolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }>): Promise<ToolExecResult[]> {
    const results: ToolExecResult[] = [];
    for (const toolCall of toolCalls) {
      try {
        const result = await this.options.toolRegistry.execute(toolCall.name, toolCall.parameters);
        results.push({ toolCall, success: result.success, data: result.data, error: result.error });
      } catch (error) {
        results.push({ toolCall, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  // === 权限检查 ===

  /** 权限检查结果：'ok' | 'denied' | 'no_callback' | 'rejected' | 'skip' */
  private async checkPermissions(toolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }>): Promise<string> {
    if (!this.options.permissionChecker) return 'ok';

    for (const toolCall of toolCalls) {
      const tool = this.options.toolRegistry.get(toolCall.name);
      const operation = tool?.permission?.operation ?? this.getOperationType(toolCall.name);

      const result = await this.options.permissionChecker.checkToolPermission(toolCall.name, operation as keyof import('@tramber/shared').ToolPermissions, toolCall.parameters);

      if (!result.allowed) return 'denied';

      if (result.requiresConfirmation) {
        if (!this.options.onPermissionRequired) return 'no_callback';

        const confirmed = await this.options.onPermissionRequired(
          toolCall, String(operation), result.reason
        );
        debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'User permission decision', { confirmed });
        if (!confirmed) return 'rejected';
      }
    }
    return 'ok';
  }

  private getOperationType(toolId: string): string {
    if (toolId.startsWith('read') || toolId.startsWith('get') || toolId === 'glob' || toolId === 'grep') return 'file_read';
    if (toolId.startsWith('write') || toolId.startsWith('create') || toolId.startsWith('edit')) return 'file_write';
    if (toolId.startsWith('delete') || toolId.startsWith('remove')) return 'file_delete';
    if (toolId.startsWith('rename') || toolId.startsWith('move')) return 'file_rename';
    return 'command_execute';
  }

  // === 系统提示词 ===

  buildSystemPrompt(): string {
    const cwd = process.cwd();
    const tools = this.options.toolRegistry.list();
    const toolList = tools.map(t => `- ${t.id}: ${t.description}`).join('\n');

    const skillsSection = this.options.userSkills?.length
      ? `\n### 已安装技能\n${this.options.userSkills.map(s => `- ${s.slug}: ${s.description}`).join('\n')}\n`
      : '';

    const platform = process.platform;
    const isWindows = platform === 'win32';
    const isMac = platform === 'darwin';
    const osInfo = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';
    const shellHint = isWindows
      ? '\n**注意**: 当前是 Windows 系统，shell 命令应使用 cmd 语法（如 `dir`、`type`、`copy`）\n- 列出目录: `dir` 或 `dir /s /b`（递归）\n- 显示文件内容: `type <file>`\n- 或使用 PowerShell: `powershell -Command "Get-ChildItem"`'
      : isMac
      ? '\n**注意**: 当前是 macOS 系统，shell 命令使用 bash/Unix 语法\n- 列出目录: `ls` 或 `ls -la`\n- 显示文件内容: `cat <file>`'
      : '\n**注意**: 当前是 Linux 系统，shell 命令使用 bash/Unix 语法\n- 列出目录: `ls` 或 `ls -la`\n- 显示文件内容: `cat <file>`';

    const infoPrompt = `## 工作环境
- 操作系统: ${osInfo}
- 当前目录: ${cwd}${shellHint}

## 重要：工具调用规范
- 调用工具时必须使用 tool_use 格式，不要在文本中描述工具调用
- 工具调用后系统会返回执行结果
- 不要在回复中写入工具名称和参数，系统会自动处理

## 工具与技能

### 内置工具
${toolList}

### 技能使用方法
技能是用户安装的扩展能力。使用步骤：
1. read_file 读取 \`.tramber/skills/<技能slug>/SKILL.md\` 查看用法
2. exec 执行脚本，例如 \`uv run .tramber/skills/<技能slug>/scripts/xxx.py\`

### 优先级
- 优先使用内置工具完成任务
- 内置工具无法完成时，才使用技能

## 工作准则
- 修改前先读取文件
- 优先 edit_file，创建新文件用 write_file
- 简洁回答，不重复已知信息
- 工具失败时分析错误并重试
${skillsSection}
`;

    if (this.options.consciousnessState) {
      return buildSelfAwarenessPrompt(infoPrompt, this.options.consciousnessState);
    }

    return `你是编程助手 ${this.options.agent.name}。\n\n${infoPrompt}`;
  }

  private addStep(step: AgentLoopStep): void {
    this.steps.push(step);
  }

  getSteps(): AgentLoopStep[] {
    return [...this.steps];
  }
}
