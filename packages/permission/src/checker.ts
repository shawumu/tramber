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
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

export class PermissionChecker {
  constructor(private config: PermissionConfig) {
    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'PermissionChecker initialized', {
      sandboxEnabled: config.sandbox?.enabled,
      toolPermissionsCount: Object.keys(config.toolPermissions ?? {}).length
    });
  }

  /**
   * 检查工具执行权限
   */
  async checkToolPermission(
    toolId: string,
    operation: keyof ToolPermissions,
    input?: unknown
  ): Promise<PermissionCheckResult> {
    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.VERBOSE, 'Checking tool permission', {
      toolId,
      operation
    });

    const permission = this.config.toolPermissions[operation];

    // 未配置权限，使用默认策略
    if (permission === undefined) {
      debugError(NAMESPACE.PERMISSION_CHECKER, `Operation not configured: ${operation}`);
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `操作 ${operation} 未配置权限`,
        suggestion: '请在 settings.json 中配置 toolPermissions'
      };
    }

    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Permission config found', {
      operation,
      permissionType: typeof permission,
      permissionValue: Array.isArray(permission) ? `whitelist[${permission.length}]` : String(permission)
    });

    // 处理不同类型的权限值
    if (typeof permission === 'boolean') {
      const result = {
        allowed: permission,
        requiresConfirmation: false,
        reason: permission ? undefined : `操作 ${operation} 被禁止`
      };
      debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Boolean permission check result', {
        operation,
        allowed: result.allowed
      });
      return result;
    }

    if (Array.isArray(permission)) {
      // 白名单模式
      if (input && typeof input === 'object') {
        const value = (input as Record<string, unknown>).command ||
                     (input as Record<string, unknown>).tool;
        if (typeof value === 'string') {
          const inWhitelist = permission.some(allowedCmd => value.startsWith(allowedCmd));
          debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Whitelist permission check', {
            operation,
            command: value,
            inWhitelist,
            whitelistSize: permission.length
          });

          if (inWhitelist) {
            // 在白名单中，直接允许
            return {
              allowed: true,
              requiresConfirmation: false
            };
          } else {
            // 不在白名单中，请求用户确认
            debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Command not in whitelist: requesting user confirmation', {
              operation,
              command: value
            });
            return {
              allowed: true,  // 必须为 true 才会触发确认流程
              requiresConfirmation: true,
              reason: `命令 "${value}" 不在白名单中，需要用户确认`
            };
          }
        }
      }
      // 白名单检查失败时，请求用户确认
      debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Whitelist check failed: requesting user confirmation', {
        operation
      });
      return {
        allowed: true,  // 需要设置 allowed: true 才会触发确认
        requiresConfirmation: true,
        reason: `操作 ${operation} 不在白名单中，需要用户确认`
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
    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Checking permission level', {
      operation,
      level
    });

    switch (level) {
      case 'allow':
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Permission allowed', { operation });
        return {
          allowed: true,
          requiresConfirmation: false
        };

      case 'confirm':
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Permission requires confirmation', { operation });
        return {
          allowed: true,
          requiresConfirmation: true
        };

      case 'deny':
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Permission denied', { operation });
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: `操作 ${operation} 被禁止`
        };

      case 'readonly':
        if (operation === 'file_read') {
          debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Read operation allowed in readonly mode');
          return {
            allowed: true,
            requiresConfirmation: false
          };
        }
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Write operation denied in readonly mode', { operation });
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: '只读模式：不允许修改操作'
        };

      default:
        debugError(NAMESPACE.PERMISSION_CHECKER, `Unknown permission level: ${level}`);
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

    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.VERBOSE, 'Checking path access', { filePath });

    // 规范化路径
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(normalizedPath);

    // 检查是否在禁止路径中
    for (const deniedPath of this.config.sandbox.deniedPaths) {
      const deniedResolved = path.resolve(deniedPath);
      if (resolvedPath.startsWith(deniedResolved) || resolvedPath === deniedResolved) {
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Path access denied: in denied list', {
          filePath,
          deniedPath
        });
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
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Path access allowed: in working directory', {
          filePath
        });
        return { allowed: true, normalizedPath: resolvedPath };
      }
      debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Path access denied: not in working directory', {
        filePath,
        cwd
      });
      return {
        allowed: false,
        normalizedPath: resolvedPath,
        reason: `路径 ${normalizedPath} 不在允许的工作目录范围内`
      };
    }

    for (const allowedPath of this.config.sandbox.allowedPaths) {
      const allowedResolved = path.resolve(allowedPath);
      if (resolvedPath.startsWith(allowedResolved) || resolvedPath === allowedResolved) {
        debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Path access allowed: in allowed paths', {
          filePath,
          allowedPath
        });
        return { allowed: true, normalizedPath: resolvedPath };
      }
    }

    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Path access denied: not in allowed list', {
      filePath,
      allowedPaths: this.config.sandbox.allowedPaths
    });
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

    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.VERBOSE, 'Checking command safety', { command });

    // 检查是否匹配禁止模式
    for (const pattern of this.config.sandbox.deniedPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(command)) {
          const riskLevel = this.getRiskLevel(pattern);
          debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.BASIC, 'Command blocked: matched dangerous pattern', {
            command,
            pattern,
            riskLevel
          });
          return {
            safe: false,
            matchedPattern: pattern,
            riskLevel
          };
        }
      } catch {
        // 正则表达式无效，跳过
        continue;
      }
    }

    debug(NAMESPACE.PERMISSION_CHECKER, LogLevel.TRACE, 'Command safety check passed', { command });
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
