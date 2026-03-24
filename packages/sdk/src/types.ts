// packages/sdk/src/types.ts
/**
 * SDK 类型定义
 */

import type { Task, Scene, Skill, Routine } from '@tramber/shared';

export interface TramberClientOptions {
  /** API Key */
  apiKey?: string;
  /** Provider */
  provider?: 'anthropic' | 'openai' | 'gemini';
  /** Model */
  model?: string;
  /** API Base URL (for custom endpoints like proxy) */
  baseURL?: string;
  /** 工作区路径 */
  workspacePath?: string;
  /** 配置文件路径 */
  configPath?: string;
  /** 是否启用 Experience */
  enableExperience?: boolean;
  /** 是否启用 Routine */
  enableRoutine?: boolean;
}

export interface ExecuteOptions {
  /** 场景 ID */
  sceneId?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 进度回调 */
  onProgress?: (progress: ProgressUpdate) => void;
  /** 权限确认回调 */
  onPermissionRequired?: (toolCall: { id: string; name: string; parameters: Record<string, unknown> }, operation: string) => Promise<boolean>;
}

export interface ProgressUpdate {
  type: 'step' | 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error';
  iteration?: number;
  content?: string;
  toolCall?: { name: string; parameters: Record<string, unknown> };
  toolResult?: { success: boolean; data?: unknown; error?: string };
  error?: string;
}

export interface TramberResponse {
  success: boolean;
  result?: unknown;
  steps?: ProgressUpdate[];
  error?: string;
}

export interface ListOptions {
  /** 类别过滤 */
  category?: string;
  /** 场景 ID 过滤 */
  sceneId?: string;
}
