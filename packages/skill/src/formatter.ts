// packages/skill/src/formatter.ts
/**
 * formatSkillsPrompt - 将 SkillManifest 列表格式化为系统提示词片段
 *
 * 只输出技能名称和描述（触发条件说明），不输出完整内容。
 * 详细用法需要在触发后读取 SKILL.md。
 */

import type { SkillManifest } from './types.js';

const MAX_DESC_LENGTH = 200;

/** 格式化 Skill 列表为系统提示词 */
export function formatSkillsPrompt(manifests: SkillManifest[]): string {
  if (manifests.length === 0) return '';

  const sections: string[] = [];

  for (const m of manifests) {
    // 截断过长的描述
    const desc = m.description.length > MAX_DESC_LENGTH
      ? m.description.slice(0, MAX_DESC_LENGTH) + '...'
      : m.description;

    sections.push(`- **${m.name}**: ${desc}`);
  }

  return `\n### 已安装技能\n` +
    sections.join('\n') +
    `\n\n使用技能前，先读取 \`.tramber/skills/<skill-name>/SKILL.md\` 了解详细用法。\n`;
}
