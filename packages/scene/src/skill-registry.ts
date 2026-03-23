// packages/scene/src/skill-registry.ts
/**
 * Skill Registry - 技能注册表
 *
 * 管理技能的注册、检索和执行
 */

import type { Skill, SkillExecutionResult, Experience } from '@tramber/shared';
import type { ToolRegistry } from '@tramber/tool';
import type { AgentLoop, AgentLoopOptions } from '@tramber/agent';

export interface SkillExecutionContext {
  skillId: string;
  inputs: Record<string, unknown>;
  workspacePath?: string;
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private experiences = new Map<string, Experience[]>();

  constructor(
    private agentLoopFactory: (options: AgentLoopOptions) => AgentLoop,
    private toolRegistry: ToolRegistry
  ) {}

  registerSkill(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ${skill.id} already registered`);
    }
    this.skills.set(skill.id, skill);
  }

  unregisterSkill(skillId: string): void {
    this.skills.delete(skillId);
  }

  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  listSkills(category?: string): Skill[] {
    const skills = Array.from(this.skills.values());
    if (category) {
      return skills.filter(s => s.category === category);
    }
    return skills;
  }

  addExperience(experience: Experience): void {
    const key = `${experience.target}:${experience.targetId}`;
    const experiences = this.experiences.get(key) || [];
    experiences.push(experience);
    this.experiences.set(key, experiences);
  }

  getExperiences(target: string, targetId: string): Experience[] {
    const key = `${target}:${targetId}`;
    return this.experiences.get(key) || [];
  }

  async executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const skill = this.skills.get(context.skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill ${context.skillId} not found`
      };
    }

    // 检查先决条件
    if (skill.prerequisites && skill.prerequisites.length > 0) {
      // TODO: 实现先决条件检查
    }

    try {
      // 创建任务
      const task = {
        id: `task-${Date.now()}`,
        description: skill.description,
        sceneId: skill.sceneId,
        isComplete: false,
        inputs: context.inputs
      };

      // 创建 Agent
      const agent = {
        id: `agent-${skill.id}`,
        name: skill.name,
        description: skill.description,
        sceneId: skill.sceneId
      };

      // 创建 Agent Loop
      const agentLoop = this.agentLoopFactory({
        agent,
        provider: null as any, // TODO: 从外部注入
        toolRegistry: this.toolRegistry,
        maxIterations: 10
      });

      // 执行技能
      const result = await agentLoop.execute(task);

      // 记录经验
      if (result.success) {
        // TODO: 记录成功的执行经验
      }

      return {
        success: result.success,
        output: result.finalAnswer,
        steps: result.steps
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async solidifyToRoutine(skillId: string, routineId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    // TODO: 实现 Skill 到 Routine 的固化
    // 1. 提取 Skill 的执行步骤
    // 2. 创建 Routine
    // 3. 保存 Routine
  }
}
