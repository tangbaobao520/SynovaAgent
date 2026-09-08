---
north-star:
  服务用户: 企业内已有 AI agent（codex/workbuddy 等）及其操作者——经 MCP 把 Synova 诊断能力纳入自动化工作流（INTERFACES-STRATEGY 2026-08-12 创始人定：MCP = P0）
  服务场景: 企业的 agent 客户端连接本地 Synova MCP server → 发现工具（诚实能力广告）→ 按权限调用（哨兵查询/触发、报告/工单查询、知识问答、诊断、本体读写、会话读回）
  模块终态: 可信的对外协议面——stdio 本机信任显式声明 + 读写两级权限 + 12 工具覆盖哨兵/诊断/本体/知识/会话 + 官方 SDK 协议正确 + `npm run mcp` 一条命令可启动
  对齐北星: PRODUCT-BRIEF §一（"Agent，不是 ChatBot"——外部工具调用靠它）+ §四（"独立 API 进程。HTTP + MCP 对外服务"）；docs/synova/coordination/INTERFACES-STRATEGY.md（MCP=P0 决策）
  完成标准: 入口 `npm run mcp` 启动 → 客户端 initialize（含信任模型声明与契约版本）/tools/list（12 工具含 permission 元数据）→ read-only 模式下写工具被拒（JSON-RPC -32000）→ sentinel_list 经 L2 全链路返回真实哨兵清单（冒烟测试绿）
  当前进度: 手写 stdio JSON-RPC 9 工具可用但零认证零权限零打包；哨兵族 L1→L3/L4/L5 跨层违规 11 处；HTTP 桥接工具白名单缺失（生产态 401）；本 spec 已写，编码线未开工
---

<!--
  SYNOVA-IMPL-DSH-D595: MCP 认证/权限 + 工具补齐（L1-P3）
  状态: dev doc | 2026-09-08 | 优先级 P0（INTERFACES-STRATEGY MCP=P0 + L1 审计 Phase 3）
  权威文档: L1 全量审计报告 §3.4/§3.6/§5/§7/§8.1 + L1 跨层违规扫描 §2/§三 + INTERFACES-STRATEGY.md（创始人 2026-08-12 产品决策）+ D590 spec（裁决① 继承）+ AGENTS.md 铁律 4/5/11/24/31/33/38/39/47/48
  依赖: 无硬依赖（L1 审计 §7 明示"可 Phase 1 并行启动"）；D590（对话 SSE + 白名单裁决）已 impl_done（task-state/D590.json，PR #424）
  并行: 与 D591/D592/D593/D594 零写集交集（写集集中在 src/mcp/ + L2 sentinel-service + auth.ts 白名单三行）
-->

# D595: MCP 认证/权限 + 工具补齐

> 一句话问题: Synova 对外服务的核心接口（MCP server）是**裸奔**的——手写 stdio JSON-RPC 暴露 9 个工具，零认证、零权限分级、零打包配置；哨兵族工具绕过 L2 直触 L3/L4/L5（跨层违规 11 处），其中 sentinel_run 还把 sentinelId 误当 teamId 传给"跑全量哨兵"的函数（**语义级 bug**）；HTTP 桥接工具依赖的白名单缺失三个前缀（生产态 401）。

## 1. Authority Doc Verification

**来源 A**: [L1 全量审计报告](../../../synova/research/L1全量审计-20260907/L1-audit-report.md)（D595 行验收标准，§7）

> "**D595** MCP 认证/权限/打包（DSH 线）| ① 信任模型显式化: stdio 本机信任声明+握手响应能力广告（借鉴 dsh-acp :1143-1163）② 工具权限: 敏感工具（diagnose_organization/ingest_document）走一次性授权语义（借鉴权限桥 :1118-1141）③ **官方 SDK 评估**: 手写 readline JSON-RPC vs @modelcontextprotocol/sdk——倾向迁移（消协议漂移），产出对比结论 ④ 打包: 桌面端内置 or npx 文档化+冒烟测试 ⑤ 契约版本化预备（Stage 2 前置）| 验收: ① 冒烟: 9 工具 stdio 全链路调用绿 ② 认证/权限语义有测试 ③ SDK 结论落盘"

**来源 B**: [L1 全量审计报告 §3.4](../../../synova/research/L1全量审计-20260907/L1-audit-report.md)（MCP 面现状 + 工具缺口清单）

> "index.ts | 349 | MCP **server**（stdio）：手写 JSON-RPC（readline，**非官方 SDK**）暴露 9 工具 | ⚠️ | ……**零认证零权限零打包配置**；启动方式仅文档级 npx tsx src/mcp/index.ts "
> "**缺失候选**: ① 报告与工单查询（GET /api/sentinel/reports、tickets 无 MCP 对应——外部 Agent 拿不到诊断产物）② 知识问答（routes/knowledge-ask 能力未暴露）③ 多轮对话工具（MCP 侧只有一次性 diagnose_organization……）④ 契约版本化元数据（Stage 2 固化前置）。→ 全部列入 D595 评估范围。"

**来源 C**: [L1 全量审计报告 §5](../../../synova/research/L1全量审计-20260907/L1-audit-report.md)（DSH dsh-acp 借鉴，零 import 范式）

> "**D595 直接借鉴**: MCP 工具权限走显式一次性授权语义；server 启动时显式声明能力与信任模型（单机本机信任=明文写入握手响应/README），替代隐式无认证"

**来源 D**: [INTERFACES-STRATEGY.md](../../../synova/coordination/INTERFACES-STRATEGY.md)（产品决策，2026-08-12 创始人定）

> "**MCP** | **P0** | 企业已有 AI agent（codex/workbuddy 等）经 MCP 直接调用 Synova 能力"
> "### MCP（stdio 工具服务）……**缺口**：企业接入的配置文档、认证/权限控制（企业内部数据安全）、工具覆盖与企业 agent 场景核对、与 Electron 打包后 MCP 服务的运行架构"

**来源 E**: [L1 跨层违规扫描](../../../synova/research/L1跨层违规扫描-20260908.md)（哨兵簇修复路径）

> "**哨兵簇（2.1 #1-5/8/12/13）**: src/agent/sentinel-service.ts + sentinel-health-service.ts （L2，均已存在）为唯一出口；MCP 工具与 server webhook 改为调 L2。MCP sentinel_run 内联构造 SqliteGraphStore 的 L4/L5 双重违规随此消除。"

**来源 F**: [D590 spec](SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md)（鉴权裁决继承）

> "① 鉴权=白名单过桥（/api/diagnosis/consult 加白名单，单机本地信任模型）……"（创始人 2026-09-08 三项裁决之一；D590 spec 明确 "MCP server 认证/打包 | 独立任务 | D595"）

**来源 G**: dsh-acp 锚点原文（DSH 0.1.2-rc.1，本 session 实测 `@deepseek-ai/dsh-acp/lib/index.js`，零 import 范式参考）：

- :1118-1141 权限桥——approval/request 处理器只提供 `allow-once`/`reject-once` 两个**一次性**选项，转发客户端 requestPermission 后映射为 `allowed-once`/`rejected`/`cancelled`；
- :1143-1163 能力广告——initialize 响应前**实时探测**（`imagePromptEnabled = await supportsAcpImagePrompts(...)`），探测结果才写进 agentCapabilities，不广告做不到的能力。

## 2. Problem Statement

MCP 是 Synova "Agent，不是 ChatBot" 的物理载体之一：企业的 agent 客户端靠它把 Synova 的哨兵/诊断/本体/知识能力纳入自动化工作流（北星 §一）。但现状（§4 全部亲证）：

1. **信任模型隐式**：stdio server 无任何认证/声明，接入方无从知道"这是本机信任还是需要凭证"；HTTP 侧 D590 已落地"单机本地信任"裁决，MCP 侧无对应显式声明（审计："替代隐式无认证"）。
2. **权限无分级**：只读查询（sentinel_list）与副作用工具（触发哨兵/起 LLM 诊断/写本体）平权暴露，外部 agent 一接上就能花钱（LLM 调用）+ 改数据（工单落库、本体写入）。
3. **工具缺口**：报告查询、工单查询、知识问答三能力在 HTTP 面存在、MCP 面缺失——外部 Agent 拿不到诊断产物（审计 §3.4 缺口①②）。
4. **跨层违规 11 处 + 语义 bug**：哨兵族工具直触 L3（sentinel/registry、sentinel/runner）+ L4/L5（内联构造 SqliteGraphStore(getDatabase())）；且 sentinel_run 把 sentinelId 传进 (teamId, store) 签名——**实际跑的是全量哨兵**，还丢了 D577 阈值注入的 teamId 上下文。
5. **协议漂移风险**：手写 readline JSON-RPC 只处理 initialize/tools/list/tools/call 三个方法，不处理 notifications/initialized，protocolVersion 硬编码 '2024-11-05'。
6. **零打包**：无 npm script，无客户端接入配置文档，冒烟测试不存在。

## 3. Q0-Q4

### Q0: 项目拼图 + 文件审计

**所在层**: L1 交互层 mcp/ 面（5 文件：index.ts 349 行 server / bridge.ts 228 行反向 client / tool-registration.ts 141 行反向注册 / skill-audit-gate.ts / skill-installer.ts）。本任务只动 **server 侧**（index.ts）+ 一个新 L2 出口（sentinel-service.ts 增 listSentinels）+ 白名单三行（auth.ts）。

**复用判定**（全部 grep/read 亲证）：
- L2 哨兵出口已存在：sentinel-service.ts 429 行，已导出 getSentinelFindings / getAggregatedSignals / runSentinelOnce / getSentinelExpertReports / getSentinelTickets / transitionSentinelTicket / injectManualSignal（:127-429）；routes/sentinel.ts:16-24 是 L1→L2 纪律样本。**缺一个 listSentinels 出口**（全仓 grep "listSentinels" 零命中，命名无冲突）。
- 知识问答能力已存在：knowledge-ask.ts:13-29（GET/POST /api/knowledge/ask，q≥2 → {ok, answer, sources, confidence}）——MCP 侧缺暴露。
- 白名单机制已存在：auth.ts isWhitelisted()（:92-114），jwtAuthMiddleware 挂载于 server.ts:315。
- 权限分级范式已存在：dsh-acp 权限桥/能力广告（来源 G，零 import）。

### Q1: 调研

**a) 业界最佳实践**: MCP 官方 SDK（@modelcontextprotocol/sdk，registry 实测 1.30.0）是协议参考实现——手写实现必然漂移（现网已漂：不处理 notifications/initialized、版本硬编码）；官方安全模型对 stdio transport 的定位就是本地进程信任（无网络监听面），认证语义（OAuth/HTTP headers）属于 Streamable HTTP transport，stdio 形态不引入。
**b) 顶级团队**: DSH dsh-acp 的两个机制（权限桥一次性授权 + 探测后能力广告）——本 spec 的权限分级与诚实声明直接对标（来源 G）。
**c) memory 历史教训**: CT-46——mcp/index.ts 曾以 `as never` 逃逸类型门禁（V5.2.7 已修门禁 + D558 清理两处断言）；新代码零 `as any`/`as never`/`as unknown as`（注意：现 sentinel_list 的 `(s.config as unknown as Record<string, unknown>).layer` 断言在搬入 L2 时必须改为直接属性访问——SentinelConfig.layer 已由 V4.2.9 补全，sentinel-loader.ts:247 即字面量赋值证据）。D487/D558 对 mcp/index.ts 的会话装配/类型清理为既有基线，保持不回退。
**决策参考系**: 见 §12（五项决策全走四步框架并收敛）。

### Q2: 范围

**做什么**：
- MCP server 认证姿态落地（stdio 本机信任显式声明——不建 token 机制，见 §12 决策 1）
- 工具读写两级权限 + SYNOVA_MCP_MODE 模式开关 + tools/list 诚实过滤
- 哨兵族 4 工具 L2 化（跨层修复）+ sentinel_run 语义 bug 修复
- 工具补齐 3 个（报告/工单/知识问答）+ flywheel_speeds 诚实化改名
- @modelcontextprotocol/sdk 迁移 + 评估结论落盘
- 打包：npm script + README 接入配置 + stdio 冒烟测试
- 白名单补 3 前缀（修复 HTTP 桥接工具生产态 401）
- 契约版本化预备（initialize instructions 声明 SYNOVA-MCP-CONTRACT: 1）

**不做什么**：见 §6（含文件路径）。

### Q3: 验收

- **入口**: `npm run mcp`（新 script）；企业 agent 客户端按 README 配置片段接入。
- **处理**: initialize（serverInfo + instructions 含信任模型与契约版本）→ tools/list（12 工具，每个含 permission 元数据；read-only 模式只广告读工具）→ tools/call（写工具在 read-only 下被拒 -32000；哨兵族经 L2 执行）。
- **结果**: sentinel_list 返回真实注册哨兵清单（extensions 目录扫描）；sentinel_run 跑**指定**哨兵并走 runner 管线（GS-05 工单闭环 + D577 阈值注入）；报告/工单/知识问答三个新工具可取数；stdio 冒烟测试全链路绿。

### Q4: 契约与测试

新 L2 出口与权限模块契约见 §5.3（JSDoc 三要素 @input/@output/@degraded/@error，铁律 47）；测试三层覆盖见 §7（red→green 先行，铁律 0-2/48；冒烟走真实 stdio 子进程，铁律 12 不 mock 协议管线）。

## 4. Current State（2026-09-08 实测，全部本 session grep/read 亲证）

### 4.1 工具清单（9 个，mcp/index.ts:42-115）

| # | 工具 | 现数据源 | 跨层 | 分级判定（本 spec） |
|---|------|---------|------|------|
| 1 | sentinel_list | 动态 import sentinel/registry（:123） | L1→L3 | read |
| 2 | sentinel_run | 动态 import sentinel/sentinel-runner + init/engine-context + adapters/sqlite-graph-store（:138-147） | **L1→L3+L4+L5** | **write** |
| 3 | sentinel_run_all | 动态 import sentinel/registry（:156），context.db=undefined（:158） | L1→L3 | **write**（GS-05 闭环写工单） |
| 4 | flywheel_speeds | 动态 import sentinel/runner（:169）；空数据时返回捏造值 valueCreation:50/valueCapture:50/valueRegeneration:50/bottleneck:'environment'（:180） | L1→L3 | read（诚实化改名 sentinel_summary） |
| 5 | data_source_status | 动态 import init/engine-context（:193）+ l4/ontology-loader（:203） | L1→L5+L4 | read |
| 6 | diagnose_organization | 进程内 new ConversationEngine（:17 import，:247 实例化）+ store/session-store（:236） | L1→L5 | **write**（LLM 花钱 + 建会话） |
| 7 | query_ontology | HTTP fetch localhost /api/ontology/graph/:orgId（:260-268） | 无 import 违规 | read |
| 8 | ingest_document | HTTP fetch localhost /api/ontology/ingest（:270-284） | 无 import 违规 | **write** |
| 9 | get_session | HTTP fetch localhost /api/sessions（:285-296） | 无 import 违规 | read |

### 4.2 缺陷 A（P0）：sentinel_run 语义 bug——sentinelId 被当 teamId，实际跑全量

mcp/index.ts:137-147 调 `runSentinelForTeam(sentinelId, store)`；而该函数签名是 `(teamId: string, store: GraphStoreReader)` 且实现为 `registry.runAll(context)`（sentinel-runner.ts:29-41）——**第一个参数语义是 teamId，且跑的是全部哨兵而非指定哨兵**；teamId 还从未传入 context（sentinel-runner.ts:35-39 死参数），导致 sentinel-loader.ts:256 的 `ctx.teamId || 'default'` 兜底、D577 阈值覆写永远解析 orgKey='default'。返回值只有 findings 数量（mcp/index.ts:148），绕过 runner 管线 → GS-05 告警闭环（信号聚合→专家→工单）不触发。
**修复路径**: 改调 L2 `runSentinelOnce(sentinelId)`（sentinel-service.ts:210-263——ID 前缀兼容 :214-219、runner 管线 runOnce→aggregateAndDispatch :226-239、降级直连 check :241-257），D577 阈值经 loader check wrapper（sentinel-loader.ts:258-259"唯一生产解析点"）自动注入。

### 4.3 缺陷 B（P0）：跨层违规 11+2 处（D601 扫描 §2 + 本 session 逐行复核）

| 位置 | 违规 | D595 处置 |
|------|------|----------|
| mcp/index.ts:123（sentinel/registry） | L1→L3 | ✅ 修复（走新 L2 listSentinels） |
| mcp/index.ts:138（sentinel/sentinel-runner） | L1→L3 | ✅ 修复（走 L2 runSentinelOnce） |
| mcp/index.ts:140+141（engine-context + sqlite-graph-store） | **L1→L5+L4 双重** | ✅ 修复（L2 内部处理，L1 零 store 构造） |
| mcp/index.ts:156（sentinel/registry） | L1→L3 | ✅ 修复（run_all 走 L2 组合） |
| mcp/index.ts:169（sentinel/runner） | L1→L3 | ✅ 修复（sentinel_summary 走 L2 getSentinelFindings） |
| mcp/index.ts:171（sentinel/types type-position） | 编译期 | ✅ 修复（随 L2 重构消除） |
| mcp/index.ts:193+203（data_source_status） | L1→L5+L4 | ⏳ 不修——D601 图存储/本体簇（§6） |
| mcp/index.ts:231+236（diagnose_organization） | L1→L5 | ⏳ 不修——D601 存储簇（§6） |
| tool-registration.ts:104-105 | L1→L4+L5 | ⏳ 不修——反向 client 侧，D601（§6） |

### 4.4 缺陷 C（P1）：认证/权限/协议/打包四缺

- 零认证：initialize 处理器（mcp/index.ts:316-324）无任何凭证校验，全文件零 token/key 检查逻辑（349 行全文亲读）；信任模型无任何声明输出。
- 零权限：TOOLS 数组无 permission 元数据；无模式开关。
- 协议漂移：手写 readline 循环（:309-343）只处理 3 个方法；notifications/initialized 未处理；protocolVersion 硬编码 '2024-11-05'（:320）；serverInfo.version 硬编码 '0.1.0'（:321，与 package.json 双源——2026-06-03 审计已点名）。
- 零打包：package.json scripts 无 mcp 项（:11-51 亲读）；依赖无 @modelcontextprotocol/sdk；全仓 grep "mcp/index" 零生产消费方（仅文档/测试/自身引用）——权限契约现在定义零破坏面。

### 4.5 缺陷 D（P1）：HTTP 桥接工具白名单缺失 → 生产态 401

白名单实测（auth.ts:92-114）：含 /api/sentinel/* 与 D590 三前缀（consult/conversations/sessions，:110-112），**不含** /api/ontology/graph/、/api/ontology/ingest、/api/knowledge/ask。jwtAuthMiddleware 全局挂载（server.ts:315，import :20；server.ts 无第二份白名单，auth.ts:10"同 server.ts 白名单"注释已过期）。生产态（DEV_MODE=false）下 query_ontology / ingest_document 两个存量工具**现在就是 401 坏的**；knowledge_ask 新工具若不加白名单同样必 401。

### 4.6 可复用资产（亲证存在）

- L2 哨兵服务 7 个函数出口（sentinel-service.ts:127-429）；工单查询自带 source/degraded 双标记（:90-95,351-380）。
- knowledge-ask 契约：GET/POST /api/knowledge/ask，{q≥2} → {ok, answer, sources[], confidence}（knowledge-ask.ts:13-29,59,63-68），自带 PKB 不可用降级模板（:62-68）。
- 白名单机制 + D590 单机信任 JSDoc 先例（auth.ts:86-90）。
- README.md:99 已有"安全模型（D590，单机本地信任声明）"节——本任务扩 MCP 小节。
- SDK 可行性：npm registry 实测 @modelcontextprotocol/sdk **1.30.0**，zod 依赖 `^3.25 || ^4.0` 与仓库 zod 4.4.3 **直接兼容**（无嵌套版本冲突）。

## 5. What We Build

### 5.1 写集 (7 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/mcp/index.ts | 修改 | ①迁移 @modelcontextprotocol/sdk（Server + StdioServerTransport，消协议漂移）②启动时 stderr 信任模型声明 + initialize instructions 能力/信任广告（含 SYNOVA-MCP-CONTRACT: 1）③SYNOVA_MCP_MODE 解析（fail-closed）+ tools/list 模式过滤 + tools/call 权限检查（-32000）④哨兵族 4 工具改调 L2（§5.4）⑤3 新工具注册（§5.5）⑥serverInfo.version 改读 package.json（消双源） |
| src/agent/sentinel-service.ts | 修改 | 新增 L2 出口 listSentinels()（契约 §5.3；代码真搬自 mcp/index.ts:124-128 的 registry 映射，L2→L3 合法） |
| src/middleware/auth.ts | 修改 | isWhitelisted() 加 3 前缀：/api/ontology/graph/、/api/ontology/ingest、/api/knowledge/ask（§5.6 缺陷 D；JSDoc 补 D595 注，同步修正 :10 过期注释） |
| package.json | 修改 | ①scripts 增 "mcp": "tsx src/mcp/index.ts" ②dependencies 增 @modelcontextprotocol/sdk（^1.30.0，zod 兼容已实测） |
| README.md | 修改 | "安全模型"节（:99）扩 MCP 小节：stdio 本机信任声明 + 权限模式 + 客户端接入配置片段（mcpServers JSON）+ 12 工具清单表 |
| tests/architecture/graphstore-unify.test.ts | 修改 | 调用点清单移除 src/mcp/index.ts, 计数 11→10（count 断言 :113 同步）——跨层修复后该文件不再含 SqliteGraphStore，棘轮断言必须同步，否则实现必红（:88-114 亲证） |
| docs/synova/coordination/INTERFACES-STRATEGY.md | 修改 | MCP 现状节更新：工具清单 9→12、缺口四项标注 D595 处置状态（M7 防漂移；:24 现清单已过时——只列 6 工具） |
| src/mcp/ | 新建 | 目录级条目（D580/D590 先例）：tool-definitions.ts——12 工具元数据（name/description/inputSchema/**permission**）+ 纯函数处理器 + filterToolsByMode/resolveMcpMode/assertToolAllowed（§5.3）；实现提交后精确化 |
| tests/mcp/ | 新建 | 目录级条目：tool-permissions.test.ts（单元，§7 表 T1-T10）+ server-smoke.test.ts（stdio 全链路集成）；实现提交后精确化 |
| docs/synova/research/ | 新建 | 目录级条目：MCP-SDK-评估结论-20260908.md——手写 vs SDK 对比结论落盘（审计 D595 行验收③） |

> 实现提交时目录级条目精确化为确切文件名（`git diff --name-only` 对账口径随之切换为文件级）。

### 5.2 认证/信任模型（决策 1 结论：stdio 本机信任显式化）

- **不建 token 机制**（API key/JWT 均不做，论证见 §12 决策 1）：stdio transport 的信任边界 = 能 spawn 本进程的本地用户，无网络监听面；HTTP 侧等价物是 D590 白名单裁决（单机本地信任），MCP stdio 是其更强形态。
- **显式声明三件套**（替代隐式无认证，对标 dsh-acp :1143-1163）：
  1. 启动时 stderr 一行：`[mcp] 信任模型: stdio 本机信任（无网络监听）| 模式: <mode> | 契约: SYNOVA-MCP-CONTRACT 1`；
  2. initialize 响应 instructions 字段写入信任模型 + 权限分级说明（机器可 grep 串 `SYNOVA-MCP-CONTRACT: 1`，契约版本化预备——Stage 2 契约冻结的挂点）；
  3. README"安全模型"MCP 小节（面向企业接入方的书面声明）。

### 5.3 权限模型（决策 2 结论：读写两级 + 模式开关 + 诚实广告）

tool-definitions.ts 契约（新文件，铁律 47 先行）：

```typescript
/**
 * 工具权限分级 + 模式过滤 — MCP server 权限模型（D595）
 * 契约:
 *   @input  — TOOLS: ToolDef[]（含 permission: 'read' | 'write' 元数据）
 *             mode: 'full' | 'read-only'（env SYNOVA_MCP_MODE，默认 'full'）
 *   @output — filterToolsByMode(tools, mode): read-only 只返回 read 工具（tools/list 诚实广告——
 *             不广告调用不了的写工具，对标 dsh-acp :1143-1163 探测后广告）
 *             assertToolAllowed(name, mode): read-only 下调写工具 → 抛 McpError code -32000
 *             （JSON-RPC Server error 区间，message 含 PERMISSION_DENIED + 工具名 + 当前模式）
 *   @degraded — resolveMcpMode(): env 值非法（非 full/read-only）→ log.warn + 返回 'read-only'
 *             （安全控制显式设置但非法 → fail-closed，不静默回 full）
 *   @error  — McpError（-32000 PERMISSION_DENIED / -32601 未知工具，SDK 标准映射）
 */
```

分级判定依据：write = 触发 LLM 花费（diagnose_organization）、写库（sentinel_run/run_all 的 GS-05 工单闭环——L2 runSentinelOnce :233 aggregateAndDispatch 落 sentinel_tickets；ingest_document 写本体）。

### 5.4 哨兵族 L2 化（缺陷 A/B 修复）

| 工具 | 修复后数据源（全部 L1→L2） | 输出契约 |
|------|--------------------------|---------|
| sentinel_list | 新 L2 listSentinels() | { ok, total, sentinels: [{id,name,layer,priority,mode}] }（形态对齐现输出，零消费方故无兼容包袱） |
| sentinel_run | L2 runSentinelOnce(sentinelId) | { ok, sentinelId, findings: n, degraded?, error? }——**单哨兵语义** + GS-05 闭环 + D577 阈值注入 |
| sentinel_run_all | L2 listSentinels() 取 id → Promise.allSettled(runSentinelOnce(id)) | { ok, total, ran, failed, results: [{sentinelId, ok, findings}] }（替换现 :156-165 的 db:undefined 直检——该形态下多数 compute 拿不到 store 全靠降级） |
| sentinel_summary（自 flywheel_speeds 改名） | L2 getSentinelFindings({limit:200}) | { ok, total, critical, warning, info, overall }（overall = 严重度均值分，复用现 :183-184 的 sev 映射；**删除捏造的 valueCreation:50 等字段**——诚实降级，铁律 24） |

listSentinels() JSDoc 契约（写入 sentinel-service.ts）：

```typescript
/**
 * listSentinels — 哨兵清单查询（D595 新增 L2 出口，供 MCP sentinel_list 消费）
 * 契约:
 *   @input  — 无参
 *   @output — { ok: true, total, sentinels: Array<{id,name,layer,priority,mode}> }
 *             （layer 直读 config.layer——SentinelConfig 已含该字段（sentinel-loader.ts:247 赋值证据），
 *              禁止 as unknown as 断言，CT-46）
 *   @degraded — registry 扫描失败 → log.warn + { ok: false, total: 0, sentinels: [] }（铁律 24 不静默）
 *   @error  — 不抛（分类返回，模式对齐 getSentinelFindings :167-170）
 */
```

### 5.5 工具补齐（9 → 12）

| 新工具 | 分级 | 数据源 | 契约 |
|--------|:---:|--------|------|
| sentinel_reports | read | L2 getSentinelExpertReports() | 透传 { ok, reports }（审计缺口①：报告查询） |
| sentinel_tickets | read | L2 getSentinelTickets(status?) | 透传 { ok, source, degraded?, tickets }（degraded 标记随链传播，铁律 31；审计缺口①：工单查询） |
| knowledge_ask | read | HTTP GET localhost /api/knowledge/ask?q=（Pattern B，与 query_ontology/get_session 同款；API 不可达 → { ok: false, error: '知识问答 API 不可达——请确保 SynovaAgent 服务已启动' }，对齐 :267 惯用語） | { ok, answer, sources, confidence }（审计缺口②：知识问答） |

多轮对话工具（审计缺口③）**不补**——论证见 §6 与 §12 决策 5。契约版本化（缺口④）= §5.2 的 SYNOVA-MCP-CONTRACT: 1。

### 5.6 白名单对齐（缺陷 D 修复，auth.ts）

isWhitelisted() 在 :112（sessions 行）后追加三行，JSDoc 增补 D595 段（单机信任模型同 D590 论证）：

```typescript
path.startsWith('/api/ontology/graph/') || // D595 — MCP query_ontology HTTP 桥（单机信任模型）
path === '/api/ontology/ingest' ||         // D595 — MCP ingest_document HTTP 桥（单机信任模型）
path.startsWith('/api/knowledge/ask') ||   // D595 — MCP knowledge_ask HTTP 桥（单机信任模型）
```

### 5.7 SDK 迁移要点（决策 3 结论：迁移）

- `Server`（低层）+ `StdioServerTransport` + `ListToolsRequestSchema`/`CallToolRequestSchema`；工具处理器全部留在 tool-definitions.ts（纯模块，单元测试直接 import，不 spawn 进程）；index.ts 只做装配/模式解析/错误映射。
- 迁移顺带修：notifications/initialized 由 SDK 处理；protocolVersion 由 SDK 协商；serverInfo.version 读 package.json。
- 评估对比结论（手写 vs SDK 的协议正确性/维护成本/依赖体积/迁移风险四维）落盘 docs/synova/research/ 目录评估文档——审计验收③的"SDK 结论落盘"。
- 环境坑（本 session 实测）：默认 ~/.npm/_cacache 存在 root 属主文件 → `npm install` 报 EPERM；绕过 `npm install @modelcontextprotocol/sdk --cache /tmp/npmcache-d595`（或 sudo chown 修复缓存属主）。

## 6. What We Don't Do

| 不做 | 理由 | 归属 |
|------|------|------|
| API key / JWT 认证机制 | stdio 形态无威胁模型支撑（§12 决策 1）；JWT 基建（auth.ts signJwtToken/verifyJwtToken）属 HTTP 面 | 多用户/远程部署阶段（施工图 §5.5）重评 |
| MCP 侧非哨兵跨层违规：mcp/index.ts:193+203（data_source_status）、:231+236（diagnose_organization）、tool-registration.ts:104-105 | D601 扫描治理原则"每簇一个 FIX 任务"（:148）；本任务只清 founder 点名的哨兵簇（L2 服务已存在的簇） | D601 图存储/本体簇 + 存储簇 FIX 任务 |
| src/mcp/bridge.ts + tool-registration.ts 任何修改 | 反向 client（Synova 消费外部 MCP），与 server 侧认证/权限正交；审计判"保留/相当" | 不排（Stage 3 DSH mcp-client 对标时一并） |
| 多轮对话 MCP 工具（审计缺口③） | D590 刚落地 HTTP 对话端点为权威对话面；MCP 侧会话生命周期须与 D587/D588 会话投影对齐，防"会话语义双轨"（审计 §8.2.2 明示风险）；Stage 2 契约固化时随协议一起设计 | Stage 2 |
| Docker 打包 | PRODUCT-BRIEF §六 P2："Docker 部署自动化（等有 3+ GA）"=过度开发 | P2 |
| Electron 桌面端内置 MCP server | INTERFACES-STRATEGY 列为"与 Electron 打包后 MCP 服务的运行架构"待排项，属桌面一体化任务域；本任务交付 npx 文档化 + 冒烟（审计 D595 行④的两选项取后者） | 桌面一体化（待排） |
| MCP server 挂进 HTTP server 进程 / Streamable HTTP transport | 双轨策略 #2 stdio 形态不变；HTTP transport 才引入认证语义 | 远程部署阶段 |
| rate limiting / 多租户 RBAC | 单机信任模型下无意义；多用户按施工图 §5.5 重构 | 施工图 §5.5 |
| check-architecture.sh 四类漏网修补 | 跨切治理归控制塔域（D601 §四），编码线写集外 | CTO 跨切治理 |

## 7. Test Requirements（测试先行，铁律 0-2/48；red→green）

**tests/mcp/tool-permissions.test.ts（L1 单元，直接 import tool-definitions.ts，不 spawn）**：

| # | 用例 | red（修复前） | green（修复后） |
|---|------|------------|--------------|
| T1 | 12 工具全含 permission 元数据；write 集合恰为 {sentinel_run, sentinel_run_all, diagnose_organization, ingest_document} | 无 permission 字段 → red | green |
| T2 | filterToolsByMode('read-only') 排除全部 write 工具；'full' 返回 12 个 | 函数不存在 → red | green |
| T3 | resolveMcpMode: 非法 env 值 → 'read-only' + warn（fail-closed）；缺省 → 'full' | 不存在 → red | green |
| T4 | sentinel_list 处理器 → { ok, total≥0, sentinels 形状 }（经新 L2 listSentinels） | listSentinels 不存在 → red | green |
| T5 | sentinel_run 处理器委托 L2 runSentinelOnce 且**单哨兵语义**（vi.mock sentinel-service 断言入参 sentinelId 原样传递） | 现实现跑全量+teamId 误用 → red | green |
| T6 | assertToolAllowed: read-only 下写工具 → McpError -32000；read 工具放行；full 下写工具放行 | 不存在 → red | green |
| T7 | sentinel_tickets 处理器透传 L2 degraded 标记（mock 返回 memory-fallback → 输出含 degraded:true，铁律 31 传播） | 工具不存在 → red | green |
| T8 | knowledge_ask: API 不可达（PORT 指向关闭端口）→ { ok:false, error 含 '不可达' }，不抛不挂 | 工具不存在 → red | green |
| T9 | initialize 构造块含 instructions 且匹配 SYNOVA-MCP-CONTRACT: 1；serverInfo.version ≠ 硬编码 '0.1.0' 字面量（读 package.json） | 手写实现无 instructions → red | green |
| T10 | sentinel_summary 输出不含 valueCreation/valueCapture/valueRegeneration 捏造字段 | 现 flywheel_speeds :180 返回捏造值 → red | green |

**tests/mcp/server-smoke.test.ts（L2a 集成 + L2b 降级 + L2c 边界，真实 stdio 子进程，铁律 12 不 mock 协议）**：spawn tsx src/mcp/index.ts （win32 走 resolveCommand 同款 shell 兼容——bridge.ts:23-28 先例）：

| 阶段 | 场景 | 断言 |
|------|------|------|
| S1（SYNOVA_MCP_MODE=read-only） | initialize | resp.serverInfo.name='synova-agent' + instructions 含 SYNOVA-MCP-CONTRACT: 1 |
| S2 | tools/list | 全部为 read 工具（无 sentinel_run/diagnose_organization/ingest_document/sentinel_run_all） |
| S3 | tools/call sentinel_run | JSON-RPC error code -32000 |
| S4 | tools/call sentinel_list | result.content[0].text 解析后 ok:true 且 total≥0（L2 全链路：进程内 registry 扫描，无需 HTTP/LLM——诚实绿可复现） |
| S5（SYNOVA_MCP_MODE=full） | tools/list | 12 工具全广告 |
| S6（L2c 边界） | 未知工具 / 非法 JSON 行 / 缺参调用 | SDK 标准错误码（-32601 等）；进程不崩（stderr 有日志，stdout 纯度保持） |
| S7（L2b 降级） | SYNOVA_MCP_MODE=bogus | 启动 stderr 含 warn 且行为=read-only（fail-closed 生效） |

**tests/architecture/graphstore-unify.test.ts（更新）**：callSites 移除 src/mcp/index.ts, 计数断言 11→10（:88-114）——非 red 用例，随修复同步的棘轮基线更新（D352 用例 8 同款"回归确认（非 red）"标注）。

**既有回归**：tests/mcp/bridge.test.ts（反向 client，不受影响零改动）、vitest 全量零新失败（铁律 36）。

## 8. Wiring Verification

| 新 export / 变更 | 生产调用点（真实传递，测试调用不计——S-3） | 验证 |
|------|--------------------------------------|------|
| sentinel-service.ts `listSentinels` | src/mcp/index.ts sentinel_list 处理器（工具调用链：外部 agent → stdio → SDK → 处理器 → L2） | grep -n "listSentinels" src/mcp/index.ts src/agent/sentinel-service.ts ≥2 命中且 import 链真实 |
| L2 `runSentinelOnce`/`getSentinelFindings`/`getSentinelExpertReports`/`getSentinelTickets` | src/mcp/index.ts 对应处理器（新增 MCP 消费方；既有消费方 routes/sentinel.ts:16-24 保持） | grep -n "sentinel-service" src/mcp/index.ts ≥1 ；grep -rn "from '../agent/sentinel-service'" src/ ≥2 文件 |
| 白名单 3 前缀 | src/mcp/index.ts knowledge_ask/query_ontology/ingest_document 的真实 fetch 请求（生产态 DEV_MODE=false 非 401） | grep -n "api/knowledge/ask" src/middleware/auth.ts src/mcp/index.ts 两侧对应 ；冒烟 S4 类似链路证明中间件外（stdio 直连进程内 L2）不受影响，HTTP 桥前缀以 auth.ts 单测断言 |
| tool-definitions.ts 权限元数据 | src/mcp/index.ts 装配（SDK setRequestHandler 消费 filterToolsByMode/assertToolAllowed） | grep -n "filterToolsByMode" src/mcp/index.ts ≥2 |
| package.json "mcp" script | README 接入片段 + 编码指令验收命令（`npm run mcp` 可启动） | `grep -n '"mcp"' package.json` |
| graphstore 棘轮更新 | tests/architecture/graphstore-unify.test.ts callSites（src/mcp/index.ts 移出） | grep -c "SqliteGraphStore" src/mcp/index.ts = 0 + 棘轮测试绿 |

**入口→交互→结果闭环（铁律 4/7）**：入口 = `npm run mcp` 或企业 agent 配置接入 → 交互 = initialize/tools/list/tools/call（权限过滤与拒绝）→ 结果 = 12 工具真实取数/受控执行（冒烟 S1-S7 全链路证明）。

## 9. Architecture Layer

**L1 交互层（mcp/ 面）为主 + 一处 L2 接口新增**。理由：MCP server 是 AGENTS.md 五层定义的 L1 交互面（与 routes/、tui/ 并列）；哨兵族修复方向 = L1→L2（sentinel-service.ts 新增 listSentinels 出口，L2→L3 registry 访问合法），完全对齐 routes/sentinel.ts 纪律样本与 D601 扫描 §三.2 总纲；不新造跨层桥接（knowledge 走既有 L1 HTTP 桥惯例 + 白名单，不新建伪 L2）。auth.ts 属 middleware（L1 基础设施），白名单变更与 D590 裁决①同域。

## 10. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: 权限分级落地——T1/T2/T3/T6 绿；12 工具 permission 元数据 + read-only 过滤 + -32000 拒绝（冒烟 S2/S3）
2. **DS2**: 信任模型显式化——stderr 启动声明 + initialize instructions（T9 + 冒烟 S1）+ README MCP 小节（含 mcpServers 配置片段与 12 工具表）
3. **DS3**: 哨兵族 L2 化——listSentinels 新出口（契约 §5.4 JSDoc 三要素）+ sentinel_run 单哨兵语义修复（T5）+ run_all/summary 重构（T10）+ grep -c "SqliteGraphStore" src/mcp/index.ts 为 0 + graphstore 棘轮 11→10 绿
4. **DS4**: 白名单对齐——3 前缀生效（auth.ts 单测断言）+ :10 过期注释修正 + JSDoc D595 注
5. **DS5**: 3 新工具（sentinel_reports/sentinel_tickets/knowledge_ask）注册且 T7/T8 绿
6. **DS6**: SDK 迁移完成——@modelcontextprotocol/sdk 入 dependencies + notifications/initialized/版本协商由 SDK 承担 + serverInfo.version 读 package.json + 评估结论文档落盘（docs/synova/research/ 目录）
7. **DS7**: 打包——`npm run mcp` 可启动 + 冒烟 S1-S7 全绿（真实 stdio 子进程）
8. **DS8**: 工具契约——tools/list 返回 12 工具（S5）；INTERFACES-STRATEGY.md 现状节与代码一致（M7 拉平）
9. **DS9**: 回归——全量 vitest 零新失败（铁律 36）；tests/mcp/bridge.test.ts 零改动仍绿
10. **DS10**: 类型与门禁——as any/as never/as unknown as = 0（CT-46，含新 L2 代码禁 as unknown as 断言）+ pre-commit 全过（禁 --no-verify）+ `git diff --name-only` 与写集一致（实现提交后目录级条目精确化）
11. **DS11**: 降级诚实——resolveMcpMode fail-closed（S7）+ L2 degraded 标记传播到工具输出（T7）+ 零静默 catch（铁律 11/24/31）
12. **DS12**: 完成报告含决策记录（§12 五项决策的参考系与结论，S-12）——K3 可核

## 11. Auth Doc References

- docs/synova/research/L1全量审计-20260907/L1-audit-report.md（§1 摘要"MCP 有服务无防護"行 / §2 表 D 行 / §3.4 全节 + 工具缺口清单 / §3.6 DSH 对标行 / §5 dsh-acp 行 / §7 D595 行 / §8.1 裁决③ / §8.2 依赖与风险）
- docs/synova/research/L1跨层违规扫描-20260908.md（§2.1 #1-4、§2.2 #1-3、§2.3a #4、§2.3b #3-6、§2.4 #1、§三.2 哨兵簇、§三 治理原则、§四 门禁另案）
- docs/synova/coordination/INTERFACES-STRATEGY.md（2026-08-12 创始人产品决策：MCP=P0 + 缺口四项）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md（裁决① 继承 + :278 MCP 归属 D595）
- L1→L2 纪律样本：src/routes/sentinel.ts 与 src/agent/sentinel-service.ts ；白名单：src/middleware/auth.ts ；知识契约：src/routes/knowledge-ask.ts
- 哨兵阈值与缺陷现场：sentinel-loader.ts:252-293（D577 阈值唯一生产解析点）+ sentinel-runner.ts:29-41（缺陷 A 现场）
- DSH 锚点（零 import 范式）：node_modules/@deepseek-ai/dsh-acp/lib/index.js:1118-1141（权限桥）、:1143-1163（能力广告）——L1 审计 §5 备妥，本 session 原文实测
- tests/architecture/graphstore-unify.test.ts:88-114（棘轮基线，必须同步）
- AGENTS.md 铁律 4/5/11/24/31/33/38/39/47/48 + CLAUDE.md 五层架构

## 12. 决策参考（S-12，多选项任务决策记录）

| # | 决策点 | 选项 | 参考系 | 结论 |
|---|--------|------|--------|------|
| 1 | 认证方案 | a) API key / b) JWT（复用 auth.ts）/ c) stdio 本机信任显式声明 | 第一性原理（stdio 信任边界=本地 spawn 权限，无网络面→token 无威胁模型可防）+ D590 裁决①（单机本地信任，产品定位本地部署）+ dsh-acp（"显式声明信任模型替代隐式无认证"，审计 §5）+ MCP 官方（认证语义属 HTTP transport） | **c**——三件套显式声明（§5.2）；a/b 归多用户阶段（施工图 §5.5） |
| 2 | 权限模型 | a) 全有或全无 / b) 读写分级 | dsh-acp 权限桥（一次性授权语义，:1118-1141）+ 第一性原理（工具副作用差异真实存在：LLM 花费/写库 vs 纯读）+ 铁律 1 最小机制（两级够用，不建角色系统） | **b**——permission 元数据 + SYNOVA_MCP_MODE 两级；tools/list 诚实过滤对标能力广告（:1143-1163） |
| 3 | 手写 vs 官方 SDK | A 保留手写+补协议 / B 迁移 SDK | 审计 D595 行（"倾向迁移（消协议漂移）"）+ Anthropic 基线（不手滚协议实现）+ 开源实证（SDK=协议参考实现，1.30.0 实测，zod ^3.25‖^4.0 与仓库直接兼容） | **B**——迁移；对比结论落盘评估文档（审计验收③）；安装受阻 → 显式上报，禁静默回退手写 |
| 4 | flywheel_speeds 处置 | A 保名修数据源 / B 改名 sentinel_summary | 铁律 5 诚实（:180 捏造 valueCreation:50 从未真算三飞轮，名字即虚假广告）+ 零消费方（grep 亲证，改名零破坏） | **B**——输出诚实化（严重度汇总），三飞轮真算归产品需要时的独立任务 |
| 5 | 工具补齐范围 | 全补 4 缺口 / 补 3 缺口（报告/工单/知识）+ 多轮对话缓 | 审计 §8.2.2（会话语义双轨风险：D587/D588 在途）+ D590 已立 HTTP 权威对话面 + 第一性原理（MCP 多轮需会话生命周期设计，属 Stage 2 契约固化域） | **补 3 缓 1**——多轮对话工具归 Stage 2，随契约版本化一起设计 |

> 收敛检查：五项决策的第一性原理与权威参考均指向同一结论，无分歧残留。**参考：Anthropic/DeepSeek/第一性原理 + 结论**（K3 可核）。
