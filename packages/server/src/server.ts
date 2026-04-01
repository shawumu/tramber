// packages/server/src/server.ts
/**
 * Tramber Server - Fastify HTTP + WebSocket 服务
 *
 * 启动流程：
 * 1. 创建 Fastify 实例（REST API）
 * 2. 创建 TramberEngine（复用 SDK）
 * 3. 创建 WebSocketServer（挂载在 Fastify 的 HTTP server 上）
 * 4. 启动
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { WebSocketServer } from 'ws';
import { TramberEngine } from '@tramber/sdk';
import { debug, LogLevel } from '@tramber/shared';
import { registerRoutes } from './routes.js';
import { WsHandler } from './ws-handler.js';
import { SessionManager } from './session-manager.js';
import type { ServerOptions } from './types.js';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const NAMESPACE = 'tramber:server';

export class TramberServer {
  private fastify: FastifyInstance;
  private wss: WebSocketServer | null = null;
  private engine: TramberEngine;
  private sessionManager: SessionManager;
  private wsHandler: WsHandler;
  private options: Required<Pick<ServerOptions, 'port' | 'host'>> & ServerOptions;
  private running = false;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port ?? 3100,
      host: options.host ?? '0.0.0.0',
      engine: options.engine,
      permissionTimeout: options.permissionTimeout ?? 30_000,
      sessionTimeout: options.sessionTimeout ?? 3600_000
    };

    // Fastify
    this.fastify = Fastify({
      logger: false,
      bodyLimit: 10 * 1024 * 1024 // 10MB
    });

    // Engine
    this.engine = new TramberEngine(this.options.engine);

    // Session manager
    this.sessionManager = new SessionManager(this.options.sessionTimeout);

    // WS handler
    this.wsHandler = new WsHandler(this.engine, this.sessionManager, this.options.permissionTimeout);
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (this.running) {
      debug(NAMESPACE, LogLevel.BASIC, 'Already running');
      return;
    }

    // 初始化 Engine
    await this.engine.initialize();

    // 注册 REST 路由
    await registerRoutes(this.fastify, this.engine);

    // 注册 Web 静态文件服务
    await this.registerWebStatic();

    // 用 Fastify 启动 HTTP 监听
    await this.fastify.listen({ port: this.options.port, host: this.options.host });

    // 拿到底层 HTTP server，挂载 WS
    const httpServer = this.fastify.server;
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    // 注册 WS 处理器
    this.wsHandler.register(this.wss);

    // 启动会话清理
    this.sessionManager.startCleanup();

    this.running = true;
    debug(NAMESPACE, LogLevel.BASIC, `Tramber Server started`, {
      http: `http://${this.options.host}:${this.options.port}`,
      ws: `ws://${this.options.host}:${this.options.port}/ws`,
      restRoutes: '/api/health, /api/scenes, /api/skills, /api/routines, /api/config'
    });
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    debug(NAMESPACE, LogLevel.BASIC, 'Shutting down...');

    this.sessionManager.stopCleanup();

    // 关闭 WS
    if (this.wss) {
      for (const ws of this.wss.clients) {
        ws.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.wss = null;
    }

    // 关闭 Fastify
    await this.fastify.close();

    // 关闭 Engine
    await this.engine.close();

    this.running = false;
    debug(NAMESPACE, LogLevel.BASIC, 'Server stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  get activeSessions(): number {
    return this.sessionManager.size;
  }

  get activeConnections(): number {
    return this.wss?.clients.size ?? 0;
  }

  getEngine(): TramberEngine {
    return this.engine;
  }

  /**
   * 获取服务器实际监听的地址（IP:端口）
   * 用于测试时动态分配端口后获取真实地址
   */
  getListenAddress(): string {
    const addr = this.fastify.server.address();
    if (typeof addr === 'string') return addr;
    if (!addr) return `${this.options.host}:${this.options.port}`;
    return `${addr.address}:${addr.port}`;
  }

  /**
   * 注册 Web Client 静态文件服务
   * 从 packages/client/web/dist/ 提供 Web UI
   */
  private async registerWebStatic(): Promise<void> {
    const webDir = this.resolveWebDir();
    if (!webDir) return;

    await this.fastify.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      wildcard: false,
      decorateReply: false
    });

    // SPA fallback：未匹配的路由返回 index.html
    this.fastify.setNotFoundHandler(async (_request, reply) => {
      return reply.type('text/html').sendFile('index.html');
    });

    debug(NAMESPACE, LogLevel.BASIC, 'Web static files served', { webDir });
  }

  /**
   * 解析 Web 静态文件目录
   */
  private resolveWebDir(): string | null {
    const { webDir } = this.options;
    if (webDir === false) return null;

    if (typeof webDir === 'string') {
      return existsSync(webDir) ? webDir : null;
    }

    // 自动检测：向上查找 packages/client/web/dist
    const candidates = [
      // 从 server 包向上查找
      resolve(dirname(fileURLToPath(import.meta.url)), '../../client/web/dist'),
      // 从 CWD 查找
      resolve(process.cwd(), 'packages/client/web/dist'),
      // 从 CWD 的 dist 场景
      resolve(process.cwd(), 'client/web/dist')
    ];

    for (const dir of candidates) {
      if (existsSync(dir) && existsSync(resolve(dir, 'index.html'))) {
        return dir;
      }
    }

    return null;
  }
}
