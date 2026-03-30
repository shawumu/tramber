#!/usr/bin/env node
/**
 * tramber-server CLI 入口
 *
 * 用法：
 *   tramber-server
 *   tramber-server --port 4000
 *   tramber-server --host 127.0.0.1
 */

import { TramberServer } from '../dist/server.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const port = getArg('--port') ? parseInt(getArg('--port')!) : undefined;
const host = getArg('--host');

const server = new TramberServer({ port, host });

async function main() {
  try {
    await server.start();
    console.log(`Tramber Server running at http://${host ?? '0.0.0.0'}:${port ?? 3100}`);

    // 优雅退出
    const shutdown = async () => {
      console.log('\nShutting down...');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
