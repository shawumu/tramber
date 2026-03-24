// packages/experience/src/retrieval.ts
/**
 * Experience Retrieval - 经验检索策略
 *
 * 实现多种检索策略来找到相关经验
 */

import type { Experience, ExperienceQuery, ExperienceType, ExperienceTarget, ExperienceCategory } from '@tramber/shared';

export interface RetrievalOptions {
  /** 最大结果数量 */
  limit?: number;
  /** 最小相关性分数 */
  minRelevance?: number;
  /** 是否包含失效的经验 */
  includeInactive?: boolean;
}

export interface RetrievalResult {
  experience: Experience;
  score: number;
  matchReason: string[];
}

/**
 * 经验检索器
 */
export class ExperienceRetriever {
  constructor(private experiences: Experience[]) {}

  /**
   * 按查询检索
   */
  async query(query: ExperienceQuery, options: RetrievalOptions = {}): Promise<RetrievalResult[]> {
    const limit = options.limit ?? 10;
    const minRelevance = options.minRelevance ?? 0.3;

    let candidates = this.experiences;

    // 按目标类型过滤
    if (query.target) {
      candidates = candidates.filter(e => e.target === query.target);
    }

    // 按 targetId 过滤
    if (query.targetId) {
      candidates = candidates.filter(e => e.targetId === query.targetId);
    }

    // 按类别过滤
    if (query.category) {
      candidates = candidates.filter(e => e.category === query.category);
    }

    // 按类型过滤
    if (query.type) {
      candidates = candidates.filter(e => e.type === query.type);
    }

    // 计算相关性并排序
    const results: RetrievalResult[] = candidates
      .map(exp => ({
        experience: exp,
        score: this.calculateRelevance(query.text, exp),
        matchReason: this.getMatchReasons(query.text, exp)
      }))
      .filter(r => r.score >= minRelevance)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * 按目标检索
   */
  async getByTarget(target: ExperienceTarget, targetId?: string): Promise<Experience[]> {
    let results = this.experiences.filter(e => e.target === target);

    if (targetId) {
      results = results.filter(e => e.targetId === targetId);
    }

    return results.sort((a, b) => {
      // 按有效性和频率排序
      const aScore = (a.effectiveness ?? 0.5) * a.frequency;
      const bScore = (b.effectiveness ?? 0.5) * b.frequency;
      return bScore - aScore;
    });
  }

  /**
   * 按类别检索
   */
  async getByCategory(category: ExperienceCategory, target?: ExperienceTarget): Promise<Experience[]> {
    let results = this.experiences.filter(e => e.category === category);

    if (target) {
      results = results.filter(e => e.target === target);
    }

    return results.sort((a, b) => (b.effectiveness ?? 0.5) - (a.effectiveness ?? 0.5));
  }

  /**
   * 按类型检索
   */
  async getByType(type: ExperienceType, target?: ExperienceTarget): Promise<Experience[]> {
    let results = this.experiences.filter(e => e.type === type);

    if (target) {
      results = results.filter(e => e.target === target);
    }

    return results.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 获取最常用的经验
   */
  async getMostUsed(limit = 10, target?: ExperienceTarget): Promise<Experience[]> {
    let results = this.experiences;

    if (target) {
      results = results.filter(e => e.target === target);
    }

    return results
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * 获取最有效的经验
   */
  async getMostEffective(limit = 10, minFrequency = 2, target?: ExperienceTarget): Promise<Experience[]> {
    let results = this.experiences.filter(e => e.frequency >= minFrequency);

    if (target) {
      results = results.filter(e => e.target === target);
    }

    return results
      .sort((a, b) => (b.effectiveness ?? 0.5) - (a.effectiveness ?? 0.5))
      .slice(0, limit);
  }

  /**
   * 计算相关性分数
   */
  private calculateRelevance(query: string, experience: Experience): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // 标签匹配 (权重: 0.3)
    for (const tag of experience.tags) {
      if (tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())) {
        score += 0.3;
      }
    }

    // 描述匹配 (权重: 0.2)
    if (experience.description.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }

    // 内容匹配 (权重: 0.3)
    const content = experience.content;
    if (content.problem?.toLowerCase().includes(queryLower)) {
      score += 0.15;
    }
    if (content.solution?.toLowerCase().includes(queryLower)) {
      score += 0.15;
    }

    // 考虑有效性 (权重调整)
    const effectiveness = experience.effectiveness ?? 0.5;
    score *= effectiveness;

    // 考虑使用频率 (轻微权重)
    score *= (1 + Math.log(experience.frequency + 1) * 0.1);

    return Math.min(score, 1);
  }

  /**
   * 获取匹配原因
   */
  private getMatchReasons(query: string, experience: Experience): string[] {
    const queryLower = query.toLowerCase();
    const reasons: string[] = [];

    for (const tag of experience.tags) {
      if (tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())) {
        reasons.push(`tag: ${tag}`);
      }
    }

    if (experience.description.toLowerCase().includes(queryLower)) {
      reasons.push('description match');
    }

    const content = experience.content;
    if (content.problem?.toLowerCase().includes(queryLower)) {
      reasons.push('problem match');
    }
    if (content.solution?.toLowerCase().includes(queryLower)) {
      reasons.push('solution match');
    }

    return reasons;
  }

  /**
   * 更新经验列表
   */
  updateExperiences(experiences: Experience[]): void {
    this.experiences = experiences;
  }

  /**
   * 添加经验
   */
  addExperience(experience: Experience): void {
    this.experiences.push(experience);
  }

  /**
   * 移除经验
   */
  removeExperience(experienceId: string): void {
    this.experiences = this.experiences.filter(e => e.id !== experienceId);
  }
}
