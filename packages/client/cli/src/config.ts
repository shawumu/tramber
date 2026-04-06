// packages/client/cli/src/config.ts
/**
 * CLI 配置管理
 */

import { promises as fs } from 'fs';
import { join } from 'path';

export interface TramberConfig {
  /** API Key */
  apiKey?: string;
  /** Provider */
  provider?: 'anthropic' | 'openai' | 'gemini';
  /** Model */
  model?: string;
  /** API Base URL */
  baseURL?: string;
  /** 场景 */
  scene?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 是否启用 Experience */
  enableExperience?: boolean;
  /** 是否启用 Routine */
  enableRoutine?: boolean;
  /** 是否启用意识体模式（Stage 8） */
  enableConsciousness?: boolean;
}

export interface CliContext {
  config: TramberConfig;
  configPath: string;
  workspacePath: string;
}

const DEFAULT_CONFIG: TramberConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  scene: 'coding',
  maxIterations: 10,
  enableExperience: true,
  enableRoutine: true,
  enableConsciousness: true
};

/**
 * 加载配置文件
 */
export async function loadConfig(configPath: string): Promise<TramberConfig> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as TramberConfig;
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    // 配置文件不存在或无效，返回默认配置
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存配置文件
 */
export async function saveConfig(configPath: string, config: TramberConfig): Promise<void> {
  const dir = join(configPath, '..');
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

/**
 * 获取默认配置路径
 */
export function getDefaultConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return join(home, '.tramber', 'settings.json');
}

/**
 * 创建 CLI 上下文
 */
export async function createContext(options: {
  configPath?: string;
  workspacePath?: string;
}): Promise<CliContext> {
  const configPath = options.configPath ?? getDefaultConfigPath();
  const workspacePath = options.workspacePath ?? process.cwd();
  const config = await loadConfig(configPath);

  // 从环境变量覆盖配置
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    config.apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  }
  if (process.env.ANTHROPIC_MODEL) {
    config.model = process.env.ANTHROPIC_MODEL;
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    config.baseURL = process.env.ANTHROPIC_BASE_URL;
  }

  return {
    config,
    configPath,
    workspacePath
  };
}
