#!/usr/bin/env node
/**
 * Tramber CLI - Global Entry Point
 * 用于全局安装的独立入口
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 动态导入并执行CLI
const cliPath = join(__dirname, 'packages', 'client', 'cli', 'dist', 'cli.js');

import(cliPath).then((cli) => {
  // CLI会自动处理命令行参数
  process.on('unhandledRejection', (err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
});
