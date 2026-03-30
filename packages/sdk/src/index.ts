// packages/sdk/src/index.ts
/**
 * Tramber SDK - 核心引擎接口
 */

export * from './types.js';
export { TramberEngine } from './engine.js';

// 创建默认引擎实例
import { TramberEngine } from './engine.js';

let defaultEngine: TramberEngine | null = null;

/**
 * 创建或获取默认引擎
 */
export function createEngine(options?: import('./types.js').TramberEngineOptions): TramberEngine {
  if (!defaultEngine) {
    defaultEngine = new TramberEngine(options);
  }
  return defaultEngine;
}

/**
 * 执行任务 (使用默认引擎)
 */
export async function execute(description: string, options?: import('./types.js').ExecuteOptions) {
  const engine = createEngine();
  return engine.execute(description, options);
}

/**
 * @deprecated 使用 TramberEngine 替代。Client 统一指代终端客户端（CLI/Web/VS 扩展等）
 */
export { TramberEngine as TramberClient } from './engine.js';
