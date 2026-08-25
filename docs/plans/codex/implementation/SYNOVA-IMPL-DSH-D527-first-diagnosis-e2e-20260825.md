---
north-star:
  服务用户: FDE（前线部署工程师）+ 企业主——不会装 Node、不想碰命令行，双击桌面端 30 分钟内完成首次诊断
  服务场景: 企业用户双击 SynovaAgent 桌面端 → 输入一句话发起首诊 → 看到六阶段进度 → 拿到诊断报告，全程零命令行
  模块终态: 桌面端从安装到可发起诊断 ≤30 分钟（物理计时可复现）；`/diagnosis` 发起 → SSE 六阶段进度可见 → 完成后报告在桌面端可见（RightPanel 报告区渲染 onePager）；LLM 不可用时降级提示可见（不静默、不白屏）
  对齐北星: PRODUCT-BRIEF §二（直接用户=FDE，缺系统诊断工具）+ §六 P0（没有真实可用的诊断旅程不能给 FDE 用）；施工图 DOC-0114 §3.1（src/routes/ + electron/ = 🟢 死守，品牌表层）
  完成标准: 入口=桌面端 `/diagnosis`（LLM 环境）；处理=SSE 六阶段（phase_started 0→5）进度推进 + complete 存 reportId；结果=报告在桌面端可见 + GS-01 扩展断言绿（无 LLM key 时如实 RED）+ 30 分钟计时记录落 evidence
  当前进度: 验证点 1-6 uncommitted。后端管线（src/routes/diagnosis.ts consult SSE 六阶段 + D480 报告端点）生产可用、GS-01 契约绿；桌面端 UI 已有首诊接线（Composer/useStreaming/RightPanel）但实测发现 4 处真实缺口：①engine 发 phase_started/phase_completed（6 对）而 useStreaming 只处理 phase → 六阶段进度事件被静默丢弃；②setCurrentReportId 零调用 → 诊断完成后报告/方案永远不可见（RightPanel 恒显示"请先进行一次诊断"）；③errorMessage 无 UI 渲染 → 降级不可见；④GS-01 无真实 consult 断言、无 30 分钟计时方法
---

<!--
  SYNOVA-IMPL-DSH-D527: L1-C 首诊旅程端到端（验证点 1-6）
  状态: dev doc | 2026-08-25 | 优先级 P1 | slice: L1-C
  权威: 派单-L1切片C-D527-D528-20260825.md §D527（5 必答题）+ K3 切片 A 审计（C2 M7 漂移 / P2-2 指纹落盘）+ D524 返修派单 + D510 F1 + GS-01 README（诚实 RED）
  依赖: 切片 B（feat/d522-service-boot-teardown，审计中）合入 main——桌面端能开 + 服务自启 + prod 契约（backend.mjs）；LLM key 可用环境（consult 真实六阶段）
  并行: 本 spec 与 D528 spec 并行出（派单 §写集约束）；编码阶段 D527 等切片 B 合并，D528 可与 B 审计并行
  基线声明: 当前工作区 = feat/d505-impl @9cb09dbb（D504 基线），切片 A/B 实现均未合入 main。编码阶段前置（铁律 0-3）: git fetch --all && git pull --ff-only，确认切片 A/B 已合 main 后**重新核验本 spec 引用的行号/契约**（防 D524 M7 漂移——D518 dev doc 写旧 prod 契约导致照文档写测试变红的教训）
-->

# D527: L1-C 首诊旅程端到端（1-6）

> 一句话问题: 后端 consult 管线 + D480 报告端点 + 桌面端 UI 骨架都已就绪，但**用户从桌面端发起的首诊旅程没有一条可复现的端到端通路**——UI 实测发现 SSE 事件类型错配（engine 发 `phase_started/phase_completed/report_ready`，useStreaming 只处理 `phase` 等 9 种，六阶段进度事件被静默丢弃）、`setCurrentReportId` 零调用（报告永远不可见）、errorMessage 无 UI 渲染（降级不可见）、GS-01 无真实 consult 断言与 30 分钟计时方法。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片C-D527-D528-20260825.md` §D527（5 必答题 + 验收 + 1-8 审计员复核）
  > 「端到端实测（GS-01 RED 2/3 补跑）：桌面端发起 `/diagnosis` → SSE 六阶段流（以 `electron-renderer/src/hooks/useStreaming.ts` 实际 case 为准：interim_finding → community_reports → entity_resolution → judgment_card → complete）→ 报告呈现——LLM key 可用环境跑真实全链路，evidence 落盘」——**实测修正**：engine 实际事件流为 `phase_started×6 → phase_completed×6 → expert_hypothesis/hypothesis_generated → report_ready → complete`（见 §4.2 实测），spec 以实测为准（D381 接线纪律：文档契约以代码实际为准）。
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（直接用户=FDE，缺系统诊断工具）+ §六 P0（诊断报告质量验证依赖真实使用）
- **施工图**: `docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §3.1 L77（`src/routes/` + `app/` + `electron/` = 🟢 死守"品牌表层，继续投入自研"）+ §2.2（全形态引用检测原则）
- **K3 切片 A 审计**: `.wt-sliceB-specs/docs/synova/audit-reports/2026-08-25-D517-D519.md`——**C2 P1-1（M7 文档-实现漂移）**: dev doc 写旧契约导致照文档写测试会红；**P2-2**: 产物指纹落 evidence 而非仅 task-state（本 spec §5 计时/evidence 规范遵循）
- **D524 返修派单**: `docs/synova/coordination/派单-D524-devdoc-fix-20260825.md`（M7 漂移修复要求：文档契约与实现一致，grep 物理验证）
- **GS-01**: `scripts/golden-scenarios/GS-01-first-diagnosis/README.md`（3 断言契约 + 诚实 RED 声明：consult 六阶段依赖 LLM，非确定性产物不进机器断言）
- **铁律**: AGENTS.md 铁律 0-2（接线验收）/ 4（交付不完整）/ 5（后端能力≠用户可用）/ 7（Done 标准）/ 24+31（异常 log + degraded 传播）/ 47/48（契约+非空壳测试）

## 2. Problem Statement

验证点 1-6「30 分钟内从安装到可诊断（零命令行）」当前 uncommitted。派单验收三件套——**端到端实测 evidence / 30 分钟计时记录 / 报告在桌面端可见**——当前零可复现路径。实测（2026-08-25，feat/d505-impl @9cb09dbb）定位 4 个真实缺口：

1. **SSE 事件类型错配（六阶段进度不可见）**: `src/l3/synova-diagnosis-engine-impl.ts` 发射 `phase_started`(6 次) / `phase_completed`(6 次) / `report_ready` / `right_column_update` / `degraded` / `expert_hypothesis` / `hypothesis_generated` / `root_cause_identified` / `error`（grep 实测 10 种）；`electron-renderer/src/hooks/useStreaming.ts` 的 `SSEEventType` 只有 `phase/expert_hypothesis/hypothesis_generated/interim_finding/community_reports/entity_resolution/judgment_card/complete/error` 9 种且 switch **无 default 分支**——engine 的 `phase_started/phase_completed/report_ready` 到达后被 JSON.parse 成功但 switch 静默丢弃。**用户看不到"当前第几阶段"**，`report_ready` 携带的 reportId 也一并丢失。
2. **`setCurrentReportId` 零调用（报告不可见）**: `electron-renderer/src/stores/app-store.ts` 定义 `currentReportId` + `setCurrentReportId`（:52/:69/:113），全仓 grep 无任何生产调用方（仅 RightPanel 消费）。complete 事件里 `report.reportId` 从未落 store → `RightPanel.tsx:358` 恒显示"请先进行一次诊断"，报告/方案功能对用户不可达（铁律 5 违反：后端能力≠用户可用的功能）。
3. **errorMessage 无 UI 渲染（降级不可见）**: `useStreaming.ts:146/241` 调 `storeNow.setError(...)`，但全仓 grep 无组件读取 `conversation-store.errorMessage`——LLM 不可用/后端未就绪时用户只看到 phase='error' 的隐形状态，无提示文案（铁律 24/31 前端侧缺口）。
4. **GS-01 无真实 consult 断言 + 无计时方法**: `run.sh` 3 契约断言（401/400/200）+ D504 静态 grep 组；无"带 LLM 的六阶段完成"断言（派单必答 4），无"安装→可诊断"计时（派单必答 2）。

> 附带发现（盘点结论，非缺陷）: ① `/diagnosis` 命令在 Composer 命令列表存在但 selectCommand 只做文本填充（:88-92）——实际任何文本都能触发诊断（文本作为 concerns），入口已通，语义化是补强；② 报告呈现：RightPanel 只有方案（/api/solutions）无报告内容渲染，GET /consult/:id/report（D480 onePager）无 UI 消费点；③ WelcomeScreen 快速诊断按钮（:87-91）onClick 调 `setWelcomeState('ready')` + `onStartDiagnosis()`，而 CenterPanel 传入的 onStartDiagnosis 本身也只是 `setWelcomeState('ready')`（CenterPanel :33）——按钮只进入 chat 视图，**不触发 sendMessage**（首诊需用户手动输入，是引导缺口非缺陷）。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层桌面端（electron-renderer）+ 首诊后端（src/routes/diagnosis.ts，生产可用）。本任务 = 事件契约对齐 + reportId 接线 + 降级 UI + GS-01 扩展 + 计时方法。**零 src/ 改动**（事件契约已满足：complete 事件内带 report.reportId，GET /consult/:id/report 端点已存在，详见 §4.2）。
**Q1 调研**: 业界 = SSE 事件驱动 UI 的标准做法是**前后端事件类型契约单源对齐**（事件是 API 的一部分，前端必须处理全部类型，未知类型不得静默丢弃）；Anthropic 基线 = 机器可验契约（SSE 事件流物理断言：`phase_started` 0-5 全出现）+ fail-closed（降级必须用户可见，不静默）；memory 教训 = K3 切片 A C2（M7 文档漂移：契约以代码实测为准，D524 已返修同类）+ D510 F1（禁静态 grep 冒充实测）+ P2-2（产物指纹落 evidence）+ K3 G1（electron-renderer 子包构建/测试无门禁——本 spec 的测试放根 tests/electron/ 受 vitest 覆盖）。**参考: 第一性原理（事件契约 = 前后端共享的机器可验接口）+ Anthropic（物理可验/降级可见）+ 结论: ①抽 SSE 事件纯函数（sse-contract）对齐 engine 全部事件类型，测试放根 tests/electron/；②complete 提取 reportId 落 app-store（最少机制，不改 src/）；③errorMessage 渲染到 CenterPanel；④GS-01 加 GS01_LLM 门控的真实 consult 断言组 + 独立计时脚本。**
**Q2 范围**: 做什么——SSE 事件契约对齐（5 个 renderer 文件修改 + 1 新建纯函数）、GS-01 断言扩展（run.sh/expect.json/README）、30 分钟计时脚本、端到端 runbook、事件契约单测。不做什么——src/ 任何文件（派单红线；本 D 经 §4.2 分析零 src/ 需求）、scripts/audit/、报告持久化（completedReports 内存缓存 50 条是现状——重启后 GET /report 404，本 D 诚实标注不解决，持久化是独立任务）、自动更新/签名（切片 A descope）、无 LLM key 时伪造全链路绿（诚实 RED）、单实例锁（D528 领地）。
**Q3 验收**: 入口=桌面端 Composer 输入触发 `/diagnosis`（LLM 环境）；处理=SSE 六阶段（phase_started 0→5）进度条推进 + complete 提取 reportId 落 app-store + 报告 GET 渲染；结果=报告在桌面端可见（RightPanel 报告区 onePager）+ GS-01 扩展断言绿（无 key 如实 RED）+ first-diagnosis-timing.sh 计时记录落 evidence。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-25 实测，feat/d505-impl @9cb09dbb）

> 基线声明：当前分支不含切片 A/B 实现。**切片 A/B 合入后**：main.cjs 加载 renderer 产物路径、backend-spawn prod 契约（dist/backend.mjs + ELECTRON_RUN_AS_NODE=1）、GS-01 静态断言组均会变化——编码阶段须重新核验（§1 依赖段）。

### 4.1 后端管线（生产可用，GS-01 契约绿）

- `src/routes/diagnosis.ts`（410 行）: `POST /api/diagnosis/consult`（SSE 六阶段，:96-316）/ `GET /consult/:id/status`（:320）/ `POST /interrupt`（:338）/ `POST /resume`（:350）/ `GET /consult/:id/report`（D480，:390-408，onePager markdown 或 JSON）。完成报告存**内存有界缓存** `completedReports`（:60-70，50 条 FIFO）。
- `src/routes/ga-diagnosis.ts`（368 行）: `GET /ga` 八维诊断表单页（走 /api/diagnosis/upload，非 consult SSE）——D527 不碰。
- 报告/方案端点: `src/routes/sentinel.ts:74` `GET /api/sentinel/reports`；`src/routes/solutions.ts:91` `GET /api/solutions`（?reportId=）。
- 六阶段（`src/l3/synova-diagnosis-engine-impl.ts` 实测）: phase 0 组织访谈 / 1 数据采集 / 2 假设生成 / 3 根因分析 / 4 报告生成 / 5 交付（:183/:217/:233/:367/:407/:441 `phase_started`；:212/:228/:362/:402/:436/:475 `phase_completed`）。

### 4.2 SSE 事件契约实测（本 spec 核心依据——前后端对齐表）

engine 发射（grep `src/l3/synova-diagnosis-engine-impl.ts` 事件类型全集）:

| engine 事件 | 次数 | useStreaming 现状 | 后果 |
|---|---|---|---|
| `phase_started`(phase 0-5, label) | 6 | ❌ 无 case（switch 无 default） | 静默丢弃——六阶段进度不可见 |
| `phase_completed`(phase 0-5) | 6 | ❌ 无 case | 同上 |
| `report_ready`(reportId) | 1 | ❌ 无 case | reportId 丢失 |
| `right_column_update` | 1 | ❌ 无 case | 丢弃（本 D 不消费，留待后续） |
| `degraded`(moduleId) | 1 处 emit（:448 循环，运行时 0-N） | ❌ 无 case | 降级信号丢失 |
| `expert_hypothesis` | 1 | ✅ case | assistant 消息 |
| `hypothesis_generated` | 1 | ✅ case | assistant 消息 |
| `root_cause_identified` | 1 | ❌ 无 case | 丢弃（本 D 不消费） |
| `error` | 0-N | ✅ case | setError（但无 UI 渲染，见缺口 3） |

另：diagnosis.ts 后处理回调补发 `community_reports`（:243-254）/ `entity_resolution`（:255-261），judgment-card 生成器在 :210-230（generateJudgmentCard :217 + formatForSSE :225）补发 `judgment_card`——useStreaming 已有 case ✅。`complete` 事件（sseClose :78-87）带 `report` 字段（含 `report.reportId`）——useStreaming complete case **只 addMessage 不取 reportId**（:134-143）。

### 4.3 桌面端 UI（electron-renderer/src 逐文件实测）

- `hooks/useStreaming.ts`（264 行）: sendMessage 用 fetch SSE（:180-188），teamId 由文本生成；handleEvent switch 9 case（:80-149）；**无 default 分支**；complete 只提示（:134-143）；error setError（:146/241）。
- `stores/app-store.ts`（121 行）: `currentReportId` + `setCurrentReportId`（:52/:69/:113）——**零生产调用方**（grep 实测，仅 RightPanel 消费）。
- `stores/conversation-store.ts`: phase 6 态（idle/loading/thinking/streaming/done/error，types/chat.ts:41）+ errorMessage 存储——**errorMessage 无 UI 读取**（grep 实测仅 setter）。
- `components/CenterPanel.tsx`（94 行）: welcomeState 三态（firstLaunch→ready）；header 显示"诊断中.../thinkingExperts 分析中/中断/✅ 诊断完成"（:44-64）——**无六阶段进度条**、**无 errorMessage 渲染**。
- `components/RightPanel.tsx`（398 行）: GAWorkspaceTabs 三 tab（action/sentinel/pattern）；`currentReportId` 驱动 /api/solutions（:179-194）；无 reportId 时显示"请先进行一次诊断"（:358）——**无报告内容渲染**（GET /consult/:id/report 无消费点）。
- `components/Composer.tsx`（234 行）: COMMAND_LIST 含 /diagnosis（:24-29）；selectCommand 只填充文本（:88-92）——命令无语义（但发任意文本即可触发诊断，入口已通）。
- `components/WelcomeScreen.tsx`: 快速诊断按钮（:87-91）onClick 只 `setWelcomeState('ready')` + onStartDiagnosis（CenterPanel 传入的 onStartDiagnosis 也只是 setWelcomeState，CenterPanel :33）——进入 chat 视图但不触发 sendMessage。
- `lib/api.ts`: getApiBase()——Electron 环境读 `window.electronAPI.getServerUrl()`（preload.cjs 暴露 config.serverUrl，默认 http://localhost:18790）；非 Electron dev 走相对路径 + vite proxy。
- `MessageItem.tsx`: user/assistant/thinking/system 四种渲染；assistant 用 ReactMarkdown（judgment_card 作为 assistant 消息展示）。

### 4.4 GS-01 现状

- `run.sh`（147 行）: 3 契约断言（无 token 401 / 缺 teamId 400 / GET reports 200）+ D504 Electron 静态断言组（L1-1/L1-4/L1-5/L1-7，grep 配置）——**无真实 consult 调用**（README 诚实 RED：consult 六阶段依赖 LLM，非确定性产物不进机器断言）。
- `expect.json`: 7 断言（noauth-401 / consult-entry-validated / reports-endpoint-ok / electron-pack-config-valid / electron-backend-spawn-contract / electron-dual-bootstrap / electron-userdata-dbpath）。
- common 基建: `scripts/golden-scenarios/common/` bootstrap.ts（临时端口+临时库+healthz 就绪）/ fresh-db.ts（临时数据目录，禁止 cp 真实库）/ assert.ts（expect 断言）/ inject.ts。
- evidence: `scripts/golden-scenarios/evidence/GS-01-<date>.json`（schema 1，verdicts + quotes 原文）。

### 4.5 测试基建

- 根 vitest（vitest.config.ts）: include `./tests/**/*.test.ts`（+integration）；根 tsconfig include 仅 `src/**/*.ts(x)`——**electron-renderer 不在根 tsc 覆盖**（K3 G1 缺口）；electron-renderer/package.json **无 vitest**（devDeps 仅 vite/tsc/react 系）。
- `tests/electron/` 现有 3 文件（backend-spawn / desktop-build / auto-update）——D527 新增测试放此处（受根 vitest 覆盖）。

## 5. What We Build

### 5.1 写集 (8 修改 + 4 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| electron-renderer/src/hooks/sse-contract.ts | 新建 | **SSE 事件契约纯函数**（零 react/零 zustand 依赖，可被根 vitest 编译）：①`SSEEventType` 扩展对齐 engine 全集（+phase_started/phase_completed/report_ready/right_column_update/degraded/root_cause_identified）；②`applySSEEvent(state, evt)` reducer——输入当前对话状态（messages/phase/phaseIndex/phaseLabel/errorMessage/degraded）+ 事件，输出新状态（phase_started→进度推进+系统消息；phase_completed→进度完成；report_ready/complete→提取 reportId 返回；error→setError；degraded→系统消息 degraded 标记；其余保持现状 case）；③未知事件类型→不抛、console.warn 留痕（不再静默丢弃）。JSDoc 契约头（铁律 47）：@input/@output/@degraded |
| electron-renderer/src/hooks/useStreaming.ts | 修改 | handleEvent 改走 `sse-contract.applySSEEvent`（单一数据流）；complete/report_ready 返回的 reportId → `useAppStore.getState().setCurrentReportId(reportId)`（缺口 2 修复）；SSEEventType 从 sse-contract 导入（单源） |
| electron-renderer/src/stores/conversation-store.ts | 修改 | 新增 `phaseIndex: number` / `phaseLabel: string` / `phaseTotal: number`(=6) state + `setPhaseProgress(index, label)` action（六阶段进度数据源） |
| electron-renderer/src/components/CenterPanel.tsx | 修改 | ①六阶段进度条 UI：header 或消息区上方显示"阶段 {phaseIndex+1}/6 · {phaseLabel}"（phaseIndex 0-5 时可见，done 后显示"✅ 诊断完成"）；②errorMessage 渲染：`phase==='error' && errorMessage` 时显示红色错误条（缺口 3 修复，铁律 24/31） |
| electron-renderer/src/components/RightPanel.tsx | 修改 | ①GAWorkspaceTabs 加第 4 个 tab「诊断报告」：currentReportId 非空时 `GET /consult/:id/report?format=markdown` 渲染 onePager（ReactMarkdown）；请求失败/404 → degraded 提示"报告不可用（服务重启后内存缓存已清）"不静默；②currentReportId 为空时仍显示"请先进行一次诊断"（现状保留） |
| electron-renderer/src/components/Composer.tsx | 修改 | `/diagnosis` 命令语义化：selectCommand 命中 /diagnosis → 直接 `onSend('/诊断 ' + 默认引导文案)`（用户可见行为：选命令即触发诊断，而非纯文本填充）；其余命令保持填充 |
| tests/electron/use-streaming-contract.test.ts | 新建 | SSE 事件契约单测（≥10 用例，red→green，见 §7）：事件类型对齐、六阶段进度归约、reportId 提取、降级/边界 |
| scripts/golden-scenarios/GS-01-first-diagnosis/run.sh | 修改 | ①新增 **GS01_LLM 门控的真实 consult 断言组**：`GS01_LLM=1` 时（LLM 环境）带 JWT 发 `POST /api/diagnosis/consult`（teamId=gs01-e2e，initiator.role=ga，concerns=首诊文案）→ 收集 SSE 事件流 → 断言 phase_started 0-5 全出现 + complete 事件 + complete.report.reportId 非空 + `GET /consult/:id/report` 200——产物落 evidence 目录；`GS01_LLM` 未设 → 该组跳过 + evidence 标注 `consult-llm: RED (LLM key 未提供)`（诚实 RED，不伪造绿）；②计时埋点：调用前记录 `timing_consult_start`，落 evidence |
| scripts/golden-scenarios/GS-01-first-diagnosis/expect.json | 修改 | 新增断言条目（env 门控）：`consult-llm-complete`（LLM 组产物文件 exists + contains "phase_started" 全 6 次）/ `consult-llm-red`（无 key 时 evidence 含 RED 标注）——断言文件路径与 run.sh 产物一致 |
| scripts/golden-scenarios/GS-01-first-diagnosis/README.md | 修改 | 诚实 RED 声明更新：3 契约断言绿 + LLM 组（GS01_LLM=1 绿 / 缺 key RED）；记录 D527 新增的 consult 断言语义 |
| scripts/desktop/first-diagnosis-timing.sh | 新建 | **30 分钟计时脚本**（派单必答 2）：测量"从安装到可诊断"路径物理时间戳——输入 `--mode dev|prod` + `--installer <dmg/exe 路径>`（prod）+ `--server-url`；里程碑: install_start → install_done → app_launch → healthz_200（GET /api/healthz）→ first_diagnosis_ready（GET /api/healthz + renderer 可达 + POST /consult 校验入口 200/400 均算"可提交"）；输出 JSON（每个里程碑 epoch ms + 间隔 + total_sec + verdict）落 `scripts/golden-scenarios/evidence/` 或 `docs/synova/product-lines/evidence/`（与 GS evidence 同 schema 风格）；幂等 + `--dry-run`（参照切片 A mac-install-verify.sh 模式，K3 可重跑）；30 分钟是目标值非硬断言——超时如实记录（P2-2：指纹/时间戳落盘不存 task-state 单一副本） |
| docs/synova/runbooks/first-diagnosis-e2e.md | 新建 | 端到端实测 runbook（K3 1-8 复核可独立重跑）：环境准备（LLM key / 切片 A+B 合入后构建）→ 桌面端启动 → /diagnosis 发起 → 六阶段进度观测 → 报告呈现 → GS-01 LLM 组 → 计时脚本执行顺序与预期产物清单；dev 与 prod 两路径 |

> 共享资源声明（S-7/S-8）：`electron-renderer/src/` 本 D 独占（D528 写集不碰）；`scripts/desktop/` 与 D528 共享目录但文件不同（本 D 新建 first-diagnosis-timing.sh，D528 新建 upgrade-data-verify.sh，零交集）；`scripts/golden-scenarios/GS-01-first-diagnosis/` 本 D 独占（D528 只读引用）。编码阶段 D527 与 D528 可并行（写集零交集）。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/ 任何文件（含 src/routes/diagnosis.ts、src/l3/synova-diagnosis-engine-impl.ts） | 派单红线——首诊管线生产可用 GS-01 绿；§4.2 分析证明事件契约已满足（complete 带 report.reportId，GET /report 端点已存在），零 src/ 需求 |
| 改 scripts/audit/ | K3 专属（审计红线，违反=事故） |
| 报告持久化（SQLite 落盘 completedReports） | completedReports 内存缓存 50 条是 D480 现状；重启后 GET /report 404——本 D 在 runbook/RightPanel 诚实标注，持久化是独立任务（不在切片 C 范围） |
| 自动更新 / 代码签名 / notarize | 切片 A descope（build-synova.cjs publish 注释态） |
| 无 LLM key 时伪造 consult 全链路绿 | 派单 §给 dev-doc 的交付要求 4——诚实声明，无 key 如实 RED |
| 消费 right_column_update / root_cause_identified 事件 | 本 D 只对齐事件契约（不静默丢弃），消费留给后续任务（右栏数据更新是独立功能） |
| 单实例锁 / db 损坏处理 / 升级语义 | D528 领地 |
| 改 electron/main.cjs / backend-spawn.cjs / build-synova.cjs | 切片 A/B 领地（D527 只消费其产物） |

## 7. Test Requirements

**契约（铁律 47，先于实现定义）**——SSE 事件契约 = engine 发射的每种事件类型，前端有对应处理；诊断完成 → reportId 落 app-store；六阶段进度 0→5 全推进；降级 → errorMessage 非空 + UI 可见：

```
sse-contract.applySSEEvent(state, evt) 契约:
  @input  state: { phaseIndex, phaseLabel, messages, phase, errorMessage, degraded }
          evt: SSEEvent（engine/diagnosis.ts 全集类型）
  @output 新 state + 可选的 reportId（complete/report_ready 时返回）
  @behavior phase_started → phaseIndex/label 更新 + 系统消息（🔄 label）
           phase_completed → 进度保持（phaseIndex 不回落）
           report_ready/complete → 提取 reportId（report.reportId || evt.reportId）
           error → errorMessage + phase='error'
           degraded → 系统消息 degraded 标记
           未知事件类型 → console.warn（不抛、不静默）
  @degraded 事件缺字段（无 report/reportId）→ 不抛，console.warn + 不落 reportId
```

| 层 | 用例 | 覆盖 | red 前提（改造前） |
|:---|------|------|------|
| L1 单元 | phase_started(0..5) 逐一 → phaseIndex 0→5 + label 正确（组织访谈/数据采集/假设生成/根因分析/报告生成/交付） | 正常 | 当前无 phase_started case → 事件被静默丢弃 |
| L1 单元 | complete 带 report.reportId → 返回 reportId（useStreaming 调 setCurrentReportId） | 正常 | 当前 complete 只提示不取 reportId |
| L1 单元 | report_ready 事件 → 同样返回 reportId | 正常 | 当前无 case |
| L1 单元 | 未知事件类型（root_cause_identified）→ 不抛 + console.warn | 边界 | 当前无 default（静默） |
| L1 单元 | error 事件 → errorMessage 非空 + phase='error' | 降级 | setError 已有但无 UI（CenterPanel 渲染属 L2a 验证） |
| L1 单元 | degraded 事件 → 系统消息 degraded 标记 | 降级 | 当前无 case |
| L1 单元 | complete 缺 report 字段 → 不抛 + warn + 不落 reportId | 边界 | 当前不取（无断言） |
| L1 单元 | phase_completed 不回落 phaseIndex（乱序到达安全） | 边界 | 当前无 case |
| L2a 接线 | GS01_LLM=1 真实 consult → SSE 流含 phase_started 0-5 全部 + complete + reportId 非空 + GET /report 200（物理断言，LLM 环境） | 正常全链 | 当前 run.sh 无 consult 调用（诚实 RED 2/3） |
| L2b 降级 | GS01_LLM 未设 → LLM 组跳过 + evidence 标 RED（不伪造绿） | 降级 | 当前无 LLM 组 |
| L2b 降级 | 后端未就绪（不 bootstrap）→ 桌面端 fetch 失败 → errorMessage UI 可见（CenterPanel 红色错误条） | 降级 | 当前 errorMessage 无 UI 渲染 |
| L2c 边界 | 计时脚本 --dry-run 幂等 + 缺 --installer（prod）→ 显式提示 exit 2（不静默） | 边界 | 新建脚本，首次实现 |

**verify 命令（物理，非 grep）**:
```bash
npx vitest run tests/electron/use-streaming-contract.test.ts     # DS1 事件契约全绿
GS01_LLM=1 bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh   # DS6 LLM 环境（无 key 则 GS01_LLM 缺省跑，验证 RED 标注）
bash scripts/desktop/first-diagnosis-timing.sh --mode dev --dry-run     # DS5 计时脚本契约
npx vitest run tests/electron/   # 回归（现有 3 文件不破）
```

## 8. Wiring Verification

| 新/改产物 | 生产调用点（实测方法） |
|--------|------|
| sse-contract.ts（applySSEEvent） | `grep -n "sse-contract\|applySSEEvent" electron-renderer/src/hooks/useStreaming.ts` → useStreaming 真实 import + 调用（测试调用不计，S-3） |
| useStreaming → setCurrentReportId | `grep -n "setCurrentReportId" electron-renderer/src/hooks/useStreaming.ts` → complete/report_ready 分支真实调用；消费点 `grep -n "currentReportId" electron-renderer/src/components/RightPanel.tsx`（:179/:184/:186 既有，接线后首次真实触发） |
| conversation-store setPhaseProgress | `grep -n "setPhaseProgress\|phaseIndex" electron-renderer/src/components/CenterPanel.tsx` → 进度条渲染真实消费 |
| errorMessage 渲染 | `grep -n "errorMessage" electron-renderer/src/components/CenterPanel.tsx` → 错误条真实渲染 |
| GS-01 LLM 组 | `grep -n "GS01_LLM" scripts/golden-scenarios/GS-01-first-diagnosis/run.sh` → run.sh 生产入口（golden-scenarios 归 Mac Harness，K3 可重跑） |
| first-diagnosis-timing.sh | `grep -n "first-diagnosis-timing" docs/synova/runbooks/first-diagnosis-e2e.md` → runbook 引用；执行产物落 evidence（K3 1-8 复核路径） |
| RightPanel 报告 tab | `grep -n "consult/:id/report\|/report?format" electron-renderer/src/components/RightPanel.tsx` → 报告 GET 真实调用 |

## 9. Architecture Layer

L1 交互层（electron-renderer 桌面端 UI + GS-01 场景脚本）。**零跨层**：useStreaming 经 fetch 调 L1 API 端点（同层 HTTP），sse-contract 纯函数零 import（不触 L2-L5）；GS-01 归 scripts/golden-scenarios（Mac Harness 领地，非运行时代码）。铁律 39 无违规风险。

## 10. Completion Standard

1. **DS1**: `npx vitest run tests/electron/use-streaming-contract.test.ts` 全绿（≥10 用例；red 已证——改造前 phase_started/complete-reportId 用例失败）
2. **DS2**: 六阶段进度 UI 实测——桌面端发起诊断，进度条 phase_started 0→5 逐阶段推进（LLM 环境日志/截图落 evidence；阶段标签与 engine 定义一致：组织访谈/数据采集/假设生成/根因分析/报告生成/交付）
3. **DS3**: 报告在桌面端可见——诊断完成后 `grep`/运行态验证 `currentReportId` 非空 + RightPanel「诊断报告」tab 渲染 onePager（GET /consult/:id/report?format=markdown 200）
4. **DS4**: 端到端实测 evidence——SSE 事件流日志落盘（phase_started×6 + complete + reportId）→ `scripts/golden-scenarios/evidence/`（K3 1-8 独立重跑可复现；P2-2 指纹/时间戳落盘）
5. **DS5**: 30 分钟计时记录——`first-diagnosis-timing.sh` 输出物理时间戳 JSON（install_start→first_diagnosis_ready 各里程碑 + total_sec；≤30 分钟为对齐目标，超时如实记录不伪造——派单 §D527 验收）
6. **DS6**: GS-01 扩展断言——`GS01_LLM=1` 环境跑绿（真实 consult 六阶段完成）；无 key 时该组 evidence 标注 RED（README + evidence 双处，不伪造全链路绿——派单 §给 dev-doc 的交付要求 4）
7. **DS7**: 降级诚实——后端未就绪/LLM 不可用时桌面端显示 errorMessage 错误条（测试断言 + 实测截图；铁律 24/31）
8. **DS8**: 写集外零文件改动（`git diff --name-only` 对账 = 写集 12 文件）；src/ 与 scripts/audit/ 零触碰；`grep -rn "@deepseek-ai/dsh" electron-renderer/` 零结果（Stage 3 前零 DSH 依赖）
9. **DS9**: task-state/D527.json 回填（spec 段 + impl evidence + `"slice": "L1-C"` 字段；派单 §切片级审计）

> 交付声明覆盖 DS1-DS9 逐项标注 ✅/⏸/❌+理由，禁重编号/静默缺项（S-10）。⏸ 项（如无 LLM key 时 DS2/DS4 部分）须显式标注原因，不得以契约断言冒充全链路（派单 §给 dev-doc 的交付要求 2）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片C-D527-D528-20260825.md（§D527 5 必答题 + 验收 + 1-8）
- .claude/PRODUCT-BRIEF.md（§二 / §六 P0）
- docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md（§3.1 L77 / §2.2）
- .wt-sliceB-specs/docs/synova/audit-reports/2026-08-25-D517-D519.md（K3 切片 A：C2 M7 / P2-2）
- docs/synova/coordination/派单-D524-devdoc-fix-20260825.md（M7 漂移修复要求）
- scripts/golden-scenarios/GS-01-first-diagnosis/README.md（诚实 RED 契约）
- src/routes/diagnosis.ts（consult SSE + D480 报告端点，410 行实测）
- src/l3/synova-diagnosis-engine-impl.ts（六阶段 phase 定义 + 事件类型全集，实测）
- electron-renderer/src/hooks/useStreaming.ts（264 行实测）/ stores/app-store.ts / stores/conversation-store.ts / components/{CenterPanel,RightPanel,Composer,WelcomeScreen,MessageItem}.tsx / lib/api.ts
- scripts/golden-scenarios/common/{bootstrap,fresh-db,assert}.ts（GSS 基建契约）
- vitest.config.ts（include tests/**；electron-renderer 无门禁——K3 G1）
- AGENTS.md（铁律 0-2/4/5/7/24/31/47/48）

## 12. 必答题 1 补充——SSE 事件契约对齐骨架（编码照此实现，§4.2 实测为准）

```ts
// electron-renderer/src/hooks/sse-contract.ts（新建，纯函数零依赖——编码按此骨架）
// engine 实测事件全集（src/l3/synova-diagnosis-engine-impl.ts grep 2026-08-25）:
//   phase_started | phase_completed | report_ready | right_column_update
//   | degraded | error | expert_hypothesis | hypothesis_generated | root_cause_identified
// diagnosis.ts 补发: community_reports | entity_resolution | judgment_card | complete

export type SSEEventType =
  | 'phase' | 'phase_started' | 'phase_completed'           // 新增 phase_started/completed（对齐 engine）
  | 'report_ready'                                          // 新增（携带 reportId）
  | 'right_column_update' | 'degraded' | 'root_cause_identified'  // 新增（不消费但不得静默丢弃）
  | 'expert_hypothesis' | 'hypothesis_generated' | 'interim_finding'
  | 'community_reports' | 'entity_resolution' | 'judgment_card'
  | 'complete' | 'error';

export interface SSEContractState {
  phaseIndex: number; phaseLabel: string;
  errorMessage: string | null; phase: string;
  degraded: boolean;
}

export interface SSEContractResult {
  state: SSEContractState;
  reportId?: string;          // complete/report_ready 时返回
  systemMessage?: { type: 'phase' | 'degraded' | 'info'; content: string };
}

export function applySSEEvent(prev: SSEContractState, evt: unknown): SSEContractResult {
  // phase_started → phaseIndex=evt.phase, phaseLabel=evt.label
  // phase_completed → 保持 phaseIndex（不回落）
  // report_ready → reportId=evt.reportId
  // complete → reportId=evt.report?.reportId（缺字段 → console.warn 不抛）
  // error → errorMessage=evt.message, phase='error'
  // degraded → degraded=true + 系统消息
  // 未知类型 → console.warn('未处理事件', evt.type)（不再静默）
}
```

> useStreaming.ts 改造后 handleEvent 只做两件事：`const r = applySSEEvent(state, evt)` → `if (r.reportId) useAppStore.getState().setCurrentReportId(r.reportId)` + 按 r.systemMessage 落 conversation-store。单一数据流，事件契约可整体单测。

## 13. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 5 必答题逐条覆盖（①端到端实测=§4.2 事件契约+DS4 ②30 分钟计时=写集 timing 脚本+DS5 ③UI 盘点补强=§4.3 四缺口+写集 6 个 renderer 文件 ④GS-01 升级=写集 run.sh/expect/README+DS6 ⑤降级诚实=§7 L2b+DS7）
- [x] 现状全部实测（diagnosis.ts/engine 事件全集/useStreaming/app-store/conversation-store/CenterPanel/RightPanel/Composer/WelcomeScreen/MessageItem/api.ts/GS-01 run.sh+expect.json+README/common 基建/vitest.config/tsconfig 逐文件 read+grep，零凭记忆）
- [x] 声称即引用：`setCurrentReportId` 零调用、`errorMessage` 无渲染、事件类型错配、complete 不取 reportId 均为 grep 物理证据（§4.2/§4.3）
- [x] Done 标准 = 物理命令断言（vitest/GS-01/计时脚本/evidence 落盘），零 grep 冒充（D510 F1）
- [x] 写集 12 条目与 §5.1 一致；基线声明 + 依赖（切片 B 合入）显式；防 D524 M7 漂移（编码前重新核验行号）
- [x] 决策参考记录（§3 Q1：事件契约单源/最少机制/诚实 RED——参考系 Anthropic + 第一性原理）
- [x] 不碰 src/（§6 红线 + §4.2 零 src/ 需求证明）；不碰 scripts/audit/
- [x] gatekeeper ALL PASS（C1-C6，12 条目写集提取）
