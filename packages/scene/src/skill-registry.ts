// packages/scene/src/skill-registry.ts
/**
 * Skill Registry - 技能注册表
 *
 * 管理技能的注册、检索和执行
 */

import type { Skill, SkillExecutionResult, Experience } from '@tramber/shared';
import type { ToolRegistry } from '@tramber/tool';
import type { AgentLoop, AgentLoopOptions } from '@tramber/agent';
import type { AIProvider } from '@tramber/provider';

export interface SkillExecutionContext {
  skillId: string;
  inputs: Record<string, unknown>;
  workspacePath?: string;
}

export interface SkillExecutorOptions {
  agentLoopFactory: (options: AgentLoopOptions) => AgentLoop;
  toolRegistry: ToolRegistry;
  provider: AIProvider;
}

export interface SkillExecutionStats {
  skillId: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  lastExecutedAt?: Date;
  lastSuccessAt?: Date;
}

/**
 * Skill Registry - 管理技能的注册、检索和执行
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private experiences = new Map<string, Experience[]>();
  private stats = new Map<string, SkillExecutionStats>();

  constructor(private options: SkillExecutorOptions) {}

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ${skill.id} already registered`);
    }
    this.skills.set(skill.id, skill);

    // 初始化统计
    this.stats.set(skill.id, {
      skillId: skill.id,
      totalCount: 0,
      successCount: 0,
      failureCount: 0
    });
  }

  /**
   * 批量注册技能
   */
  registerSkills(skills: Skill[]): void {
    for (const skill of skills) {
      try {
        this.registerSkill(skill);
      } catch (err) {
        const error = err as Error;
        console.warn(`Failed to register skill ${skill.id}:`, error.message);
      }
    }
  }

  /**
   * 注销技能
   */
  unregisterSkill(skillId: string): void {
    this.skills.delete(skillId);
    this.stats.delete(skillId);
  }

  /**
   * 获取技能
   */
  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * 列出技能
   */
  listSkills(category?: string): Skill[] {
    const skills = Array.from(this.skills.values());
    if (category) {
      return skills.filter(s => s.category === category);
    }
    return skills;
  }

  /**
   * 添加经验
   */
  addExperience(experience: Experience): void {
    const key = `${experience.target}:${experience.targetId}`;
    const experiences = this.experiences.get(key) || [];
    experiences.push(experience);
    this.experiences.set(key, experiences);
  }

  /**
   * 获取经验
   */
  getExperiences(target: string, targetId: string): Experience[] {
    const key = `${target}:${targetId}`;
    return this.experiences.get(key) || [];
  }

  /**
   * 检索相关经验
   */
  async searchExperiences(query: string, target?: string, limit = 5): Promise<Experience[]> {
    const results: { experience: Experience; score: number }[] = [];

    for (const [, experiences] of this.experiences) {
      for (const experience of experiences) {
        // 过滤目标类型
        if (target && experience.target !== target) {
          continue;
        }

        // 计算相关性
        const relevance = this.calculateRelevance(query, experience);
        if (relevance > 0) {
          results.push({ experience, score: relevance });
        }
      }
    }

    // 按相关性排序
    results.sort((a, b) => b.score - a.score);

    // 返回前 N 个结果
    return results.slice(0, limit).map(r => r.experience);
  }

  /**
   * 计算查询与经验的相关性
   */
  private calculateRelevance(query: string, experience: Experience): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // 检查标签匹配
    for (const tag of experience.tags) {
      if (tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())) {
        score += 0.3;
      }
    }

    // 检查描述匹配
    if (experience.description.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }

    // 检查内容匹配
    const content = experience.content;
    if (content.problem?.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }
    if (content.solution?.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }

    // 考虑有效性评分
    if (experience.effectiveness) {
      score *= experience.effectiveness;
    }

    return Math.min(score, 1);
  }

  /**
   * 执行技能
   */
  async executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const skill = this.skills.get(context.skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill ${context.skillId} not found`
      };
    }

    // 更新统计
    const stats = this.stats.get(context.skillId)!;
    stats.totalCount++;
    stats.lastExecutedAt = new Date();

    // 检查先决条件
    if (skill.prerequisites && skill.prerequisites.length > 0) {
      const prereqCheck = await this.checkPrerequisites(skill.prerequisites);
      if (!prereqCheck.satisfied) {
        stats.failureCount++;
        return {
          success: false,
          error: `Prerequisites not satisfied: ${prereqCheck.missing?.join(', ')}`
        };
      }
    }

    try {
      // 加载相关经验
      const experiences = await this.searchExperiences(skill.description, 'skill', 3);

      // 创建任务
      const task = {
        id: `task-${Date.now()}`,
        description: skill.description,
        sceneId: skill.sceneId || 'coding',
        isComplete: false,
        inputs: { ...context.inputs, experiences }
      };

      // 创建 Agent
      const agent = {
        id: `agent-${skill.id}`,
        name: skill.name,
        description: skill.description,
        sceneId: skill.sceneId || 'coding',
        temperature: 0.7,
        maxTokens: 4096
      };

      // 创建 Agent Loop
      const agentLoop = this.options.agentLoopFactory({
        agent,
        provider: this.options.provider,
        toolRegistry: this.options.toolRegistry,
        maxIterations: 10
      });

      // 执行技能
      const loopResult = await agentLoop.execute(task);

      // 更新统计
      if (loopResult.success) {
        stats.successCount++;
        stats.lastSuccessAt = new Date();

        // 记录成功经验
        if (stats.successCount >= 1) {
          this.recordSuccessExperience(skill);
        }
      } else {
        stats.failureCount++;

        // 记录失败经验
        this.recordFailureExperience(skill, loopResult.error);
      }

      return {
        success: loopResult.success,
        output: loopResult.finalAnswer,
        steps: loopResult.steps
      };
    } catch (error) {
      stats.failureCount++;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 检查先决条件
   */
  private async checkPrerequisites(prerequisites: string[]): Promise<{
    satisfied: boolean;
    missing?: string[];
  }> {
    const missing: string[] = [];

    for (const prereq of prerequisites) {
      // 检查是否是工具依赖
      const hasTool = this.options.toolRegistry.get(prereq) !== undefined;
      if (!hasTool) {
        missing.push(prereq);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined
    };
  }

  /**
   * 记录成功经验
   */
  private recordSuccessExperience(skill: Skill): void {
    // 简化版：记录成功次数
    const existingExperiences = this.getExperiences('skill', skill.id);
    const successExp = existingExperiences.find(e => e.type === 'success');

    if (successExp) {
      successExp.frequency++;
      successExp.updatedAt = new Date();
    } else {
      this.addExperience({
        id: `exp-${skill.id}-success`,
        name: `Successful execution of ${skill.name}`,
        description: `Skill ${skill.name} executed successfully`,
        type: 'success',
        target: 'skill',
        targetId: skill.id,
        category: 'usage',
        content: {
          problem: '',
          solution: skill.description,
          keyPoints: []
        },
        tags: skill.tools || [],
        confidence: 0.8,
        frequency: 1,
        source: {
          type: 'ai_generated'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        relevance: () => 0.8
      });
    }
  }

  /**
   * 记录失败经验
   */
  private recordFailureExperience(skill: Skill, error?: string): void {
    const existingExperiences = this.getExperiences('skill', skill.id);
    const failureExp = existingExperiences.find(e => e.type === 'failure');

    if (failureExp) {
      failureExp.frequency++;
      failureExp.updatedAt = new Date();
    } else {
      this.addExperience({
        id: `exp-${skill.id}-failure`,
        name: `Failed execution of ${skill.name}`,
        description: `Skill ${skill.name} failed to execute`,
        type: 'failure',
        target: 'skill',
        targetId: skill.id,
        category: 'troubleshooting',
        content: {
          problem: error || 'Unknown error',
          solution: 'Retry or investigate error',
          keyPoints: []
        },
        tags: skill.tools || [],
        confidence: 0.5,
        frequency: 1,
        source: {
          type: 'ai_generated'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        relevance: () => 0.5
      });
    }
  }

  /**
   * 获取技能统计
   */
  getStats(skillId: string): SkillExecutionStats | undefined {
    return this.stats.get(skillId);
  }

  /**
   * 检查技能是否可以沉淀为 Routine
   * 条件：成功次数 >= 3 且成功率 >= 90%
   */
  canSolidifyToRoutine(skillId: string): boolean {
    const stats = this.stats.get(skillId);
    if (!stats) {
      return false;
    }

    const successRate = stats.totalCount > 0
      ? stats.successCount / stats.totalCount
      : 0;

    return stats.successCount >= 3 && successRate >= 0.9;
  }

  /**
   * 获取可沉淀的技能列表
   */
  getSolidifiableSkills(): string[] {
    const result: string[] = [];
    for (const [skillId] of this.skills) {
      if (this.canSolidifyToRoutine(skillId)) {
        result.push(skillId);
      }
    }
    return result;
  }
}
