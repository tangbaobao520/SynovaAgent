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

  // Token 认证中间件（铁律 24: 异常处理审计 — devMode 跳过鉴权）
  // 白名单: 健康检查、Web 界面、静态资源不鉴权
  app.use((req, res, next) => {
    if (config.devMode) return next();
    if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api/status')) return next();
    if (req.path.startsWith('/assets/') || req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css')) return next();

    const token = req.headers['authorization']?.replace('Bearer ', '') || (req.query.token as string);
    if (!token || token !== config.engineTokens) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '缺少或无效的 API Token。请在 Authorization header 中提供 Bearer <token>，或在 DEV_MODE=true 下运行。' });
    }

    // 鉴权成功，剥离 token query 参数防止日志泄漏
    // Express Request.query 为 getter-only，需要覆写（P1-02: 用类型断言替代 as any）
    if (req.query.token) {
      const { token: _, ...cleanQuery } = req.query;
      Object.defineProperty(req, 'query', { value: cleanQuery, writable: true, configurable: true });
    }
    next();
  });

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
  }, 30_000); // 30s 清理，防止内存泄漏 (P1-06)

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
