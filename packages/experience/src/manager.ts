// packages/experience/src/manager.ts
/**
 * Experience Manager - 经验管理器
 *
 * 统一管理经验的记录、检索、更新和统计
 */

import type { Experience, ExperienceQuery, ExperienceStats, ExperienceTarget, ExperienceType, ExperienceCategory } from '@tramber/shared';
import type { ExperienceStorage } from './storage.js';
import type { ExperienceRetriever, RetrievalOptions } from './retrieval.js';

/**
 * Experience Manager
 */
export class ExperienceManager {
  private cache = new Map<string, Experience>();

  constructor(
    private storage: ExperienceStorage,
    private retriever: ExperienceRetriever
  ) {}

  /**
   * 记录经验
   */
  async record(experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>): Promise<Experience> {
    const now = new Date();
    const id = this.generateExperienceId(experience.target, experience.targetId, experience.type);

    const fullExperience: Experience = {
      ...experience,
      id,
      createdAt: now,
      updatedAt: now,
      relevance: (query: string) => this.retriever['calculateRelevance'](query, fullExperience)
    };

    // 保存到存储
    await this.storage.save(fullExperience);

    // 添加到缓存
    this.cache.set(id, fullExperience);

    // 更新检索器
    this.retriever.addExperience(fullExperience);

    return fullExperience;
  }

  /**
   * 批量记录经验
   */
  async recordBatch(target: ExperienceTarget, targetId: string, experiences: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Experience[]> {
    const batch = {
      target,
      targetId,
      experiences
    };

    await this.storage.saveBatch(batch);

    const results: Experience[] = [];
    for (const exp of experiences) {
      const fullExperience: Experience = {
        ...exp,
        id: this.generateExperienceId(target, targetId, exp.type),
        createdAt: new Date(),
        updatedAt: new Date(),
        relevance: () => 0
      };
      this.cache.set(fullExperience.id, fullExperience);
      this.retriever.addExperience(fullExperience);
      results.push(fullExperience);
    }

    return results;
  }

  /**
   * 检索经验
   */
  async search(query: ExperienceQuery, options?: RetrievalOptions): Promise<Experience[]> {
    const results = await this.retriever.query(query, options);
    return results.map(r => r.experience);
  }

  /**
   * 获取经验
   */
  async get(experienceId: string): Promise<Experience | null> {
    // 先查缓存
    if (this.cache.has(experienceId)) {
      return this.cache.get(experienceId)!;
    }

    // 查存储
    const experience = await this.storage.load(experienceId);
    if (experience) {
      this.cache.set(experienceId, experience);
    }

    return experience;
  }

  /**
   * 按目标获取经验
   */
  async getByTarget(target: ExperienceTarget, targetId?: string): Promise<Experience[]> {
    return this.retriever.getByTarget(target, targetId);
  }

  /**
   * 按类别获取经验
   */
  async getByCategory(category: ExperienceCategory, target?: ExperienceTarget): Promise<Experience[]> {
    return this.retriever.getByCategory(category, target);
  }

  /**
   * 按类型获取经验
   */
  async getByType(type: ExperienceType, target?: ExperienceTarget): Promise<Experience[]> {
    return this.retriever.getByType(type, target);
  }

  /**
   * 获取最常用的经验
   */
  async getMostUsed(limit = 10, target?: ExperienceTarget): Promise<Experience[]> {
    return this.retriever.getMostUsed(limit, target);
  }

  /**
   * 获取最有效的经验
   */
  async getMostEffective(limit = 10, minFrequency = 2, target?: ExperienceTarget): Promise<Experience[]> {
    return this.retriever.getMostEffective(limit, minFrequency, target);
  }

  /**
   * 更新经验有效性
   */
  async updateEffectiveness(experienceId: string, feedback: 'positive' | 'negative' | 'neutral'): Promise<void> {
    const experience = await this.get(experienceId);
    if (!experience) {
      return;
    }

    // 更新有效性评分
    const currentEffectiveness = experience.effectiveness ?? 0.5;
    let newEffectiveness = currentEffectiveness;

    switch (feedback) {
      case 'positive':
        newEffectiveness = Math.min(1, currentEffectiveness + 0.1);
        break;
      case 'negative':
        newEffectiveness = Math.max(0, currentEffectiveness - 0.2);
        break;
      case 'neutral':
        // 中性反馈稍微降低
        newEffectiveness = Math.max(0, currentEffectiveness - 0.05);
        break;
    }

    experience.effectiveness = newEffectiveness;
    experience.lastUsedAt = new Date();
    experience.updatedAt = new Date();

    await this.storage.update(experienceId, { effectiveness: newEffectiveness, lastUsedAt: experience.lastUsedAt });
    this.cache.set(experienceId, experience);
  }

  /**
   * 更新使用频率
   */
  async incrementFrequency(experienceId: string): Promise<void> {
    const experience = await this.get(experienceId);
    if (!experience) {
      return;
    }

    experience.frequency++;
    experience.lastUsedAt = new Date();
    experience.updatedAt = new Date();

    await this.storage.update(experienceId, { frequency: experience.frequency, lastUsedAt: experience.lastUsedAt });
    this.cache.set(experienceId, experience);
  }

  /**
   * 获取统计数据
   */
  async getStats(target: ExperienceTarget, targetId: string): Promise<ExperienceStats> {
    const experiences = await this.getByTarget(target, targetId);

    const byType: Record<ExperienceType, number> = {
      success: 0,
      failure: 0,
      pattern: 0,
      'anti-pattern': 0
    };

    const byCategory: Record<string, number> = {};
    let totalEffectiveness = 0;
    let effectiveCount = 0;

    for (const exp of experiences) {
      byType[exp.type]++;
      byCategory[exp.category] = (byCategory[exp.category] || 0) + 1;

      if (exp.effectiveness !== undefined) {
        totalEffectiveness += exp.effectiveness;
        effectiveCount++;
      }
    }

    return {
      target,
      targetId,
      totalExperiences: experiences.length,
      byType,
      byCategory,
      averageEffectiveness: effectiveCount > 0 ? totalEffectiveness / effectiveCount : 0,
      mostUsed: await this.getMostUsed(5, target)
    };
  }

  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<void> {
    this.cache.clear();
    const all = await this.storage.listAll();
    for (const exp of all) {
      this.cache.set(exp.id, exp);
    }
    this.retriever.updateExperiences(all);
  }

  /**
   * 生成 Experience ID
   */
  private generateExperienceId(target: ExperienceTarget, targetId: string, type: ExperienceType): string {
    return `${target}-${targetId}-${type}-${Date.now()}`;
  }
}
