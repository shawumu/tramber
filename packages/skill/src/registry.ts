// packages/skill/src/registry.ts
/**
 * SkillRegistry - 管理已加载的 Skill（列表、启用/禁用、持久化）
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { SkillManifest, SkillState } from './types.js';

export class SkillRegistry {
  private skills = new Map<string, SkillManifest>();

  /** 批量加载 Skill */
  load(manifests: SkillManifest[]): void {
    for (const m of manifests) {
      this.skills.set(m.slug, m);
    }
  }

  /** 所有 Skill */
  list(): SkillManifest[] {
    return [...this.skills.values()];
  }

  /** 获取单个 */
  get(slug: string): SkillManifest | undefined {
    return this.skills.get(slug);
  }

  /** 仅启用的 */
  getEnabled(): SkillManifest[] {
    return this.list().filter(s => s.enabled);
  }

  /** 启用 */
  enable(slug: string): void {
    const skill = this.skills.get(slug);
    if (skill) skill.enabled = true;
  }

  /** 禁用 */
  disable(slug: string): void {
    const skill = this.skills.get(slug);
    if (skill) skill.enabled = false;
  }

  /** 从文件恢复启用状态 */
  async loadState(statePath: string): Promise<void> {
    try {
      const raw = await readFile(statePath, 'utf-8');
      const state: SkillState = JSON.parse(raw);
      for (const slug of state.disabled || []) {
        const skill = this.skills.get(slug);
        if (skill) skill.enabled = false;
      }
    } catch {
      // 状态文件不存在，全部保持 enabled
    }
  }

  /** 持久化启用状态 */
  async saveState(statePath: string): Promise<void> {
    const disabled = this.list()
      .filter(s => !s.enabled)
      .map(s => s.slug);
    const state: SkillState = { disabled };

    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }
}
