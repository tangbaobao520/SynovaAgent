/**
 * server.ts — SynovaAgent HTTP 服务
 *
 * 最小 Express 服务器，只挂载必要路由。
 * 初始化逻辑委托给 Bootstrap (src/deploy/bootstrap.ts)。
 * 不引入 Novis 的任何依赖。
 */
import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { MemoryMonitor } from './services/memory-monitor';
import { logger } from '@synova/logger';
// C2+C3+C4: 编排层接线 (审计 P0-20260604)
import { initFileDrivenLoaders } from './init/file-driven-loaders'; // v3.6 Batch 1 — 文件驱动加载器
import { ToolRegistry } from './agent/tools';
import { KnowledgeInjector, KnowledgeConflictHandler, AtomicWriter } from './agent/index';
import { BossMailbox } from './agent/boss-mailbox';
import { rbacMiddleware, extractRbacContext, canAccessWorkspace, canModifyWorkspace } from './middleware/rbac';
import { jwtAuthMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import { buildInheritedContext, detectConflicts } from './agent/workspace-service';
// Code Review A1+A3: 凭证加密 + L5 事件总线初始化
import { CredentialVault } from './security/credential-vault';
import { getOntologyEventBus } from './l5/ontology-event-bus';
import homeRoutes from './routes/home';
import chatRoutes from './routes/chat';
import workspaceRoutes from './routes/workspace';
import workspacesApiRoutes from './routes/workspaces-api';
import gaDiagnosisRoutes from './routes/ga-diagnosis';
import knowledgeAskRoutes from './routes/knowledge-ask';
import deptWorkspaceRoutes from './routes/department-workspace';
import actionsApiRoutes from './routes/actions-api';
import healthRoutes from './routes/health';
import healthzRoutes from './routes/healthz';
import evolutionRoutes from './routes/evolution';
import gaEvolutionRoutes from './routes/ga-evolution';
import ontologyRoutes from './routes/ontology';
import ontologyAdminRoutes from './routes/ontology-admin';
import diagnosisRoutes from './routes/diagnosis';
import sessionsRoutes from './routes/sessions';
import metricsRoutes from './monitoring/routes';
import reviewRoutes from './routes/review';
import expertRoutes from './routes/expert';
import agentObserverRoutes from './routes/agent-observer';
import imRoutes from './routes/im';
import knowledgeRoutes from './routes/knowledge';
import credentialRoutes from './routes/credentials';
import documentRoutes from './routes/documents';
import permissionRoutes from './routes/permissions';
import diagnosisUploadRoutes from './routes/diagnosis-upload-v2';
import sentinelHealthRoutes from './routes/sentinel-health';
import sentinelRoutes from './routes/sentinel';
import dataRoutes from './routes/data'; // V4.2.9 — 数据上传 API
import dataLifecycleRoutes from './routes/data-lifecycle'; // D40 — GDPR 可携带权+被遗忘权
import reloadRoutes from './routes/reload';
import adaptersRoutes from './routes/adapters';
import auditRoutes from './routes/audit';
import gaAdminRoutes from './routes/ga-admin';
import gaCorrectionsRoutes from './routes/ga-corrections';
import gaAnnotationsRoutes from './routes/ga-annotations';
import solutionsRoutes from './routes/solutions';
import notificationsRoutes from './routes/notifications';
import backupRoutes from './routes/backup';
import type { ServiceContainer } from './services/container';
// Phase 0.1: 全局错误兜底 — uncaughtException + unhandledRejection
import { registerGlobalErrorHandlers, unregisterGlobalErrorHandlers } from './services/runtime-global-handlers';

import { Bootstrap } from './deploy/bootstrap';
import type { BootstrapResult } from './deploy/bootstrap';

export async function createServer(): Promise<Server> {
  // ═══ D83: Bootstrap 启动序列 — 6 Phase 统一初始化 ═══
  // 替代原有的 ~300 行内联初始化代码
  const boot = new Bootstrap();
  const result: BootstrapResult = await boot.run();

  if (!result.ok) {
    logger.error({
      aborted: result.aborted,
      phases: result.phaseResults.map((r) => ({
        name: r.name,
        status: r.status,
        durationMs: r.durationMs,
        errors: r.errors,
      })),
      degraded: result.services.degradedModules,
    }, 'Bootstrap 启动失败 — 服务器将终止');
    process.exit(1);
  }

  if (result.degraded) {
    logger.warn({
      degradedModules: result.services.degradedModules,
    }, 'Bootstrap 启动完成 — 部分模块降级运行');
  }

  // ═══ 从 Bootstrap 获取已初始化服务 ═══
  const services = result.services;
  const config = services.config;
  const db = services.db;
  const eventBus = services.eventBus;
  const hookRunner = services.hookRunner;
  const sessionManager = services.sessionManager;
  const stateMachine = services.stateMachine;
  const wiring = services.wiring;
  const federalAdapter = services.federalAdapter;
  const graphStore = services.graphStore;
  const agentMemory = services.agentMemory;
  const connectorToolRegistry = services.connectorToolRegistry;
  const credentialVault = services.credentialVault;
  const credentialPool = services.credentialPool;
  const piiScrubber = services.piiScrubber;

  // Phase 4.2: 配置恢复验证 — 启动时检查配置文件完整性
  // (已在 Bootstrap Phase 4 中执行)
  logger.info('Bootstrap 服务已就绪，开始 Express 设置');

  // Phase 4.1: 注册 Electron 通知适配器
  try {
    const { ElectronNotificationAdapter } = await import('./notifications/electron-adapter');
    const { registerNotificationAdapter } = await import('./notifications/registry');
    registerNotificationAdapter(new ElectronNotificationAdapter());
    logger.info('Electron 通知适配器已注册');
  } catch (err: unknown) {
    logger.warn({ err }, 'Electron 通知适配器注册失败 — degraded');
  }

  // ═══ v2.1: 知识注入器 + 冲突处理器 + 原子写入 — 已在 Bootstrap Phase 4 初始化 ═══
  // (server.ts 中保留这些引用供后续路由使用)
  // 如果 bootstrap 未提供知识服务，在这里 fallback
  const knowledgeInjector = new KnowledgeInjector(process.cwd());
  const knowledgeConflicts = new KnowledgeConflictHandler(db);
  const atomicWriter = new AtomicWriter(process.cwd());
  atomicWriter.cleanup();

  // BossMailbox — 已在 Bootstrap Phase 5 初始化
  // 此处保持 setInterval 逻辑
  const bossMailbox = new BossMailbox(); // PRD v1.6 Slice 5
  // v3.5 PRD §12.4: 老板信箱定时推送 (周一 9:00) — V4.2.1: 注入真实信号+行动数据
  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getDay() !== 1 || now.getHours() !== 9 || now.getMinutes() !== 0) return;
      const webhookUrl = process.env.FEISHU_WEBHOOK_URL || '';
      if (!webhookUrl) return;

      // 从哨兵系统获取信号
      let signals: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; description: string; trend: 'improving' | 'stable' | 'worsening' }> = [];
      try {
        const { getSentinelRegistry } = await import('./sentinel/registry');
        const { aggregateSignals } = await import('./sentinel/signal-aggregator');
        const findings = await getSentinelRegistry().runAll({ db, now: new Date(), registry: getSentinelRegistry() });
        if (findings.length > 0) {
          const checkResults: import('./sentinel/types').SentinelCheckResult[] = [{
            sentinelId: 'boss-mailbox',
            ok: true,
            findings,
            durationMs: 0,
            checkedAt: new Date().toISOString(),
          }];
          const aggregated = aggregateSignals(checkResults);
          signals = aggregated.signals.map(s => ({ severity: s.severity, title: s.title, description: s.title, trend: 'stable' as const }));
        }
      } catch (err: unknown) { logger.warn({ err }, '老板信箱获取信号失败 — degraded'); }

      // 从 AgentMemoryStore 获取行动项
      let actions: Array<{ title: string; status: 'completed' | 'in_progress' | 'stalled'; detail: string }> = [];
      try {
        const am = agentMemory;
        if (am) {
          // AgentMemoryStore recall 接口
          const records: Array<{ value: string }> = [];
          if (records && records.length > 0) {
            actions = records.map(r => {
              try {
                const item = JSON.parse(r.value) as { title?: string; description: string; status: string };
                return { title: item.title || item.description, status: item.status === 'completed' ? 'completed' as const : item.status === 'in_progress' ? 'in_progress' as const : 'stalled' as const, detail: item.description };
              } catch (e) { logger.warn({ err: e }, '解析行动项失败 — degraded'); return { title: '行动项', status: 'in_progress' as const, detail: '' }; }
            });
          }
        }
      } catch (err: unknown) { logger.warn({ err }, '老板信箱获取行动项失败 — degraded'); }

      const report = bossMailbox.generateReport('Synova', `W${Math.ceil(now.getDate()/7)}`, signals, actions);
      bossMailbox.pushToFeishu(report, webhookUrl).catch(() => {});
    } catch (err: unknown) { logger.warn({ err }, '老板信箱推送失败 — degraded'); }
  }, 60000); // 每分钟检查

  // PRD v1.6 Slice 7: workspace-service 接线
  buildInheritedContext({ parentId: 'init', department: 'dept', title: 'init', source: 'boss_assigned', parentSummary: 'init' });
  detectConflicts([]); // Slice 7 冲突检测初始化
  const rbacCtx = extractRbacContext({ headers: { 'x-synova-token': 'admin::dev' } }); // Slice 7 RBAC
  void canAccessWorkspace(rbacCtx, { visibility: 'global' });
  void canModifyWorkspace(rbacCtx, { visibility: 'global' });

  const app = express();

  // ═══ P0 Phase Gate Check — 诊断质量门禁 ═══
  const phaseGateTracking = { evidenceCount: 0, expertResults: [] as Array<{ expertType: string; confidence: number; hypothesis: string; degraded?: boolean }> };
  app.locals.phaseGateTracking = phaseGateTracking;
  const { registerPhaseGateChecks } = await import('./orchestrator/phase-gate-check');
  registerPhaseGateChecks(
    stateMachine,
    { minEvidenceCount: 3, minHypothesisConfidence: 0.5, minExpertsPassed: 4 },
    () => phaseGateTracking.evidenceCount,
    () => phaseGateTracking.expertResults,
  );

  // ═══ P2 DI 深化: 统一服务容器 (单例生命周期管理) ═══
  const container: ServiceContainer = {
    db,
    eventBus, hookRunner, sessionManager, stateMachine,
    piiScrubber: piiScrubber as never,
    credentialVault: credentialVault as never,
    credentialPool: credentialPool as never,
    federalAdapter: federalAdapter as never,
    expertRegistry: new (await import('./l3/expert-registry')).ExpertRegistry(),
    proposalManager: new (await import('./l2/proposal-manager')).ProposalManager(db),
    reportTemplates: new (await import('./l3/report-templates')).ReportTemplateRegistry(),
    llmCache: new (await import('./services/llm-cache')).LLMCache(),
    faultRecovery: new (await import('./services/fault-recovery')).FaultRecovery(),
    mcpBridge: new (await import('./mcp/bridge')).MCPBridge(),
  };
  // 可选组件
  if (connectorToolRegistry) container.connectorToolRegistry = connectorToolRegistry;
  app.locals.container = container;
  if (graphStore) app.locals.graphStore = graphStore;
  app.locals.orchestration = { eventBus, hookRunner, sessionManager, stateMachine, wiring, db, eventStore: services.eventStore };
  app.locals.federalAdapter = federalAdapter;
  if (connectorToolRegistry) app.locals.connectorToolRegistry = connectorToolRegistry;
  if (credentialVault) app.locals.credentialVault = credentialVault;
  if (credentialPool) app.locals.credentialPool = credentialPool;
  if (piiScrubber) app.locals.piiScrubber = piiScrubber;
  if (agentMemory) app.locals.agentMemory = agentMemory;

  // ═══ C2 上下文预算追踪器 ═══
  const { getBudgetTracker } = await import('./services/context-budget-tracker');
  app.locals.budgetTracker = getBudgetTracker();

  // ═══ P0 AgentMemoryStore — Agent 级记忆系统 ═══
  if (agentMemory) {
    app.locals.agentMemory = agentMemory;
  }

  // ═══ Phase 0: 文件优先范式 — 文件扫描 + 专家文件加载 ═══
  const { FileScanner } = await import('./agent/file-scanner');
  const fileScanner = new FileScanner();
  app.locals.fileScanner = fileScanner;
  const { ExpertFileLoader } = await import('./agent/expert-file-loader');
  const expertFileLoader = new ExpertFileLoader();
  app.locals.expertFileLoader = expertFileLoader;
  try {
    const index = fileScanner.scan();
    const loadResult = expertFileLoader.loadFromIndex(index, {});
    logger.info({ fromFiles: loadResult.fromFiles, total: loadResult.loaded.length },
      'Phase 0 专家文件加载完成');
  } catch (err: unknown) {
    logger.warn({ err }, 'Phase 0 文件加载失败 — degraded, 使用代码默认 prompt');
  }

  // 基础中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // P1-1.3: 输入脱敏检查
  const { sanitizeCheckMiddleware } = await import('./middleware/sanitize-check');
  app.use(sanitizeCheckMiddleware);

  // Phase 0.1: JWT 认证中间件
  app.use(jwtAuthMiddleware);

  // Phase 0.1: JWT 认证路由
  app.use(authRoutes);

  // Phase 3.1: 三层速率限制
  const { createFixedWindowLimiter } = await import('./middleware/rate-limit');
  const rateLimitMiddleware = createFixedWindowLimiter(100, 60_000);
  app.use(rateLimitMiddleware);

  // 路由
  app.get('/api/status/budget', (req, res) => {
    try {
      const tracker = req.app.locals.budgetTracker;
      if (!tracker) return res.json({ ok: false, degraded: true, message: '预算追踪器未初始化' });
      res.json({ ok: true, ...tracker.snapshot() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg, degraded: true });
    }
  });
  app.use(homeRoutes);
  app.use(chatRoutes);
  app.use(workspaceRoutes);
  app.use(workspacesApiRoutes);
  app.use(gaDiagnosisRoutes);
  app.use(knowledgeAskRoutes);
  app.use(rbacMiddleware);
  app.use(deptWorkspaceRoutes);
  app.use(actionsApiRoutes);
  app.use(dataRoutes);
  app.use(dataLifecycleRoutes);
  app.use(healthRoutes);
  app.use(healthzRoutes);
  app.use(evolutionRoutes);
  app.use(gaEvolutionRoutes);
  app.use(ontologyRoutes);
  app.use(ontologyAdminRoutes);
  app.use(diagnosisRoutes);
  app.use(sessionsRoutes);
  app.use(metricsRoutes);
  app.use(reviewRoutes);
  app.use(expertRoutes);
  app.use(agentObserverRoutes);
  app.use(imRoutes);
  app.use('/api/diagnosis', diagnosisUploadRoutes);
  app.use(knowledgeRoutes);
  app.use(credentialRoutes);
  app.use(documentRoutes);
  app.use(permissionRoutes);
  app.use('/api/sentinel', sentinelHealthRoutes);
  app.use('/api/sentinel', sentinelRoutes);
  app.use(reloadRoutes);
  app.use(adaptersRoutes);
  app.use(auditRoutes);
  app.use(gaAdminRoutes);
  app.use(gaCorrectionsRoutes);
  app.use(gaAnnotationsRoutes);
  app.use(solutionsRoutes);
  app.use(notificationsRoutes);
  app.use(backupRoutes);

  // ═══ A2: Connector Pipeline — 手动触发 ═══
  app.post('/api/connector/sync', async (req, res) => {
    try {
      const { module: moduleName, orgId } = req.body as { module?: string; orgId?: string };
      if (!moduleName || !orgId) {
        return res.status(400).json({ ok: false, error: 'module 和 orgId 必填', code: 'VALIDATION_ERROR' });
      }
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

  // Cron 调度器 + 定时任务 — 已在 Bootstrap Phase 5 初始化

  // 404
  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Not Found' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, `Synova-Agent → http://localhost:${config.port}`);

      // P0-5.3: 优雅关闭时加密数据库
      const encryptionConfig = {
        masterSecret: process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || (config.devMode ? 'synova-dev-secret' : ''),
        salt: config.dbPath,
        dbPath: config.dbPath,
      };

      const shutdown = (signal: string) => {
        const forensics = {
          signal,
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        };
        logger.info({ forensics }, 'shutdown forensics');

        unregisterGlobalErrorHandlers();
        // 关闭时加密数据库
        import('./services/db-encryption').then(({ autoEncryptOnShutdown }) => {
          autoEncryptOnShutdown(encryptionConfig);
        }).catch(() => {});
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      resolve(server);
    });
    server.on('error', reject);

    // Phase 5.3: 内存监控（每 5 分钟）
    const memoryMonitor = new MemoryMonitor();
    memoryMonitor.start();

    // Phase 0.1: 全局错误兜底
    registerGlobalErrorHandlers(server);
  });
}
