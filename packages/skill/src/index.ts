// packages/skill/src/index.ts
/**
 * @tramber/skill - Skill 加载、管理和提示词格式化
 */

export { SkillLoader } from './loader.js';
export { SkillRegistry } from './registry.js';
export { formatSkillsPrompt } from './formatter.js';
export type { SkillManifest, SkillDescription, SkillMeta, SkillState } from './types.js';
