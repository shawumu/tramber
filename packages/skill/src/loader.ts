// packages/skill/src/loader.ts
/**
 * SkillLoader - 扫描 .tramber/skills/ 目录，解析 Skill
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { SkillManifest, SkillMeta, SkillDescription } from './types.js';

export class SkillLoader {
  constructor(private skillsDir: string) {}

  /** 扫描 skills 目录，加载所有 Skill */
  async loadAll(): Promise<SkillManifest[]> {
    const skills: SkillManifest[] = [];
    try {
      const entries = await readdir(this.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skill = await this.loadSkill(entry.name);
        if (skill) skills.push(skill);
      }
    } catch {
      // 目录不存在，静默跳过
    }
    return skills;
  }

  /** 加载单个 Skill */
  async loadSkill(slug: string): Promise<SkillManifest | null> {
    const skillDir = join(this.skillsDir, slug);
    const metaPath = join(skillDir, '_meta.json');
    const descPath = join(skillDir, 'SKILL.md');

    // 两个文件都必需
    try {
      await stat(metaPath);
    } catch {
      return null;
    }
    try {
      await stat(descPath);
    } catch {
      return null;
    }

    try {
      const metaRaw = await readFile(metaPath, 'utf-8');
      const meta: SkillMeta = JSON.parse(metaRaw);
      const descriptionRaw = await readFile(descPath, 'utf-8');
      const desc = this.parseDescription(descriptionRaw, slug);

      return {
        slug,
        dir: skillDir,
        name: meta.displayName || desc.name || slug,
        description: desc.description,
        descriptionRaw,
        version: meta.latest?.version,
        owner: meta.owner,
        enabled: true,
      };
    } catch {
      return null;
    }
  }

  /** 解析 SKILL.md 的 YAML frontmatter，提取 name 和 description */
  private parseDescription(raw: string, fallbackSlug: string): SkillDescription {
    const frontmatter = this.extractFrontmatter(raw);

    return {
      name: frontmatter.name || fallbackSlug,
      description: frontmatter.description || '',
      requires: frontmatter.metadata?.openclaw?.requires,
    };
  }

  /** 提取 YAML frontmatter（--- ... ---之间的内容） */
  extractFrontmatter(raw: string): Record<string, any> {
    if (!raw.startsWith('---')) return {};
    const end = raw.indexOf('---', 3);
    if (end === -1) return {};

    const yamlStr = raw.slice(3, end).trim();
    return this.parseSimpleYaml(yamlStr);
  }

  /** 极简 YAML 解析（只处理 skill 需要的字段，不用 yaml 库） */
  private parseSimpleYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    let currentKey = '';
    let currentObj: Record<string, any> | null = null;
    let inNested = false;

    for (const line of yaml.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 嵌套对象开始（如 metadata:）
      if (trimmed.endsWith(':') && !trimmed.includes(': ')) {
        const key = trimmed.slice(0, -1).trim();
        if (inNested && currentKey && currentObj) {
          result[currentKey] = currentObj;
        }
        currentKey = key;
        currentObj = {};
        inNested = true;
        continue;
      }

      // 键值对
      const match = trimmed.match(/^(\w[\w-]*):\s+(.+)$/);
      if (match) {
        const [, key, value] = match;
        const parsed = this.parseYamlValue(value);
        if (inNested && currentObj) {
          currentObj[key] = parsed;
        } else {
          result[key] = parsed;
        }
      }
    }

    if (inNested && currentKey && currentObj) {
      result[currentKey] = currentObj;
    }

    return result;
  }

  /** 解析 YAML 值（字符串、数字、布尔、JSON） */
  private parseYamlValue(value: string): any {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return trimmed; }
    }
    // 去除引号
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}
