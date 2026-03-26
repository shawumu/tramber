// packages/agent/src/conversation-manager.ts
/**
 * ConversationManager - 管理对话状态
 *
 * 负责管理内存中的对话状态，不涉及持久化
 */

import type { AgentContext, Message } from '@tramber/shared';

export type ConversationState = 'idle' | 'running' | 'waiting_user';

export interface ConversationSession {
  state: ConversationState;
  messages: Message[];
  iterations: number;
  maxIterations: number;
}

export class ConversationManager {
  private currentSession: ConversationSession | null = null;

  /**
   * 开始一个新的对话会话
   */
  start(initialMessages: Message[], maxIterations: number = 10): ConversationSession {
    this.currentSession = {
      state: 'running',
      messages: [...initialMessages],
      iterations: 0,
      maxIterations
    };
    return this.currentSession;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): ConversationSession | null {
    return this.currentSession;
  }

  /**
   * 检查是否应该继续循环
   */
  shouldContinue(): boolean {
    if (!this.currentSession) return false;
    return (
      this.currentSession.state === 'running' &&
      this.currentSession.iterations < this.currentSession.maxIterations
    );
  }

  /**
   * 增加迭代计数
   */
  incrementIteration(): void {
    if (this.currentSession) {
      this.currentSession.iterations++;
    }
  }

  /**
   * 添加消息到历史
   */
  addMessage(message: Message): void {
    if (this.currentSession) {
      this.currentSession.messages.push(message);
    }
  }

  /**
   * 添加多条消息到历史
   */
  addMessages(messages: Message[]): void {
    if (this.currentSession) {
      this.currentSession.messages.push(...messages);
    }
  }

  /**
   * 获取所有消息
   */
  getMessages(): Message[] {
    return this.currentSession?.messages ?? [];
  }

  /**
   * 等待用户输入
   */
  waitForUser(): void {
    if (this.currentSession) {
      this.currentSession.state = 'waiting_user';
    }
  }

  /**
   * 标记会话为完成
   */
  complete(): void {
    if (this.currentSession) {
      this.currentSession.state = 'idle';
    }
  }

  /**
   * 获取当前迭代次数
   */
  getIterations(): number {
    return this.currentSession?.iterations ?? 0;
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.currentSession = null;
  }
}
