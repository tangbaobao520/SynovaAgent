/**
 * wiring-registry.ts — 模块→入口文件映射表
 *
 * 铁律 0-2 Step 5: 接线验证是硬门禁。
 * 每行记录一个核心模块，以及它应该被哪些生产入口文件引用。
 *
 * 新增模块时在此加一行即可。接线测试自动验证。
 *
 * @example
 *   import { WIRING_REGISTRY } from '@synova/test-kit';
 *   for (const [mod, entry] of WIRING_REGISTRY) { ... }
 */

/** 一条接线记录 */
export interface WiringEntry {
  /** 模块名 (类名/函数名/变量名) */
  moduleName: string;
  /** 所属包 */
  package: string;
  /** 所在源文件 (相对于 repo root) */
  sourceFile: string;
  /** 应引用此模块的生产入口文件 glob */
  expectedEntries: string[];
  /** 接线描述 */
  purpose: string;
  /** 是否必须接线 (false=可选) */
  required: boolean;
  /** 上次审计的状态 */
  status: 'critical' | 'known-broken' | 'wired' | 'optional';
  /** 铁律/审计编号 */
  ref?: string;
}

/** 接线注册表 — 新增模块只需一行 */
export const WIRING_REGISTRY: WiringEntry[] = [
  // ═══ L2 → L3 桥接 ═══
  {
    moduleName: 'EngineCoreVendorAdapter',
    package: '@synova/test-kit',
    sourceFile: 'src/adapters/engine-core-adapter.ts',
    expectedEntries: ['src/server.ts', 'src/tui/chat.ts'],
    purpose: 'L2 诊断引擎桥接 — ConversationEngine 通过此适配器调用 engine-core',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'DiagnosisEngine',
    package: '@synova/test-kit',
    sourceFile: 'src/l2-interfaces/diagnosis-engine.ts',
    expectedEntries: ['src/agent/conversation-engine.ts', 'src/agent/diagnosis-launcher.ts', 'src/agent/engine-context.ts'],
    purpose: 'L2 编排层的诊断引擎接口',
    required: true,
    status: 'wired',
  },

  // ═══ L3 分析层 ═══
  {
    moduleName: 'ExpertDispatcher',
    package: '@synova/test-kit',
    sourceFile: 'src/l3/expert-dispatcher.ts',
    expectedEntries: ['src/orchestrator/subagent-coordinator.ts'],
    purpose: 'L3 专家调度 — 证据过滤 + ExpertAutonomyEngine + QualityFirewall',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'ExpertAutonomyEngine',
    package: '@synova/test-kit',
    sourceFile: 'src/l3/expert-autonomy.ts',
    expectedEntries: ['src/l3/expert-dispatcher.ts'],
    purpose: 'L3 ReAct 自主分析引擎',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'QualityFirewall',
    package: '@synova/test-kit',
    sourceFile: 'src/l3/quality-firewall.ts',
    expectedEntries: ['src/l3/expert-dispatcher.ts'],
    purpose: 'L3 洞察质量门禁 (证据真实/置信度/矛盾/过时)',
    required: true,
    status: 'wired',
  },

  // ═══ L4 本体层 ═══
  {
    moduleName: 'GraphBridge',
    package: '@synova/test-kit',
    sourceFile: 'src/l4/graph-bridge.ts',
    expectedEntries: ['src/agent/diagnosis-launcher.ts'],
    purpose: 'L4 诊断→本体桥接 (6 upsert 方法)',
    required: true,
    status: 'wired',
    ref: 'WIRE-02: 6 方法仅 1 个在生产中使用',
  },
  {
    moduleName: 'ReportGraphAdapter',
    package: '@synova/test-kit',
    sourceFile: 'src/l4/report-graph-adapter.ts',
    expectedEntries: [],
    purpose: 'L4 报告从 GraphStore 读取',
    required: false,
    status: 'known-broken',
    ref: '未接线 — 报告目前通过 engine-core 渲染',
  },
  {
    moduleName: 'CommunityReports',
    package: '@synova/test-kit',
    sourceFile: 'src/l4/community-reports.ts',
    expectedEntries: [],
    purpose: 'L4 GraphRAG 社区发现',
    required: false,
    status: 'known-broken',
    ref: 'Feature flag 默认关闭',
  },

  // ═══ 联邦进化 ═══
  {
    moduleName: 'FederalReporter',
    package: '@synova/test-kit',
    sourceFile: 'src/adapters/federal-adapter.ts',
    expectedEntries: ['src/server.ts'],
    purpose: '核心竞争力 5: 联邦上报 (差分隐私 + AES-256-GCM 加密)',
    required: true,
    status: 'critical',
    ref: 'BUG-02: initFederalReporter() 零入口创建',
  },

  // ═══ 模板进化 ═══
  {
    moduleName: 'TemplateValidator',
    package: '@synova/test-kit',
    sourceFile: 'src/expert-platform/validator.ts',
    expectedEntries: ['src/routes/expert.ts', 'src/agent/diagnosis-launcher.ts'],
    purpose: '核心竞争力 4: 模板进化引擎',
    required: true,
    status: 'critical',
    ref: 'WIRE-03: recordValidation() 零生产调用',
  },

  // ═══ 事件溯源 ═══
  {
    moduleName: 'EventStore',
    package: '@synova/test-kit',
    sourceFile: 'src/orchestrator/event-store.ts',
    expectedEntries: ['src/orchestrator/event-bus.ts'],
    purpose: '不可变事件日志 (SQLite)',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'createOrchestrationWiring',
    package: '@synova/test-kit',
    sourceFile: 'src/orchestrator/wiring.ts',
    expectedEntries: ['src/server.ts'],
    purpose: '编排层接线工厂 (事件/压缩/相位推进)',
    required: true,
    status: 'critical',
    ref: 'BUG-03: 160 行完整但零调用',
  },

  // ═══ 编排层 ═══
  {
    moduleName: 'ModuleRunner',
    package: '@synova/test-kit',
    sourceFile: 'src/orchestrator/module-runner.ts',
    expectedEntries: [],
    purpose: '并行模块调度器 (Phase 1) — 通过 orchestrator/index.ts re-export',
    required: false,
    status: 'known-broken',
    ref: '类已导出但未被 synova-agent 生产入口直接引用',
  },
  {
    moduleName: 'PhaseStateMachine',
    package: '@synova/test-kit',
    sourceFile: 'src/orchestrator/phase-state-machine.ts',
    expectedEntries: ['src/orchestrator/diagnosis-orchestrator.ts'],
    purpose: '六阶段状态机',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'IntentRouter',
    package: '@synova/test-kit',
    sourceFile: 'src/orchestrator/intent-router.ts',
    expectedEntries: ['src/orchestrator/phase0-engine.ts'],
    purpose: '9 分支意图分类',
    required: true,
    status: 'wired',
  },

  // ═══ 证据引擎 ═══
  {
    moduleName: 'CorroborationEngine',
    package: '@synova/test-kit',
    sourceFile: 'src/evidence/index.ts',
    expectedEntries: ['src/agent/conversation-engine.ts'],
    purpose: '核心竞争力 1: 多源交叉验证',
    required: true,
    status: 'known-broken',
    ref: 'CV-001: 仅有 O(n²) 置信度比较，无 LLM 语义验证',
  },

  // ═══ 安全 ═══
  {
    moduleName: 'PIIScrubber',
    package: '@synova/test-kit',
    sourceFile: 'src/security/index.ts',
    expectedEntries: ['src/middleware/sanitize-check.ts'],
    purpose: 'PII 脱敏 (手机号/身份证/邮箱/IP)',
    required: true,
    status: 'wired',
  },
  {
    moduleName: 'PermissionPolicy',
    package: '@synova/test-kit',
    sourceFile: 'src/security/index.ts',
    expectedEntries: ['src/server.ts'],
    purpose: 'API Token 认证 + 权限策略 (类名已在 server.ts 中通过 import 使用)',
    required: false,
    status: 'known-broken',
    ref: 'PermissionPolicy 类名未被直接引用，但 security/index.ts 被整体 import',
  },

  // ═══ Agent Observer ═══
  {
    moduleName: 'AgentObserverCollector',
    package: '@synova/test-kit',
    sourceFile: 'src/agent-observer/collector.ts',
    expectedEntries: ['src/server.ts'],
    purpose: 'Agent 可观测性收集器',
    required: false,
    status: 'optional',
    ref: 'P3 AgentObserver 正在建设中',
  },

  // ═══ 新 L5 组件 ═══
  {
    moduleName: 'ConnectorPipeline',
    package: '@synova/test-kit',
    sourceFile: 'src/l5/connector-pipeline.ts',
    expectedEntries: ['src/server.ts'],
    purpose: '连接器事件管道',
    required: false,
    status: 'optional',
    ref: 'todo #6 — 正在建设中',
  },
  {
    moduleName: 'OntologyEventBus',
    package: '@synova/test-kit',
    sourceFile: 'src/l5/ontology-event-bus.ts',
    expectedEntries: ['src/server.ts'],
    purpose: 'L5 本体事件总线',
    required: false,
    status: 'optional',
    ref: 'todo #5 — 正在建设中',
  },

  // ═══ Python Bridge ═══
  {
    moduleName: 'PythonBridge',
    package: '@synova/test-kit',
    sourceFile: 'synova_worker/__main__.py',
    expectedEntries: [],
    purpose: 'Python ↔ TypeScript 跨语言桥接',
    required: false,
    status: 'optional',
    ref: 'P3: 跨语言集成测试覆盖',
  },

  // ═══ PKB + Knowledge (M2 actual) ═══
  {
    moduleName: 'KnowledgeStore',
    package: '@synova/synova-agent',
    sourceFile: 'src/l4/knowledge-store.ts',
    expectedEntries: ['src/server.ts', 'src/l3/knowledge-agent.ts', 'src/routes/knowledge.ts'],
    purpose: 'PKB 知识库存储 (FTS5 + 权限过滤 + 生命周期)',
    required: true,
    status: 'wired',
    ref: 'M2: KnowledgeAgent + Gear6',
  },
  {
    moduleName: 'qa-router',
    package: '@synova/synova-agent',
    sourceFile: 'src/l1/qa-router.ts',
    expectedEntries: ['src/routes/im.ts'],
    purpose: '员工知识问答路由器 (领域识别→检索→专家回答)',
    required: true,
    status: 'wired',
    ref: 'M2: QA Router',
  },
  // ═══ M1-M3 新增接线 (2026-06-06) ═══
  {
    moduleName: 'im-inbound',
    package: '@synova/synova-agent',
    sourceFile: 'src/l1/im-inbound.ts',
    expectedEntries: ['src/routes/im.ts'],
    purpose: 'IM 入站消息处理 (飞书 webhook → 用户识别 → Session)',
    required: true,
    status: 'wired',
    ref: 'M1-Slice2: IM Webhook',
  },
  {
    moduleName: 'documentRoutes',
    package: '@synova/synova-agent',
    sourceFile: 'src/routes/documents.ts',
    expectedEntries: ['src/server.ts'],
    purpose: '文档管理 API (上传→分块→索引)',
    required: true,
    status: 'wired',
    ref: 'M2: KnowledgeAgent ④ 文档规范化',
  },
  {
    moduleName: 'credentialRoutes',
    package: '@synova/synova-agent',
    sourceFile: 'src/routes/credentials.ts',
    expectedEntries: ['src/server.ts'],
    purpose: '用户凭证管理 (IMA 等外部知识源)',
    required: true,
    status: 'wired',
    ref: 'M3: IMA connector',
  },
  {
    moduleName: 'runPKBLifecycle',
    package: '@synova/synova-agent',
    sourceFile: 'src/l3/pkb-lifecycle.ts',
    expectedEntries: ['src/l3/gear6-scheduler.ts'],
    purpose: 'PKB 生命周期 (Gear6 调用) — 待接线到 Gear6',
    required: false,
    status: 'known-broken',
    ref: 'M2: PKB lifecycle 已实现, 待 Gear6 集成',
  },
  {
    moduleName: 'runWithContext',
    package: '@synova/synova-agent',
    sourceFile: 'src/services/request-context.ts',
    expectedEntries: ['src/routes/im.ts', 'src/l3/knowledge-agent.ts'],
    purpose: '请求级权限上下文 (AsyncLocalStorage → FilterClause)',
    required: true,
    status: 'wired',
    ref: 'M2: 权限过滤',
  },
  {
    moduleName: 'ServiceContainer',
    package: '@synova/synova-agent',
    sourceFile: 'src/services/container.ts',
    expectedEntries: ['src/server.ts'],
    purpose: 'DI 容器 — 14 服务集中管理',
    required: true,
    status: 'wired',
    ref: 'P2: Singleton DI',
  },
  // ═══ Observer 适配器 ═══
  {
    moduleName: 'ObserverMCP',
    package: '@synova/test-kit',
    sourceFile: 'packages/agent-observer-mcp/src/index.ts',
    expectedEntries: [],
    purpose: 'MCP Server — 多框架 Agent 可观测性',
    required: false,
    status: 'optional',
    ref: 'P3: 多框架适配器',
  },
];
