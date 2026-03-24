// packages/shared/src/types/permission.ts
/**
 * 权限控制相关类型定义
 */

import type { ToolCategory } from './tool.js';

/**
 * 权限级别
 */
export type PermissionLevel =
  | 'allow'      // 无需确认，直接执行
  | 'confirm'    // 每次执行前需要用户确认
  | 'deny'       // 禁止执行
  | 'readonly';  // 只读访问，禁止修改

/**
 * 权限值类型
 */
export type PermissionValue = PermissionLevel | boolean | string[];

/**
 * 操作类型权限
 */
export interface ToolPermissions {
  // 文件操作权限
  file_read?: PermissionValue;
  file_write?: PermissionValue;
  file_delete?: PermissionValue;
  file_rename?: PermissionValue;

  // 命令执行权限
  command_execute?: PermissionValue;
  command_dangerous?: PermissionValue;

  // 网络权限
  network_http?: PermissionValue;
  network_https?: PermissionValue;

  // 系统权限
  system_env?: PermissionValue;
  system_process?: PermissionValue;
}

/**
 * 沙箱配置
 */
export interface SandboxConfig {
  /** 是否启用沙箱 */
  enabled: boolean;
  /** 允许访问的路径 */
  allowedPaths: string[];
  /** 禁止访问的路径 */
  deniedPaths: string[];
  /** 禁止的命令模式 */
  deniedPatterns: string[];
  /** 最大文件大小 (bytes) */
  maxFileSize: number;
  /** 最大执行时间 (ms) */
  maxExecutionTime: number;
  /** 最大内存使用 (bytes) */
  maxMemoryUsage?: number;
}

/**
 * 权限声明
 */
export interface PermissionDeclaration {
  /** 权限级别 */
  level: 'safe' | 'dangerous' | 'critical';
  /** 所需权限 */
  requires: (keyof ToolPermissions)[];
  /** 如果未配置权限时的默认行为 */
  fallback?: PermissionLevel;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 建议的安全操作 */
  suggestion?: string;
}

/**
 * 路径访问检查结果
 */
export interface PathAccessResult {
  /** 是否允许访问 */
  allowed: boolean;
  /** 规范化后的路径 */
  normalizedPath?: string;
  /** 拒绝原因 */
  reason?: string;
}

/**
 * 命令安全检查结果
 */
export interface CommandSafetyResult {
  /** 是否安全 */
  safe: boolean;
  /** 匹配到的禁止模式 */
  matchedPattern?: string;
  /** 风险级别 */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}
