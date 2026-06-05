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
import { initFederalReporter, getFederalAdapter, FederalAdapter } from './adapters/federal-adapter';
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
import agentObserverRoutes from './routes/agent-observer';
import imRoutes from './routes/im';
import knowledgeRoutes from './routes/knowledge';
import type { ServiceContainer } from './services/container';

export async function createServer(): Promise<Server> {
  const config = loadConfig();

  // 初始化 engine-core (DB + 服务注入)
  initEngineContext();
  const db = getDatabase();

  // P0-5.3: 数据库启动时自动解密
  const { autoDecryptOnStartup, autoEncryptOnShutdown } = await import('./services/db-encryption');
  const encryptionConfig = {
    masterSecret: process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || 'synova-dev-secret',
    salt: config.dbPath,
    dbPath: config.dbPath,
  };
  const wasEncrypted = autoDecryptOnStartup(encryptionConfig);
  if (wasEncrypted) logger.info('数据库启动时已解密');

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
    const salt = config.dbPath;
    credentialVault = new CredentialVault(db, masterSecret, salt);
    logger.info('CredentialVault 已初始化 (AES-256-GCM 凭证加密)');
  } catch (err: any) {
    logger.warn({ err }, 'CredentialVault 初始化失败 — degraded, 凭证仍走 .env');
  }

  // ═══ P6 接线: CredentialPool — 多凭据轮换 ═══
  let credentialPool: import('./security/credential-vault').CredentialPool | undefined;
  try {
    const { CredentialPool: CP } = await import('./security/credential-vault');
    credentialPool = new CP(); // DI: 显式构造替代 getCredentialPool()
    // 从 vault 加载已存储凭据到 pool
    if (credentialVault) {
      for (const cred of credentialVault.list()) {
        const decrypted = credentialVault.decryptForSubprocess(cred.id);
        if (decrypted) {
          try { credentialPool.register(cred.id, JSON.parse(decrypted)); } catch { logger.debug('凭证解密/注册失败 — 跳过'); }
        }
      }
    }
    logger.info('CredentialPool 已初始化 (多凭据轮换)');
  } catch (err: any) {
    logger.warn({ err }, 'CredentialPool 初始化失败 — degraded');
  }

  // ═══ PII 接线: PIIScrubber — 4级敏感度脱敏 ═══
  let piiScrubber: import('./security/pii-scrubber').PIIScrubber | undefined;
  try {
    const { PIIScrubber: PS } = await import('./security/pii-scrubber');
    piiScrubber = new PS(); // DI: 显式构造替代 getPIIScrubber()
    logger.info('PIIScrubber 已初始化 (S1-S4 敏感度脱敏)');
  } catch (err: any) {
    logger.warn({ err }, 'PIIScrubber 初始化失败 — degraded');
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

  // ═══ P2 DI 深化: 统一服务容器 (单例生命周期管理) ═══
  // 所有服务在此集中创建，Routes 通过 req.app.locals.container 访问。
  // 兼容旧代码: app.locals.xxx 仍然可用，逐步迁移到 container。
  // 集中创建所有服务 — 单一组合根
  const container: ServiceContainer = {
    db,
    eventBus, hookRunner, sessionManager, stateMachine: phaseStateMachine,
    piiScrubber: piiScrubber!,
    credentialVault,
    credentialPool,
    federalAdapter,
    expertRegistry: new (await import('./l3/expert-registry')).ExpertRegistry(),
    proposalManager: new (await import('./l2/proposal-manager')).ProposalManager(),
    reportTemplates: new (await import('./l3/report-templates')).ReportTemplateRegistry(),
    llmCache: new (await import('./services/llm-cache')).LLMCache(),
    faultRecovery: new (await import('./services/fault-recovery')).FaultRecovery(),
    mcpBridge: new (await import('./mcp/bridge')).MCPBridge(),
  };
  // 可选组件 (可能因配置/环境而缺失)
  if (connectorToolRegistry) container.connectorToolRegistry = connectorToolRegistry;
  app.locals.container = container;
  // 兼容旧代码 (逐步迁移到 container)
  app.locals.orchestration = { eventBus, hookRunner, sessionManager, stateMachine: phaseStateMachine, wiring, db, eventStore };
  app.locals.federalAdapter = federalAdapter;
  if (connectorToolRegistry) app.locals.connectorToolRegistry = connectorToolRegistry;
  if (credentialVault) app.locals.credentialVault = credentialVault;
  if (credentialPool) app.locals.credentialPool = credentialPool;
  if (piiScrubber) app.locals.piiScrubber = piiScrubber;

  // 基础中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // P1-1.3: 输入脱敏检查 (S4 API Key/Token 硬阻断, S2-S3 告警放行)
  const { sanitizeCheckMiddleware } = await import('./middleware/sanitize-check');
  app.use(sanitizeCheckMiddleware);

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
app.use(agentObserverRoutes); // POST /api/agent-observer/report
app.use(imRoutes);          // POST /api/im/feishu/webhook | GET /api/im/health
app.use(knowledgeRoutes);   // POST /api/knowledge/search | POST /api/knowledge/ingest

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

  // Cron: 每 30 分钟运行已注册的 Connector 管线 (替换 setInterval)
  const { getGlobalScheduler } = await import('./cron/scheduler');
  const scheduler = getGlobalScheduler(db);
  try {
    scheduler.schedule('connector-sync', '*/30 * * * *', async () => {
      try {
        const registry = connectorToolRegistry;
        if (!registry) return;
        const { runConnectorPipeline } = await import('./l5/connector-pipeline');
        const connectors = registry.listTools().filter(t => t.executionMode === 'connector');
        for (const tool of connectors) {
          try {
            const result = await runConnectorPipeline(tool.name, 'default', {});
            if (result.degraded) logger.warn({ tool: tool.name, errors: result.errors }, 'Connector 同步 degraded');
          } catch (err: any) { logger.warn({ err, tool: tool.name }, 'Connector 同步失败'); }
        }
      } catch { logger.debug('无可用连接器 — 跳过同步'); }
    });
    logger.info('Connector 同步调度已启动 (cron: */30 * * * *)');

    // 文件安全守卫 — 连接器读写保护
    const { getFileGuard } = await import('./security/file-guard');
    app.locals.fileGuard = getFileGuard(config.dbPath);

    // 连接器沙箱 — 安全等级判定
    const { determineSandboxLevel } = await import('./security/connector-sandbox');
    app.locals.determineSandboxLevel = determineSandboxLevel;

    // 告警规则引擎 — 运行时注册检查
    try {
      const { getAlertRuleEngine } = await import('./l5/alert-rules');
      getAlertRuleEngine();
      logger.info('告警规则引擎已初始化');
    } catch (err: any) { logger.warn({ err }, '告警规则引擎初始化失败 — degraded'); }

    // IM 通道 — 注册飞书 Webhook (如果配置)
    try {
      const { getIMRegistry, createFeishuWebhookChannel } = await import('./l1/im-channel');
      const imReg = getIMRegistry();
      if (process.env.FEISHU_WEBHOOK_URL) {
        imReg.register(createFeishuWebhookChannel(process.env.FEISHU_WEBHOOK_URL));
        imReg.switchTo('feishu');
        logger.info('飞书 IM 通道已注册');
      }
    } catch (err: any) { logger.warn({ err }, 'IM 通道初始化失败 — degraded'); }

    // MCP 工具注册 — 自动连接 Brave Search + GitHub (如果 API Key 已配置)
    // SYNOVA_SKIP_MCP=1 跳过 (测试环境)
    if (process.env.SYNOVA_SKIP_MCP !== '1') {
      try {
        const { registerMCPTools } = await import('./mcp/tool-registration');
        const { ToolRegistry } = await import('./agent/tools');
        const mcpRegistry = new ToolRegistry();
        await registerMCPTools(mcpRegistry);
        app.locals.mcpToolRegistry = mcpRegistry;
        logger.info('MCP 工具已注册');
      } catch (err: any) { logger.warn({ err }, 'MCP 工具注册失败 — degraded (需 BRAVE_API_KEY 或 GITHUB_TOKEN)'); }
    }

    // GNS M2-3: 每日 19:00 简报
    scheduler.schedule('daily-briefing', '0 19 * * *', async () => {
      try {
        const { BriefingGenerator } = await import('./l3/briefing-generator');
        const { EngineCoreVendorAdapter } = await import('./adapters/engine-core-adapter');
        const store = await EngineCoreVendorAdapter.createGraphStore(db);
        const gen = new BriefingGenerator(store as {
          queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>;
          queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ from: string; to: string; type: string; props: Record<string, unknown> }>;
        });
        const briefing = await gen.generate('default');
        const markdown = gen.formatMarkdown(briefing);
        logger.info({ summary: briefing.summary }, '每日简报已生成');
        // Future: IM 发送 markdown
        logger.debug({ markdown: markdown.slice(0, 500) }, '简报内容 (预览)');
      } catch (err: any) {
        logger.warn({ err }, '每日简报生成失败 — degraded');
      }
    });
    logger.info('每日简报调度已启动 (cron: 0 19 * * *)');

    // P2: SQLite 每日备份 (凌晨 3:00)
    scheduler.schedule('db-backup', '0 3 * * *', async () => {
      try {
        const { backupDatabase } = await import('./services/db-encryption');
        const result = backupDatabase({
          dbPath: config.dbPath,
          backupDir: config.dbPath.replace(/[^/\\]+$/, '') + 'backups',
          maxBackups: 7,
          encryptBackups: true,
          masterSecret: process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || 'synova-dev-secret',
          salt: config.dbPath,
        });
        if (result.ok) logger.info({ path: result.path }, '数据库备份完成');
        else logger.warn({ error: result.error }, '数据库备份失败');
      } catch (err: any) { logger.warn({ err }, '数据库备份异常'); }
    });
    logger.info('数据库备份调度已启动 (cron: 0 3 * * *, 保留 7 天)');
  } catch (err: any) {
    logger.warn({ err }, 'Cron 调度器初始化失败 — degraded');
  }

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Not Found' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, `Synova-Agent → http://localhost:${config.port}`);

      // P0-5.3: 优雅关闭时加密数据库
      const shutdown = (signal: string) => {
        logger.info({ signal }, '收到信号 — 加密数据库后退出');
        autoEncryptOnShutdown(encryptionConfig);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      resolve(server);
    });
    server.on('error', reject);
  });
}
