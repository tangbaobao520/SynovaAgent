# SynovaAgent 架构对比：现状 vs 理想

## 一、当前实际架构（基于代码审计）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SynovaAgent v0.1.0-beta                          │
│                    (全部 75 文件 + engine-core 297 文件)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ 表现层（混杂在逻辑中）────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  src/tui/                    src/cli.ts       src/routes/      │    │
│  │  app.ts ─ 三栏布局            CLI readline     chat.ts (Web)   │    │
│  │  chat.ts ─ 启动+对话循环      ════════         health.ts       │    │
│  │  chat-panel.ts ─ 消息渲染     独立入口         ontology.ts     │    │
│  │  side-panel.ts ─ 洞察面板     (不共享逻辑)     diagnosis.ts    │    │
│  │  welcome.ts                   ════════         sessions.ts     │    │
│  │  status-bar.ts                                 review.ts       │    │
│  │                                                                │    │
│  │  ⚠️ 问题：chat.ts 同时负责 TUI 布局 + 输入处理                  │    │
│  │  + LLM 调用 + 消息存储 + Cron 调度 + 错误处理                   │    │
│  │  表现层和 Agent 逻辑层耦合在一起，无法复用                       │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    ▲                                   │
│                                    │ 紧耦合                            │
│  ┌─ Agent 对话层 ───────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  src/agent/                                                   │    │
│  │  conversation.ts ─ Phase 状态机 (0-5)                          │    │
│  │    ├─ streamWithToolLoop()  ← 🔴 双重 LLM 调用                 │    │
│  │    ├─ processMessageStream()                                   │    │
│  │    └─ Phase 1-5 只有空 prompt，不调 engine-core                │    │
│  │  tools.ts ─ ToolRegistry (注册/执行)                           │    │
│  │  builtin-tools.ts ─ 硬编码 26 个工具                           │    │
│  │  synova-agent.ts ─ Agent 生命周期 (start/stop)                 │    │
│  │                                                                │    │
│  │  ⚠️ 问题：依赖 neo-blessed TUI，不是纯逻辑                     │    │
│  │  ⚠️ 问题：Phase 1-5 诊断流水线悬空，不调 DiagnosisOrchestrator │    │
│  │  ⚠️ 问题：工具注册硬编码，不支持动态加载                        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    ▲                                   │
│                                    │                                   │
│  ┌─ Provider 层 ────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  src/providers/                                               │    │
│  │  deepseek.ts ─ DeepSeek API                                   │    │
│  │  openai.ts ─ OpenAI 兼容 (通义/GLM/Kimi)                       │    │
│  │  gateway.ts ─ 自定义 Gateway                                  │    │
│  │  registry.ts ─ ProviderRegistry + Failover                     │    │
│  │  types.ts ─ LLMProvider 接口                                   │    │
│  │                                                                │    │
│  │  ✅ 这部分设计是对的：工厂模式 + 接口抽象                        │    │
│  │  ⚠️ 问题：无统一错误类型枚举                                   │    │
│  │  ⚠️ 问题：provider 检测逻辑在三处重复                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    ▲                                   │
│                                    │                                   │
│  ┌─ 工具链 ─────────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  src/tools/                                                   │    │
│  │  accuracy-tools.ts         org-expert-tools.ts                │    │
│  │  tech-expert-tools.ts      strategy-expert-tools.ts           │    │
│  │  finance-expert-tools.ts   action-expert-tools.ts             │    │
│  │  marketing-expert-tools.ts pattern-engine.ts                  │    │
│  │                                                                │    │
│  │  ⚠️ 问题：26 个工具全部硬编码注册                               │    │
│  │  ⚠️ 问题：无动态加载机制                                        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ 基础设施层（平铺，无抽象）────────────────────────────────────┐    │
│  │                                                                │    │
│  │  src/store/session-store.ts   SQLite 会话存储                  │    │
│  │  src/cron/scheduler.ts        Cron 调度器                      │    │
│  │  src/setup.ts                 交互式 Setup 向导                 │    │
│  │  src/config.ts                环境变量读取                     │    │
│  │  src/logger.ts                pino 日志                        │    │
│  │  src/index.ts                 HTTP 服务模式入口                 │    │
│  │  src/server.ts                Express 创建                     │    │
│  │  src/monitoring/metrics.ts    Prometheus 指标                  │    │
│  │  src/mcp/index.ts             MCP 协议支持                     │    │
│  │  src/connectors/nemoclaw.ts   NemoClaw MCP (stub)              │    │
│  │  src/connectors/feishu.ts     飞书 API (stub)                  │    │
│  │  src/skills/skill-loader.ts   技能加载                         │    │
│  │                                                                │    │
│  │  ⚠️ 问题：CronScheduler 无全局单例，chat.ts 和 synova-agent.ts │    │
│  │  各创建一个实例                                                   │    │
│  │  ⚠️ 问题：无 StorageBackend 接口抽象，engine-context 用内存模式 │    │
│  │  ⚠️ 问题：connectors 是 stub 实现                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ engine-core（297 文件，独立仓库，通过 file: 引用）──────────┐    │
│  │                                                                │    │
│  │  vendor/@synova/engine-core/src/                              │    │
│  │  ├── sog/                SOG-Core v1.0 冻结 schema             │    │
│  │  ├── pipeline/           诊断流水线 (100+ 文件)                │    │
│  │  │   └── diagnosis/      六阶段诊断 + 专家子 Agent              │    │
│  │  ├── evolution/          进化引擎                              │    │
│  │  ├── knowledge-ingest/   知识摄取 (PDF/DOCX/Excel)             │    │
│  │  ├── knowledge-sharing/  知识共享                              │    │
│  │  ├── information-flow/   信息流路由                             │    │
│  │  ├── observer/           团队观察者                             │    │
│  │  ├── harness/            测试工具                               │    │
│  │  ├── infra/logger.ts     日志                                   │    │
│  │  ├── engine-context.ts   上下文注入                             │    │
│  │  ├── storage.ts          存储（内存模式）                       │    │
│  │  ├── task-store.ts       任务存储                               │    │
│  │  ├── types.ts            类型定义                               │    │
│  │  ├── protocols.ts        协议定义                               │    │
│  │  └── llm-client.ts       LLM 客户端                             │    │
│  │                                                                │    │
│  │  ⚠️ 问题：297 文件大单体，无法按需引入                          │    │
│  │  ⚠️ 问题：synova-agent 只调用了 init 注入，                    │    │
│  │  没有调用任何诊断/进化/SOG 能力                                 │    │
│  │  ⚠️ 问题：storage.ts 是内存模式，没有 SQLite 后端               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

当前架构关键问题总结：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 表现层和逻辑层耦合（TUI chat.ts 承担了太多职责）
2. engine-core 是大单体（297 文件一个包，无法按需加载）
3. 工具注册硬编码（不支持运行时动态加载）
4. Phase 1-5 诊断流水线悬空（代码存在但未接线）
5. 无统一错误处理模块
6. CronScheduler 无全局单例
7. engine-context 使用内存存储（TODO 未替换）
8. connectors 是 stub 实现
```

---

## 二、理想架构（模块化 + 可扩展）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SynovaAgent v1.0（目标架构）                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│  表现层（Views）— 可插拔的视图实现                                      │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │  TUI View    │  │  CLI View    │  │  Web View    │  ... 未来扩展    │
│  │ neo-blessed  │  │ readline     │  │ Express/SPA  │  IM/飞书/企微   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         │                 │                 │                           │
│         └─────────────────┴─────────────────┘                           │
│                           │                                             │
│                    EventBus / View API                                  │
│                    (统一视图接口：onUserInput / onAgentReply /          │
│                     onProgress / onAlert / onPhaseChange)               │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│  Agent 运行时层 — 纯逻辑，不依赖任何 UI 框架                            │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  ┌─ Conversation Engine ──────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  @synova/agent-core                                             │   │
│  │  ConversationEngine                                             │   │
│  │  ├─ processMessage(input) → Reply                                │   │
│  │  ├─ runPhase(phaseId) → PhaseResult                              │   │
│  │  ├─ PhaseManager (Phase 0→5 状态机，配置化)                       │   │
│  │  ├─ ToolExecutionEngine (工具执行)                                │   │
│  │  └─ ContextManager (对话上下文管理)                               │   │
│  │                                                                  │   │
│  │  ✅ 纯逻辑，可被 TUI/CLI/Web/IM 复用                              │   │
│  │  ✅ Phase 配置从文件或 engine-core 加载，不硬编码                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│         ┌─────────────────┼─────────────────┐                          │
│         ▼                 ▼                 ▼                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │ Tool         │  │ Provider     │  │ Skill        │                 │
│  │ Registry     │  │ Manager      │  │ Loader       │                 │
│  │              │  │              │  │              │                 │
│  │ 内置工具     │  │ DeepSeek     │  │ 动态加载     │                 │
│  │ 外部工具     │  │ OpenAI兼容   │  │ skills/目录  │                 │
│  │ 动态注册     │  │ Gateway      │  │ SKILL.md     │                 │
│  │              │  │              │  │ 热加载       │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│  领域服务层 — 按领域拆分的独立包                                        │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ @synova/         │  │ @synova/         │  │ @synova/         │     │
│  │ sog-core         │  │ diagnosis-       │  │ evolution-       │     │
│  │                  │  │ engine           │  │ engine           │     │
│  │ SOG 本体 schema  │  │ 六阶段诊断       │  │ 联邦进化         │     │
│  │ 14 节点 + 10 边  │  │ DiagnosisOrchestr│  │ OrgAdapter       │     │
│  │ 枚举校验         │  │ 专家子 Agent     │  │ FederalReporter  │     │
│  │ 端点矩阵         │  │ ReportRenderer   │  │ GlobalAggregator │     │
│  │ SOGValidationError │ │ DecisionEngine │  │ RuleDeployer     │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
│       │                       │                       │               │
│       └───────────────────────┼───────────────────────┘               │
│                               ▼                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ @synova/         │  │ @synova/         │  │ @synova/         │     │
│  │ knowledge-       │  │ observer         │  │ connectors       │     │
│  │ ingest           │  │                  │  │                  │     │
│  │ PDF/DOCX/Excel   │  │ 团队行为观察     │  │ NemoClaw MCP     │     │
│  │ 解析→本体映射    │  │ 统计工具         │  │ 飞书 API         │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
│                                                                         │
│  每个包：                                                                │
│  ✅ 独立的 package.json + 版本号                                        │
│  ✅ 独立的测试套件                                                       │
│  ✅ 明确的公开 API 接口                                                  │
│  ✅ 按需引入，不需要全量加载                                             │
│  ✅ 可被其他产品复用（Novis 桌面端、SoloHub 等）                          │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════    │
│  基础设施层 — 接口抽象 + 可替换实现                                      │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                         │
│  ┌─ Storage ────────────────────────────────────────────────────┐     │
│  │                                                                │     │
│  │  interface StorageBackend                                     │     │
│  │  ├─ InMemoryBackend (开发/测试)                               │     │
│  │  ├─ SQLiteBackend (生产，默认)                                 │     │
│  │  └─ RedisBackend (未来，多实例部署)                            │     │
│  │                                                                │     │
│  │  职责：会话存储 + SOG 持久化 + 诊断结果存储                     │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌─ Scheduler ──────────────────────────────────────────────────┐     │
│  │                                                                │     │
│  │  class Scheduler (全局单例)                                    │     │
│  │  ├─ schedule(taskId, cron, handler)                           │     │
│  │  ├─ unschedule(taskId)                                        │     │
│  │  ├─ status(taskId) → Running/Idle/Failed                      │     │
│  │  ├─ list() → 所有注册任务                                      │     │
│  │  └─ 持久化到 SQLite（重启恢复）                                 │     │
│  │                                                                │     │
│  │  注册方：                                                        │     │
│  │  ├─ Agent 层：本体监测                                          │     │
│  │  ├─ 进化引擎：联邦上报定时触发                                   │     │
│  │  └─ 诊断引擎：定期重新诊断                                      │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌─ Error Handling ─────────────────────────────────────────────┐     │
│  │                                                                │     │
│  │  enum ErrorType { Timeout, Network, Auth, InvalidInput, ... } │     │
│  │                                                                │     │
│  │  interface RetryStrategy                                      │     │
│  │  ├─ shouldRetry(error) → boolean                              │     │
│  │  ├─ backoff(attempt) → ms                                     │     │
│  │  └─ maxRetries → number                                       │     │
│  │                                                                │     │
│  │  每种错误类型有独立的降级路径和重试策略                          │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌─ Configuration ──────────────────────────────────────────────┐     │
│  │                                                                │     │
│  │  @synova/config                                                │     │
│  │  ├─ .env 加载                                                  │     │
│  │  ├─ YAML 配置 (phases/ tools/ skills/)                        │     │
│  │  ├─ 环境变量覆盖                                               │     │
│  │  └─ 运行时配置热更新                                           │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌─ Logging ────────────────────────────────────────────────────┐     │
│  │                                                                │     │
│  │  pino 结构化日志 (stderr)                                      │     │
│  │  统一日志上下文：session / phase / task / error                │     │
│  │  所有 catch 块必须 log（零容忍空 catch）                         │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

数据流（完整用户旅程）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用户输入 (TUI/CLI/Web)
  │
  ▼
View Layer → EventBus → ConversationEngine
  │                                      │
  │                                      ▼
  │                        ┌─────────────────────────────┐
  │                        │ Phase 0: 组织访谈            │
  │                        │  → Provider 调 LLM           │
  │                        │  → ToolRegistry 执行工具     │
  │                        │  → SkillLoader 加载诊断技能  │
  │                        │  → SOG 创建节点/边           │
  │                        └──────────────┬──────────────┘
  │                                       │
  │                        ┌──────────────▼──────────────┐
  │                        │ Phase 1-5: 自动诊断          │
  │                        │  → DiagnosisOrchestrator     │
  │                        │  → 6 专家子 Agent            │
  │                        │  → DecisionEngine            │
  │                        │  → ReportRenderer            │
  │                        └──────────────┬──────────────┘
  │                                       │
  │                        ┌──────────────▼──────────────┐
  │                        │ 持续监测 + 进化              │
  │                        │  → Scheduler 定时触发        │
  │                        │  → GraphMonitor 检查         │
  │                        │  → OrgAdapter 校准           │
  │                        │  → FederalReporter 上报      │
  │                        │  → GlobalAggregator 聚合     │
  │                        │  → RuleDeployer 下发         │
  │                        └─────────────────────────────┘
  │                                       │
  ▼                                       ▼
View 渲染 ←─────────────────────── 结果返回
(TUI 消息/侧边栏告警/报告)
```

---

## 三、从现状到理想的改造路径

```
阶段 1（本周）：核心 bug 修复 + 接线诊断
├─ 修复 streamWithToolLoop 双重调用
├─ 空 catch 补日志
├─ 加"处理中"状态提示
├─ Phase 1-5 接线到 DiagnosisOrchestrator（最小实现）
└─ 验收：用户能看到诊断结果

阶段 2（下周）：模块边界初步划分
├─ 抽离 ConversationEngine 为纯逻辑（不依赖 TUI）
├─ 定义 StorageBackend 接口，实现 SQLite 后端
├─ Scheduler 改为全局单例
├─ 定义 Error 类型枚举 + 重试策略
└─ 验收：对话引擎可被 mock UI 测试

阶段 3（本月）：engine-core 按领域拆分
├─ @synova/sog-core 独立包
├─ @synova/diagnosis-engine 独立包
├─ @synova/evolution-engine 独立包
├─ synova-agent 按需引入
└─ 验收：每个包可独立构建、测试、发布

阶段 4（下月）：动态扩展能力
├─ 工具从 skills/ 目录动态加载
├─ Phase 配置化（YAML 加载）
├─ 支持运行时插件加载
└─ 验收：新增工具/Phase 不改核心代码

阶段 5（未来）：多视图 + 联邦闭环
├─ Web View（完整前端）
├─ IM 接入（飞书/企微）
├─ 联邦学习闭环完整接线
├─ 数据连接器实装（NemoClaw/飞书）
└─ 验收：完整产品矩阵
```

---

## 四、关键原则

1. **表现层和逻辑层必须解耦**：ConversationEngine 不 import neo-blessed
2. **engine-core 按领域拆分**：297 文件不能在一个包里
3. **接口先于实现**：StorageBackend / Scheduler / Error 先定义接口
4. **渐进式改造**：每改一个模块，现有功能不能 break
5. **配置化优于硬编码**：Phase 定义、工具注册、技能加载都从配置/目录加载
