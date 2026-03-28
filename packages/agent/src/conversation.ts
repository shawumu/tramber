// packages/agent/src/conversation.ts
/**
 * Conversation - 对话数据对象
 *
 * 纯数据 + 工具函数，不依赖 AgentLoop 或 Engine。
 * 由 Client 创建和持有，传入 Engine 执行后返回更新后的实例。
 */

import type { Message, TokenUsage, ProjectInfo } from '@tramber/shared';
import { generateId } from '@tramber/shared';

export interface Conversation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  /** 系统提示词（创建时确定，后续不变） */
  systemPrompt: string;
  /** 对话消息历史 */
  messages: Message[];
  /** 累计 token 使用量 */
  tokenUsage: TokenUsage;
  /** 累计迭代次数 */
  totalIterations: number;
  /** 项目信息（创建时确定） */
  projectInfo: ProjectInfo;
  /** 上下文窗口管理配置 */
  contextWindow: {
    maxTokens: number;
    summaryThreshold: number;
    maxToolResults: number;
  };
  /** 是否已生成摘要 */
  hasSummary: boolean;
  /** 摘要内容 */
  summary?: string;
}

export interface ConversationOptions {
  systemPrompt: string;
  projectInfo: ProjectInfo;
  maxContextTokens?: number;
  summaryThreshold?: number;
  maxToolResults?: number;
}

/**
 * 创建新的 Conversation
 */
export function createConversation(options: ConversationOptions): Conversation {
  return {
    id: `conv-${generateId()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    systemPrompt: options.systemPrompt,
    messages: [],
    tokenUsage: { input: 0, output: 0, total: 0 },
    totalIterations: 0,
    projectInfo: options.projectInfo,
    contextWindow: {
      maxTokens: options.maxContextTokens ?? 128000,
      summaryThreshold: options.summaryThreshold ?? 20,
      maxToolResults: options.maxToolResults ?? 10
    },
    hasSummary: false
  };
}

/**
 * 添加消息到对话
 */
export function addMessage(conversation: Conversation, message: Message): void {
  conversation.messages.push(message);
  conversation.updatedAt = new Date();
}

/**
 * 获取发送给 LLM 的消息列表
 * 格式：system prompt + (summary) + history messages
 */
export function getMessagesForLLM(conversation: Conversation): Message[] {
  const result: Message[] = [];

  // 系统提示词
  result.push({ role: 'system', content: conversation.systemPrompt });

  // 如果有摘要，在系统提示词后插入
  if (conversation.hasSummary && conversation.summary) {
    result.push({ role: 'user', content: `[Previous conversation summary]\n${conversation.summary}` });
    result.push({ role: 'assistant', content: 'Understood, I have the context from our previous discussion. How can I help you?' });
  }

  // 历史消息
  for (const msg of conversation.messages) {
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

/**
 * 更新 token 使用量
 */
export function updateTokenUsage(conversation: Conversation, usage: Partial<TokenUsage>): void {
  if (usage.input !== undefined) conversation.tokenUsage.input += usage.input;
  if (usage.output !== undefined) conversation.tokenUsage.output += usage.output;
  conversation.tokenUsage.total = conversation.tokenUsage.input + conversation.tokenUsage.output;
}

/**
 * 估算当前 token 使用量（粗略：4 字符 ≈ 1 token）
 */
export function estimateTokens(conversation: Conversation): number {
  const systemPromptTokens = conversation.systemPrompt.length / 4;
  const messagesTokens = conversation.messages.reduce((sum, msg) => sum + msg.content.length / 4, 0);
  return Math.ceil(systemPromptTokens + messagesTokens);
}

/**
 * 检查是否需要管理上下文窗口
 */
export function needsContextManagement(conversation: Conversation): boolean {
  const estimated = estimateTokens(conversation);
  const threshold = conversation.contextWindow.maxTokens * 0.8; // 80% 时触发
  return estimated > threshold;
}

/**
 * 截断对话中的旧工具结果
 *
 * 策略：
 * - 保留最近 keepRecent 条消息完整不变
 * - 较早的工具结果消息：截断为摘要行（保留前 maxToolResultLines 行）
 * - 不修改系统提示词
 */
export function trimConversation(conversation: Conversation, keepRecent = 20, maxToolResultLines = 5): void {
  const messages = conversation.messages;
  if (messages.length <= keepRecent) {
    return;
  }

  // 找到需要截断的消息范围（排除最近 keepRecent 条）
  const trimEnd = messages.length - keepRecent;

  for (let i = 0; i < trimEnd; i++) {
    const msg = messages[i];
    // 工具结果消息以 "工具执行结果:" 开头
    if (msg.role === 'user' && msg.content.startsWith('工具执行结果:\n')) {
      const lines = msg.content.split('\n');
      if (lines.length > maxToolResultLines + 1) {
        // 保留标题行 + 前 N 行 + 截断标记
        const truncated = lines.slice(0, maxToolResultLines + 1).join('\n');
        messages[i] = {
          ...msg,
          content: truncated + `\n... (truncated ${lines.length - maxToolResultLines - 1} lines)`
        };
      }
    }
  }
}

/**
 * 使用 AI 生成对话摘要
 *
 * 将较早的消息发送给 LLM 生成摘要，替换原始消息。
 */
export async function summarizeConversation(
  conversation: Conversation,
  summarize: (prompt: string) => Promise<string>
): Promise<void> {
  if (conversation.messages.length <= conversation.contextWindow.summaryThreshold) {
    return;
  }

  // 取较早的消息生成摘要，保留最近的消息
  const splitPoint = Math.floor(conversation.messages.length * 0.6);
  const oldMessages = conversation.messages.slice(0, splitPoint);
  const recentMessages = conversation.messages.slice(splitPoint);

  // 构建摘要请求
  const conversationText = oldMessages
    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const prompt = `请将以下对话历史总结为简洁的摘要，保留关键决策、文件修改和当前任务状态。\n\n对话历史:\n${conversationText}\n\n请输出摘要:`;

  try {
    const summary = await summarize(prompt);

    // 更新 conversation
    conversation.summary = summary;
    conversation.hasSummary = true;
    conversation.messages = recentMessages;
    conversation.updatedAt = new Date();
  } catch {
    // 摘要生成失败，静默处理（保留原始消息）
  }
}

/**
 * 管理上下文窗口
 *
 * 按需执行截断和摘要：
 * 1. 先截断旧的工具结果
 * 2. 如果仍然超限，生成摘要替换旧消息
 */
export async function manageContextWindow(
  conversation: Conversation,
  summarize?: (prompt: string) => Promise<string>
): Promise<void> {
  if (!needsContextManagement(conversation)) {
    return;
  }

  // Step 1: 截断旧的工具结果
  trimConversation(conversation);

  // Step 2: 如果仍然超限且有 summarize 能力，生成摘要
  if (summarize && needsContextManagement(conversation)) {
    await summarizeConversation(conversation, summarize);
  }
}
