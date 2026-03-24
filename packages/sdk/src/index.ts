// packages/sdk/src/index.ts
/**
 * Tramber SDK - 统一客户端接口
 */

export * from './types.js';
export * from './client.js';

// 创建默认客户端实例
export { TramberClient } from './client.js';

// 便捷函数
import { TramberClient } from './client.js';

let defaultClient: TramberClient | null = null;

/**
 * 创建或获取默认客户端
 */
export function createClient(options?: import('./types.js').TramberClientOptions): TramberClient {
  if (!defaultClient) {
    defaultClient = new TramberClient(options);
  }
  return defaultClient;
}

/**
 * 执行任务 (使用默认客户端)
 */
export async function execute(description: string, options?: import('./types.js').ExecuteOptions) {
  const client = createClient();
  return client.execute(description, options);
}
