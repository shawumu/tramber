// packages/server/src/routes.ts
/**
 * REST 路由 — Fastify
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TramberEngine } from '@tramber/sdk';

/**
 * 注册所有 REST 路由
 */
export async function registerRoutes(fastify: FastifyInstance, engine: TramberEngine): Promise<void> {

  // CORS 预检
  fastify.options('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .code(204)
      .send();
  });

  // 全局 CORS
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    void request;
    reply.header('Access-Control-Allow-Origin', '*');
  });

  // --- Health ---

  fastify.get('/api/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  }));

  // --- Scenes ---

  fastify.get('/api/scenes', async () => {
    return await engine.listScenes();
  });

  // --- Skills ---

  fastify.get('/api/skills', async () => {
    return engine.listUserSkills();
  });

  // --- Routines ---

  fastify.get('/api/routines', async () => {
    return await engine.listRoutines();
  });

  // --- Config ---

  fastify.get('/api/config', async () => {
    const config = engine.getConfig();
    return { ...config, apiKey: config.apiKey ? '***' : '' };
  });

  fastify.put('/api/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      reply.code(400).send({ error: 'Invalid body' });
      return;
    }
    engine.updateConfig(body);
    const config = engine.getConfig();
    return { ...config, apiKey: config.apiKey ? '***' : '' };
  });

  // --- Experiences ---

  fastify.post('/api/experiences/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, limit } = request.body as { query?: string; limit?: number };
    if (!query) {
      reply.code(400).send({ error: 'query is required' });
      return;
    }
    return await engine.searchExperiences(query, limit ?? 5);
  });
}
