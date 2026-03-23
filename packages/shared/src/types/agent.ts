// packages/shared/src/types/agent.ts
/**
 * Agent 相关类型定义
 */

import type { ToolResult } from './tool.js';
import type { Experience } from './experience.js';

export interface Task {
  id: string;
  description: string;
  sceneId: string;
  isComplete: boolean;
  result?: unknown;
  inputs?: Record<string, unknown>;
}

export interface AgentContext {
  messages: Message[];
  files: FileContent[];
  projectInfo: ProjectInfo;
  tokenUsage: TokenUsage;
  experiences: Experience[];
  task?: Task;
  memory?: Map<string, unknown>;
  iterations?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface FileContent {
  path: string;
  content: string;
  language?: string;
}

export interface ProjectInfo {
  rootPath: string;
  name: string;
  type?: 'node' | 'python' | 'rust' | 'go' | 'java';
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface ActionResult {
  toolCalls: ToolCall[];
  results: ToolResult[];
}

export interface Verification {
  success: boolean;
  errors?: string[];
  feedback?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  sceneId: string;
  temperature?: number;
  maxTokens?: number;
}
