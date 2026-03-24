// packages/permission/src/config-loader.ts
/**
 * Configuration Loader - 配置加载器
 *
 * 负责加载和验证 .tramber/settings.json 配置文件
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  PermissionValue,
  PermissionLevel,
  ToolPermissions,
  SandboxConfig
} from '@tramber/shared';

export interface PermissionConfig {
  toolPermissions: ToolPermissions;
  sandbox: SandboxConfig;
}

export interface SettingsConfig {
  toolPermissions?: {
    file_read?: unknown;
    file_write?: unknown;
    file_delete?: unknown;
    file_rename?: unknown;
    command_execute?: unknown;
    command_dangerous?: unknown;
    network_http?: unknown;
    network_https?: unknown;
    system_env?: unknown;
    system_process?: unknown;
  };
  sandbox?: {
    enabled?: unknown;
    allowedPaths?: unknown;
    deniedPaths?: unknown;
    deniedPatterns?: unknown;
    maxFileSize?: unknown;
    maxExecutionTime?: unknown;
    maxMemoryUsage?: unknown;
  };
}

export class ConfigLoader {
  private configPath: string;
  private cachedConfig: PermissionConfig | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, '.tramber', 'settings.json');
  }

  /**
   * 加载配置文件
   */
  async load(): Promise<PermissionConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(content) as SettingsConfig;

      this.cachedConfig = this.validateAndNormalize(rawConfig);
      return this.cachedConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 配置文件不存在，返回默认配置
        this.cachedConfig = this.getDefaultConfig();
        return this.cachedConfig;
      }
      throw error;
    }
  }

  /**
   * 验证并规范化配置
   */
  private validateAndNormalize(raw: SettingsConfig): PermissionConfig {
    return {
      toolPermissions: {
        file_read: this.normalizePermissionValue(raw.toolPermissions?.file_read ?? true),
        file_write: this.normalizePermissionValue(raw.toolPermissions?.file_write ?? 'confirm'),
        file_delete: this.normalizePermissionValue(raw.toolPermissions?.file_delete ?? false),
        file_rename: this.normalizePermissionValue(raw.toolPermissions?.file_rename ?? 'confirm'),
        command_execute: this.normalizePermissionValue(raw.toolPermissions?.command_execute ?? ['npm', 'git', 'ls', 'cat']),
        command_dangerous: this.normalizePermissionValue(raw.toolPermissions?.command_dangerous ?? 'deny'),
        network_http: this.normalizePermissionValue(raw.toolPermissions?.network_http ?? false),
        network_https: this.normalizePermissionValue(raw.toolPermissions?.network_https ?? 'confirm'),
        system_env: this.normalizePermissionValue(raw.toolPermissions?.system_env ?? 'readonly'),
        system_process: this.normalizePermissionValue(raw.toolPermissions?.system_process ?? false)
      },
      sandbox: {
        enabled: Boolean(raw.sandbox?.enabled ?? true),
        allowedPaths: this.normalizePaths(raw.sandbox?.allowedPaths ?? ['./']),
        deniedPaths: this.normalizePaths(raw.sandbox?.deniedPaths ?? [
          '~/.ssh',
          '~/.aws',
          '/etc',
          'C:\\Windows\\System32'
        ]),
        deniedPatterns: Array.isArray(raw.sandbox?.deniedPatterns)
          ? raw.sandbox.deniedPatterns
          : ['rm -rf', 'del /q', 'format', 'mkfs', 'dd if=', '> /dev/'],
        maxFileSize: this.normalizeNumber(raw.sandbox?.maxFileSize ?? 10485760),
        maxExecutionTime: this.normalizeNumber(raw.sandbox?.maxExecutionTime ?? 30000),
        maxMemoryUsage: raw.sandbox?.maxMemoryUsage
          ? this.normalizeNumber(raw.sandbox.maxMemoryUsage)
          : undefined
      }
    };
  }

  /**
   * 规范化权限值
   */
  private normalizePermissionValue(value: unknown): PermissionValue {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const validLevels: PermissionLevel[] = ['allow', 'confirm', 'deny', 'readonly'];
      if (validLevels.includes(value as PermissionLevel)) {
        return value as PermissionValue;
      }
      // 如果字符串不是有效级别，作为 deny 处理
      return 'deny';
    }
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return 'deny';
  }

  /**
   * 规范化路径数组
   */
  private normalizePaths(paths: unknown): string[] {
    if (Array.isArray(paths)) {
      return paths.map(p => String(p));
    }
    return [];
  }

  /**
   * 规范化数字
   */
  private normalizeNumber(value: unknown): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): PermissionConfig {
    return {
      toolPermissions: {
        file_read: true,
        file_write: 'confirm',
        file_delete: false,
        file_rename: 'confirm',
        command_execute: ['npm', 'git', 'ls', 'cat'],
        command_dangerous: 'deny',
        network_http: false,
        network_https: 'confirm',
        system_env: 'readonly',
        system_process: false
      },
      sandbox: {
        enabled: true,
        allowedPaths: ['./'],
        deniedPaths: [
          '~/.ssh',
          '~/.aws',
          '/etc',
          'C:\\Windows\\System32'
        ],
        deniedPatterns: ['rm -rf', 'del /q', 'format', 'mkfs', 'dd if=', '> /dev/'],
        maxFileSize: 10485760,
        maxExecutionTime: 30000
      }
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}
