// packages/shared/src/logger.ts
/**
 * Global Logger - 全局日志系统
 *
 * 提供统一的日志接口，支持命名空间过滤和日志级别控制
 */

export enum LogLevel {
  ERROR = 'error',     // 仅错误
  BASIC = 'basic',     // 关键步骤 + 错误
  VERBOSE = 'verbose', // 详细信息
  TRACE = 'trace'      // 所有细节
}

export interface LoggerOptions {
  enabled?: boolean;
  level?: LogLevel;
  namespaces?: string[];  // 命名空间过滤，如 ['tramber:agent', 'tramber:tool']
  output?: 'console' | 'file' | 'callback';
  filePath?: string;
}

/** Debug 日志条目 */
export interface DebugLogEntry {
  timestamp: number;
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
}

/**
 * 命名空间规范：tramber:<module>[:<submodule>]
 */
export const NAMESPACE = {
  // CLI 层
  CLI: 'tramber:cli',
  CLI_CONFIG: 'tramber:cli:config',

  // SDK 层
  SDK: 'tramber:sdk',
  SDK_CLIENT: 'tramber:sdk:client',

  // Provider 层
  PROVIDER: 'tramber:provider',
  PROVIDER_ANTHROPIC: 'tramber:provider:anthropic',

  // Agent 层
  AGENT: 'tramber:agent',
  AGENT_LOOP: 'tramber:agent:loop',
  AGENT_CONVERSATION: 'tramber:agent:conversation',
  AGENT_CONTEXT: 'tramber:agent:context',

  // Tool 层
  TOOL: 'tramber:tool',
  TOOL_REGISTRY: 'tramber:tool:registry',
  TOOL_FILE: 'tramber:tool:file',
  TOOL_SEARCH: 'tramber:tool:search',
  TOOL_EXEC: 'tramber:tool:exec',

  // Permission 层
  PERMISSION: 'tramber:permission',
  PERMISSION_CHECKER: 'tramber:permission:checker',
  PERMISSION_CONFIG: 'tramber:permission:config',

  // Experience 层
  EXPERIENCE: 'tramber:experience',
  EXPERIENCE_STORAGE: 'tramber:experience:storage',
  EXPERIENCE_MANAGER: 'tramber:experience:manager',
  EXPERIENCE_RETRIEVER: 'tramber:experience:retriever',

  // Scene 层
  SCENE: 'tramber:scene',
  SCENE_MANAGER: 'tramber:scene:manager',
  SCENE_SKILL: 'tramber:scene:skill',

  // Routine 层
  ROUTINE: 'tramber:routine',
  ROUTINE_MANAGER: 'tramber:routine:manager',
  ROUTINE_SOLIDIFIER: 'tramber:routine:solidifier',
} as const;

export type NamespaceType = typeof NAMESPACE[keyof typeof NAMESPACE];

/**
 * 全局单例 Logger
 *
 * 支持命名空间，方便按模块过滤
 */
export class Logger {
  private static instance: Logger;
  private enabled: boolean;
  private level: LogLevel;
  private namespaces: Set<string>;
  private output: 'console' | 'file' | 'callback';
  private filePath?: string;
  /** 日志回调钩子，用于桥接到 Ink DebugPanel */
  onLog?: (entry: DebugLogEntry) => void;

  private constructor() {
    // 从环境变量读取配置
    const debugEnv = process.env.TRAMBER_DEBUG;
    this.enabled = debugEnv !== undefined && debugEnv !== 'false' && debugEnv !== '0';

    const levelEnv = process.env.TRAMBER_DEBUG_LEVEL;
    this.level = (levelEnv as LogLevel) ?? LogLevel.BASIC;

    const namespaceEnv = process.env.TRAMBER_DEBUG_NAMESPACES;
    this.namespaces = namespaceEnv
      ? new Set(namespaceEnv.split(',').map(n => n.trim()))
      : new Set();

    this.output = (process.env.TRAMBER_DEBUG_OUTPUT as 'console' | 'file') ?? 'console';
    this.filePath = process.env.TRAMBER_DEBUG_FILE;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 配置 Logger（用于 CLI 选项覆盖环境变量）
   */
  configure(options: LoggerOptions): void {
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    if (options.level !== undefined) {
      this.level = options.level;
    }
    if (options.namespaces !== undefined) {
      this.namespaces = new Set(options.namespaces);
    }
    if (options.output !== undefined) {
      this.output = options.output;
    }
    if (options.filePath !== undefined) {
      this.filePath = options.filePath;
    }
  }

  /**
   * 静态方法：记录 debug 日志
   *
   * @param namespace - 命名空间，如 'tramber:agent'
   * @param level - 日志级别
   * @param message - 消息
   * @param data - 附加数据
   */
  static debug(namespace: string, level: LogLevel, message: string, data?: unknown): void {
    Logger.getInstance().log(namespace, level, message, data);
  }

  /**
   * 静态方法：记录错误
   */
  static error(namespace: string, message: string, error?: Error | unknown): void {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error };
    Logger.debug(namespace, LogLevel.ERROR, message, errorData);
  }

  private log(namespace: string, level: LogLevel, message: string, data?: unknown): void {
    if (!this.enabled) return;
    if (!this.shouldLog(namespace, level)) return;

    // 触发回调（同步，调用方只做 array.push）
    this.onLog?.({
      timestamp: Date.now(),
      level,
      namespace,
      message,
      data
    });

    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const levelTag = this.levelTag(level);
    const fullMessage = `[${timestamp}] [${namespace}] ${levelTag} ${message}`;

    if (this.output === 'console') {
      console.error(fullMessage);
      if (data !== undefined) {
        console.error(JSON.stringify(data, null, 2));
      }
    } else if (this.output === 'file' && this.filePath) {
      const fs = require('fs');
      const content = data !== undefined
        ? `${fullMessage}\n${JSON.stringify(data, null, 2)}\n`
        : `${fullMessage}\n`;
      fs.appendFileSync(this.filePath, content);
    }
    // output === 'callback' 时仅走 onLog，不写 console/file
  }

  private shouldLog(namespace: string, level: LogLevel): boolean {
    // 检查命名空间过滤
    if (this.namespaces.size > 0 && !this.namespaces.has(namespace)) {
      return false;
    }

    // 检查级别
    const levels = [LogLevel.ERROR, LogLevel.BASIC, LogLevel.VERBOSE, LogLevel.TRACE];
    return levels.indexOf(level) <= levels.indexOf(this.level);
  }

  private levelTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '[ERROR]';
      case LogLevel.BASIC: return '[INFO]';
      case LogLevel.VERBOSE: return '[VERBOSE]';
      case LogLevel.TRACE: return '[TRACE]';
    }
  }
}

// 便捷函数
export function debug(namespace: string, level: LogLevel, message: string, data?: unknown): void {
  Logger.debug(namespace, level, message, data);
}

export function debugError(namespace: string, message: string, error?: Error | unknown): void {
  Logger.error(namespace, message, error);
}
