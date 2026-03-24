// packages/experience/src/storage.ts
/**
 * Experience Storage - 经验文件存储
 *
 * 负责 Experience 的持久化存储
 */

import type { Experience, ExperienceBatch } from '@tramber/shared';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface ExperienceStorageOptions {
  /** 存储根目录 */
  rootPath: string;
  /** 是否自动创建目录 */
  autoCreate?: boolean;
}

/**
 * Experience 文件存储
 */
export class ExperienceStorage {
  private readonly experiencesDir: string;
  private readonly byTargetDir: string;

  constructor(private options: ExperienceStorageOptions) {
    this.experiencesDir = join(options.rootPath, '.tramber', 'experiences');
    this.byTargetDir = join(this.experiencesDir, 'by-target');

    if (options.autoCreate !== false) {
      this.ensureDirectories();
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.byTargetDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在，忽略错误
    }
  }

  /**
   * 保存单个 Experience
   */
  async save(experience: Experience): Promise<void> {
    const filePath = this.getExperiencePath(experience.id);
    const dir = join(filePath, '..');

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify(experience, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(`Failed to save experience ${experience.id}: ${error}`);
    }
  }

  /**
   * 批量保存 Experience
   */
  async saveBatch(batch: ExperienceBatch): Promise<void> {
    const dir = join(this.byTargetDir, batch.target, batch.targetId);

    try {
      await fs.mkdir(dir, { recursive: true });

      for (const exp of batch.experiences) {
        const experience: Experience = {
          id: `${batch.targetId}-${exp.type}-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...exp
        };
        await this.save(experience);
      }
    } catch (error) {
      throw new Error(`Failed to save experience batch: ${error}`);
    }
  }

  /**
   * 加载 Experience
   */
  async load(experienceId: string): Promise<Experience | null> {
    const filePath = this.getExperiencePath(experienceId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Experience;
    } catch (error) {
      return null;
    }
  }

  /**
   * 按目标加载 Experiences
   */
  async loadByTarget(target: string, targetId: string): Promise<Experience[]> {
    const dir = join(this.byTargetDir, target, targetId);

    try {
      const files = await fs.readdir(dir);
      const experiences: Experience[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(join(dir, file), 'utf-8');
          try {
            experiences.push(JSON.parse(content) as Experience);
          } catch {
            // 忽略解析错误
          }
        }
      }

      return experiences;
    } catch (error) {
      return [];
    }
  }

  /**
   * 列出所有 Experiences
   */
  async listAll(): Promise<Experience[]> {
    const experiences: Experience[] = [];

    try {
      const targets = await fs.readdir(this.byTargetDir);

      for (const target of targets) {
        const targetDir = join(this.byTargetDir, target);
        const targetIds = await fs.readdir(targetDir);

        for (const targetId of targetIds) {
          const exps = await this.loadByTarget(target, targetId);
          experiences.push(...exps);
        }
      }
    } catch (error) {
      // 目录可能不存在
    }

    return experiences;
  }

  /**
   * 删除 Experience
   */
  async delete(experienceId: string): Promise<boolean> {
    const filePath = this.getExperiencePath(experienceId);

    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 更新 Experience
   */
  async update(experienceId: string, updates: Partial<Experience>): Promise<boolean> {
    const existing = await this.load(experienceId);
    if (!existing) {
      return false;
    }

    const updated: Experience = {
      ...existing,
      ...updates,
      id: experienceId, // 确保 ID 不变
      updatedAt: new Date()
    };

    await this.save(updated);
    return true;
  }

  /**
   * 获取 Experience 文件路径
   */
  private getExperiencePath(experienceId: string): string {
    // ID 格式: {target}-{targetId}-{type}-{timestamp}
    const parts = experienceId.split('-');
    if (parts.length >= 3) {
      const target = parts[0];
      const targetId = parts[1];
      return join(this.byTargetDir, target, targetId, `${experienceId}.json`);
    }
    return join(this.experiencesDir, `${experienceId}.json`);
  }
}
