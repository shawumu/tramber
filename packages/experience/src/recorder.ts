// packages/experience/src/recorder.ts
/**
 * Experience Recorder - 自动记录触发器
 *
 * 在特定事件发生时自动记录经验
 */

import type { Experience, ExperienceTarget, ExperienceType, ExperienceCategory } from '@tramber/shared';
import type { ExperienceManager } from './manager.js';

export interface RecorderOptions {
  /** 是否自动记录成功 */
  recordSuccess?: boolean;
  /** 是否自动记录失败 */
  recordFailure?: boolean;
  /** 最小记录间隔（毫秒） */
  minRecordInterval?: number;
}

export interface RecordContext {
  target: ExperienceTarget;
  targetId: string;
  category: ExperienceCategory;
  tags: string[];
  problem?: string;
  solution?: string;
  codeExample?: string;
}

/**
 * Experience 自动记录器
 */
export class ExperienceRecorder {
  private lastRecordTime = new Map<string, number>();

  constructor(
    private manager: ExperienceManager,
    private options: RecorderOptions = {}
  ) {
    this.options = {
      recordSuccess: true,
      recordFailure: true,
      minRecordInterval: 5000,
      ...options
    };
  }

  /**
   * 记录成功经验
   */
  async recordSuccess(context: RecordContext, additionalData?: Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'target' | 'targetId' | 'category' | 'tags'>>): Promise<Experience | null> {
    if (!this.options.recordSuccess) {
      return null;
    }

    const key = `${context.target}:${context.targetId}:success`;
    if (!this.shouldRecord(key)) {
      return null;
    }

    const experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Success: ${context.targetId}`,
      description: context.solution || 'Operation completed successfully',
      type: 'success',
      target: context.target,
      targetId: context.targetId,
      category: context.category,
      content: {
        problem: context.problem || '',
        solution: context.solution || 'Success',
        keyPoints: [],
        codeExample: context.codeExample,
        bestPractices: additionalData?.content?.bestPractices
      },
      tags: context.tags,
      confidence: 0.9,
      frequency: 1,
      source: {
        type: 'ai_generated'
      },
      relevance: () => 0.9,
      ...additionalData
    };

    this.markRecorded(key);
    return this.manager.record(experience);
  }

  /**
   * 记录失败经验
   */
  async recordFailure(context: RecordContext, error: string | Error, additionalData?: Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'target' | 'targetId' | 'category' | 'tags'>>): Promise<Experience | null> {
    if (!this.options.recordFailure) {
      return null;
    }

    const key = `${context.target}:${context.targetId}:failure`;
    if (!this.shouldRecord(key)) {
      return null;
    }

    const errorMessage = typeof error === 'string' ? error : error.message;

    const experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Failure: ${context.targetId}`,
      description: `Operation failed: ${errorMessage}`,
      type: 'failure',
      target: context.target,
      targetId: context.targetId,
      category: context.category,
      content: {
        problem: context.problem || errorMessage,
        solution: context.solution || 'Retry with different parameters',
        errorPattern: errorMessage,
        errorSolution: context.solution,
        keyPoints: []
      },
      tags: [...context.tags, 'error', 'failure'],
      confidence: 0.7,
      frequency: 1,
      source: {
        type: 'ai_generated'
      },
      relevance: () => 0.7,
      ...additionalData
    };

    this.markRecorded(key);
    return this.manager.record(experience);
  }

  /**
   * 记录模式经验
   */
  async recordPattern(context: RecordContext, pattern: string, additionalData?: Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'target' | 'targetId' | 'category' | 'tags'>>): Promise<Experience | null> {
    const key = `${context.target}:${context.targetId}:pattern:${pattern}`;
    if (!this.shouldRecord(key)) {
      return null;
    }

    const experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Pattern: ${pattern}`,
      description: `Discovered pattern: ${pattern}`,
      type: 'pattern',
      target: context.target,
      targetId: context.targetId,
      category: context.category,
      content: {
        problem: context.problem || '',
        solution: pattern,
        keyPoints: [pattern],
        codeExample: context.codeExample
      },
      tags: [...context.tags, 'pattern'],
      confidence: 0.8,
      frequency: 1,
      source: {
        type: 'ai_generated'
      },
      relevance: () => 0.8,
      ...additionalData
    };

    this.markRecorded(key);
    return this.manager.record(experience);
  }

  /**
   * 记录反模式经验
   */
  async recordAntiPattern(context: RecordContext, antiPattern: string, additionalData?: Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'target' | 'targetId' | 'category' | 'tags'>>): Promise<Experience | null> {
    const key = `${context.target}:${context.targetId}:anti-pattern:${antiPattern}`;
    if (!this.shouldRecord(key)) {
      return null;
    }

    const experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Anti-Pattern: ${antiPattern}`,
      description: `Avoid anti-pattern: ${antiPattern}`,
      type: 'anti-pattern',
      target: context.target,
      targetId: context.targetId,
      category: context.category,
      content: {
        problem: context.problem || antiPattern,
        solution: `Avoid: ${antiPattern}`,
        keyPoints: [`Avoid: ${antiPattern}`],
        caveats: [antiPattern]
      },
      tags: [...context.tags, 'anti-pattern', 'avoid'],
      confidence: 0.8,
      frequency: 1,
      source: {
        type: 'ai_generated'
      },
      relevance: () => 0.8,
      ...additionalData
    };

    this.markRecorded(key);
    return this.manager.record(experience);
  }

  /**
   * 记录配置经验
   */
  async recordConfiguration(context: RecordContext, config: Record<string, unknown>, additionalData?: Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'target' | 'targetId' | 'category' | 'tags'>>): Promise<Experience | null> {
    const key = `${context.target}:${context.targetId}:config`;
    if (!this.shouldRecord(key)) {
      return null;
    }

    const experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Configuration: ${context.targetId}`,
      description: 'Working configuration',
      type: 'pattern',
      target: context.target,
      targetId: context.targetId,
      category: 'configuration' as ExperienceCategory,
      content: {
        problem: context.problem || 'Configuration',
        solution: JSON.stringify(config, null, 2),
        keyPoints: [],
        configExample: JSON.stringify(config, null, 2)
      },
      tags: [...context.tags, 'configuration'],
      confidence: 0.8,
      frequency: 1,
      source: {
        type: 'ai_generated'
      },
      relevance: () => 0.8,
      ...additionalData
    };

    this.markRecorded(key);
    return this.manager.record(experience);
  }

  /**
   * 检查是否应该记录
   */
  private shouldRecord(key: string): boolean {
    const lastTime = this.lastRecordTime.get(key) ?? 0;
    const now = Date.now();
    return now - lastTime >= (this.options.minRecordInterval ?? 5000);
  }

  /**
   * 标记已记录
   */
  private markRecorded(key: string): void {
    this.lastRecordTime.set(key, Date.now());
  }

  /**
   * 清理旧的记录时间
   */
  cleanup(olderThan: number = Date.now() - 3600000): void {
    for (const [key, time] of this.lastRecordTime) {
      if (time < olderThan) {
        this.lastRecordTime.delete(key);
      }
    }
  }
}
