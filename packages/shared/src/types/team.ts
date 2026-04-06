// packages/shared/src/types/team.ts
/**
 * 多智能体类型（预留）
 *
 * 当前先实现单智能体多层意识。多智能体通过以下类型预留扩展空间。
 * 每个智能体有完整的分层意识体 + 定制 scene + workflow 编排。
 */

/**
 * 智能体角色（预留）
 * 多智能体阶段：每个 agent 可定制 scene 和 workflow
 */
export type AgentRole =
  | 'supervisor'
  | 'planner'
  | 'builder'
  | 'reviewer'
  | 'tester'
  | 'researcher'
  | string;  // 允许自定义角色

/**
 * 智能体实例（预留）
 * 每个智能体有完整的分层意识体 + 定制 scene + workflow 编排
 */
export interface AgentInstance {
  id: string;
  name: string;
  role: AgentRole;
  /** 定制的 scene 配置 */
  sceneId: string;
  /** workflow 编排（预留） */
  workflowId?: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 智能体间关系（预留）
 */
export type AgentRelationType = 'supervisor' | 'reviewer' | 'collaborator';

export interface AgentRelation {
  superiorId: string;
  subordinateId: string;
  type: AgentRelationType;
}

/**
 * 智能体团队（预留）
 */
export interface AgentTeam {
  id: string;
  taskDescription: string;
  members: Map<string, AgentInstance>;
  relations: AgentRelation[];
  status: 'forming' | 'active' | 'completed' | 'failed';
}

/**
 * 团队消息（预留）
 */
export interface TeamMessage {
  id: string;
  fromId: string;
  toId: string;
  type: 'task_assignment' | 'result_report' | 'approval_request' | 'approval_response' | 'status_update';
  content: string;
  payload?: unknown;
  timestamp: string;
}
