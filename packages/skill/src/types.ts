// packages/skill/src/types.ts

/** SKILL.md YAML frontmatter 解析结果 */
export interface SkillDescription {
  name: string;
  description: string;
  requires?: { bins?: string[] };
}

/** 解析后的 Skill 清单（_meta.json + SKILL.md 合并） */
export interface SkillManifest {
  /** 目录名（唯一标识） */
  slug: string;
  /** Skill 目录绝对路径 */
  dir: string;
  /** 显示名称（displayName > frontmatter.name > slug） */
  name: string;
  /** 一句话描述 */
  description: string;
  /** SKILL.md 原始内容 */
  descriptionRaw: string;
  /** 版本号 */
  version?: string;
  /** 所有者 */
  owner?: string;
  /** 是否启用 */
  enabled: boolean;
}

/** _meta.json 结构 */
export interface SkillMeta {
  owner?: string;
  slug: string;
  displayName?: string;
  latest?: {
    version: string;
    publishedAt: number;
    commit: string;
  };
  history: unknown[];
}

/** 启用状态持久化文件结构 */
export interface SkillState {
  disabled: string[];
}
