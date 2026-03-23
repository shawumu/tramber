// packages/shared/src/index.ts
/**
 * Tramber Shared Package
 * 共享类型和工具
 */

// 导出所有类型
export * from './types/index.js';

// 工具函数
export function generateId(prefix: string = 'tramber'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// 常量
export const VERSION = '1.0.0' as const;
