// packages/routine/src/types.ts
/**
 * Routine 类型定义
 *
 * Routine 是从成功经验中固化而来的可重用流程
 */

import type { Routine, RoutineInput, RoutineOutput, RoutineStep, RoutineStats } from '@tramber/shared';

export type { Routine, RoutineInput, RoutineOutput, RoutineStep, RoutineStats };

/**
 * Routine 执行选项
 */
export interface RoutineExecuteOptions {
  inputs: RoutineInput;
  toolRegistry: import('@tramber/tool').ToolRegistry;
  onStep?: (step: RoutineStep, index: number) => void;
}

/**
 * Routine 执行状态
 */
export interface RoutineExecution {
  routineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep?: number;
  result?: RoutineOutput;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Routine 固化配置
 */
export interface RoutineSolidifyConfig {
  /** 固化条件：最小成功次数 */
  minSuccessCount: number;
  /** 固化条件：最小成功率 */
  minSuccessRate: number;
  /** 固化后是否禁用原 Skill */
  disableOriginalSkill?: boolean;
}
