// packages/shared/src/types/scene.ts
/**
 * Scene 相关类型定义
 */

export type SceneCategory =
  | 'coding'
  | 'drawing'
  | 'video'
  | 'writing'
  | 'custom';

export type SceneType = 'builtin' | 'plugin' | 'dynamic' | 'named';

export interface Scene {
  id: string;
  name: string;
  description: string;
  category: SceneCategory;
  type: SceneType;
  workflow: Workflow;
  config: SceneConfig;
  stats: SceneStats;
  source?: SceneSource;
}

export interface SceneConfig {
  systemPrompt?: string;
  defaultProvider: string;
  defaultModel: string;
  recommendedClients: ClientType[];
  maxIterations?: number;
  enableCheckpoint?: boolean;
}

export interface SceneStats {
  totalExecutions: number;
  successCount: number;
  successRate: number;
  createdAt: Date;
  lastExecutedAt: Date;
}

export interface SceneSource {
  type: 'ai_generated' | 'user_created' | 'plugin_provided';
  originalPrompt?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  trigger: Trigger;
}

export interface WorkflowStep {
  type: 'workflow' | 'skill' | 'routine' | 'tool';
  id: string;
  name: string;
  parameters?: Record<string, unknown>;
}

export interface Trigger {
  type: 'manual' | 'automatic' | 'scheduled';
  schedule?: string;
}

export type ClientType = 'cli' | 'web' | 'telegram' | 'discord' | 'slack';
