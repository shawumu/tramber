// packages/routine/src/manager.ts
/**
 * Routine Manager - Routine 管理器
 *
 * 负责 Routine 的注册、执行和管理
 */

import type { Routine, RoutineInput, RoutineOutput, RoutineStep, RoutineStats } from '@tramber/shared';
import type { ToolRegistry } from '@tramber/tool';
import type { RoutineExecuteOptions, RoutineExecution } from './types.js';

/**
 * Routine Manager
 */
export class RoutineManager {
  private routines = new Map<string, Routine>();
  private executions = new Map<string, RoutineExecution>();

  /**
   * 注册 Routine
   */
  registerRoutine(routine: Routine): void {
    if (this.routines.has(routine.id)) {
      throw new Error(`Routine ${routine.id} already registered`);
    }
    this.routines.set(routine.id, routine);
  }

  /**
   * 批量注册 Routine
   */
  registerRoutines(routines: Routine[]): void {
    for (const routine of routines) {
      try {
        this.registerRoutine(routine);
      } catch (err) {
        const error = err as Error;
        console.warn(`Failed to register routine ${routine.id}:`, error.message);
      }
    }
  }

  /**
   * 注销 Routine
   */
  unregisterRoutine(routineId: string): void {
    this.routines.delete(routineId);
  }

  /**
   * 获取 Routine
   */
  getRoutine(routineId: string): Routine | undefined {
    return this.routines.get(routineId);
  }

  /**
   * 列出所有 Routine
   */
  listRoutines(): Routine[] {
    return Array.from(this.routines.values());
  }

  /**
   * 列出指定来源的 Routine
   */
  listRoutinesBySource(sourceId: string): Routine[] {
    return this.listRoutines().filter(r => r.derivedFrom === sourceId);
  }

  /**
   * 检查 Routine 是否存在
   */
  hasRoutine(routineId: string): boolean {
    return this.routines.has(routineId);
  }

  /**
   * 执行 Routine
   */
  async executeRoutine(routineId: string, options: RoutineExecuteOptions): Promise<RoutineOutput> {
    const routine = this.routines.get(routineId);
    if (!routine) {
      return {
        success: false,
        error: `Routine ${routineId} not found`
      };
    }

    // 创建执行状态
    const execution: RoutineExecution = {
      routineId,
      status: 'running',
      startedAt: new Date()
    };
    this.executions.set(`${routineId}-${Date.now()}`, execution);

    try {
      // 验证输入
      if (routine.condition.validate && !routine.condition.validate(options.inputs)) {
        execution.status = 'failed';
        execution.error = 'Input validation failed';
        execution.completedAt = new Date();
        return {
          success: false,
          error: 'Input validation failed'
        };
      }

      // 执行步骤
      let lastResult: unknown = undefined;
      for (let i = 0; i < routine.steps.length; i++) {
        const step = routine.steps[i];

        // 通知步骤
        options.onStep?.(step, i);

        // 执行工具调用
        const toolResult = await options.toolRegistry.execute(step.toolId, step.parameters);

        if (!toolResult.success) {
          execution.status = 'failed';
          execution.error = toolResult.error;
          execution.completedAt = new Date();

          // 更新统计
          routine.stats.totalExecutions++;
          routine.stats.failureCount = routine.stats.totalExecutions - routine.stats.successCount;
          routine.stats.successRate = routine.stats.successCount / routine.stats.totalExecutions;

          return {
            success: false,
            error: `Step ${i} failed: ${toolResult.error}`
          };
        }

        lastResult = toolResult.data;
      }

      // 执行成功
      execution.status = 'completed';
      execution.result = {
        success: true,
        result: lastResult
      };
      execution.completedAt = new Date();

      // 更新统计
      routine.stats.totalExecutions++;
      routine.stats.successCount++;
      routine.stats.successRate = routine.stats.successCount / routine.stats.totalExecutions;

      return execution.result;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date();

      // 更新统计
      routine.stats.totalExecutions++;
      routine.stats.failureCount = routine.stats.totalExecutions - routine.stats.successCount;
      routine.stats.successRate = routine.stats.successCount / routine.stats.totalExecutions;

      return {
        success: false,
        error: execution.error
      };
    }
  }

  /**
   * 获取 Routine 统计
   */
  getStats(routineId: string): RoutineStats | undefined {
    return this.routines.get(routineId)?.stats;
  }

  /**
   * 获取所有执行记录
   */
  getExecutions(routineId?: string): RoutineExecution[] {
    const executions = Array.from(this.executions.values());
    if (routineId) {
      return executions.filter(e => e.routineId === routineId);
    }
    return executions;
  }

  /**
   * 清理旧的执行记录
   */
  cleanupExecutions(olderThan: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): void {
    for (const [key, execution] of this.executions) {
      if (execution.startedAt < olderThan) {
        this.executions.delete(key);
      }
    }
  }
}
