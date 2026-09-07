---
north-star:
  服务用户: GA（增长顾问）与桌面端用户——配置完 LLM 后要能立即与 Agent 多轮对话，而不是面对只会一次性诊断的"发射器"
  服务场景: D575 向导配完 key → 用户在桌面端/HTTP 发一句话 → SSE 逐字流式回答 → 会话落库，重启后仍可查
  模块终态: 对话 SSE 端点把 ConversationEngine 接进 HTTP 与桌面端；会话进 SessionStore（D500 事件溯源）；诊断 consult 与对话端点免 401；upload-v2 假绿源 410 下线
  对齐北星: PRODUCT-BRIEF.md §三"Synova 怎么工作"（Agent 不是 ChatBot——多轮访谈是对话式诊断的入口）+ §六 P0"没有这些不能给 GA 用"
  完成标准: DEV_MODE=false 生产态 curl 发消息 → SSE token 流返回 → GET /api/sessions/:id 可查全轮次；断线重连不丢已见内容；全量 vitest 零新失败
  当前进度: ConversationEngine 生产调用方仅 CLI/TUI/MCP/IM（HTTP 面零对话端点）；web-adapter.ts 零消费者；auth 白名单不含 consult → 桌面首条消息即 401。本 spec = D590 实现规格，编码线未开工
---

<!--
  SYNOVA-IMPL-DSH-D590: 对话 HTTP SSE 端点 + SessionStore 持久化 + 鉴权落地
  状态: dev doc | 2026-09-08 | 优先级 P0（L1 审计 P0-1 对话断链 + P0-3 假绿源下线裁决）
  权威文档: L1 全量审计报告 §2/§5/§7/§8 + 创始人三项裁决（2026-09-08，已登记台账）+ AGENTS.md 铁律 0-2/4/5/24/31/38/39/47/48
  依赖: D575（已交付）；D587/D588 已落 main（ccbbc9ac / eebd9c99，写集语义零冲突，见 §3 Q0c）
  并行: D591（桌面端对话接线）依赖本任务；与 D593/D596 写集零交集
  编码线: Claude Code（src/routes + l1-interaction + middleware 归 Claude 写集例外内）
-->

# D590: 对话 HTTP SSE 端点 + SessionStore 持久化 + 鉴权落地

> 一句话问题: 对话引擎从未与 HTTP 相连——ConversationEngine 的生产调用方只有 CLI/TUI/MCP/IM 四个进程内入口，HTTP 面零对话端点；为对话流而写的 WebViewAdapter 零消费者（死代码）；auth 白名单不含 /api/diagnosis/consult，桌面端配完 LLM 后首条消息即 401；diagnosis-upload-v2 全部任务必 failed（假绿源）占着 /api/diagnosis/upload 路由。

## 1. Authority Doc Verification

**来源 A**: [L1 全量审计报告](../../synova/research/L1全量审计-20260907/L1-audit-report.md)（2026-09-07，2026-09-08 复核修订版）

> §1: "对话引擎从未与 HTTP/桌面端相连——ConversationEngine 的全部生产调用方 = cli.ts:20 / tui-v2/index.ts:41 / mcp/index.ts:17 / l1/im-inbound.ts:170。**routes/ 无任何对话端点**；桌面端对话组件悬空。"

> §2 结构性结论 2: "ViewAdapter 抽象建了没用: l1-interaction/types.ts 定义 7 方法接口，web-adapter.ts 实现 SSE 版……两个实现都零生产消费者。这是'M3 机制建成未接线'的教科书案例（好在只是没接线，不是没造）。"

> §7 D590 行（验收标准原文）: "① DEV_MODE=false 生产态下 curl 发消息→token 流式返回→回复在 GET /api/sessions 可查 ② 断开重连不丢已见内容 ③ 全量 vitest 零新失败。"

> §5 DSH 借鉴锚点: dsh-agent-loop 请求重建 invariant（lib/invariant.js:15-33）+ 中断锚（lib/index.js:637-655）；dsh-api-gateway 帧协议+心跳（lib/index.js:122-133, :199-269）。**零 import，范式借鉴**（G1 零依赖红线）。

**来源 B**: 创始人三项裁决（2026-09-08 在座裁定，已登记台账）

> ① 鉴权=白名单过桥（/api/diagnosis/consult 加白名单，单机本地信任模型）；② upload-v2 路由下线（返回 410 Gone）；③ TUI 保留不动。

**来源 C**: [AGENTS.md](../../../AGENTS.md) 铁律 0-2（测试先行+接线验收）、铁律 4/5（交付不完整/后端能力≠用户可用）、铁律 24/31（异常处理+降级信号传播）、铁律 38（as any 零容忍）、铁律 39（五层架构边界）、铁律 47/48（契约优先/测试非空壳）。

**来源 D**: [D575 LLM 配置向导 spec](SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md)——向导端点 /api/llm/* 免认证挂载先例（server.ts:293-298）。

## 2. Problem Statement

对齐北星锚定块：产品的交互叙事是"配置完即可对话"（D575 承诺），但生产态这条链在三处断裂——

1. **对话引擎 HTTP 面零暴露**：产品叙事"Agent，不是 ChatBot；驻扎企业"要求多轮对话可从任意交互面进入。现状 HTTP 面唯一的"对话页"（routes/chat.ts 内嵌页）实为一次性诊断发射器（其 JS 只调 POST /api/diagnosis/consult），多轮对话只能进 TUI/CLI。
2. **桌面端 401 断链（审计 P0-1）**：jwtAuthMiddleware 全局门禁（server.ts:298），白名单（auth.ts:86-105）不含 /api/diagnosis/consult；桌面 renderer 零凭证代码；DEV_MODE 逃生口实测不触发。D575 只豁免了向导 3 端点（挂载序），没豁免"配置完要用的端点"——**"配置完即可用"承诺生产态不成立**。
3. **假流式无水源（审计 §3.4）**：useStreaming 的 16ms buffer 管道零数据流入——根因是上游 401 + 诊断 SSE 事件是整块消息。修 ② 是 ③ 的前置，逐字 token 流是 D591 的活，但 SSE 帧契约（token/agent_message 事件）必须由本任务（生产者侧）先落。
4. **假绿源占道（裁决 ②）**：diagnosis-upload-v2.ts:553 DocExtractor=null + :558 new(null) 在 try 外 → POST /api/diagnosis/upload 所有任务必 failed；:607/:623 硬编码空输出却自标 "@state: real"。创始人裁决下线（410 Gone）。
5. **会话不可恢复**：引擎消息只存内存（this.messages），HTTP 调用方无人做"历史重建"——IM 通道的恢复代码（im-inbound.ts:190-194）调用的 `addToHistory?.()` 在引擎上**不存在**，静默 no-op（本次实测新发现，同 tui-v2 `processUserInput?.()` 的 M3 模式）。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

a) **项目拼图**：Synova 五层架构中，本任务在 **L1 交互层**（routes/ + l1-interaction/ + middleware/）+ 一处 L2 消费（ConversationEngine 公开 API，零 L2 代码修改）。L1 现有 51 个路由文件全部接线（审计 §3.1），但对话轨缺位；SessionStore（L5）已有完整事件溯源能力（D500）等待消费。

b) **文件审计**（grep 实测 2026-09-08）：
- grep -rn "/api/chat"（范围 src/ 全仓）→ **零结果**（权威文档05"chat.ts 有 /api/chat/stream"系 M2 漂移，审计附录A 已勘误）
- grep -rln "conversation-engine"（范围 src/ 全仓，排除自身）→ cli.ts、tui-v2/index.ts、mcp/index.ts、l1/im-inbound.ts、orchestrator/context-engine.ts、store/session-store.ts（类型引用）——**routes/ 零引用**
- grep -rn "web-adapter"（范围 src/ 全仓）→ 仅自身文件，**零消费者**
- 复用判定：SessionStore.addMessage/appendEvent/getMessages/saveState/loadState/serialize/fromState 全部现成（§4.4）；ViewAdapter 接口现成（l1-interaction/types.ts:11-31）；**不新建存储、不改 L2**

c) **决策**：已有覆盖 → 复用 + 接线。无覆盖需新建的仅 conversations 路由文件本体。

### Q1: 调研

a) **业界最佳实践**：SSE 对话流事实标准 = OpenAI chat completions 流式（`data: {json}` 帧 + `[DONE]` 终止）+ 注释帧心跳防代理空闲断连；Express SSE 用原生 res.write（无需 socket.io——单机本地场景引库即过度设计）。
b) **DSH 范式**（锚点已一手验证 2026-09-08，零 import）：
- **请求重建不变量**（dsh-agent-loop lib/invariant.js:15-33 原文）：`if (JSON.stringify(options.messages) !== JSON.stringify(expected)) fail("...log-reconstruction desync")`——本任务落为"重放自检"测试：SSE 交付序列 ≡ SessionStore 事件流投影。
- **中断锚**（lib/index.js:637-655 原文）：abort 后已投递前缀以 `interrupted: true` 锚落会话日志，历史仍可重放——本任务落为"断线后完整回复落库（已见前缀 ⊂ 落库内容）"。
- **帧协议+心跳**（dsh-api-gateway lib/index.js:122-133 open/cancel 帧严格校验、:199-215 mux server + heartbeatIntervalMs）——本任务落为 open/token/agent_message/end/error 帧语义 + 心跳注释帧。
c) **memory/ 历史教训**：D316（声称"实测"须有物理证明→本 doc 全部 file:line 当场 grep/read）；D381/D384（写集表格式契约+取号纪律，D590 号已由 alloc-task-id 登记 task-state/D590.json）；D576（诚实交付：不虚报"已验证"）；M3 模式两例（tui-v2 processUserInput?.() 与 im-inbound addToHistory?.()——**接线必须 read 被调用方真实定义，禁从 import 线索猜接口**）。

### Q2: 范围 — 正确的最简方案

**做什么**：对话 SSE 端点（新建 1 个路由文件，复活 web-adapter）；会话持久化接线（复用 D500 双写 + serialize/saveState，**零 schema 变更**）；白名单三前缀 + 单机信任模型声明；upload-v2 下线（410 + 删文件 + ga-diagnosis 轮询止停）；chat.ts 浏览器脚本 log bug 修复（4 处）；SSE 帧契约对齐桌面 sse-contract.ts。

**不做什么（含文件路径）**：见 §6。

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**：`POST /api/conversations`（body `{message, sessionId?}`）——DEV_MODE=false、无 Authorization 头可达（白名单）。
- **交互**：SSE 流式返回——`open`（含 sessionId 回声）→ `token`×N（逐字）→ `agent_message`（全文）→ `end`；访谈完成（phaseComplete）时诊断事件 flat 透传进同一条流。
- **结果**：`GET /api/sessions/:id` 可查全部轮次（重启后仍在）；断线重连不丢已见内容；upload-v2 五路由返回 410 Gone。

### Q4: 契约与测试（铁律 47/48，写代码前定义）

新路由模块契约（详细帧协议见 §5.2）：
- `@input` — POST body `{message: string(1..8000), sessionId?, orgId?}`；req.app.locals.orchestration.db
- `@output` — SSE 流（open/token/agent_message/status/system_message/诊断事件/complete/error/end）或流前 JSON 错误（400/404/409/503）
- `@degraded` — db 缺失/非 SQLite → 503 `{ok:false, code:'STORE_UNAVAILABLE', degraded:true}` fail-closed（会话持久化是本任务的存在理由，静默降级 = 假绿）；store.addMessage 双写失败 → lastDegraded 信号 + 流内 error 帧 + log.error（铁律 24/31）
- 测试：tests/routes/conversations.test.ts 集成测试走真实路由（铁律 12：express app + listen(0) + fetch，仅 mock provider/config 与诊断引擎工厂——沿 tests/routes/diagnosis-consult-events.test.ts 既有模式），≥12 用例覆盖正常/降级/边界（§7）。

## 4. Current State（2026-09-08 实测，全部 grep/read 当场验证）

> 路径约定：本节行文引用相对 src/ 目录（省写前缀）；写集表（§5.1）与接线表（§8）用仓库全路径。

### 4.1 缺陷 A（P0）：对话引擎 HTTP 面零暴露 + web-adapter 死代码

- ConversationEngine 生产调用方（`grep -rln` 实测）：cli.ts、tui-v2/index.ts、mcp/index.ts、l1/im-inbound.ts。routes/ 51 文件中无对话端点（grep -rn "conversation"（范围 src/routes/ 全目录）仅 diagnosis.ts 变量命名命中）。
- l1-interaction/web-adapter.ts（71 行）：WebViewAdapter 完整实现 ViewAdapter 七方法（SSE 头 :22-25、emit :28-34、appendToken→'token' :44-47、close :66-70），grep -rn "web-adapter"（范围 src/ 全仓）零消费者。**它就是为对话流准备的，从未接线**（审计 §1 原话）。
- 引擎挂点现成：setViewAdapter（agent/conversation-engine.ts:453-455）、processMessageStream（:707-710，签名 `(userInput: string, onToken: (token: string) => void): Promise<ProcessResult>`，ProcessResult = `{reply, phaseComplete}` :110-114）、viewAdapter 调用点 :734。
- **规范调用方先例 = cli.ts:228-244**（本 spec 持久化时序的权威模板）：

```ts
const result = await conv.processMessageStream(input, (token) => { ... });
store.addMessage(sessionId, 'assistant', result.reply);
store.updateSession(sessionId, { phase: conv.getPhase() });   // session-store.ts:253
store.saveState(sessionId, conv.serialize());                  // serialize: conversation-engine.ts:775
```

- **反面教材（禁复制）**：l1/im-inbound.ts:190-194 用 `(conv as unknown as { addToHistory?: ... }).addToHistory?.(m.role, m.content)` 恢复历史——grep -n "addToHistory"（范围 src/agent/ 与 src/orchestrator/ 两目录）**零定义**，整段恢复是静默 no-op。正确的恢复 API 是 `ConversationEngine.fromState(provider, state, wiring)`（:789-802，wiring 接 sessionManager/sessionStore/sessionId）。

### 4.2 缺陷 B（P0）：鉴权白名单断链（桌面 401 根因）

- middleware/auth.ts:86-105 isWhitelisted()：含 /health、/api/auth/login、/api/sentinel/、/api/cockpit/ 等 16 条匹配规则，**不含 /api/diagnosis/consult、不含任何对话/会话端点**（亲证）。
- 中间件序（server.ts）：:297 llmConfigRoutes（先于 JWT——D575 向导免认证设计）→ :298 jwtAuthMiddleware → :301 authRoutes → :306 rateLimit(100/60s) → :337 diagnosisRoutes → :338 sessionsRoutes。
- DEV_MODE 逃生口（auth.ts:260-273）：`!secret && DEV_MODE==='true'` 才放行；生产 .env DEV_MODE=false（审计亲证）→ 不触发。
- 桌面端零凭证：electron-renderer 下 hooks/useStreaming.ts:200 裸 `fetch(POST /api/diagnosis/consult)` 无 Authorization 头 → 首条消息即 401（审计 §3.4 对话链路图）。
- 后果链：consult 401 → useStreaming 手写 SSE 解析（:220-260，本身是好的）无水 → scheduleFlush（:63-69）无调用方 = 假流式（审计 P0-3）。

### 4.3 缺陷 C（P0，裁决 ②）：upload-v2 假绿源占道

- routes/diagnosis-upload-v2.ts（981 行）五路由：GET /upload（:46）、POST /upload（:120）、POST /interview（:429）、GET /report/:jobId（:455）、GET /status/:jobId（:469），挂载于 server.ts:344 `app.use('/api/diagnosis', diagnosisUploadRoutes)`（import :48）。
- :553 `DocExtractor=null` + :558 `new(null)` 在 try 外 → 所有上传任务必 failed（commit 3d8336f6 引入，审计亲证）；:607/:623 测量/专家硬编码空输出却自标 "@state: real"（:3）。
- 活路由零撞路径：routes/diagnosis.ts 五端点全部在 /api/diagnosis/consult* 前缀下（:100/:378/:396/:408/:455），与 upload 五路径（/upload、/interview、/status/:jobId、/report/:jobId）**零交集**——410 拦截可安全精确匹配。
- 删除爆炸半径（grep 实测）：真实 import 仅 tests/test-http-route.ts:16（手动脚本，无 package.json/script 引用）；routes/diagnosis.ts:50 与 services/llm-credential-store.ts:16 为**注释**提及；mvp-server.ts:13 为注释（该文件本身是审计 D596 待清理死文件，本任务不动）；tests/architecture/graphstore-unify.test.ts:98 callSites 数组含该路径（readFileStrict 会因文件删除而断）→ 需同步移除数组项。
- 下游连带：routes/ga-diagnosis.ts:149-164 pollResults 对 !ok 一律 `setTimeout(pollResults, 5000)` 无限轮询——410 下不处理则从"failed 无限轮询"变"410 无限轮询"，必须同步止停（裁决 ② 的完整执行）。

### 4.4 缺陷 D（P1）：会话不可从 HTTP 恢复 + 持久化能力闲置

SessionStore（store/session-store.ts，530 行）**持久化能力已齐**（D500 已交付），零 schema 变更即可承载对话轨：

| 能力 | 位置 | 契约要点 |
|---|---|---|
| createSession(orgId, userId?) | :236 | id = `sess_<ts36>_<rand>` |
| addMessage | :317 | **双写** agent_messages + session_events('message')；失败 lastDegraded=true + log.error（铁律 31） |
| getMessages | :422 | 从事件流派生（deriveMessages :377，message/tool_result 投影、log-only 跳过、半截事件截断+degraded）——"model-visible ⟺ logged" |
| saveState / loadState | :455/:438 | state_json 整体引擎快照；ConversationState（:72-77）与引擎 EngineState（conversation-engine.ts:117-122）同形（orgId/phase/messages/startedAt） |
| updateSession | :253 | phase 更新（cli.ts:241 用例） |
| 引擎快照 API | conversation-engine.ts:775 serialize / :789 fromState | 官方序列化/恢复对 |

断点：引擎 processMessageStream 自身**不持久化**（引擎内 :622 仅 processMessage 的意图分类分支写 sessionManager），持久化责任在调用方——CLI 做了（:238-241），HTTP 面没有调用方。**本任务的"SessionStore 持久化"= 接线复用，非 schema 改造**（D588 会话投影注册表已占 store 层演进线，2026-09-08 落 main，勿重叠）。

### 4.5 缺陷 E（P2）：chat.ts 浏览器脚本引用服务端 log（比审计多 2 处）

- src/routes/chat.ts 内嵌 HTML 的浏览器 JS 引用服务端 `log.warn` → catch 路径 ReferenceError（审计记 :321/:726 两处；**本次 grep 实测共 4 处**：:321、:726、:823、:885；:44 是服务端路由内合法引用不动）。
- 文件头注释（:2-4）"统一 SSE + 进度可视化"不实（审计附录A M7）——内嵌页无对话 SSE，只有诊断发射。

## 5. What We Build

### 5.1 写集 (9 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/server.ts | 修改 | ①import + 挂载 conversations 路由（:338 sessionsRoutes 旁）；②:48 删 diagnosisUploadRoutes import、:344 挂载替换为 410 拦截（§5.2-E） |
| src/middleware/auth.ts | 修改 | isWhitelisted()（:86-105）加三前缀：`/api/diagnosis/consult`（覆盖 consult 五端点族）、`/api/conversations`、`/api/sessions`；JSDoc 更新单机本地信任模型声明（裁决 ①，对齐 /api/sentinel/* 先例） |
| src/l1-interaction/web-adapter.ts | 修改 | 复活改造：①emit 签名 `(type, payload: unknown)` → `data: JSON.stringify(payload)`（帧自描述，桌面解析器 evt.type 直接可用）；②六方法改发对象帧（`{content}`/`{text}`…）；③新增具体类方法 emitDiagnosisEvent(evt)——诊断事件 flat 透传（不加进 ViewAdapter 接口，路由持具体类）；④新增 setOnClosed 钩子供路由感知断开；⑤删死字段 messageBuffer（:17/:45 写而不读） |
| src/routes/conversations.ts | 新建 | 对话 SSE 路由（契约见 §5.2）；实现期由目录级条目精确化——文件已落地，精确路径消除与并行分支的目录级重叠误判（verify-parallel 2026-09-08 CI 实测） |
| src/routes/chat.ts | 修改 | ①:321/:726/:823/:885 四处浏览器脚本 `log.warn({err...},...)` → `console.warn(...)`（消 ReferenceError）；②:2-4 头注释诚实化（"内嵌诊断发射页 + 3 辅助接口"，删"统一 SSE"不实声称） |
| src/routes/ga-diagnosis.ts | 修改 | pollResults（:149-164）加 410 止停：`r.status===410` → 显示"文档诊断已下线，请使用对话诊断"并 return（消无限轮询；裁决 ② 连带） |
| electron-renderer/src/hooks/sse-contract.ts | 修改 | SSEEventType 联合加 `'open' \| 'token' \| 'agent_message' \| 'end'`；SSEEventLike 加 `sessionId?/text?/content?/phaseComplete?`；SSEContractResult 加 `sessionId?`；applySSEEvent 加 open（回声 sessionId）/token/agent_message/end 归约分支（known-passthrough，未知仍 warn）——契约先行，消费在 D591（审计 §8.2.5 预期内改动） |
| README.md | 修改 | 增"安全模型"短节：单机本地信任声明（白名单端点族清单 + 多用户阶段按施工图 §5.5 重构，借鉴 dsh-acp 诚实能力广告） |
| tests/routes/conversations.test.ts | 新建 | 对话端点集成测试（铁律 12 真实路由 + listen(0) + fetch），用例表见 §7；目录级条目精确化同上 |
| tests/architecture/graphstore-unify.test.ts | 修改 | :98 callSites 数组移除 diagnosis-upload-v2 条目（随删除清单） |
| tests/electron/use-streaming-contract.test.ts | 修改 | 新事件类型归约用例（open/token/agent_message/end）+ 既有 15 类型零回归 |

> 注：两个新建文件在 dev doc 交付时以**目录级条目**声明（未存在文件报"文件不存在"假阳；D580 先例）；实现提交后已精确化为确切文件名（src/routes/conversations.ts、tests/routes/conversations.test.ts，契约见 §5.2 / §7）——目录级条目在 verify-parallel 并行对账中与其它分支的 routes 文件产生重叠误判，精确化即消除（2026-09-08 CI 实测）。

### 5.2 关键实现契约

**A. 端点设计（两条路由，单文件）**

```
POST /api/conversations              body {message: string, sessionId?: string, orgId?: string}
POST /api/conversations/:id/messages body {message: string}
```
- 两路由共用同一 handler；前者 sessionId 缺省时 createSession（orgId 缺省 `SYNOVA_ORG_ID \|\| 'default'`，与 auth.ts:267 DEV_MODE 兜底同源）——单飞入口语义（借鉴 dsh-api-session-controller resume/create 单飞范式）；后者 :id 不存在 → 404 `{code:'NOT_FOUND'}`。
- 输入边界（借鉴 dsh-api-gateway assertJsonValue 纯度校验范式）：message 必填、string、1..8000 字符，违规 → 400 `{code:'VALIDATION_ERROR'}`（流前 JSON，不进 SSE）。
- SessionStore 获取走 **D563 既有范式**（diagnosis.ts:175-194 原样）：`req.app.locals.orchestration.db` → 动态 import `{SessionStore, isSqliteDatabase}` → 谓词窄化失败或 db 缺失 → **503 `{ok:false, code:'STORE_UNAVAILABLE', degraded:true}`**（fail-closed：对话轨的存在理由就是落库，静默不落库=假绿）。禁学 im-inbound 的 `store['db' as keyof ...] as never`（CT-46 零容忍存量，勿复制）。
- Provider/config 构造走 diagnosis.ts:127-133 原样（loadConfig + createProvider + detectProvider，D575 热生效语义自动继承）；loadConfig 抛错（未配 key）→ 400 `{code:'LLM_NOT_CONFIGURED', message:'请先完成 LLM 配置（D575 向导）'}`。
- 引擎装配（每请求实例，无共享态）：

```ts
const saved = store.loadState(sessionId);
const conv = saved
  ? ConversationEngine.fromState(provider, saved, {
      sessionManager: new SessionManager({}, store), sessionStore: store, sessionId })
  : new ConversationEngine(provider, { sessionId, orgId, sessionManager, sessionStore: store });
registerBuiltinTools(conv.getToolRegistry(), store, sessionId,
  () => conv.getPhase(), () => conv.getOrgId());      // 能力对齐 CLI（cli.ts:134 先例）
conv.setViewAdapter(adapter);                           // conversation-engine.ts:453
```

**B. SSE 帧协议**（WebViewAdapter 产出；命名对齐桌面 sse-contract，帧语义借鉴 dsh-api-gateway open/item/end/error + 心跳）

| 帧 | data 载荷 | 时机 |
|---|---|---|
| `open` | `{type:'open', sessionId, phase}` | 流建立即发（sessionId 回声=提交回声语义，客户端据此对账） |
| `token` | `{type:'token', text}` | 每个 onToken（appendToken 直通） |
| `agent_message` | `{type:'agent_message', content}` | 轮次完成（全文回声，非流式消费者兜底） |
| `status` / `system_message` | `{type:'status', message}` 等 | ViewAdapter.setStatus/showSystemMessage 直通 |
| 诊断事件（flat） | 引擎 DiagnosisEvent 原样（type=phase_started 等） | phaseComplete→startDiagnosis 的 onEvent 桥（emitDiagnosisEvent）——**flat 透传**，桌面 sse-contract 十五种既有类型零改动可解 |
| `complete` | `{type:'complete', report...}` | 诊断完成（对齐 diagnosis.ts:82-91 sseClose 形状） |
| `error` | `{type:'error', code, message}` | 引擎/诊断异常（含 store.lastDegraded 传播） |
| `end` | `{type:'end'}` | 终帧 + res.end() |
| 心跳 | `: ping` 注释帧 | 15s interval（本机无代理，取 15s 而非 DSH 的 2s；close/end 时清除） |

**C. 持久化时序**（cli.ts:228-244 权威模板 + 用户消息前置）

```
① addMessage(sessionId,'user',message)   ← 引擎处理前落库（崩溃安全；双写自动进事件流）
② processMessageStream(message, token => adapter.appendToken(token))
③ addMessage(sessionId,'assistant',result.reply)
④ updateSession(sessionId,{phase:conv.getPhase()})
⑤ saveState(sessionId, conv.serialize())  ← 下次请求 loadState→fromState 恢复
```
步骤 ③-⑤ 任一 store 异常：log.error + 流内 error 帧 + `degraded:true`（不静默；铁律 24/31）。

**D. 中断语义（DSH 中断锚 + 重建不变量落地）**

- processMessageStream 无 AbortSignal 参数（:707-710 实测）——**不给引擎加中断 API**（L2 零修改原则），断线后让在途轮次自然 settle（provider 超时兜底）。
- `res.on('close')` → disconnected=true + 清心跳 + adapter 停写；settle 后仍执行 ③④⑤——**完整回复落库**，`已见前缀 ⊂ 落库内容`（中断锚语义：断线重连不丢已见内容，且上下文连续）；log.warn({sessionId}, '客户端断开——回复已完整落库')。
- 重建不变量测试化：`SSE 交付的 token 串 ≡ addMessage 落库的 assistant content`；`loadState→fromState→getMessages ≡ 落库事件投影`（对应 dsh-agent-loop "请求消息必须严格等于持久日志重建结果"）。
- 并发防护：模块级 per-session 忙锁 `Set<sessionId>`，占用中第二请求 → 409 `{code:'SESSION_BUSY'}`（借鉴 dsh-agent-presets 空白会话锁语义；防双引擎同会话交错写 state_json）。

**E. upload-v2 下线（裁决 ②）**

server.ts :344 挂载替换为精确 410 拦截（活路由 /consult* 零误伤，§4.3 已证路径零交集）：

```ts
// D590 裁决②: upload-v2 下线——410 Gone 显式（非静默 404），指路替代入口
app.all(['/api/diagnosis/upload', '/api/diagnosis/interview',
         '/api/diagnosis/status/:jobId', '/api/diagnosis/report/:jobId'],
  (_req, res) => res.status(410).json({ ok: false, code: 'GONE',
    message: '文档诊断 upload-v2 已下线——请改用 POST /api/diagnosis/consult（SSE 六阶段诊断）或对话端点' }));
```

### 5.3 删除清单（2 文件——写集表外列示）

> 不入写集表的原因：check-dev-doc-write-set 的存在性核验与 U2a 反向对账用 `--diff-filter=ACMR`（删除不在其中），删除条目入表会在实现提交时触发"文件不存在"假阳。删除是裁决 ② 的一等公民动作，验收见 DS9。

| 文件 | 理由 |
|---|---|
| src/routes/diagnosis-upload-v2.ts | 假绿源（§4.3）；410 拦截替代挂载；铁律 37：零引用死代码不入仓库 |
| tests/test-http-route.ts | 唯一真实 import 方（:16），整文件围绕 upload 路由的手动脚本（grep 无 script/CI 引用），随删 |

删除后必须 `grep -rn "diagnosis-upload-v2" src/ tests/` 复核：仅剩 diagnosis.ts:50 / llm-credential-store.ts:16 / mvp-server.ts:13 三处注释提及（本任务不改注释外文件；mvp-server.ts 本身归 D596 清理）。

### 5.4 决策参考（S-12/D333）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 复用 web-adapter vs 新建 SSE writer | A 复活 / B 新写 | 第一性原理（最少机制：71 行实现已存在且接口对位）+ 审计 §7（"复活 web-adapter 而非新造"） | **A**——改帧载荷为对象 + 补透传方法，零消费者故无兼容包袱 |
| 持久化方案 | A 新表 / B 复用 D500 双写+state_json | 第一性原理（表已齐，加表=重复造轮子）+ Anthropic 基线（单一事实源：事件流已承载 model-visible⟺logged）+ D588 已占 store 演进线 | **B**——零 schema 变更，写集最小 |
| 白名单范围 | A 仅 consult / B consult+conversations+sessions | 产婆裁决①（过桥）+ 铁律 1 垂直切片（验收"GET /api/sessions 可查"本身无凭证可达才闭环）+ sentinel 先例 | **B**——三前缀；README 显式单机信任声明兜底姿态（多用户阶段施工图 §5.5 重构） |
| 410 实现方式 | A 注释掉注册 / B 拦截+删文件 / C 留文件改 handler | 裁决②（410 Gone 显式）+ 铁律 37（死代码不入仓库）+ 404 与 410 语义差（客户端可区分"从未有"与"已下线"） | **B**——精确路径拦截 + 删 2 文件 + grep 零引用复核 |
| 中断实现 | A 引擎加 AbortSignal / B 断线落完整回复 | 第一性原理（L2 零修改）+ DSH 中断锚语义（已见内容必须可恢复）+ D592 前不引入引擎 API 变更 | **B**——已见前缀 ⊂ 落库内容，重连不丢 |
| phaseComplete→诊断桥 | A D590 做 / B 推 D592 | 铁律 1 垂直切片（引擎 :729 回复文本承诺"开始运行六阶段诊断"，不桥接=文案假绿 M2 模式）+ D592 是纯测试任务（写集无 src/ 目录，桥接代码无处落） | **A**——startDiagnosis onEvent 桥进同一条 SSE 流（诊断事件桌面契约零新增） |
| useStreaming.ts 是否本任务修 | A 顺带改 / B 不改 | 审计 §3.4（管道本身健全，断在 401）+ 裁决①修复后 fetch 自通 + D591 写集归属 | **B**——零代码变更；401 消失即诊断链路自通，逐字水源归 D591 |

> 收敛检查：七项决策两参考系（第一性原理 + Anthropic/DSH 实证）均指向同一答案，无分歧。**参考：Anthropic/DeepSeek/第一性原理**。

## 6. What We Don't Do

| 不做 | 原因 | 归属 |
|---|---|---|
| electron-renderer/src/hooks/useStreaming.ts 代码变更 | 管道健全（:220-260 手写 SSE 解析可用），断因是 401（本任务白名单修复后自通）；逐字 token 消费、提交回声 UI 归桌面接线任务 | D591 |
| chat.ts 内嵌页改造为多轮对话 UI | 内嵌页是交互面 C（诊断发射器）的产品形态，页面对话化 = 新 UX 设计面；本任务只修 log bug + 头注释 | D593+/产品裁决 |
| notifications/solutions/ga-clients 白名单 | 审计明确归报告链路任务 | D593 |
| ConversationEngine 中断 AbortSignal / L2 任何代码修改 | §5.4 决策 5；Stage 3 整体替换前不动 L2 | Stage 3 |
| SessionStore schema 变更 / 会话投影注册表 | D500 能力已齐；store 层演进线已被占 | D588（已落） |
| mvp-server.ts、tui-v2、tui-v3、department-workspace.ts 等死文件清理 | TUI 保留裁决 ③ + 死文件清理有独立批次 | D596 |
| 报告落盘（consult 50 条内存 FIFO） | 与对话轨正交 | D593① |
| MCP server 认证/打包 | 独立任务 | D595 |

## 7. Test Requirements（测试先行——铁律 0-2/48；第一步 red，第二步 green）

**测试文件**：tests/routes/conversations.test.ts（新建，集成）+ tests/electron/use-streaming-contract.test.ts（扩展）。
**模式**（沿 tests/routes/diagnosis-consult-events.test.ts 先例，铁律 12 真实路由不 mock 管线）：express app + listen(0) + fetch；`vi.mock` 仅三处——providers（fake provider 流式吐 token，fake 形态参考 tests/conversation-engine.test.ts 既有 mock LLM 模式）、config（loadConfig 定值）、诊断引擎工厂（synova-diagnosis-engine-impl，phaseComplete 用例用）；SessionStore 用真实 better-sqlite3 `':memory:'`，经 `app.locals.orchestration = { db }` 注入；鉴权用例真实挂载 jwtAuthMiddleware。

| # | 用例 | red（现状） | green（实现后） |
|---|---|---|---|
| 1 | 正常轮次：POST /api/conversations {message} → SSE 含 open(sessionId)/token×N/agent_message/end；store.getMessages 含 user+assistant | 404 路由不存在 | 全绿 |
| 2 | 多轮恢复：同 sessionId 第二条消息 → fake provider 收到的 messages 历史含第一轮 user/assistant（loadState→fromState 生效） | 404 | 全绿 |
| 3 | **白名单（P0-1 闭环）**：挂 jwtAuthMiddleware、无 Authorization → 对话端点流式 200；POST /api/diagnosis/consult 无凭证非 401（400/200 均 Pass，禁 401）；GET /api/sessions/:id 非 401 | 401 | 非 401 |
| 4 | 会话读回：GET /api/sessions/:id 返回全轮次（读路径零改动，回归锁定） | 401 | 200 |
| 5 | 断线：中途 abort fetch → settle 后 store 含完整回复；`已见 token 串 ⊆ 落库 assistant content`（中断锚） | 404 | 全绿 |
| 6 | **重建不变量**：两轮对话后 loadState→fromState→getMessages 与 SSE 交付序列 deep-equal（log-reconstruction desync 断言，dsh-agent-loop invariant 范式） | 404 | 全绿 |
| 7 | 忙锁：同 sessionId 并发第二请求 → 409 SESSION_BUSY；首请求完成后可再发 | 404 | 全绿 |
| 8 | 边界：空 message → 400；>8000 字符 → 400；未知 sessionId → 404（流前 JSON，非 SSE） | 404 | 全绿 |
| 9 | 降级：app.locals.orchestration 缺失 → 503 STORE_UNAVAILABLE + degraded:true（fail-closed，铁律 24/31） | 404 | 全绿 |
| 10 | **410 下线**：POST /api/diagnosis/upload → 410 GONE；GET /api/diagnosis/status/x → 410；consult 正常用例非 410（活路由零误伤回归） | 200（假绿任务创建） | 410 |
| 11 | phaseComplete 桥：fake 诊断引擎 → 访谈完成轮后流内出现 flat 诊断事件 + complete 帧 | 404 | 全绿 |
| 12 | sse-contract 扩展：open 回声 sessionId；token/agent_message/end passthrough；未知类型仍 warn（既有 15 类型零回归） | 联合类型缺失编译失败 | 全绿 |

| 层 | 类型 | 数量 | 覆盖 |
|:---|---|:---:|---|
| L1 单元契约 | 集成（真实路由+真实 store+mock LLM） | ≥12 | §7 表全用例（正常/降级/边界/并发/回归） |
| L2a 接线 | server.ts 挂载 + 白名单 grep 断言 | 含于用例 1/3/10 | 生产挂载点 + 白名单生效 |
| L2b 降级 | 503 fail-closed / store 双写失败 error 帧 | 用例 9 + ③-⑤ 异常注入 | degraded 显式不静默 |
| L2c 边界 | 空/超长输入、并发忙锁、断线、410 未路径 | 用例 5/7/8/10 | 防线语义 |

## 8. Wiring Verification

新 export 的生产调用点（测试调用不计——铁律 0-2 Step 5 WIRE CHECK）：

| 新 export / 变更 | 生产调用点（实现后 grep 必须命中） |
|---|---|
| conversations 路由（default export Router） | src/server.ts 挂载行 `app.use(conversationsRoutes)`（:338 sessionsRoutes 旁；grep `conversationsRoutes` ≥2：import + use） |
| WebViewAdapter（复活） | src/routes/ 下 conversations.ts `new WebViewAdapter(res)`（grep `web-adapter` 消费者 ≥1；`setViewAdapter` 生产调用点 ≥1） |
| emitDiagnosisEvent / setOnClosed | conversations.ts 内调用（grep ≥1 各） |
| isWhitelisted 三新前缀 | src/middleware/ 下 auth.ts:86-105 函数体内（grep `/api/conversations` auth.ts ≥1）+ 用例 3 集成证明 |
| 410 拦截 | src/server.ts `app.all([...4 路径...])`（grep `code: 'GONE'` server.ts ≥1） |
| sse-contract 新类型 | electron-renderer 下 hooks/sse-contract.ts 的 applySSEEvent switch 分支 + conversations.ts 发帧侧（producer 接线）；消费侧接线归 D591（§5.4 决策 7 已声明，不属本任务 WIRE 缺口） |
| 删除复核 | `grep -rn "diagnosis-upload-v2" src/ tests/` 仅剩 3 处注释（§5.3）；`grep -rn "test-http-route" .` 零结果 |

## 9. Architecture Layer

**L1 交互层**（routes/ + l1-interaction/ + middleware/ + server 装配）。

- 新路由文件对 L2 仅经公开 API（ConversationEngine 构造/processMessageStream/startDiagnosis/serialize/fromState、SessionManager、registerBuiltinTools、ToolRegistry）——L1→L2 合法；**零 L2 代码修改**。
- L5 访问仅经 req.app.locals + 动态 import `{SessionStore, isSqliteDatabase}`（diagnosis.ts:182 D563 既有范式，audit 记录在案）；**不新增静态 L1→L5 import**（勿复制 sessions.ts:11 静态违规形态，其修复归 D596）。
- web-adapter 保持 L1（仅 import ViewAdapter 接口 + express 类型 + logger）。
- pre-commit check-architecture 回归：新增 import 面全部 L1→L1/L1→L2/既有容忍动态 L5，预期零新增违规。
- 铁律 38：新代码 `as any`/`as never`/`as unknown as` = 0（引擎历史恢复用 fromState 官方 API，不用 im-inbound 的 `as never` 窄化逃逸形态）。

## 10. Completion Standard（DS 与本 doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: tests/routes/conversations.test.ts 全绿（≥12 用例；red 已先证——实现前该文件必须先存在且失败）
2. **DS2**: 对话端点上线——DEV_MODE=false、无 Authorization 头，`curl -N POST /api/conversations -d '{"message":"你好"}'` → SSE open/token/agent_message/end 流式返回（物理 curl 证据贴完成报告）
3. **DS3**: 会话落库可查——同 curl 后 `GET /api/sessions/:id` 返回该轮 user+assistant；重启后端进程后仍可查
4. **DS4**: 白名单落地（裁决 ①）——对话/consult/sessions 三前缀免 JWT（用例 3）+ auth.ts JSDoc 单机信任声明 + README.md 安全模型节
5. **DS5**: 断线不丢——用例 5 绿（已见前缀 ⊆ 落库回复）
6. **DS6**: 重建不变量——用例 6 绿（SSE 交付 ≡ 事件流投影 ≡ fromState 重建）
7. **DS7**: 忙锁/边界/降级——用例 7/8/9 绿（409/400/404/503+degraded 显式）
8. **DS8**: upload-v2 下线（裁决 ②）——4 路径 410 GONE + consult 零误伤（用例 10）+ ga-diagnosis.ts 410 止停
9. **DS9**: 删除复核——src/routes/diagnosis-upload-v2.ts 与 tests/test-http-route.ts 已删；`grep -rn "diagnosis-upload-v2" src/ tests/` 仅剩 §5.3 列明 3 处注释
10. **DS10**: chat.ts 四处浏览器 log ReferenceError 修复（:321/:726/:823/:885 → console.warn）+ 头注释诚实化
11. **DS11**: sse-contract 扩展 + use-streaming-contract.test.ts 全绿（15 既有类型零回归）
12. **DS12**: 接线验证（§8 表）全部 grep 命中 + 用例 1/3/10 作为生产链路证明；tsc 零新增错误；`as any`=0；全量 vitest 零新失败（审计验收 ③）
13. **DS13**: 完成报告含 §5.4 七项决策记录（参考系+结论，S-12/K3 可核）+ 北星验收三句（入口/交互/结果各一句，附证据）

## 11. Auth Doc References

- docs/synova/research/L1全量审计-20260907/L1-audit-report.md（§1 执行摘要 / §2 结构性结论 / §3.1-3.5 逐文件 / §5 DSH 借鉴锚点 / §7 D590 行 / §8.1 裁决三问 / §8.2 依赖与风险 / 附录A 漂移清单）
- .claude/PRODUCT-BRIEF.md（§三 怎么工作 / §六 P0）
- AGENTS.md（铁律 0-2/4/5/24/31/38/39/47/48）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md（向导免认证先例）
- docs/plans/codex/implementation/SYNOVA-IMPL-D588-session-projection-20260907.md、SYNOVA-IMPL-D587-tool-result-pruner-20260907.md（在途防冲突，已核零写集交集）
- docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md（结构范例，D381）
- DSH 源码锚点（零 import，范式借鉴；本机 @deepseek-ai 包一手验证 2026-09-08）：dsh-agent-loop/lib/invariant.js:15-33、dsh-agent-loop/lib/index.js:637-655、dsh-api-gateway/lib/index.js:122-133/:199-215
- scripts/control-tower/dev-doc-gatekeeper.sh（本 doc 验收门禁）+ scripts/workflow/check-dev-doc-write-set.sh（写集对账）

## 12. 自检清单

- [x] L1 审计报告 §7 D590 行 + §8.1 三裁决逐条现场核实（非转述）
- [x] 全部"X 存在/签名是 Y"当场 grep/read（web-adapter 零消费者、addToHistory 不存在、白名单 16 条匹配规则、upload 五路径、活路由零撞、cli 持久化时序、SessionStore 六 API、serialize/fromState、D587/D588 已落 main）
- [x] DSH 三锚点一手源码验证（invariant desync 原文 / interrupted:true 锚 / open-cancel 帧校验+heartbeat）
- [x] 写集表 D381 格式（`### 5.1 写集 (9 修改 + 2 新建)`，标题下一行即表头）；新建文件目录级声明（check-dev-doc-write-set 假阳规避，D580 先例）；删除走 §5.3 表外清单（--diff-filter=ACMR 语义）
- [x] 审计未覆盖处的增量发现已标注（浏览器 log bug 实为 4 处非 2 处；im-inbound addToHistory no-op 新证据）
- [x] 测试 red→green 对照 + 铁律 12 真实路由模式（diagnosis-consult-events.test.ts 先例）
- [x] 决策参考 §5.4（S-12，六决策点双参考系收敛）
- [x] DS1-DS13 一一对应（S-10）；不做清单含文件路径与归属（Q2 排除项可物理验证）
- [x] 架构边界自查（§9）：零新增跨层违规、零 L2 修改、as never 形态明确禁入
- [x] 不是凭记忆；不涉及 scripts/audit/；不用 --no-verify
