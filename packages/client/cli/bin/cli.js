#!/usr/bin/env node
/**
 * Tramber CLI - Bin Entry Point
 * 处理workspace依赖解析的包装器
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readlinkSync } from 'fs';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 解析符号链接找到项目根目录
function findProjectRoot(startDir) {
  let currentDir = startDir;

  // 尝试解析符号链接
  try {
    const linked = readlinkSync(currentDir);
    currentDir = linked;
  } catch {
    // 不是符号链接，继续
  }

  // 向上查找包含packages目录的根目录
  let dir = resolve(currentDir);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'packages'))) {
      return dir;
    }
    dir = dirname(dir);
  }

  // 如果找不到，返回当前目录的推测根目录
  return resolve(__dirname, '..', '..', '..', '..');
}

// 设置NODE_PATH
const projectRoot = findProjectRoot(__dirname);
const nodePaths = [
  join(projectRoot, 'node_modules'),
  join(projectRoot, 'packages', 'node_modules')
];

// 更新NODE_PATH环境变量
process.env.NODE_PATH = (process.env.NODE_PATH || '')
  .split(process.platform === 'win32' ? ';' : ':')
  .concat(nodePaths)
  .filter(Boolean)
  .join(process.platform === 'win32' ? ';' : ':');

// 导入实际的CLI (使用file://URL)
const cliPath = join(__dirname, '..', 'dist', 'cli.js').replace(/\\/g, '/');
import(`file:///${cliPath}`);
