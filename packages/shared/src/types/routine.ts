// packages/shared/src/types/routine.ts
/**
 * Routine 相关类型定义
 */

export interface Routine {
  id: string;
  name: string;
  description: string;
  derivedFrom: string;
  steps: RoutineStep[];
  condition: RoutineCondition;
  stats: RoutineStats;
  execute(input: RoutineInput): Promise<RoutineOutput>;
}

export interface RoutineStep {
  toolId: string;
  action: string;
  parameters: Record<string, unknown>;
}

export interface RoutineCondition {
  trigger: {
    patterns?: string[];
    fileType?: string[];
  };
  validate?: (input: unknown) => boolean;
}

export interface RoutineStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

export interface RoutineInput {
  [key: string]: unknown;
}

export interface RoutineOutput {
  success: boolean;
  result?: unknown;
  error?: string;
}
