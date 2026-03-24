// packages/routine/src/solidify.ts
/**
 * Routine Solidify - Routine 沉淀逻辑
 *
 * 从成功经验中固化 Routine
 */

import type { Routine, RoutineStep, RoutineCondition, RoutineStats } from '@tramber/shared';
import type { RoutineSolidifyConfig } from './types.js';

/**
 * Skill 执行历史
 */
export interface SkillExecutionHistory {
  skillId: string;
  executions: Array<{
    timestamp: Date;
    success: boolean;
    steps: Array<{
      toolId: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
}

/**
 * 固化结果
 */
export interface SolidifyResult {
  success: boolean;
  routine?: Routine;
  error?: string;
}

/**
 * Routine 固化器
 */
export class RoutineSolidifier {
  private executionHistory = new Map<string, SkillExecutionHistory>();

  constructor(private config: RoutineSolidifyConfig = {
    minSuccessCount: 3,
    minSuccessRate: 0.9
  }) {}

  /**
   * 记录 Skill 执行
   */
  recordExecution(skillId: string, steps: Array<{ toolId: string; parameters: Record<string, unknown> }>, success: boolean): void {
    let history = this.executionHistory.get(skillId);
    if (!history) {
      history = {
        skillId,
        executions: []
      };
      this.executionHistory.set(skillId, history);
    }

    history.executions.push({
      timestamp: new Date(),
      success,
      steps
    });
  }

  /**
   * 检查是否可以固化
   */
  canSolidify(skillId: string): boolean {
    const history = this.executionHistory.get(skillId);
    if (!history) {
      return false;
    }

    const successfulExecutions = history.executions.filter(e => e.success);
    const successRate = history.executions.length > 0
      ? successfulExecutions.length / history.executions.length
      : 0;

    return successfulExecutions.length >= this.config.minSuccessCount &&
           successRate >= this.config.minSuccessRate;
  }

  /**
   * 固化 Routine
   */
  solidify(skillId: string, skillName: string, skillDescription: string): SolidifyResult {
    const history = this.executionHistory.get(skillId);
    if (!history) {
      return {
        success: false,
        error: `No execution history found for skill ${skillId}`
      };
    }

    if (!this.canSolidify(skillId)) {
      return {
        success: false,
        error: `Skill ${skillId} does not meet solidification criteria`
      };
    }

    // 提取成功的执行步骤
    const successfulExecutions = history.executions.filter(e => e.success);

    // 使用最近的成功执行作为模板
    const latestSuccess = successfulExecutions[successfulExecutions.length - 1];

    // 创建 Routine 步骤
    const steps: RoutineStep[] = latestSuccess.steps.map(step => ({
      toolId: step.toolId,
      action: 'execute',
      parameters: step.parameters
    }));

    // 创建触发条件
    const condition: RoutineCondition = {
      trigger: {
        patterns: [skillName.toLowerCase(), skillDescription.toLowerCase()]
      }
    };

    // 创建统计
    const stats: RoutineStats = {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 1.0
    };

    // 创建 Routine
    const routine: Routine = {
      id: `routine-${skillId}`,
      name: `${skillName} (Routine)`,
      description: `Solidified routine from ${skillName}`,
      derivedFrom: skillId,
      steps,
      condition,
      stats,
      execute: async (input) => {
        // 这个方法会在 RoutineManager 中被实际执行
        // 这里只是占位符
        return {
          success: true,
          result: input
        };
      }
    };

    return {
      success: true,
      routine
    };
  }

  /**
   * 批量固化可固化的 Skills
   */
  solidifyAll(skills: Array<{ id: string; name: string; description: string }>): Routine[] {
    const routines: Routine[] = [];

    for (const skill of skills) {
      if (this.canSolidify(skill.id)) {
        const result = this.solidify(skill.id, skill.name, skill.description);
        if (result.success && result.routine) {
          routines.push(result.routine);
        }
      }
    }

    return routines;
  }

  /**
   * 获取执行历史
   */
  getHistory(skillId: string): SkillExecutionHistory | undefined {
    return this.executionHistory.get(skillId);
  }

  /**
   * 清理旧历史记录
   */
  cleanupHistory(olderThan: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)): void {
    for (const [skillId, history] of this.executionHistory) {
      const filtered = history.executions.filter(e => e.timestamp >= olderThan);
      if (filtered.length === 0) {
        this.executionHistory.delete(skillId);
      } else {
        history.executions = filtered;
      }
    }
  }

  /**
   * 重置固化配置
   */
  updateConfig(config: Partial<RoutineSolidifyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RoutineSolidifyConfig {
    return { ...this.config };
  }
}
