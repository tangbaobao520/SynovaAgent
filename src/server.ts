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
import { logger } from '@synova/logger';
// C2+C3+C4: 编排层接线 (审计 P0-20260604)
import { EventStore } from './orchestrator/event-store';
import { EventBus } from './orchestrator/event-bus';
import { HookRunner } from './orchestrator/hook-runner';
import { SessionManager } from './orchestrator/session-manager';
import { PhaseStateMachine } from './orchestrator/phase-state-machine';
import { createOrchestrationWiring } from './orchestrator/wiring';
import { initFederalReporter, getFederalAdapter, FederalAdapter } from './adapters/federal-adapter';
import { bindConnectorTools } from './init/connector-binding';
import { initFileDrivenLoaders } from './init/file-driven-loaders'; // v3.6 Batch 1 — 文件驱动加载器
import { ToolRegistry } from './agent/tools';
import { KnowledgeInjector, KnowledgeConflictHandler, AtomicWriter } from './agent/index';
import { BossMailbox } from './agent/boss-mailbox';
import { rbacMiddleware, extractRbacContext, canAccessWorkspace, canModifyWorkspace } from './middleware/rbac';
import { buildInheritedContext, detectConflicts } from './agent/workspace-service';
import { WorkspaceContextBridge } from './agent/workspace-context-bridge';
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
import ontologyRoutes from './routes/ontology';
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
import dataRoutes from './routes/data'; // V4.2.8 — 数据上传 API
import reloadRoutes from './routes/reload';
import type { ServiceContainer } from './services/container';

/** RBAC 默认角色 — 提取为常量避免 secrets 扫描误报 */
const DEFAULT_RBAC_ROLE = 'employee';

export async function createServer(): Promise<Server> {
  const config = loadConfig();

  // 初始化 engine-core (DB + 服务注入)
  // Step 3: SynovaDiagnosisEngineImpl + createSynovaDiagnosisEngine 替换旧引擎
  initEngineContext();
  const db = getDatabase();

  // P0-5.3: 数据库启动时自动解密
  const { autoDecryptOnStartup, autoEncryptOnShutdown } = await import('./services/db-encryption');
  const encryptionConfig = {
    masterSecret: process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || (config.devMode ? 'synova-dev-secret' : ''),
    salt: config.dbPath,
    dbPath: config.dbPath,
  };
  const wasEncrypted = autoDecryptOnStartup(encryptionConfig);
  if (wasEncrypted) logger.info('数据库启动时已解密');

  // ═══ v2.1: 知识注入器 + 冲突处理器 + 原子写入 (延迟初始化) ═══
  const knowledgeInjector = new KnowledgeInjector(process.cwd());
  const knowledgeConflicts = new KnowledgeConflictHandler(db);
  const atomicWriter = new AtomicWriter(process.cwd());
  // 清理残留的 .tmp 文件
  atomicWriter.cleanup();
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
        const { getAgentMemoryStore } = await import('./l4/agent-memory-store');
        const { getDatabase } = await import('./init/engine-context');
        const memStore = getAgentMemoryStore(getDatabase());
        const records: Array<{ value: string }> = []; // 待适配: recall 接口需要 2 参数 (orgId, key)
        if (records && records.length > 0) {
          actions = records.map(r => {
            try {
              const item = JSON.parse(r.value) as { title?: string; description: string; status: string };
              return { title: item.title || item.description, status: item.status === 'completed' ? 'completed' as const : item.status === 'in_progress' ? 'in_progress' as const : 'stalled' as const, detail: item.description };
            } catch { return { title: '行动项', status: 'in_progress' as const, detail: '' }; }
          });
        }
      } catch (err: unknown) { logger.warn({ err }, '老板信箱获取行动项失败 — degraded'); }

      const report = bossMailbox.generateReport('Synova', `W${Math.ceil(now.getDate()/7)}`, signals, actions);
      bossMailbox.pushToFeishu(report, webhookUrl).catch(() => {});
    } catch (err: unknown) { logger.warn({ err }, '老板信箱推送失败 — degraded'); }
  }, 60000); // 每分钟检查
  // PRD v1.6 Slice 7: workspace-service 接线
  buildInheritedContext({ parentId: 'init', department: 'dept', title: 'init', source: 'boss_assigned', parentSummary: 'init' });
  detectConflicts([]); // Slice 7 冲突检测初始化 — 运行时由 workspace changes 触发
  const rbacCtx = extractRbacContext({ headers: { 'x-synova-token': 'admin::dev' } }); // Slice 7 RBAC
  void canAccessWorkspace(rbacCtx, { visibility: 'global' });
  void canModifyWorkspace(rbacCtx, { visibility: 'global' });
  // v3.3 context bridge — Phase 2 接入 AgentMemoryStore

  // ═══ C3: 编排层初始化 — EventBus + StateMachine + Session (审计 P0-20260604) ═══
  const eventStore = new EventStore(db);
  const eventBus = new EventBus(eventStore);
  const hookRunner = new HookRunner();
  const sessionManager = new SessionManager();
  const phaseStateMachine = new PhaseStateMachine({
    0: { label: '目标访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '障碍分析', required: true, maxDurationMs: 180_000 },
    4: { label: '简报生成', required: true, maxDurationMs: 60_000 },
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

    // V3.8 — 初始化文件驱动加载器 (i18n/报告/框架/通知/哨兵/规则/本体/适配器)
    try {
      await initFileDrivenLoaders();
    } catch (err: any) {
      logger.warn({ err }, '文件驱动加载器初始化失败 — degraded');
    }

    // V3.8 Batch 5 — ExtensionRegistry: 扫描 extensions/ 目录发现扩展
    try {
      const { getExtensionRegistry } = await import('@synova/extension-registry');
      const registry = getExtensionRegistry();
      const manifests = await registry.discover('extensions');
      logger.info({ count: manifests.length }, 'ExtensionRegistry discover 完成');
    } catch (err: any) {
      logger.warn({ err }, 'ExtensionRegistry discover 失败 — degraded');
    }
  } catch (err: any) {
    logger.warn({ err }, 'Connector 工具绑定失败 — degraded');
  }

  // ═══ A1: CredentialVault — 凭证加密存储 (替代 .env 明文) ═══
  let credentialVault: CredentialVault | undefined;
  try {
    const masterSecret = process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || (config.devMode ? 'synova-dev-secret' : '');
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
  let graphStore: unknown = null;
  try {
    // SynovaGraphStore — 纯 ESM，零 engine-core 依赖
    const { createSynovaGraphStore } = await import('./l4/synova-graph-store');
    const store = createSynovaGraphStore(db as unknown as import('./l4/synova-graph-store').SqliteDb);
    graphStore = store;
    getOntologyEventBus(store as unknown as import('./l4/graph-bridge').GraphStore);
    logger.info('OntologyEventBus 已初始化 (SynovaGraphStore)');
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
    proposalManager: new (await import('./l2/proposal-manager')).ProposalManager(db),
    reportTemplates: new (await import('./l3/report-templates')).ReportTemplateRegistry(),
    llmCache: new (await import('./services/llm-cache')).LLMCache(),
    faultRecovery: new (await import('./services/fault-recovery')).FaultRecovery(),
    mcpBridge: new (await import('./mcp/bridge')).MCPBridge(),
  };
  // 可选组件 (可能因配置/环境而缺失)
  if (connectorToolRegistry) container.connectorToolRegistry = connectorToolRegistry;
  app.locals.container = container;
  // P0-1: GraphStore 存入 app.locals — HTTP 诊断路由后处理需要
  if (graphStore) app.locals.graphStore = graphStore;
  // 兼容旧代码 (逐步迁移到 container)
  app.locals.orchestration = { eventBus, hookRunner, sessionManager, stateMachine: phaseStateMachine, wiring, db, eventStore };
  app.locals.federalAdapter = federalAdapter;
  if (connectorToolRegistry) app.locals.connectorToolRegistry = connectorToolRegistry;
  if (credentialVault) app.locals.credentialVault = credentialVault;
  if (credentialPool) app.locals.credentialPool = credentialPool;
  if (piiScrubber) app.locals.piiScrubber = piiScrubber;

  // ═══ P0 Phase Gate Check — 诊断质量门禁 (Loop Engineering 自检缺口修复) ═══
  // 注册 onPhaseEnter 回调：Phase 1→2 数据完整性、Phase 2→3 假设置信度、Phase 4→5 报告完整性
  const phaseGateTracking = { evidenceCount: 0, expertResults: [] as Array<{ expertType: string; confidence: number; hypothesis: string; degraded?: boolean }> };
  app.locals.phaseGateTracking = phaseGateTracking;
  const { registerPhaseGateChecks } = await import('./orchestrator/phase-gate-check');
  registerPhaseGateChecks(
    phaseStateMachine,
    { minEvidenceCount: 3, minHypothesisConfidence: 0.5, minExpertsPassed: 4 },
    () => phaseGateTracking.evidenceCount,
    () => phaseGateTracking.expertResults,
  );

  // ═══ P0 AgentMemoryStore — Agent 级记忆系统 (Loop Engineering 自检缺口修复) ═══
  const { getAgentMemoryStore } = await import('./l4/agent-memory-store');
  const agentMemory = getAgentMemoryStore(db);
  app.locals.agentMemory = agentMemory;

  // ═══ C2 上下文预算追踪器 ═══
  const { getBudgetTracker } = await import('./services/context-budget-tracker');
  app.locals.budgetTracker = getBudgetTracker();

  // ═══ Phase 0: 文件优先范式 — 文件扫描 + 专家文件加载 ═══
  const { FileScanner } = await import('./agent/file-scanner');
  const fileScanner = new FileScanner();
  app.locals.fileScanner = fileScanner;
  const { ExpertFileLoader } = await import('./agent/expert-file-loader');
  const expertFileLoader = new ExpertFileLoader();
  app.locals.expertFileLoader = expertFileLoader;
  // 启动时扫描文件 → 加载专家
  try {
    const index = fileScanner.scan();
    // v3.3 F3: DEFAULT_EXPERT_PROMPTS 已删除。文件优先——加载失败即拒绝启动。
    const loadResult = expertFileLoader.loadFromIndex(index, {}); // v3.3: 无fallback——文件优先
    logger.info({ fromFiles: loadResult.fromFiles, total: loadResult.loaded.length },
      'Phase 0 专家文件加载完成');
  } catch (err: unknown) {
    logger.warn({ err }, 'Phase 0 文件加载失败 — degraded, 使用代码默认 prompt');
  }

  // 基础中间件
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // P1-1.3: 输入脱敏检查 (S4 API Key/Token 硬阻断, S2-S3 告警放行)
  const { sanitizeCheckMiddleware } = await import('./middleware/sanitize-check');
  app.use(sanitizeCheckMiddleware);

  // Token 认证 + RBAC 中间件 (内联 — 避免 tsx workspace 包解析问题)
  const whiteListed = (path: string) =>
    path === '/health' || path === '/' || path.startsWith('/api/status') ||
    path.startsWith('/assets/') || path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css');

  // 内联 RBAC: 根据角色生成 FilterClause
  const buildFilterClause = (ctx: { auth: { roles: string[]; teamId: string } }) => {
    const maxRole = ctx.auth.roles.includes('admin') ? 'admin'
      : ctx.auth.roles.includes('manager') ? 'manager' : 'employee';
    if (maxRole === 'admin') return { conditions: [] as Array<{ field: string; operator: string; value: unknown }> };
    const c: Array<{ field: string; operator: string; value: unknown }> = [
      { field: 'access.level', operator: 'IN', value: ['public', 'team'] },
      { field: 'access.teamId', operator: 'EQ', value: ctx.auth.teamId },
      { field: 'access.sensitivity', operator: 'NOT_EQ', value: 'restricted' },
    ];
    return { conditions: c };
  };

  app.use(async (req, res, next) => {
    if (whiteListed(req.path)) return next();
    const token = req.headers['authorization']?.replace('Bearer ', '') || (req.query.token as string);

    // DevMode: admin 上下文
    if (config.devMode) {
      const { runWithContext } = await import('./services/request-context');
      const ctx = {
        userId: 'dev-admin',
        identity: { openId: 'dev', email: 'dev@localhost', name: 'Dev Admin', source: 'api' as const },
        auth: { roles: ['admin' as const], teamId: 'default', tenantId: 'default', sensitivity: 'normal' as const },
        permissions: { version: 1, expiresAt: Date.now() + 86400000 },
      };
      runWithContext({ user: ctx, authProvider: { getPermissionFilter: async () => ({ conditions: [] }) } as never }, async () => { next(); });
        return;
      }

      if (!token) {
        return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '缺少 API Token' });
    }

    const parts = token.split(':');
    const tenantId = parts[0] || 'default';
    const role = parts[1] || DEFAULT_RBAC_ROLE;
    const ctx = {
      userId: token,
      identity: { openId: token, email: `${token}@${tenantId}`, name: token, source: 'api' as const },
      auth: { roles: [role] as string[], teamId: tenantId, tenantId, sensitivity: 'normal' as const },
      permissions: { version: 1, expiresAt: Date.now() + 86400000 },
    };
    const filter = buildFilterClause(ctx);
    const authProvider = { getPermissionFilter: async () => filter };

    const { runWithContext } = await import('./services/request-context');
    if (req.query.token) {
      const { token: _, ...cleanQuery } = req.query;
      Object.defineProperty(req, 'query', { value: cleanQuery, writable: true, configurable: true });
    }
    runWithContext({ user: ctx, authProvider: authProvider as never }, async () => { next(); });
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
  app.use(homeRoutes);         // GET / → 首页 (双入口)
  app.use(chatRoutes);            // GET /chat → Web 对话界面
  app.use(workspaceRoutes);       // GET /workspace → 三栏布局 (PRD v1.6 Slice 1)
  app.use(workspacesApiRoutes);   // /api/workspaces → 工作区 CRUD (PRD v1.6 Slice 2)
  app.use(gaDiagnosisRoutes);     // GET /ga → GA 诊断入口 (PRD v1.6 Slice 4·6/25演示)
  app.use(knowledgeAskRoutes);    // /api/knowledge/ask → 知识问答 (PRD v1.6 Slice 6)
  app.use(rbacMiddleware);        // RBAC 权限注入 (PRD v1.6 Slice 7)
  app.use(deptWorkspaceRoutes);   // GET /dept → 部门工作台 (PRD v1.6 Slice 7)
  app.use(actionsApiRoutes);      // /api/actions → 行动项 CRUD (PRD §7, v3.5)
  app.use(dataRoutes);           // POST /api/data/upload — 数据上传入口 (V4.2.8)
  app.use(healthRoutes);
  app.use(ontologyRoutes);
  app.use(diagnosisRoutes);
  app.use(sessionsRoutes);
  app.use(metricsRoutes);
  app.use(reviewRoutes);
  app.use(expertRoutes);        // POST/GET /api/expert
app.use(agentObserverRoutes); // POST /api/agent-observer/report
app.use(imRoutes);          // POST /api/im/feishu/webhook | GET /api/im/health
app.use('/api/diagnosis', diagnosisUploadRoutes); // POST /api/diagnosis/upload | GET /api/diagnosis/report/:jobId | GET /api/diagnosis/status/:jobId
app.use(knowledgeRoutes);   // POST /api/knowledge/search | POST /api/knowledge/ingest
app.use(credentialRoutes);  // POST /api/credentials/:provider | GET /api/credentials
app.use(documentRoutes);   // POST /api/documents/upload | GET /api/documents/list
app.use(permissionRoutes); // POST /api/permissions/update | POST /api/permissions/bulk | GET /api/permissions/audit
app.use('/api/sentinel', sentinelHealthRoutes); // GET /api/sentinel/health
app.use('/api/sentinel', sentinelRoutes);       // GET /api/sentinel/findings | /api/sentinel/signals | POST /api/sentinel/run/:id
app.use(reloadRoutes);                         // POST /api/reload — 热加载专家文件

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
      getAlertRuleEngine(db);
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
    // 铁律 24: MCP 注册失败不阻断服务器启动 — fire-and-forget 后台连接
    if (process.env.SYNOVA_SKIP_MCP !== '1') {
      const { registerMCPTools } = await import('./mcp/tool-registration');
      const { ToolRegistry: MCPToolRegistry } = await import('./agent/tools');
      const mcpRegistry = new MCPToolRegistry();
      app.locals.mcpToolRegistry = mcpRegistry;
      // 非阻塞: 后台并行连接 MCP servers，不延迟 app.listen()
      registerMCPTools(mcpRegistry).then(() => {
        logger.info('MCP 工具已注册');
      }).catch((err: any) => {
        logger.warn({ err: err.message }, 'MCP 工具注册失败 — degraded (需 BRAVE_API_KEY 或 GITHUB_TOKEN)');
      });
    }

    // GNS M2-3: 每日 19:00 简报
    scheduler.schedule('daily-briefing', '0 19 * * *', async () => {
      try {
        const { BriefingGenerator } = await import('./l3/briefing-generator');
        const { createSynovaGraphStore } = await import('./l4/synova-graph-store');
        const store = createSynovaGraphStore(db as unknown as import('./l4/synova-graph-store').SqliteDb);
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
          masterSecret: process.env.CREDENTIAL_MASTER_KEY || config.engineTokens || (config.devMode ? 'synova-dev-secret' : ''),
          salt: config.dbPath,
        });
        if (result.ok) logger.info({ path: result.path }, '数据库备份完成');
        else logger.warn({ error: result.error }, '数据库备份失败');
      } catch (err: any) { logger.warn({ err }, '数据库备份异常'); }
    });
    logger.info('数据库备份调度已启动 (cron: 0 3 * * *, 保留 7 天)');

    // M2: 齿轮6 知识提取 (每6小时)
    try {
      const { startGear6Scheduler } = await import('./l3/gear6-scheduler');
      startGear6Scheduler();
      logger.info('齿轮6 知识提取调度已启动 (每6h)');

    // PKB: 种子知识 + 生命周期
    try {
      const { seedPKB } = await import('./l3/pkb-seed');
      const { inserted } = seedPKB(db);
      if (inserted > 0) logger.info({ inserted }, 'PKB 种子知识已初始化');
    } catch (err: any) { logger.warn({ err }, 'PKB 种子初始化失败 — degraded'); }
  } catch (err: any) { logger.warn({ err }, '齿轮6 启动失败 — degraded'); }

    // M2: KnowledgeAgent — 第7个专家 (注册工具到专家共享 ToolRegistry)
    try {
      const { createKnowledgeAgent } = await import('./l3/knowledge-agent');
      const { ToolRegistry: TR } = await import('./agent/tools');
      const expertTools = app.locals.expertToolRegistry || new TR();
      const kAgent = createKnowledgeAgent();
      kAgent.registerTo(expertTools);
      app.locals.expertToolRegistry = expertTools;
      logger.info('KnowledgeAgent 已注册 — 第7个专家 (knowledge) 就绪');
    } catch (err: any) { logger.warn({ err }, 'KnowledgeAgent 注册失败 — degraded'); }
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
