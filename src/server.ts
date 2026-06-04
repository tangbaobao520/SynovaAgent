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
import { initEngineContext, getDatabase } from './init/engine-context';
import { logger } from './logger';
// C2+C3+C4: 编排层接线 (审计 P0-20260604)
import { EventStore } from './orchestrator/event-store';
import { EventBus } from './orchestrator/event-bus';
import { HookRunner } from './orchestrator/hook-runner';
import { SessionManager } from './orchestrator/session-manager';
import { PhaseStateMachine } from './orchestrator/phase-state-machine';
import { createOrchestrationWiring } from './orchestrator/wiring';
import { initFederalReporter, getFederalAdapter } from './adapters/federal-adapter';
import { bindConnectorTools } from './init/connector-binding';
import { ToolRegistry } from './agent/tools';
// Code Review A1+A3: 凭证加密 + L5 事件总线初始化
import { CredentialVault } from './security/credential-vault';
import { getOntologyEventBus } from './l5/ontology-event-bus';
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
  const db = getDatabase();

  // ═══ C3: 编排层初始化 — EventBus + StateMachine + Session (审计 P0-20260604) ═══
  const eventStore = new EventStore(db);
  const eventBus = new EventBus(eventStore);
  const hookRunner = new HookRunner();
  const sessionManager = new SessionManager();
  const phaseStateMachine = new PhaseStateMachine({
    0: { label: '组织访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '根因分析', required: true, maxDurationMs: 180_000 },
    4: { label: '报告生成', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  });
  const wiring = createOrchestrationWiring(eventBus, hookRunner, sessionManager, phaseStateMachine);
  logger.info('编排层已初始化 (EventBus + PhaseStateMachine + SessionManager)');

  // ═══ C2: 联邦进化 — 诊断完成后上报质量信号 (差分隐私+加密) ═══
  let federalAdapter;
  try {
    federalAdapter = await initFederalReporter(db, { epsilon: 1.0, optOut: config.devMode });
    logger.info('联邦进化上报已启用');
  } catch (err: any) {
    logger.warn({ err }, '联邦进化初始化失败 — degraded, 继续启动');
    federalAdapter = getFederalAdapter();
  }

  // ═══ C4: Connector → ToolRegistry 桥接 ═══
  let connectorToolRegistry: ToolRegistry | undefined;
  try {
    connectorToolRegistry = new ToolRegistry();
    bindConnectorTools(connectorToolRegistry);
    logger.info('Connector 工具绑定完成');
  } catch (err: any) {
    logger.warn({ err }, 'Connector 工具绑定失败 — degraded');
  }

  // ═══ A1: CredentialVault — 凭证加密存储 (替代 .env 明文) ═══
  let credentialVault: CredentialVault | undefined;
  try {
    const masterSecret = process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || 'synova-dev-secret';
    const salt = config.dbPath; // 确定性 salt — 每个实例独立密钥
    credentialVault = new CredentialVault(db, masterSecret, salt);
    logger.info('CredentialVault 已初始化 (AES-256-GCM 凭证加密)');
  } catch (err: any) {
    logger.warn({ err }, 'CredentialVault 初始化失败 — degraded, 凭证仍走 .env');
  }

  // ═══ A3: OntologyEventBus — L5 进程内事件总线初始化 ═══
  try {
    // GraphStore 由 engine-core adapter 创建，注入到总线
    const { EngineCoreVendorAdapter } = await import('./adapters/engine-core-adapter');
    const store = await EngineCoreVendorAdapter.createGraphStore(db);
    getOntologyEventBus(store as unknown as import('./l4/graph-bridge').GraphStore);
    logger.info('OntologyEventBus 已初始化 (L5 进程内事件总线)');
  } catch (err: any) {
    logger.warn({ err }, 'OntologyEventBus 初始化失败 — degraded, 连接器管线不可用');
  }

  const app = express();

  // 附着共享编排上下文到 Express locals — routes 可通过 req.app.locals 访问
  app.locals.orchestration = { eventBus, hookRunner, sessionManager, stateMachine: phaseStateMachine, wiring, db, eventStore };
  app.locals.federalAdapter = federalAdapter;
  if (connectorToolRegistry) app.locals.connectorToolRegistry = connectorToolRegistry;
  if (credentialVault) app.locals.credentialVault = credentialVault;

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

  // ═══ A2: Connector Pipeline — 手动触发 + 定时同步 ═══
  app.post('/api/connector/sync', async (req, res) => {
    try {
      const { module: moduleName, orgId } = req.body as { module?: string; orgId?: string };
      if (!moduleName || !orgId) {
        return res.status(400).json({ ok: false, error: 'module 和 orgId 必填', code: 'VALIDATION_ERROR' });
      }
      // 延迟 import 避免循环依赖
      const { runConnectorPipeline } = await import('./l5/connector-pipeline');
      const vault = req.app.locals.credentialVault;
      const credentials = vault
        ? vault.decryptForSubprocess(moduleName) || '{}'
        : '{}';
      const creds: Record<string, string> = JSON.parse(credentials);
      const result = await runConnectorPipeline(moduleName, orgId, creds);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message, code: 'PIPELINE_ERROR' });
    }
  });

  // 定时同步: 每 30 分钟运行已注册的 Connector 管线
  const connectorSyncInterval = setInterval(async () => {
    try {
      const registry = connectorToolRegistry;
      if (!registry) return;
      const { runConnectorPipeline } = await import('./l5/connector-pipeline');
      const connectors = registry.listTools().filter(t => t.executionMode === 'connector');
      for (const tool of connectors) {
        try {
          const result = await runConnectorPipeline(tool.name, 'default', {});
          if (result.degraded) logger.warn({ tool: tool.name, errors: result.errors }, 'Connector 同步 degraded');
          else logger.debug({ tool: tool.name, nodes: result.nodesCreated }, 'Connector 同步完成');
        } catch (err: any) {
          logger.warn({ err, tool: tool.name }, 'Connector 同步失败');
        }
      }
    } catch { /* no connectors registered — skip */ }
  }, 30 * 60_000); // 30 min

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Not Found' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, `Synova-Agent → http://localhost:${config.port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
