// tests/integration/server.test.ts
/**
 * Server Integration Tests
 *
 * 测试 TramberServer 的启动、REST API、WebSocket 通信
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { TramberServer } from '@tramber/server';

const TEST_PORT = 0; // 随机可用端口

describe('TramberServer Integration', () => {
  let server: TramberServer;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    server = new TramberServer({ port: TEST_PORT, host: '127.0.0.1' });
    await server.start();
    const addr = server.getListenAddress();
    baseUrl = `http://${addr}`;
    wsUrl = `ws://${addr}/ws`;
  });

  afterEach(async () => {
    await server.stop();
  });

  // ---- REST API ----

  describe('REST API', () => {
    it('GET /api/health should return ok status', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('GET /api/scenes should return scenes list', async () => {
      const res = await fetch(`${baseUrl}/api/scenes`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
    });

    it('GET /api/skills should return skills list', async () => {
      const res = await fetch(`${baseUrl}/api/skills`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/routines should return routines list', async () => {
      const res = await fetch(`${baseUrl}/api/routines`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/config should return config', async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('apiKey');
      expect(data).toHaveProperty('provider');
    });
  });

  // ---- WebSocket ----

  describe('WebSocket', () => {
    it('should connect and respond to ping', async () => {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });

      const pong = await new Promise<any>((resolve, reject) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          resolve(msg);
        });
        ws.on('error', reject);
        ws.send(JSON.stringify({ type: 'ping', id: 'ping-1', sessionId: '', payload: {} }));
      });

      expect(pong.type).toBe('pong');
      expect(pong.id).toBe('ping-1');
      ws.close();
    });

    it('should reject unknown message type', async () => {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });

      const error = await new Promise<any>((resolve, reject) => {
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'error') resolve(msg);
        });
        ws.on('error', reject);
        ws.send(JSON.stringify({ type: 'unknown_type', id: 'unknown-1', sessionId: '', payload: {} }));
      });

      expect(error.type).toBe('error');
      expect(error.payload.message).toContain('Unknown type');
      ws.close();
    });
  });

  // ---- Server Properties ----

  describe('Server Properties', () => {
    it('should report isRunning after start', () => {
      expect(server.isRunning).toBe(true);
    });

    it('should have zero sessions and connections initially', () => {
      expect(server.activeSessions).toBe(0);
      expect(server.activeConnections).toBe(0);
    });

    it('should return the engine', () => {
      const engine = server.getEngine();
      expect(engine).toBeDefined();
    });
  });
});
