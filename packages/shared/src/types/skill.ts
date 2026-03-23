// packages/shared/src/types/skill.ts
/**
 * Skill 相关类型定义
 */

import type { Experience } from './experience.js';

export interface Skill {
  id: string;
  name: string;
  description: string;
  tools: string[];
  execute(input: SkillInput, context: SkillContext): Promise<SkillOutput>;
}

export interface SkillInput {
  [key: string]: unknown;
}

export interface SkillOutput {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface SkillContext {
  experiences: Experience[];
  queryExperience(query: string): Promise<Experience[]>;
}
