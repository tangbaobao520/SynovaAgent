/**
 * server.ts — SynovaAgent HTTP 服务
 *
 * 最小 Express 服务器，只挂载必要路由。
 * 不引入 Novis 的任何依赖。
 */
import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { loadConfig } from './config';
import { initEngineContext } from './init/engine-context';
import { logger } from './logger';
import chatRoutes from './routes/chat';
import healthRoutes from './routes/health';
import ontologyRoutes from './routes/ontology';
import diagnosisRoutes from './routes/diagnosis';
import sessionsRoutes from './routes/sessions';
import metricsRoutes from './monitoring/routes';
import reviewRoutes from './routes/review';
import expertRoutes from './routes/expert';

export async function createServer(): Promise<Server> {
  const config = loadConfig();

  // 初始化 engine-core (DB + 服务注入)
  initEngineContext();

  const app = express();

  // 基础中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Slice 6.2: 简易速率限制 (100 req/min per IP)
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= 100) {
        res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
        return;
      }
      entry.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    }
    next();
  });

  // 定期清理过期 IP 条目
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now >= entry.resetAt) rateLimitMap.delete(ip);
    }
  }, 120000);

  // 路由
  app.use(chatRoutes);         // GET / → Web 对话界面
  app.use(healthRoutes);
  app.use(ontologyRoutes);
  app.use(diagnosisRoutes);
  app.use(sessionsRoutes);
  app.use(metricsRoutes);
  app.use(reviewRoutes);
  app.use(expertRoutes);        // POST/GET /api/expert

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Not Found' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, `SynovaAgent 启动 → http://localhost:${config.port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
