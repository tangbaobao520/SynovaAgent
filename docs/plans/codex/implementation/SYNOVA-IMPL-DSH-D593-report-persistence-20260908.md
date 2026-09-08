---
north-star:
  服务用户: GA（增长顾问）与桌面端用户——诊断报告是 Synova 的核心产出（"诊断是手段，目的是增长"），跑完一次诊断后报告必须一直在那里：重启不丢、刷新可读、右栏打开即真实数据
  服务场景: 用户（对话触发或显式入口）跑完一次诊断 → 关闭应用/重启后端 → 重新打开桌面端 → 右栏报告 tab 仍能读回同一份报告；哨兵 tab 打开即真实工单/报告数据；通知/方案/GA 客户列表不再 401
  模块终态: 诊断报告持久化于 SQLite（diagnosis_checkpoints 表，零 schema 变更）；50 条内存 FIFO 退役为一级加速缓存（事实源 = 持久层，内存 miss → 冷读持久层，不触碰引擎不重新诊断）；桌面端报告/哨兵/通知/方案/GA 客户五类数据全部免 401 直达（单机本地信任，对齐 /api/sentinel/* 先例）
  对齐北星: PRODUCT-BRIEF.md §三"Synova 怎么工作"（两套系统并行的产出都是报告——GA 按需诊断 → HTML 诊断报告；哨兵巡检 → 工单）+ §五 W1"全链路打通：上传→诊断→报告"（报告链路的最后一公里）+ §六 P0"诊断报告质量验证"（报告可读是质量验证的前提）
  完成标准: 跑一次诊断 → 重启后端进程 → GET /api/diagnosis/consult/:reportId/report 仍 200（物理 curl 证据）；桌面右栏报告 tab 刷新后渲染 markdown、哨兵 tab 渲染真实 tickets/reports（无 Empty 占位、无 401）
  当前进度: D590（对话 SSE 端点）→ D591（桌面接线）→ D592（E2E 审计 PASS）已全部落 main；对话链路已通但诊断报告仍仅内存 50 条 FIFO（diagnosis.ts:64-75，重启即丢，L1 审计 §8.3 风险登记行 5）；桌面报告 tab 因 reportId/consultId 键错配恒 404 降级；哨兵 tab Empty 占位；notifications/solutions/ga-clients 白名单外 401。本 spec = D593 实现规格，编码线未开工
---

<!--
  SYNOVA-IMPL-DSH-D593: L1-P2 报告落盘——50 条 FIFO→持久化 + 桌面报告/哨兵呈现 + 401 对齐
  状态: dev doc | 2026-09-08 | 优先级 P1（L1 审计 Phase 2 首任务；报告是核心产出，重启丢数据）
  权威文档: L1 全量审计报告 §3.5.2 报告层行/§7 D593 行/§5 DSH 借鉴 + AGENTS.md 铁律 0-2/4/5/24/31/38/39/47/48
  依赖: D590（白名单先行，b54a0fb6 已合 main）；D591/D592 已合（bdfad5c0 / 143a9924 + 2e9e06ad K3 PASS）
  并行: D594（交互卡片+通知+IPC）桌面写集可能触及 RightPanel——本 spec §5.1 已声明文件边界，D594 出 doc 时走 verify-parallel 重叠检查
  编码线: Claude Code（src/routes + src/store + src/middleware + electron-renderer 均归 L1 审计 §7 认领建议的 Claude 写集例外内；D591 先例同型）
  编号注意: 任务号 D593 为 alloc-task-id 复用（旧 14e54722 "D593 LLM 调用韧性层" 已关闭）——本任务 spec/审计文件名必须带 DSH 前缀与任务名区分，防与旧 SYNOVA-IMPL-D593-llm-call-resilience-20260908.md 撞名
-->

# D593: L1-P2 报告落盘 + 桌面报告/哨兵呈现 + 401 对齐

> 一句话问题: L1 审计 P1 发现桌面端诊断报告仅内存 50 条 FIFO（重启即丢）——诊断报告这个核心产出没有持久化；D590 已通对话链路、D591 已通桌面前端接线，但对话触发的诊断报告仍然不落盘；桌面报告 tab 还因 reportId/consultId 键错配恒 404；哨兵 tab 是 Empty 占位；notifications/solutions/ga-clients 仍在白名单外 401。

## 1. Authority Doc Verification

**来源 A**: [L1 全量审计报告](../../synova/research/L1全量审计-20260907/L1-audit-report.md)（2026-09-07，2026-09-08 复核修订版）

> §3.1 diagnosis.ts 行: "报告仅内存 50 条 FIFO（:64-65，重启丢，:458 自认）；L1→L3/L5 动态 import。修复（D593: 鉴权对齐+报告落盘）"

> §7 D593 行（验收标准原文）: "① consult 报告从 50 条内存 FIFO（diagnosis.ts:64-65）落盘（SessionStore/l4 或文件，重启可读）② 桌面 RightPanel report/solutions、LeftPanel ga-clients 的 401 修复（随 D590 白名单对齐）③ GET /api/sentinel/reports+tickets 在桌面呈现（哨兵 tab Empty 占位接真数据）④ /api/notifications 白名单对齐"

> §7 D593 行（写集原文）: "src/routes/diagnosis.ts、electron-renderer RightPanel/LeftPanel、auth.ts、tests"；验收: "① 跑一次诊断→重启后端→报告仍可取 ② 桌面右栏看到真实报告/哨兵数据（无 401）"；依赖: "D590（白名单先行）"

> §5 DSH 借鉴锚点: dsh-api-session-controller 冷读激活（lib/index.js:142-170）——"sessions.ts 会话列表读路径不触碰引擎"；本任务落为"报告读路径不触碰引擎/不重新诊断"。

> §8.3 风险登记行 5: "报告 50 条 FIFO 内存态（重启丢用户数据）| 铁律 24/31 边缘 | D593①"

**来源 B**: [D590 spec](SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md)（已实现 b54a0fb6）

> §6 不做清单: "notifications/solutions/ga-clients 白名单 | 审计明确归报告链路任务 | D593"、"报告落盘（consult 50 条内存 FIFO）| 与对话轨正交 | D593①"

**来源 C**: [D591 spec](SYNOVA-IMPL-DSH-D591-desktop-chat-wiring-20260908.md) §5.4 决策 5（已实现 bdfad5c0）

> "mock 假数据处置……**C**——置空数组（诚实空态）；真会话列表接 GET /api/sessions 归 D593 报告链路任务"

**来源 D**: [AGENTS.md](../../../AGENTS.md) 铁律 0-2（测试先行+接线验收）、铁律 4/5（交付不完整/后端能力≠用户可用）、铁律 24/31（异常处理+降级信号传播）、铁律 38（as any 零容忍）、铁律 39（五层架构边界）、铁律 47/48（契约优先/测试非空壳）。

**来源 E**: DSH 源码（一手验证 2026-09-08，零 import——G1 零依赖红线）：

> dsh-api-session-controller/lib/index.js:142-170 `inspectApiSession`: 冷读 `ctx.sessionQuery.observeSession(sessionId, {projectionMode:"none"})` 只读快照，不复活引擎；`ApiSessionNotFound` 显式 404 语义——本任务 GET report 内存 miss 后冷读持久层，不重新诊断、不构造引擎。

## 2. Problem Statement

对齐北星锚定块：诊断报告是"诊断是手段、目的是增长"的交付物（PRODUCT-BRIEF §三/§五 W1）。现状这条链在四处断裂——

1. **报告不落盘（审计 P1 核心）**：`completedReports` 内存 Map 上限 50 条 FIFO（diagnosis.ts:64-75），进程重启即清空，GET /report 重启后恒 404（diagnosis.ts:59-61 注释自认"可接受：SSE 已送达"——审计 §8.3 判为"重启丢用户数据"）。对话桥（D590 新增路线，conversations.ts:273-303）的诊断报告只有 SSE complete 帧送达，**同样不落盘**。
2. **桌面报告 tab 键错配恒 404**：桌面 currentReportId 落的是 `reportId`（rpt_xxx，sse-contract.ts:76-78 从 complete 帧 report.reportId 提取），而 GET /api/diagnosis/consult/:id/report 内存 Map 键是 `consultId`（diag-xxx，diagnosis.ts:126）——**两个 ID 空间不匹配**，桌面请求恒 miss → 404 降级文案（RightPanel.tsx:216-219）。且 currentReportId 是 zustand 内存态，刷新即丢。
3. **401 家族**：auth.ts:94-113 白名单已含 sentinel/consult/conversations/sessions（D590 三前缀），**仍缺 /api/notifications、/api/solutions、/api/ga/clients、/api/ga/switch**（审计 §7 D593 行②④；D590 §6 明示归本任务）。
4. **哨兵 tab Empty 占位**（RightPanel.tsx:345-347）：GET /api/sentinel/reports+tickets 后端是活的（白名单内），桌面呈现缺位；另 D591 置空的会话列表（app-store.ts:111 conversations: []）真数据接入也明示留给本任务（D591 spec §5.4 决策 5）。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

a) **项目拼图**：本任务在 **L1 交互层**（routes/ + middleware/ + electron-renderer 呈现）+ 一处 **L5 扩展**（SessionStore 加列表读方法，域内自洽）。诊断报告是"对话/consult → 六阶段引擎 → 报告"链路（D590/D591/D592 已通）的最后一公里——落盘与读回。**零 L2/L3/L4 修改**。

b) **文件审计**（grep/read 实测 2026-09-08，全部 file:line 当场验证）：
- 内存 FIFO：diagnosis.ts:64-75（`completedReports` Map + `COMPLETED_REPORTS_MAX = 50` + `cacheCompletedReport` :78-84）；写点 :441；读点 :543。
- **持久化设施已齐但闲置**：`diagnosis_checkpoints` 表已存在（session-store.ts:212-220，含 `partial_report TEXT` 字段）；`saveDiagnosisCheckpoint`/`getDiagnosisCheckpoint`/`deleteDiagnosisCheckpoints` API 现成（session-store.ts:492/:508/:527）；consult resume 已按 consultId 键读 checkpoint（diagnosis.ts:511）。launcher 内 `saveCheckpoint` 定义后**零调用**（diagnosis-launcher.ts:162-172 死代码）。
- 诊断事件流已通（D487/D489）：session_events 表 event_type CHECK 含 diagnosis_phase/diagnosis_module/diagnosis_report（session-store.ts:166/:188）；launcher 落 phase/module 事件 + diagnosis_report **摘要**事件（diagnosis-launcher.ts:96-104, :185-191）——完整 report 对象未入流。
- 键错配实测：consultId = `diag-${teamId}-${Date.now().toString(36)}`（diagnosis.ts:126）；reportId = `rpt_${teamId}_${Date.now().toString(36)}`（synova-diagnosis-engine-impl.ts:424）；桌面 setCurrentReportId 落 reportId（useStreaming.ts:132，经 sse-contract.ts:76-78 readReportId 取 complete 帧 report.reportId）。
- 白名单现状：auth.ts:104-113 十六规则（D590 三前缀已落）；notifications 四路由（notifications.ts:74/:99/:112/:129）、solutions 四路由（solutions.ts:60/:91/:114/:169）、ga 三路由（ga-admin.ts:66/:88/:125）均白名单外。
- 哨兵数据源：getSentinelTickets 走 SQLite 表（sentinel-service.ts:342-376，D580 已持久化 ✅）；getSentinelExpertReports 从 runner 内存派生（sentinel-service.ts:266-292，非持久化——呈现任务只消费 API，数据源治理归哨兵线）。
- D588 投影注册表：内存 cells + checkpoint 行"产出契约"（调用方回写），**无内置持久化位置**——不是报告持久化载体（§5.4 决策 1）。
- 旧编号复用：git log 含 14e54722 "feat(D593): LLM 调用韧性层"（已关闭任务）——本任务 spec/审计产物命名已规避（文件头注）。

c) **决策**：持久化载体复用 diagnosis_checkpoints 表（零 schema 变更）；读路径内存 miss → checkpoint 冷读（不触碰引擎）；桌面呈现接真数据；白名单四前缀对齐。无新建 src/ 文件。

### Q1: 调研

a) **业界最佳实践**：报告类大 JSON 文档的持久化 = 主键直取（对象存储/SQLite TEXT 列），非事件流 fold；读路径 L1 缓存 + 持久层回退（CDN/内存 → 存储）是通用模式。
b) **DSH 范式**（零 import，锚点已一手验证 2026-09-08）：
- **冷读激活**（dsh-api-session-controller/lib/index.js:142-170）：读路径只读快照不复活引擎、`SessionNotFound` 显式 404——本任务落为"GET report 内存 miss → checkpoint 冷读 → 不重新诊断"。
- **SSE 帧协议**（dsh-api-gateway lib/index.js:11,122-133）：本任务 SSE 流零改动（consult/对话桥帧已对齐 D590），引用点仅在报告事件形状与帧语义的既有对齐上。
c) **memory/ 历史教训**：D316（声称必须物理证明——本 doc 全部 file:line 当场 grep/read）；D381/D384（写集表格式契约 + 取号纪律，D593 号已由 alloc-task-id 登记 task-state/D593.json）；D576（诚实交付）；M3 模式（机制建成未接线——saveCheckpoint 死代码、checkpoint 表闲置正是此模式，本任务以接线复用而非新造）。

### Q2: 范围 — 正确的最简方案

**做什么**：报告落盘写路径（两条路线：consult 完成点 + 对话桥完成点，落 diagnosis_checkpoints phase=5 行，键 = reportId）；读路径 fallback（GET /consult/:id/report 内存 miss → checkpoint 冷读，兼容 consultId/reportId 双 ID）；列表端点（GET /api/diagnosis/reports，桌面刷新恢复的必要条件）；白名单四前缀（+README 安全模型节同步）；桌面报告 tab 刷新恢复 + 哨兵 tab 真数据 + 会话列表接 GET /api/sessions；SessionStore 加 `listDiagnosisReports`（L5 域内新方法）。

**不做什么（含文件路径）**：见 §6。

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**：POST /api/diagnosis/consult（显式诊断）或 POST /api/conversations 访谈完成（对话桥）→ 诊断完成。
- **交互**：完成点写 diagnosis_checkpoints（reportId 键，完整 report + onePager + meta）；GET /api/diagnosis/consult/:id/report 内存 miss → 冷读持久层；GET /api/diagnosis/reports 列表。
- **结果**：重启后端后报告仍可取（curl 物理证据）；桌面右栏报告 tab 刷新后渲染 markdown、哨兵 tab 渲染真实 reports/tickets（无 Empty、无 401）；通知/方案/GA 客户端点非 401。

### Q4: 契约与测试（铁律 47/48，写代码前定义）

- `SessionStore.listDiagnosisReports` 契约（JSDoc）：`@input {limit: 1..200, offset: >=0}`；`@output {ok, total, reports: [{reportId, teamId, completedAt, summary?, onePagerAvailable}]}` 按 saved_at DESC；`@degraded` partial_report JSON 损坏 → log.warn + 跳过该行 + `degraded:true`（铁律 24）；`@error` 非 SQLite/查询失败 → `{ok:false, degraded:true, error}` 由路由映射 503。
- 报告 checkpoint 行契约：`saveDiagnosisCheckpoint({sessionId: reportId, phase: 5, completedModules: [], partialReport: {report, onePager, teamId, completedAt, consultId?, source: 'consult'|'conversation'}, savedAt})`。
- 测试：tests/routes/ 新建诊断报告持久化集成测试（真实路由 + 真实 SessionStore ':memory:' + mock 引擎/LLM，沿 diagnosis-consult-events.test.ts 与 conversations.test.ts 既有模式）+ tests/electron/ 新建右栏呈现测试（沿 use-streaming-conversation.test.ts 模式）；red→green 用例表见 §7。

## 4. Current State（2026-09-08 实测，全部 grep/read 当场验证）

> 路径约定：本节行文引用相对 src/ 或 electron-renderer/src/（按文件域省写）；写集表（§5.1）与接线表（§8）用仓库全路径。

### 4.1 缺陷 A（P1 核心）：报告仅内存 50 条 FIFO，重启即丢

- diagnosis.ts:64-75：`completedReports` Map + `COMPLETED_REPORTS_MAX = 50`；:78-84 `cacheCompletedReport` FIFO 淘汰最旧；:59-61 注释自认"进程重启即清空——重启后 GET 返回 404（可接受：SSE 已送达）"——审计 §8.3 行 5 判"重启丢用户数据"。
- 写点 :441（sseClose 前）；读点 :543（`completedReports.get(consultId)`，miss → 404 :545）。
- 对话桥路线（conversations.ts:273-303）：phaseComplete → DiagnosisLauncher 直连 → complete 帧带 `report`（:296-303）——**完整报告仅随 SSE 送达，零落盘**。
- **闲置资产**：diagnosis_checkpoints 表（session-store.ts:212-220）+ saveDiagnosisCheckpoint/getDiagnosisCheckpoint（:492/:508）现成；launcher saveCheckpoint（diagnosis-launcher.ts:162-172）**定义后零调用**（grep "saveCheckpoint" 仅命中定义行）。consult resume 已按 consultId 键读（diagnosis.ts:511）——键约定已存在但写侧从未接线（M3 教科书样本）。

### 4.2 缺陷 B（P1）：桌面报告 tab 键错配 + 刷新丢 ID

- consultId（diagnosis.ts:126 `diag-${teamId}-...`）≠ reportId（synova-diagnosis-engine-impl.ts:424 `rpt_${teamId}_...`）。
- 桌面 setCurrentReportId 落 reportId（useStreaming.ts:130-133，经 sse-contract.ts:76-78 `readReportId` 取 complete 帧 `report.reportId`；DiagnosisReport.reportId 必填——synova-diagnosis-engine.ts:129）。
- RightPanel DiagnosisReportTab 用 currentReportId 请求 `GET /api/diagnosis/consult/{currentReportId}/report`（RightPanel.tsx:212-213）→ 内存 Map 按 consultId 键 → **恒 miss** → 404 → 降级文案"服务重启后内存缓存已清"（:216-219，文案本身也是错的——多数时候根本没重启）。
- currentReportId 是 zustand 内存态（app-store.ts:111/:129），**刷新即丢**——与 D591 已建的 `synova:last-session-id` localStorage 模式（conversation-store.ts）形成对比。

### 4.3 缺陷 C（P1）：401 家族——四端点白名单外

- auth.ts:94-113 isWhitelisted 十六规则现状：sentinel/consult/conversations/sessions 已落（D590 :110-112），**缺 /api/notifications、/api/solutions、/api/ga/clients、/api/ga/switch**（grep 实测零命中）。
- 桌面消费方：RightPanel GAWorkspaceTabs `/api/solutions`（:265/:283/:298）；LeftPanel `/api/ga/clients`（:62）+ `/api/ga/switch/:orgId`（:112）；NotificationCenter `/api/notifications`（useNotifications.ts:34，审计 §3.5.1 判 ❌ 上游 401→恒空）。
- 本任务新列表端点 `/api/diagnosis/reports` 不匹配 `/api/diagnosis/consult` 前缀（auth.ts:110 是前缀匹配）——**必须单独加白名单**（精确前缀 `/api/diagnosis/reports`，保守不加宽 `/api/diagnosis/` 全前缀——避免误豁免 D590 已下线的 upload/status 410 路径族）。
- ga-admin.ts 路由无 requireGa 中间件挂载（grep 实测 server.ts 零 requireGa），白名单即可直达。

### 4.4 缺陷 D（P2）：哨兵 tab Empty 占位 + 会话列表空态

- RightPanel.tsx:345-347 `{tab === 'sentinel' && (<Section title="📊 哨兵数据"><Empty /></Section>)}`——Empty 占位（审计 §3.5.1 RightPanel 行原文）。
- 数据 API 已就绪：GET /api/sentinel/tickets（SQLite 表，D580 持久化，sentinel-service.ts:342-376）+ GET /api/sentinel/reports（runner 内存派生，sentinel-service.ts:266-292）；白名单 /api/sentinel/* 已含 → 零 401。
- 会话列表：app-store.ts:111 `conversations: []`（D591 诚实空态）——D591 spec §5.4 决策 5 明示"真会话列表接 GET /api/sessions 归 D593"；GET /api/sessions 已在白名单（D590）。

### 4.5 资产盘点（本任务复用的全部现成能力）

| 资产 | 位置 | 要点 |
|---|---|---|
| diagnosis_checkpoints 表 | session-store.ts:212-220 | (session_id, phase, completed_modules, partial_report TEXT, saved_at)，INSERT OR REPLACE |
| save/get/delete checkpoint API | session-store.ts:492/:508/:527 | 现成、resume 已用读侧 |
| SessionStore 事件流三诊断类型 | session-store.ts:166/:188 | D487/D489 已落 phase/module/report 摘要事件 |
| D588 投影注册表 | store/session-projection.ts | 派生缓存层，非持久化载体（§5.4 决策 1） |
| D580 工单表 | sentinel-service.ts:342-376 | tickets 持久化已闭环 |
| D563 动态 import 通道 | diagnosis.ts:213-215 / conversations.ts:91-108 | L1→L5 合法通道（isSqliteDatabase 谓词窄化） |
| 桌面 401 修复后的自通链路 | useStreaming/sse-contract | consult 诊断流 D590 白名单后已通 |

## 5. What We Build

### 5.1 写集 (8 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/routes/diagnosis.ts | 修改 | ①完成点（:441 cacheCompletedReport 处）落盘：`sessionStore?.saveDiagnosisCheckpoint?.({sessionId: reportId, phase: 5, completedModules: [], partialReport: {report, onePager, teamId, completedAt, consultId}, savedAt})`（reportId 取自 result.report.reportId，缺失 → log.warn 跳过，铁律 24）；②GET /consult/:id/report（:541-559）内存 miss → `getDiagnosisCheckpoint(:id)` 冷读（§5.2-B，不触碰引擎）；③新增 GET /api/diagnosis/reports 列表端点（§5.2-C）；④:59-61 与 :78-84 注释诚实化（FIFO 降级为一级缓存，持久层为事实源） |
| src/routes/conversations.ts | 修改 | 诊断桥完成点（:294-303 旁）：`diagnosisResult.report.reportId` 存在 → `store.saveDiagnosisCheckpoint({sessionId: reportId, phase: 5, completedModules: [], partialReport: {report, teamId, completedAt, source: 'conversation'}, savedAt})`（对话路线报告落盘；store 已持有完整 SessionStore 实例）；失败 log.warn 不阻断 SSE（铁律 24/31） |
| src/store/session-store.ts | 修改 | 新增 `listDiagnosisReports(opts)` 方法（§5.2-C 契约；L5 域内扩展，查询 diagnosis_checkpoints phase=5 行） |
| src/middleware/auth.ts | 修改 | isWhitelisted()（:94-113）加四前缀：`/api/diagnosis/reports`、`/api/notifications`、`/api/solutions`、`/api/ga/clients`、`/api/ga/switch`（五条规则）；JSDoc 补 D593 条目（对齐裁决①单机本地信任声明，多用户阶段施工图 §5.5 重构） |
| electron-renderer/src/components/RightPanel.tsx | 修改 | ①DiagnosisReportTab：挂载时 currentReportId 为 null → `GET /api/diagnosis/reports?limit=1` 取最近 reportId → setCurrentReportId；404 降级文案诚实化（去"内存缓存已清"）；②哨兵 tab（:345-347 Empty 占位替换）→ 新 SentinelDetail 组件（§5.2-E，同文件内实现） |
| electron-renderer/src/components/LeftPanel.tsx | 修改 | ①挂载时 `GET /api/sessions` → setConversations（会话列表真数据，D591 遗留）；②gaClients/switch fetch 逻辑不变（401 修复后自通，零代码变更——仅回归验证） |
| electron-renderer/src/stores/app-store.ts | 修改 | ①新增 `setConversations(list)` action；②currentReportId 落 localStorage（`synova:last-report-id`，boot 时读回——对齐 D591 `synova:last-session-id` 模式，SSR/无 window 守卫同款） |
| README.md | 修改 | 安全模型节白名单清单追加 D593 五端点族（对齐 D590 的声明做法） |
| tests/routes/diagnosis-report-persistence.test.ts | 新建 | 报告落盘/读回/列表/白名单/降级集成测试（§7 用例表；沿 diagnosis-consult-events.test.ts + conversations.test.ts 模式）。实现提交精确化：12 用例（§7 十用例 + 7a/7b 拆分），含增量用例 13（FIFO 满后持久层仍可读，§7 L2c 行） |
| tests/electron/right-panel-report-sentinel.test.ts | 新建 | 报告 tab 列表恢复 + 哨兵 tab 渲染/降级测试（§7 用例表；沿 use-streaming-conversation.test.ts 模式）。实现提交精确化：**.ts 非 .tsx**（vitest.config.ts include 仅 `*.test.ts`/`*.integration.test.ts`，写集无 vitest.config.ts——组件函数直调 + test-support/render 序列化，ga-collab-ui.test.ts 先例，无需 JSX） |

> 注：新建文件以**目录级条目**声明（check-dev-doc-write-set 存在性核验对未存在文件报假阳，D580/D590 先例）；实现提交后精确化。文件边界声明：RightPanel.tsx 归本任务（报告 tab + 哨兵 tab）；D594（交互卡片+通知+IPC）桌面写集应避开 RightPanel.tsx，若必须动 → verify-parallel 重叠报错后停手问 CTO 仲裁（TASK-ROUTING §一 撞车协议）。

### 5.2 关键实现契约

**A. 报告落盘（写路径，两条路线同一形状）**

```
键 = reportId（rpt_xxx）——桌面 currentReportId 已用它；checkpoint 表 session_id 键空间自由（无 FK）
consult 路线（diagnosis.ts :441 处）:
  store.saveDiagnosisCheckpoint({
    sessionId: reportId, phase: 5, completedModules: [],
    partialReport: { report, onePager, teamId, completedAt: ISO, consultId },
    savedAt: ISO })
对话桥路线（conversations.ts :303 处）:
  同形 + { source: 'conversation' }（无 consultId——对话会话无该概念）
reportId 缺失（防御）→ log.warn + 跳过落盘（诊断 SSE 不受影响，铁律 24/31）
写失败 → log.warn + degraded（不静默；报告已随 SSE 送达客户端，落盘失败不阻断诊断）
```

**B. 读路径 fallback（冷读激活——DSH 范式落地）**

```
GET /api/diagnosis/consult/:id/report
  → ① 内存 Map completedReports.get(:id) 命中 → 返回（进程内快路径）
  → ② miss → resolveStore（D563 动态 import 通道，diagnosis.ts:213-215 同款）
       → store.getDiagnosisCheckpoint(:id)（:id = reportId 或 consultId 双兼容——
          checkpoint 键是 reportId，consultId 查不到时再兜底？否：checkpoint 行 partialReport
          内含 consultId 字段，读侧按 :id 精确匹配键即可，consultId 调用方由内存层服务）
       → 命中且 partialReport.report 存在 → 组装响应（markdown 格式按需渲染 onePager，
         renderOnePagerOnDemand 既有函数 :531-539）
       → partialReport 损坏/缺失 → log.warn + 404（诚实，不静默）
  → ③ 均 miss → 404（现状语义不变）
关键: 冷读**不构造引擎、不重新诊断**（dsh-api-session-controller :142-170 冷读语义）；
      db 缺失环境 → 跳过 ② 直接 404（内存命中仍可服务，行为兼容现状）
```

**C. 列表端点 + listDiagnosisReports 契约（铁律 47）**

```
GET /api/diagnosis/reports?limit=50&offset=0
  limit 夹取 1..200（sentinel findings :41-42 同款 idiom）；offset >= 0
  db 缺失/非 SQLite → 503 {ok:false, code:'STORE_UNAVAILABLE', degraded:true}（fail-closed）
  @degraded — 单行 partial_report JSON 损坏 → log.warn + 跳过该行 + degraded:true（不 500）

SessionStore.listDiagnosisReports（JSDoc 契约先行）:
  @input  — {limit: number, offset: number}
  @output — {ok:true, total, reports: Array<{reportId, teamId, completedAt, summary: string|null,
            onePagerAvailable: boolean}>} 按 saved_at DESC
  @degraded — 行级解析失败跳过 + degraded:true；total 恒为 phase=5 行计数（不因跳过缩水）
  @error   — 查询异常 → {ok:false, degraded:true, error}（路由 503）
SQL: SELECT session_id, partial_report, saved_at FROM diagnosis_checkpoints
     WHERE phase = 5 ORDER BY saved_at DESC LIMIT ? OFFSET ?
     + SELECT COUNT(*) ... WHERE phase = 5
```

**D. 白名单（auth.ts 五条新规则）**

```ts
path.startsWith('/api/diagnosis/reports') ||  // D593 — 报告列表（桌面刷新恢复）
path.startsWith('/api/notifications') ||      // D593 — 通知（审计 §7 行④）
path.startsWith('/api/solutions') ||          // D593 — 方案（审计 §7 行②）
path.startsWith('/api/ga/clients') ||         // D593 — GA 客户（审计 §7 行②）
path.startsWith('/api/ga/switch')             // D593 — GA 客户切换
```

- 前缀豁免对齐 /api/sentinel/* 先例（单机本地信任模型，auth.ts:86-88 声明已存在）；README 安全模型节同步。
- 注意 `/api/diagnosis/reports` 前缀匹配不会误伤 `/api/diagnosis/consult/*`（不同前缀），也不会恢复已下线的 upload 410 族（路径零交集——D590 §5.2-E 已证）。

**E. 桌面呈现（electron-renderer）**

```
① DiagnosisReportTab 恢复链:
   boot/挂载: currentReportId 优先读 localStorage['synova:last-report-id']（app-store boot）
   → 仍无 → GET /api/diagnosis/reports?limit=1 → reports[0]?.reportId → setCurrentReportId
   → GET /api/diagnosis/consult/{reportId}/report?format=markdown 渲染（既有逻辑）
   404 文案 → "报告不可用（HTTP 404）"（诚实化，删"内存缓存已清"错误归因）
② SentinelDetail（哨兵 tab 替换 Empty）:
   useEffect 并行 GET /api/sentinel/reports + GET /api/sentinel/tickets
   → 渲染两段: 专家报告列表（sentinelId/expert/summary/checkedAt）+ 工单列表
     （title/severity 色点/status/createdAt，severity 色对齐 SEVERITY_COLOR 既有映射）
   → 失败/!ok → degraded 提示条（铁律 24/31，apiFetch 已 log + null）
   → 空 → Empty（'暂无哨兵报告'/'暂无工单'）
   → apiFetch 复用（RightPanel.tsx:153-172 既有；白名单已含 sentinel 零改动）
③ LeftPanel 会话列表: 挂载时 fetch GET /api/sessions → setConversations(映射)
   → 失败 console.warn + 保持空态（铁律 24 不静默）
```

**F. 50 条 FIFO 语义变更（诚实化，非删除）**

- 内存 Map 保留：一级加速缓存（进程内 GET 快路径），FIFO 50 上限保留（防 OOM 初衷仍成立）。
- 语义变化：miss 不再等于"报告没了"——fallback 持久层；注释与降级文案同步更新（§5.1 diagnosis.ts 修改④）。
- 持久层上限策略：**全部保留**（SQLite 行存储零容量压力；每次诊断 +1 行 phase=5）；列表分页 limit/offset；过期清理不建（P2 挂治理——数据资产备份体系 D335 已覆盖 data/synova.db）。

### 5.3 删除清单

无删除。（launcher saveCheckpoint 死代码不碰——§6 排除项。）

### 5.4 决策参考（S-12/D333）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 1. 持久化载体 | A 新表 diagnosis_reports / B 复用 diagnosis_checkpoints（partial_report）/ C 事件流全量 report / D 文件系统 JSON / E D588 投影 | 第一性原理（最少机制：B 表已存在、API 现成、resume 已用读侧——零 schema 变更零新表）；Anthropic 基线（单一事实源：事件流已有 diagnosis_report 摘要，完整大 JSON 进 append-only 流 = 读报告 O(n) fold 全日志，不适合直取）；D 引入第二存储面（备份体系只备 sqlite）；E 投影是派生缓存非持久化载体（checkpoint 回写位置无内置） | **B**——checkpoint 表 phase=5 行 + 现成 save/get API；事件流摘要维持现状（D489 回放完整性已覆盖） |
| 2. 报告键 | A consultId / B reportId / C 会话 sessionId | 桌面 currentReportId 已是 reportId（useStreaming.ts:132 实测）；rpt_ 天然主键且两路线（consult/对话桥）统一存在；checkpoint 键空间无 FK 自由；resume 的 consultId 键读不动（其语义是崩溃恢复检查点，与报告归档行共存同表） | **B**——reportId；partialReport 内附带 consultId 字段供追溯 |
| 3. GET report 兼容 | A 仅内存 / B 内存→checkpoint 双 ID fallback / C 重写为纯持久层 | DSH 冷读激活（读不复活引擎）；Anthropic 机器可验（内存 miss 的确定性回退）；现状调用方双 ID 并存（内存键 consultId + 桌面传 reportId） | **B**——内存快路径 + checkpoint 冷读（:id 精确匹配键）；consultId 调用方由内存层服务不变 |
| 4. 列表端点 | A 不做 / B 新建 GET /api/diagnosis/reports | 桌面"刷新后报告从哪读回"必须有一个入口拿到 reportId——currentReportId localStorage 只能覆盖同机同浏览，清缓存/新装即断；列表 = 恢复链兜底 | **B**——新建列表端点 + L5 listDiagnosisReports |
| 5. 上限策略 | A 全保留 / B 定期清理 / C 条数上限 | 第一性原理（FIFO 上限是防内存 OOM 的机制，落盘后该动机消失）；SQLite 行存储零压力；过期清理无产品依据（报告是企业病历，D335 备份体系已覆盖库级） | **A**——全保留 + limit/offset 分页；内存 FIFO 保留为一级缓存 |
| 6. 哨兵呈现范围 | A 呈现 only / B 呈现+数据源持久化 / C 呈现+工单六动作 | 审计 §7 行③原文"GET /api/sentinel/reports+tickets 在桌面呈现（哨兵 tab Empty 占位接真数据）"；reports 内存派生治理归 DSH 哨兵线；六动作卡片归 D594 | **A**——呈现 only（调 API + 渲染 + 降级提示） |
| 7. 会话列表是否纳入 | A 纳入 / B 不纳入 | D591 spec §5.4 决策 5 明示"真会话列表接 GET /api/sessions 归 D593"——不纳入 = 悬空遗留；工作量小（一次 fetch + action） | **A**——纳入（LeftPanel + app-store） |
| 8. launcher saveCheckpoint 死代码 | A 顺手删除 / B 不碰 | D590 红线精神（L2 零修改：诊断桥直连已是唯一合法路径）；死代码删除不改善本任务验收；K3 可核的写集最小化 | **B**——不碰（§6 排除 + 登记待办，归 Stage 3 或 D596 批次） |
| 9. 白名单边界 | A 仅 notifications / B 全量五前缀 / C 全前缀 /api/diagnosis/ | 审计 §7 行②④原文（report/solutions/ga-clients/notifications 四类）；列表端点必需；C 会误豁免已下线 410 路径族（精确性差） | **B**——五条精确前缀 + README 声明 |

> 收敛检查：九项决策两参考系（第一性原理 + Anthropic/DSH 实证）均指向同一答案，无分歧。**参考：Anthropic/DeepSeek/第一性原理**。

## 6. What We Don't Do

| 不做 | 原因 | 归属 |
|---|---|---|
| src/agent/diagnosis-launcher.ts 的 saveCheckpoint 死代码删除/接线 | L2 零修改（D590 红线精神）；本任务写路径在路由层（拥有 report/onePager/teamId 全部数据） | 登记待办（Stage 3 / D596 批次） |
| 哨兵 reports 数据源持久化（getSentinelExpertReports 内存派生） | 审计 §7 行③只要求呈现；哨兵数据层治理归哨兵线 | DSH 哨兵线 |
| 工单六动作卡片（confirm/dismiss/details）桌面呈现 + nav-ticket 左栏工单视图 | 审计归 D594（interactive-card 桌面呈现）；本任务哨兵 tab 只读列表 | D594 |
| NotificationCenter error 渲染 / StatusBar / TitleBar 死数据 | 审计归 D594 | D594 |
| SessionStore schema 变更 / 新表 | checkpoint 表已覆盖（§5.4 决策 1）；D588 已占 store 演进线 | D588（已落） |
| 报告过期清理 / 条数上限策略 | §5.4 决策 5（全保留） | P2 治理 |
| consult/对话 SSE 帧协议任何改动 | D590 已对齐；本任务零流改动 | — |
| useStreaming.ts / sse-contract.ts / conversation-store.ts 代码变更 | D591 已闭环（reportId 提取、sessionId 回声均已在位） | D591（已落） |
| conversations 列表的会话搜索/删除 UI（FTS/CRUD 界面） | 列表呈现只是读回；管理操作超范围 | 后续 |
| 桌面 IPC/preload（P0-2）修复 | 审计归 D594 | D594 |

## 7. Test Requirements（测试先行——铁律 0-2/48；第一步 red，第二步 green）

**测试文件**：tests/routes/diagnosis-report-persistence.test.ts（新建，集成）+ tests/electron/right-panel-report-sentinel.test.ts（新建；实现提交精确化 .ts——vitest include 限定，D593 实现注）。
**模式**（沿 tests/routes/diagnosis-consult-events.test.ts 与 tests/routes/conversations.test.ts 先例，铁律 12 真实路由不 mock 管线）：express app + listen(0) + fetch；`vi.mock` 仅 providers/config/诊断引擎工厂（fake 引擎返回带 reportId 的 report）；SessionStore 用真实 better-sqlite3 `':memory:'` 经 `app.locals.orchestration = { db }` 注入；鉴权用例真实挂载 jwtAuthMiddleware；"重启"模拟 = 同一 db 句柄构造**新的 express app 实例**（内存 Map 清空，持久层保留——D592 T9 双段物理重启的测试内等价形态）。

| # | 用例 | red（现状） | green（实现后） |
|---|---|---|---|
| 1 | 落盘：fake 引擎完成 consult → diagnosis_checkpoints 存在 phase=5 行，partial_report JSON 含 reportId/report/teamId（SQL 断言） | 无行 | 有行 |
| 2 | 读回（重启）：同 db 新 app 实例 → GET /api/diagnosis/consult/{reportId}/report → 200 + report.reportId 匹配 + teamId 匹配 | 404 | 200 |
| 3 | 双 ID 兼容：进程内 GET /consult/{consultId}/report（内存键命中）→ 200；GET /consult/{reportId}/report（内存 miss → checkpoint 命中）→ 200 | 后者 404 | 双 200 |
| 4 | 未知 id：GET /consult/ghost/report → 404（形状 {ok:false, code:'NOT_FOUND'}） | 404 | 404（语义保持） |
| 5 | 列表：两次落盘 → GET /api/diagnosis/reports → total=2、按 saved_at DESC、reports[0].reportId 正确；limit=1&offset=1 → 第二条 | 404（路由不存在） | 全绿 |
| 6 | **白名单（P0-1 收尾）**：挂 jwtAuthMiddleware、无 Authorization：GET /api/diagnosis/reports 非 401；GET /api/notifications 非 401；GET /api/solutions 非 401；GET /api/ga/clients 非 401；POST /api/ga/switch/x 非 401 | 401 | 非 401 |
| 7 | 降级：partial_report 写坏 JSON → 列表跳过该行 + degraded:true + 不 500；db 缺失 → 列表 503 STORE_UNAVAILABLE | 404/500 | 全绿 |
| 8 | 对话桥落盘：conversations phaseComplete（fake 诊断引擎）→ 该 reportId 的 checkpoint 行存在（source:'conversation'）；同 db 重启后 GET report 200 | 无行 | 有行 |
| 9 | 边界：limit=0 → 夹取 1；limit=1000 → 夹取 200；offset 负数 → 0 | 404 | 全绿 |
| 10 | markdown 格式：checkpoint fallback 路径 GET ?format=markdown → text/markdown 200（renderOnePagerOnDemand 复用） | 404 | 200 |
| 11 | 报告 tab 恢复（electron）：mock fetch 列表返回最近 reportId → setCurrentReportId 被调用；localStorage 已存时优先读 localStorage | 无组件逻辑 | 全绿 |
| 12 | 哨兵 tab（electron）：mock fetch reports+tickets → 渲染两段列表（断言条数/标题）；失败 → degraded 提示条渲染；空 → Empty 文本 | Empty 占位 | 真数据渲染 |

| 层 | 类型 | 数量 | 覆盖 |
|:---|---|:---:|---|
| L1 单元契约 | 集成（真实路由+真实 store+mock 引擎）+ 组件（mock fetch） | ≥12 | §7 表全用例（正常/降级/边界/白名单/双路线） |
| L2a 接线 | 路由挂载 + 白名单 grep 断言 + checkpoint 写点 | 含于用例 1/6/8 | 生产调用点 + 白名单生效 |
| L2b 降级 | 行级 JSON 损坏 / db 缺失 503 / 写失败 log.warn | 用例 7 + 写路径异常注入 | degraded 显式不静默 |
| L2c 边界 | limit/offset 夹取、双 ID、未知 id、FIFO 满后持久层仍可读 | 用例 3/4/9 + 内存淘汰后读回 | 防线语义 |

## 8. Wiring Verification

新 export / 变更的生产调用点（测试调用不计——铁律 0-2 Step 5 WIRE CHECK）：

| 新 export / 变更 | 生产调用点（实现后 grep 必须命中） |
|---|---|
| `listDiagnosisReports`（SessionStore 新方法） | src/routes/diagnosis.ts 列表端点 handler 内调用（grep `listDiagnosisReports` src/ ≥2：定义 + 生产调用） |
| `saveDiagnosisCheckpoint`（既有 API 首次真实接线） | src/routes/diagnosis.ts + src/routes/conversations.ts 各 ≥1 调用（grep `saveDiagnosisCheckpoint` ≥2，除 session-store 定义与 launcher 死代码外新增两处） |
| GET /api/diagnosis/reports 路由 | src/routes/diagnosis.ts `router.get('/api/diagnosis/reports'...`（挂载复用 server.ts:354 diagnosisRoutes 既有挂载，零 server.ts 改动） |
| isWhitelisted 五新前缀 | src/middleware/auth.ts:94-113 函数体内（grep `/api/diagnosis/reports`、`/api/notifications`、`/api/solutions`、`/api/ga/clients`、`/api/ga/switch` auth.ts ≥1 各）+ 用例 6 集成证明 |
| SentinelDetail（哨兵 tab 组件） | electron-renderer/src/components/RightPanel.tsx `tab === 'sentinel'` 分支渲染（grep `SentinelDetail` RightPanel.tsx ≥2：定义 + 使用） |
| `setConversations`（app-store 新 action） | electron-renderer/src/components/LeftPanel.tsx 调用（grep `setConversations` ≥2：定义 + 生产调用） |
| localStorage `synova:last-report-id` | app-store.ts boot 读 + setCurrentReportId 写（grep ≥2 处） |
| GET report fallback（冷读） | diagnosis.ts :541-559 handler 内 `getDiagnosisCheckpoint` 调用（grep `getDiagnosisCheckpoint` src/routes/diagnosis.ts ≥1 新增，与 :511 resume 既有调用并存） |

## 9. Architecture Layer

**L1 交互层为主**（routes/ + middleware/ + electron-renderer 呈现）+ **一处 L5 域内扩展**（SessionStore 新方法）。

- 路由对 L5 仅经 D563 既有动态 import 通道（diagnosis.ts:213-215 / conversations.ts:91-108 已存在的 `resolveStore` 范式）——**零新增静态 L1→L5 import**；isSqliteDatabase 谓词窄化沿用。
- SessionStore 新方法在 L5 域内自洽（同类查询方法先例：getDiagnosisCheckpoint/searchSessions）。
- 零 L2/L3/L4 修改（launcher 死代码不碰，§5.4 决策 8）。
- 诊断事件流（launcher appendEvent）零改动——报告落盘走 checkpoint 表，事件流摘要维持 D489 现状。
- pre-commit check-architecture 回归：新增 import 面全部 L1→L1/L1→L5（动态通道既有容忍），预期零新增违规。
- 铁律 38：新代码 `as any`/`as never`/`as unknown as` = 0（读侧类型守卫：partialReport 反序列化用类型守卫不盲信 JSON——对齐 conversations.ts:75-84 isEngineStateLike 先例形态）。

## 10. Completion Standard（DS 与本 doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: tests/routes/diagnosis-report-persistence.test.ts + tests/electron/right-panel-report-sentinel.test.ts 全绿（≥12 用例；red 已先证——实现前该两文件必须先存在且失败）
2. **DS2**: 报告落盘——跑一次真实 consult（或 fake 引擎集成路径）→ SQL 断言 diagnosis_checkpoints phase=5 行存在；**物理证据：跑诊断 → 杀后端进程 → 重启 → `curl GET /api/diagnosis/consult/{reportId}/report` 200**（贴完成报告）
3. **DS3**: 双路线落盘——consult 路线（用例 1/2）+ 对话桥路线（用例 8）均落盘且重启后可读
4. **DS4**: 桌面报告 tab 刷新恢复——currentReportId 经 localStorage / 列表兜底恢复 → markdown 渲染成功（用例 11）
5. **DS5**: 哨兵 tab 真数据——reports+tickets 渲染（无 Empty 占位；用例 12）；失败降级提示条诚实
6. **DS6**: 401 清零——五前缀白名单落地（用例 6 全非 401）+ auth.ts JSDoc + README 安全模型节同步
7. **DS7**: 列表端点分页/边界——用例 5/9 绿（limit 夹取 1..200、offset、total 恒准）
8. **DS8**: 接线验证（§8 表）全部 grep 命中 + tsc 零新增错误 + `as any`=0 + 全量 vitest 零新失败（审计验收③）
9. **DS9**: 完成报告含 §5.4 九项决策记录（参考系+结论，S-12/K3 可核）+ 北星验收三句（入口/交互/结果各一句，附证据）

## 11. Auth Doc References

- docs/synova/research/L1全量审计-20260907/L1-audit-report.md（§3.1 diagnosis.ts 行 / §3.5.1 RightPanel 行 / §5 DSH 借鉴 / §7 D593 行 / §8.3 风险登记行 5）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md（白名单先例 + §6 归本任务的排除项）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D591-desktop-chat-wiring-20260908.md（§5.4 决策 5 会话列表遗留 + localStorage 模式）
- docs/plans/codex/implementation/SYNOVA-IMPL-D588-session-projection-20260907.md（投影定位——非持久化载体的依据）
- docs/synova/product-lines/evidence/d592-e2e-2-5.json（对话+诊断桥 E2E 已通基线；T6 诊断桥 15 flat 事件 + complete 终帧）
- .claude/PRODUCT-BRIEF.md（§三 怎么工作 / §五 W1 / §六 P0）
- AGENTS.md（铁律 0-2/4/5/24/31/38/39/47/48）
- DSH 源码锚点（零 import，范式借鉴；本机一手验证 2026-09-08）：dsh-api-session-controller/lib/index.js:142-170（冷读激活）、dsh-api-gateway/lib/index.js:122-133（帧协议对齐基线）
- scripts/control-tower/dev-doc-gatekeeper.sh（本 doc 验收门禁）+ scripts/workflow/check-dev-doc-write-set.sh（写集对账）

## 12. 自检清单

- [x] L1 审计 §7 D593 行 + §8.3 风险登记逐条现场核实（非转述）
- [x] 全部"X 存在/签名是 Y"当场 grep/read（FIFO :64-75、checkpoint 表 :212-220 与 API :492/:508、saveCheckpoint 零调用、reportId/consultId 双生成点、白名单现状 16 规则、solutions/notifications/ga-admin 路由路径、sentinel 数据源、D588 投影定位、D590/D591/D592 已合 main 的 commit hash）
- [x] DSH 冷读激活锚点一手源码验证（inspectApiSession 只读快照 + ApiSessionNotFound 显式 404）
- [x] 写集表 D381 格式（`### 5.1 写集 (8 修改 + 2 新建)`，标题下一行即表头）；新建文件目录级声明（check-dev-doc-write-set 假阳规避，D580/D590 先例）
- [x] 增量发现已标注（桌面 reportId/consultId 键错配是审计未记的第三断点；saveCheckpoint 死代码实证）
- [x] 测试 red→green 对照 + 铁律 12 真实路由模式（diagnosis-consult-events.test.ts 先例）+ "重启"测试内等价形态声明
- [x] 决策参考 §5.4（S-12，九决策点双参考系收敛）
- [x] DS1-DS9 一一对应（S-10）；不做清单含文件路径与归属（Q2 排除项可物理验证）
- [x] 架构边界自查（§9）：零 L2/L3/L4 修改、零新增静态跨层 import、as never 形态明确禁入
- [x] 不是凭记忆；不涉及 scripts/audit/；不用 --no-verify
