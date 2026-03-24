// packages/permission/src/checker.ts
/**
 * Permission Checker - 权限检查器
 *
 * 负责检查工具执行权限，包括：
 * - 按操作类型的权限检查
 * - 沙箱路径访问检查
 * - 命令安全检查
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type {
  PermissionLevel,
  PermissionValue,
  ToolPermissions,
  SandboxConfig,
  PermissionCheckResult,
  PathAccessResult,
  CommandSafetyResult
} from '@tramber/shared';

import type { PermissionConfig } from './config-loader.js';

export class PermissionChecker {
  constructor(private config: PermissionConfig) {}

  /**
   * 检查工具执行权限
   */
  async checkToolPermission(
    toolId: string,
    operation: keyof ToolPermissions,
    input?: unknown
  ): Promise<PermissionCheckResult> {
    const permission = this.config.toolPermissions[operation];

    // 未配置权限，使用默认策略
    if (permission === undefined) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `操作 ${operation} 未配置权限`,
        suggestion: '请在 settings.json 中配置 toolPermissions'
      };
    }

    // 处理不同类型的权限值
    if (typeof permission === 'boolean') {
      return {
        allowed: permission,
        requiresConfirmation: false,
        reason: permission ? undefined : `操作 ${operation} 被禁止`
      };
    }

    if (Array.isArray(permission)) {
      // 白名单模式
      if (input && typeof input === 'object') {
        const value = (input as Record<string, unknown>).command ||
                     (input as Record<string, unknown>).tool;
        if (typeof value === 'string') {
          const allowed = permission.some(allowedCmd => value.startsWith(allowedCmd));
          return {
            allowed,
            requiresConfirmation: false,
            reason: allowed ? undefined : `命令 "${value}" 不在白名单中`
          };
        }
      }
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: '需要提供具体命令进行白名单检查'
      };
    }

    // 字符串类型权限级别
    return this.checkPermissionLevel(permission as PermissionLevel, operation);
  }

  /**
   * 检查权限级别
   */
  private checkPermissionLevel(
    level: PermissionLevel,
    operation: keyof ToolPermissions
  ): PermissionCheckResult {
    switch (level) {
      case 'allow':
        return {
          allowed: true,
          requiresConfirmation: false
        };

      case 'confirm':
        return {
          allowed: true,
          requiresConfirmation: true
        };

      case 'deny':
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: `操作 ${operation} 被禁止`
        };

      case 'readonly':
        if (operation === 'file_read') {
          return {
            allowed: true,
            requiresConfirmation: false
          };
        }
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: '只读模式：不允许修改操作'
        };

      default:
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: `未知权限级别: ${level}`
        };
    }
  }

  /**
   * 检查路径访问权限
   */
  async checkPathAccess(filePath: string): Promise<PathAccessResult> {
    if (!this.config.sandbox.enabled) {
      return { allowed: true };
    }

    // 规范化路径
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(normalizedPath);

    // 检查是否在禁止路径中
    for (const deniedPath of this.config.sandbox.deniedPaths) {
      const deniedResolved = path.resolve(deniedPath);
      if (resolvedPath.startsWith(deniedResolved) || resolvedPath === deniedResolved) {
        return {
          allowed: false,
          normalizedPath: resolvedPath,
          reason: `路径 ${normalizedPath} 在禁止列表中`
        };
      }
    }

    // 检查是否在允许路径中
    if (this.config.sandbox.allowedPaths.length === 0) {
      return { allowed: true, normalizedPath: resolvedPath };
    }

    // 如果 allowedPaths 包含 "./"，则允许当前工作目录及其子目录
    const cwd = process.cwd();
    if (this.config.sandbox.allowedPaths.includes('./')) {
      if (resolvedPath.startsWith(cwd) || resolvedPath === cwd) {
        return { allowed: true, normalizedPath: resolvedPath };
      }
      return {
        allowed: false,
        normalizedPath: resolvedPath,
        reason: `路径 ${normalizedPath} 不在允许的工作目录范围内`
      };
    }

    for (const allowedPath of this.config.sandbox.allowedPaths) {
      const allowedResolved = path.resolve(allowedPath);
      if (resolvedPath.startsWith(allowedResolved) || resolvedPath === allowedResolved) {
        return { allowed: true, normalizedPath: resolvedPath };
      }
    }

    return {
      allowed: false,
      normalizedPath: resolvedPath,
      reason: `路径 ${normalizedPath} 不在允许列表中`
    };
  }

  /**
   * 检查命令安全性
   */
  checkCommandSafety(command: string): CommandSafetyResult {
    if (!this.config.sandbox.enabled) {
      return { safe: true };
    }

    // 检查是否匹配禁止模式
    for (const pattern of this.config.sandbox.deniedPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(command)) {
          return {
            safe: false,
            matchedPattern: pattern,
            riskLevel: this.getRiskLevel(pattern)
          };
        }
      } catch {
        // 正则表达式无效，跳过
        continue;
      }
    }

    return { safe: true };
  }

  /**
   * 获取风险级别
   */
  private getRiskLevel(pattern: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPatterns = ['rm -rf', 'del /q', 'format', 'mkfs', 'dd if='];
    const highPatterns = ['> /dev/', 'curl.*|.*sh', 'wget.*|.*sh'];

    if (criticalPatterns.some(p => pattern.includes(p))) {
      return 'critical';
    }
    if (highPatterns.some(p => pattern.includes(p))) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * 检查文件大小限制
   */
  async checkFileSize(filePath: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.sandbox.enabled) {
      return { allowed: true };
    }

    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.sandbox.maxFileSize) {
        return {
          allowed: false,
          reason: `文件大小 ${stats.size} 超过限制 ${this.config.sandbox.maxFileSize}`
        };
      }
      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  /**
   * 检查执行时间限制
   */
  createExecutionTimeout(): number {
    return this.config.sandbox.enabled
      ? this.config.sandbox.maxExecutionTime
      : Infinity;
  }
}
