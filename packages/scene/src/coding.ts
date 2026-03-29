// packages/scene/src/coding.ts
/**
 * Coding Scene 固定配置
 *
 * MVP 阶段使用预定义的 Coding Scene 配置
 * 后续迭代将支持动态 Scene 创建
 */

import type { Scene, Workflow } from '@tramber/shared';

/**
 * Coding Scene 内置 Workflow
 */
const CODING_WORKFLOW: Workflow = {
  id: 'coding-workflow-default',
  name: 'Default Coding Workflow',
  description: 'Default workflow for coding tasks',
  steps: [
    {
      type: 'skill',
      id: 'gather-context',
      name: 'Gather Context',
      parameters: {
        includeFiles: true,
        includeStructure: true
      }
    },
    {
      type: 'skill',
      id: 'analyze-requirement',
      name: 'Analyze Requirement'
    },
    {
      type: 'skill',
      id: 'plan-action',
      name: 'Plan Action'
    },
    {
      type: 'skill',
      id: 'execute-changes',
      name: 'Execute Changes'
    },
    {
      type: 'skill',
      id: 'verify-results',
      name: 'Verify Results'
    }
  ],
  trigger: {
    type: 'manual'
  }
};

/**
 * Coding Scene 系统提示词
 */
const CODING_SYSTEM_PROMPT = `You are Tramber, an AI coding assistant.

Your role is to help users with programming tasks by:
1. Understanding their requirements
2. Gathering relevant context (reading files, understanding structure)
3. Planning appropriate actions
4. Executing changes using available tools
5. Verifying results

You have access to the following tools:
- read_file: Read file contents
- write_file: Write content to files
- edit_file: Make targeted edits to files
- glob: Search for files by pattern
- grep: Search for content within files
- bash: Execute shell commands

Guidelines:
- Always understand the full context before making changes
- Make minimal, focused changes
- Run tests when available to verify changes
- Explain what you're doing and why
- Handle errors gracefully and try alternative approaches`;

/**
 * Coding Scene 配置
 */
export const CODING_SCENE_CONFIG: Scene = {
  id: 'coding',
  name: 'Coding Scene',
  description: 'Scene for programming tasks including code reading, writing, debugging, and testing',
  category: 'coding',
  type: 'builtin',
  workflow: CODING_WORKFLOW,
  config: {
    systemPrompt: CODING_SYSTEM_PROMPT,
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    recommendedClients: ['cli', 'web'],
    maxIterations: 10,
    enableCheckpoint: false
  },
  stats: {
    totalExecutions: 0,
    successCount: 0,
    successRate: 1.0,
    createdAt: new Date(),
    lastExecutedAt: new Date()
  },
  source: {
    type: 'ai_generated'
  }
};

/**
 * 创建 Coding Scene
 */
export function createCodingScene(): Scene {
  return { ...CODING_SCENE_CONFIG };
}

/**
 * Coding Scene 推荐的 Tool 列表
 */
export const CODING_RECOMMENDED_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'glob',
  'grep',
  'bash'
];
