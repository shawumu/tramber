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
import { WebSocketServer } from 'ws';
import { TramberEngine } from '@tramber/sdk';
import { debug, LogLevel } from '@tramber/shared';
import { registerRoutes } from './routes.js';
import { WsHandler } from './ws-handler.js';
import { SessionManager } from './session-manager.js';
import type { ServerOptions } from './types.js';

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
}
