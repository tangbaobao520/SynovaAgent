---
north-star:
  服务用户: 桌面端用户（企业主/GA）——D575 配完 LLM key 后要能立即与 Agent 逐字对话，而不是面对一个点了发送毫无反应的"假流式"面板
  服务场景: 打开桌面端 → 向导配 key（或已配置直接进）→ 中栏发一句话 → 逐字流式回答 → 刷新/重启应用后会话还在
  模块终态: 桌面中栏对话主链路接 /api/conversations（D590 已上线的 SSE 对话端点，含诊断事件 flat 透传）；显式诊断入口保留 /api/diagnosis/consult；提交回声 + open 帧 sessionId 对账 + 刷新后会话恢复
  对齐北星: PRODUCT-BRIEF.md §三"Synova 怎么工作"（Agent 不是 ChatBot——对话式访谈是诊断入口）+ §六 P0"没有这些不能给 GA 用"
  完成标准: 桌面端发一句话 → 逐字流式完整回复（水源 = token 帧）→ 刷新后会话历史仍在 → use-streaming 契约测试更新后全绿
  当前进度: D590 已落 main（b54a0fb6，对话 SSE 端点 + SessionStore 持久化 + 白名单三前缀 + sse-contract 四新帧）；桌面端 useStreaming 仍独指 /api/diagnosis/consult，token 帧零消费（假流式未修）；useConversation.ts 死代码待裁决。本 spec = D591 实现规格，编码线未开工
---

<!--
  SYNOVA-IMPL-DSH-D591: 桌面对话接线——真流式 + 提交回声 + 向导后直达对话
  状态: dev doc | 2026-09-08 | 优先级 P0（L1 审计 Phase 1 关键路径第二棒）
  权威文档: L1 全量审计报告 §3.5.1/§4.4/§5/§7（D591 行）+ D590 spec + D590 evidence（docs/synova/audit-reports/D590-chat-sse-evidence-20260908/）+ AGENTS.md 铁律 0-2/4/5/24/31/37/38/47/48 + 铁律 40-45 适用域裁决
  依赖: D590（已落 main，b54a0fb6）
  并行: D592（对话 E2E）依赖本任务；D596 依赖本任务的 useConversation.ts 去留裁决（本 doc §5.4 已裁决：删除）
  编码线: Claude Code（electron-renderer 归 Claude 写集例外内）
  任务号: D591（task-state/D591.json，status=claimed）
-->

# D591: 桌面对话接线——真流式 + 提交回声 + 向导后直达对话

> 一句话问题: D590 把对话引擎接进了 HTTP（/api/conversations，SSE open/token/agent_message/end 帧），但桌面端唯一的发送链路 useStreaming 仍独指 /api/diagnosis/consult——对话端点的 token 帧桌面零消费（真流式无水源）；提交回声有上屏无对账（open 帧 sessionId 被丢弃）；D590 持久化的会话刷新后桌面读不回来；useConversation.ts 是零消费者死代码；app-store:88-97 mock 假数据仍在喂 LeftPanel/CommandPalette。

## 1. Authority Doc Verification

**来源 A**: [L1 全量审计报告](../../synova/research/L1全量审计-20260907/L1-audit-report.md)

> §7 D591 行（验收标准原文）: "① 桌面端发一句话→**逐字**流式→完整回复 ② 刷新后会话还在 ③ use-streaming-contract 测试更新后绿"。

> §7 D591 行（范围原文）: "① useConversation.ts 复活或 useStreaming 扩展 conversation 模式（废 enum 裁量）② **真流式**: appendToken→scheduleFlush 水源接通（当前假流式）③ Composer→新端点；D575 向导完成后直达对话 ④ 提交回声语义（乐观上屏+requestId 对账，借鉴 client-ui-session）⑤ mock 假数据清理（app-store:88-97）"。

> §3.5.1: "hooks/useConversation.ts — 对话封装 — 💀**死代码零消费者**（文件头自认 :23）— 删除或复活（D591 裁量）"；"hooks/useStreaming.ts — SSE 消费+发消息 — ⚠️（401 断+假流式）"。

> §5 DSH 借鉴锚点（D591 行）: "dsh-client-ui-session …… ② 提交回声 beginSubmission（api-session-controller/lib/client.js:875-896：发送前同步插入 pending 帧，requestId 贯穿到持久化回执，断线可对账）——**D591 直接借鉴**: 桌面已有 zustand（外部 store），补'提交回声'语义（用户消息乐观上屏+服务端确认对账）与真流式 token 水源。**零 import，范式借鉴**（G1 零依赖红线）"。

> §4.4 铁律 40-45 处置（方案 A）: "铁律保留；但「pre-commit 硬阻断」声称改为如实描述"——适用域裁决见本 doc §3 Q1c。

**来源 B**: [D590 spec](SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md)（已实现落 main）+ [D590 evidence](../../synova/audit-reports/D590-chat-sse-evidence-20260908/)（red→green + curl 物理证据：SSE 全流/会话读回/重启可查）。

**来源 C**: [AGENTS.md](../../../AGENTS.md) 铁律 0-2（测试先行+接线验收）、4/5（交付不完整/后端能力≠用户可用）、24/31（异常处理+降级信号传播）、37（死代码不入仓库）、38（as any 零容忍）、47/48（契约优先/测试非空壳）。

**来源 D**: [.claude/PRODUCT-BRIEF.md](.claude/PRODUCT-BRIEF.md) §三（两套系统并行：GA 按需诊断 + 哨兵巡检；对话是访谈入口不是替代诊断）+ §六 P0。

## 2. Problem Statement

对齐北星锚定块：产品的交互叙事是"配置完即可对话"（D575 向导承诺"保存并进入"），但桌面端这条链在四处断裂——

1. **对话端点桌面零消费（假流式未修）**：D590 已上线 `POST /api/conversations`（open/token/agent_message/end 帧，实测 evidence e2e-sse-full-stream.log.txt），但桌面端唯一发送链路 useStreaming.ts:200 硬编码 `fetch(POST /api/diagnosis/consult)`——token 帧这个真逐字水源桌面没有任何消费者。useStreaming 内部的 16ms flush 管道（:56-69）机制健全但水源是诊断整块事件，"逐字"不存在。
2. **提交回声只有半截**：sendMessage 先 `storeNow.addMessage(user)`（:176-180，乐观上屏已有），但 D590 open 帧回声的 sessionId（sse-contract.ts:145-148 已归约返回 `result.sessionId`）被 useStreaming.handleEvent 丢弃——无对账、无会话锚定，刷新即失忆。
3. **会话不可恢复**：D590 已把全部轮次落 SessionStore 且 `GET /api/sessions/:id` 白名单可达（evidence e2e-session-readback-restart.log.txt），但桌面端 conversation-store 纯内存（63 行，无 sessionId 字段、无恢复逻辑），刷新/重启后消息区清零。
4. **死代码与假数据**：useConversation.ts（70 行）零消费者（grep 实测 §4）；app-store.ts:88-97 MOCK_WORKSPACES/MOCK_CONVERSATIONS 假数据喂 LeftPanel/CommandPalette（审计 D591 范围⑤）。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

a) **项目拼图**：本任务在 **L1 交互层的桌面前端**（electron-renderer/src/，32 文件），消费 D590 刚上线的对话 SSE 端点。后端零改动（D590 已闭环：端点/持久化/白名单/契约四件齐）；本任务是 Phase 1 关键路径 D590→D591→D592 的第二棒，把"老板一句话→流式回答→落库可恢复"从 curl 证据变成桌面用户可见行为。

b) **文件审计**（grep/read 实测 2026-09-08，main@b54a0fb6）：
- `grep -n "api/diagnosis/consult" electron-renderer/src/` → 仅 useStreaming.ts:200 一处真实 fetch。
- `grep -rn "useConversation\b" electron-renderer/src`（排除 useConversationStore）→ 仅 useConversation.ts 自身定义，**零消费者**（死代码实锤，审计 §3.5.1 判定维持）。
- `grep -rn "useStreaming" electron-renderer/src` → CenterPanel.tsx:13（唯一组件消费方）+ useConversation.ts:9。CenterPanel 切走后 useStreaming 仍须保留诊断模式消费者（见 §5.4 决策 2，避免制造新死代码——铁律 37）。
- sse-contract.ts（D590 已扩展）: `'open'|'token'|'agent_message'|'end'` 已入 SSEEventType（:36），applySSEEvent 已有 open 归约返回 sessionId（:145-148）、token/agent_message/end passthrough（:150-152）——**消费侧契约已备好，本任务纯接线**。
- `GET /api/sessions/:id` 返回 `{ok, session, messages}`（src/routes/sessions.ts:68-81，read 实测）——恢复读路径现成。
- WelcomeScreen「保存并进入」→ `setWelcomeState('ready')`（:164）→ CenterPanel Chat 视图（CenterPanel.tsx:34-43）——**向导后直达对话的路由已存在**，本任务验证 + 补齐"快速行动直发对话"。
- 铁律 40-45 冻结对象（patches/ink+5.2.1.patch、tui-v2/use-streaming.ts、tui chat-panel.tsx）在 electron-renderer 下 grep **零命中**——TUI 冻结项不约束本写集（§3 Q1c 详证）。
- 复用判定：sse-contract 归约器、conversation-store CRUD、getApiBase、D575 boot 判定全部现成；**不新建 store、不改后端、不改 sse-contract**。

c) **决策**：已有覆盖 → 复用 + 接线。需新建的仅 useStreaming 的 conversation 模式分支 + 会话恢复纯函数 + 对应测试。

### Q1: 调研

a) **业界最佳实践**：SSE 消费端事实标准 = fetch + ReadableStream 手写解析（本仓 useStreaming:220-260 已是合格实现，不引 eventsource 库——Electron renderer fetch 流式已够，引库即过度设计）；乐观 UI 回声 = 本地立即上屏 + 服务端确认帧对账（Linear/Slack 模式）；会话恢复 = 持久标识（localStorage/sessionStorage）+ 启动时拉取投影。

b) **DSH 范式**（零 import，审计 §5 D591 行锚点）：dsh-client-ui-session 外部存储订阅（getSnapshot/subscribe + useSyncExternalStore，lib/client.js:83-126）——桌面已有 zustand 等价物，不搬；**提交回声 beginSubmission**（发送前同步插入 pending 帧，requestId 贯穿到持久化回执，断线可对账）——本任务落为"乐观上屏（已有）+ open 帧 sessionId 捕获持久化（新增）+ 会话恢复对账（新增）"。

c) **memory/ 历史教训 + 铁律适用域裁决**：
- **铁律 40-45 裁决（本任务必答项）**：六条 TUI V2 铁律的物理执法对象全部是 tui-v2 侧文件——铁律 40 冻结清单（patches/ink+5.2.1.patch、postinstall、Message/StreamingText 的 React.memo）、铁律 41（use-streaming.ts 类名禁入）、铁律 44（chat-panel.tsx flex-end）。`grep -rn "patches/ink\|chat-panel\|LineBuffer" electron-renderer/src/` → 零命中。**裁决：40-45 不适用于 electron-renderer 写集**（审计 §4.4 方案 A"铁律保留"指 TUI 域保留）。但铁律 41 的 **bufferRef + 16ms flush 模式是刻意沿用**——它是被 TUI 闪烁事故验证过的正确模式，electron 侧新代码沿用同一模式（防重蹈 LineBuffer 式过度工程化覆辙）。铁律 44 的 DOM 版精神同样沿用：中栏消息区用原生 scrollIntoView（CenterPanel:27-29 现状），不引入 reverse-flex 布局。
- M3 模式教训（D590 spec Q1c）：接线必须 read 被调用方真实定义——本 spec 已 read sse-contract.ts:145-152、sessions.ts:68-81、useStreaming.ts 全文、conversation-store.ts 全文。
- D316/D576：声称即物理证明——本 doc 全部 file:line 当场 grep/read。

### Q2: 范围 — 正确的最简方案

**做什么**：useStreaming 扩展 conversation 模式（token 帧真流式水源 + open 帧 sessionId 捕获）；conversation-store 加 sessionId 持久化；会话恢复（启动时 GET /api/sessions/:id 读回投影）；欢迎页快速行动直发对话；useConversation.ts 死代码删除；app-store mock 假数据清理；测试先行。

**不做什么（含文件路径）**：见 §6。

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**：桌面端启动（已配置 LLM → 直达主界面；未配置 → 向导「保存并进入」/「暂不配置」→ 主界面）→ 中栏 Composer 输入一句话发送。
- **交互**：用户消息立即上屏（提交回声）；SSE open 帧回声 sessionId 落 store + localStorage；token 帧逐字进 streamingText（16ms flush）；agent_message 帧全文落消息列表；访谈完成时诊断事件 flat 透传渲染（六阶段进度条复用 D527 管道）。
- **结果**：完整回复可见；刷新应用后消息区自动恢复该会话全部轮次（GET /api/sessions/:id）；显式"诊断我的公司"入口走 consult 六阶段诊断链（保留 GA 按需诊断桌面入口）。

### Q4: 契约与测试（铁律 47/48，写代码前定义）

`useStreaming` 扩展契约（在既有 `UseStreamingReturn` 上增量，零破坏性签名变更）：

- `@input` — `sendMessage(text: string, opts?: { mode?: 'conversation' | 'diagnosis' })`；mode 缺省 `'conversation'`（ CenterPanel 主链路）；`'diagnosis'` 保持既有 consult 行为（URL/payload/契约归约全部不变）。
- `@output` — conversation 模式：POST `{getApiBase()}/api/conversations`，body `{message: text}`（首条消息 sessionId 缺省由服务端新建）；SSE 帧经 sse-contract.applySSEEvent 归约——open→捕获 sessionId（setCurrentSessionId + localStorage），token→bufferRef += text（16ms flush 到 streamingText），agent_message→addMessage(assistant 全文) + 清 streamingText，error→setError/setPhase('error')，end→isStreaming=false。
- `@degraded` — fetch 失败/非 2xx/流中断 → setError(人话) + setPhase('error')（铁律 24/31，前端可见错误条，CenterPanel:81-85 既有降级 UI 复用）；SSE data JSON 解析失败 → console.warn 跳帧（既有 :253-257 模式）；会话恢复失败（404/网络）→ console.warn + 清除 localStorage sessionId + 空消息区（不阻断进入主界面）。
- 会话恢复纯函数 `restoreMessages(sessionPayload): ChatMessage[]`（独立导出，可单测）：只投影 role∈{user,assistant} 的消息，越界/畸形项跳过。
- 测试：tests/electron/use-streaming-conversation.test.ts（新建，沿 use-streaming-contract.test.ts 既有模式 mock fetch Response 流）≥8 用例（§7）；tests/electron/use-streaming-contract.test.ts 零回归锁定。

## 4. Current State（2026-09-08 实测，main@b54a0fb6，全部 grep/read 当场验证）

### 4.1 后端（D590 已交付，本任务零改动）

- 对话端点：`POST /api/conversations`（body `{message, sessionId?, orgId?}`，sessionId 缺省新建）+ `POST /api/conversations/:id/messages`（src/routes/conversations.ts:323-328）。
- SSE 帧：open（含 sessionId 回声）/token/agent_message/status/system_message/诊断事件 flat/complete/error/end + 15s 心跳（D590 spec §5.2-B；evidence e2e-sse-full-stream.log.txt 实流验证）。
- 持久化：每轮 user/assistant 双写 SessionStore + saveState 快照（D590 §5.2-C 时序）；evidence e2e-session-readback-restart.log.txt 证明重启可查。
- 白名单：`/api/conversations`、`/api/diagnosis/consult`、`/api/sessions` 三前缀免 JWT（D590 DS4；桌面 renderer 零凭证代码可直连）。
- 桌面契约侧已备：electron-renderer/src/hooks/sse-contract.ts:36 四新帧入 SSEEventType；:145-152 open 归约（返回 sessionId）/token/agent_message/end passthrough；use-streaming-contract.test.ts 既有用例全绿（D590 DS11）。

### 4.2 桌面端（本任务写集域）

- **useStreaming.ts（286 行）**：URL 硬编码 consult（:200）；payload 是诊断形状 `{teamId, initiator}`（:203-206）；事件处理走 applySSEEvent + switch（:77-170，诊断十五类型）；**token/agent_message/open/end 零消费分支**（handleEvent switch 无这四个 case——契约扩展后 passthrough 归约不产生副作用，真流式无水源实锤）；16ms flush 管道健全（:56-69，scheduleFlush 零调用方=假流式的机制证据）；乐观上屏已有（:176-180）。
- **CenterPanel.tsx（114 行）**：唯一 useStreaming 组件消费方（:24）；welcomeState !== 'ready' → WelcomeScreen（:34-43）；错误条/进度条 UI 现成（:73-85）；消息滚动 scrollIntoView（:27-29）。
- **conversation-store.ts（63 行）**：messages/phase/welcomeState/phase 进度 + CRUD；**无 sessionId 字段**；纯内存无持久化。
- **WelcomeScreen.tsx（208 行）**：firstLaunch → LlmSetupCard（D575）；「保存并进入」→ setWelcomeState('ready')（:164）→ **直达主界面对话已成立**（CenterPanel Chat 视图即对话面板）；快速行动三按钮（:100-113）只调 onStartDiagnosis（= setWelcomeState('ready')），**不预填不发送**——"直达对话"缺最后一口气：用户进主界面后面对空消息区，不知道该说话。
- **app-store.ts:88-97**：MOCK_WORKSPACES（3 条）/MOCK_CONVERSATIONS（3 条）假数据注入初始 state（:118），喂 LeftPanel（:40）与 CommandPalette（:48）——假绿内容（审计 D591 范围⑤）。
- **useConversation.ts（70 行）**：文件头自认"本 hook 当前零消费者"（:21）；grep 全目录零引用——死代码，铁律 37。D596 spec 依赖本任务的去留裁决（审计 §7 D596 行："D591 定 useConversation 去落后"）。

### 4.3 关键架构确认（用户问的 6 个问题的实测答案摘要）

| # | 问题 | 实测结论 |
|---|---|---|
| 1 | 端点选择 | **c) 两个都接**：对话主链路走 /api/conversations（token 帧逐字 + 诊断事件 flat 透传，一个水源两用）；显式诊断入口（欢迎页"诊断我的公司"）保留 consult——PRODUCT-BRIEF §三两套系统并行，诊断是核心系统不可丢桌面入口。详见 §5.4 决策 1 |
| 2 | useStreaming 是否可直用 | fetch 管道/解析器可直用，但**必须扩模式**：consult URL+payload 是诊断形状，token 帧无消费分支——不改则假流式继续。D590 白名单已消 401（evidence 用例 3），修的是水源不是 401 |
| 3 | 向导后入口 | 已存在（保存成功 → ready → Chat 视图）；缺的是欢迎页快速行动直发对话（预填+聚焦 Composer） |
| 4 | 提交回声 | 乐观上屏已有；缺 open 帧 sessionId 对账 + 持久化 |
| 5 | 会话恢复 | 后端能力齐（sessions.ts:68-81 + 白名单）；桌面零实现——本任务补 |
| 6 | 铁律 40-45 | 不适用 electron-renderer（冻结对象全在 tui-v2 侧，grep 零命中）；41 的 buffer+16ms 模式刻意沿用 |

## 5. What We Build

### 5.1 写集 (4 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| electron-renderer/src/hooks/useStreaming.ts | 修改 | ①`sendMessage` 加第二参 `opts?: { mode?: 'conversation' \| 'diagnosis' }`（缺省 conversation）；②conversation 分支：URL `/api/conversations`、body `{message: text}`、SSE 帧消费新增 open（sessionId → `useConversationStore.getState().setCurrentSessionId(id)`，其内部写 localStorage）/token（`bufferRef += text` + `scheduleFlush()`——真流式水源，复用既有 16ms 管道）/agent_message（addMessage(assistant 全文) + setStreamingText('')）/end（setPhase('done')）四 case（经既有 applySSEEvent 归约，诊断事件 flat 分支零改动复用）；③diagnosis 分支 = 既有行为逐字节不变（consult URL + 诊断 payload）；④bufferRef+=token 与 setTimeout flush 模式沿用（铁律 41 模式移植，禁 LineBuffer/FrameRateLimiter/StreamChunker 类名——模式纪律沿用）；⑤JSDoc 契约按 §3 Q4 更新 |
| electron-renderer/src/stores/conversation-store.ts | 修改 | ①加 `currentSessionId: string \| null` + `setCurrentSessionId(id)`（同时写 `localStorage['synova:last-session-id']`，SSR/无 window 守卫）；②加 `restoreMessages(msgs: ChatMessage[])`（批量替换 messages，恢复路径专用）；③加 `clearSession()`（清 sessionId + localStorage + messages——"新对话"语义预留，本期不接 UI） |
| electron-renderer/src/components/CenterPanel.tsx | 修改 | ①handleSend 传 mode：普通发送走缺省 conversation；②挂载时若 `localStorage['synova:last-session-id']` 存在 → `fetch(GET /api/sessions/:id)` → `restoreMessages(restoreMessagesFn(payload))`（恢复失败 console.warn + 清 sessionId，铁律 24 不静默）；③"新对话"入口本期不做 UI（§6） |
| electron-renderer/src/components/WelcomeScreen.tsx | 修改 | 快速行动三按钮（:100-113）行为升级：进入主界面（既有 onStartDiagnosis）+ 经 store 传递预填文本/诊断意图——"诊断我的公司"→ `pendingIntent='diagnosis'`（首条消息走 consult 显式诊断）；另两个 → 预填文本进对话（用户按发送即走 conversation）。预填落点 = conversation-store 新增 `draftPrefill: string \| null` + `setDraftPrefill`（Composer 挂载消费后清空） |
| tests/electron/use-streaming-conversation.test.ts | 新建 | conversation 模式集成测试（mock fetch Response SSE 流），用例表见 §7；沿 tests/electron/use-streaming-contract.test.ts 既有模式。注：审计 D591 范围①给的是"useConversation.ts 复活**或** useStreaming 扩展 conversation 模式"二选一，本 spec 裁决走后者（§5.4 决策 2），故**不新建** useConversationStream.ts 之类新 hook——真流式逻辑全部落在 useStreaming.ts 扩展内 |

> 用户任务的原始写集预估与本表的差异说明：预估含 ChatPanel.tsx / App.tsx——grep 实测 electron-renderer 下**不存在 ChatPanel.tsx**（对话主面板实际是 CenterPanel.tsx，审计 §3.5.1 原文"无 ChatPanel 之名"）；App.tsx 无需改动（D575 boot 判定与 welcomeState 路由已成立）。预估含 conversation-store.ts / useStreaming.ts 改 URL——实际为扩展模式而非改 URL（consult 保留，§5.4 决策 1/2）。

> 删除清单（写集表外，--diff-filter=ACMR 语义，D590 先例）：
>
> | 文件 | 理由 |
> |---|---|
> | electron-renderer/src/hooks/useConversation.ts | 零消费者死代码（§4.2 grep 实证；审计 §3.5.1 判定维持）；useStreaming 已扩展覆盖其全部职责；D596 依赖此裁决。删除后 `grep -rn "useConversation\b" electron-renderer/src`（排除 useConversationStore）必须零结果 |

> app-store mock 清理说明：MOCK_WORKSPACES/MOCK_CONVERSATIONS（:88-97）在 LeftPanel/CommandPalette 有渲染消费，直接置空数组会让左栏/命令面板出现诚实空态——属行为变化。**本任务将其从初始 state 改为空数组**（诚实空态优于假绿数据，审计范围⑤原文"mock 假数据清理"），写集归 app-store.ts 但因改动极小（2 处 `[]` 替换）并入 CenterPanel 所需的提交；若实现时发现空态渲染崩溃（不应发生），停下报告而非加 mock 回补。

### 5.2 关键实现契约

**A. conversation 模式发送时序**

```
① addMessage(user)                    ← 提交回声：乐观上屏（既有行为，两模式共用）
② setPhase('thinking') + thinking block（既有）
③ fetch POST /api/conversations {message: text}   ← conversation 分支
④ open 帧 → setCurrentSessionId(evt.sessionId)     ← 对账锚（localStorage 持久化）
⑤ removeLastMessage()（移除 thinking block，既有）
⑥ token 帧 → bufferRef += text; scheduleFlush()    ← 真流式（16ms flush → streamingText）
⑦ agent_message 帧 → addMessage(assistant 全文); setStreamingText('')   ← 全文兜底（铁律 43 顺序：先上全文再收 streaming 状态）
⑧ 诊断事件 flat → 既有 handleEvent 诊断 case 零改动（六阶段进度/降级/报告链路全复用）
⑨ end 帧 → setPhase('done');  finally → isStreaming=false
```

**B. 模式分流实现形态**（防两分支纠缠）

- `sendMessage(text, opts)` 内部按 mode 选 `{url, body}`，SSE 读取循环（:220-260 手写解析器）与 handleEvent 两模式共用；conversation 新增四个 case 加在 applySSEEvent 归约之后、诊断 switch 之前。
- diagnosis 分支行为与 main@b54a0fb6 逐字节等价（用例 8 回归锁定）——显式诊断入口不许被 conversation 改造波及。

**C. 会话恢复时序**

```
CenterPanel 挂载（welcomeState==='ready' 首次成立时执行一次）:
① id = localStorage['synova:last-session-id']；无 → 结束（空消息区空态）
② fetch GET /api/sessions/:id（白名单内，零凭证）
③ ok → restoreMessages(投影 user/assistant 消息)（顺序保持、越界跳过）
④ 404/网络失败 → console.warn + 清 localStorage + 空态（不阻断、不弹错误条——历史不可得是可接受降级，但必须留痕）
⑤ 恢复后首条新消息 → POST /api/conversations 带 sessionId=恢复的 id → 服务端 loadState→fromState 续轮（D590 §5.2-A 多轮语义，服务端已备）
```

注意：conversation 模式 body 需在 `currentSessionId` 非空时携带 `{message, sessionId}`（续轮），为空时 `{message}`（新建）——open 帧回声后 setCurrentSessionId 已落，续轮自然带上。

### 5.3 决策参考（S-12/D333）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 1. 端点选择 | A 仅 consult / B 仅 conversations / C 两个都接 | 第一性原理（consult=六阶段诊断管道，conversations=多轮对话+诊断透传，语义不同不可互替）+ PRODUCT-BRIEF §三（GA 按需诊断是核心系统 1，桌面入口不可丢）+ D590 设计（对话流内 phaseComplete 已桥接诊断 flat 透传——对话可自然触达诊断）+ 审计 D591 范围③"Composer→新端点" | **C**——对话主链路走 conversations（一个水源两用：token 逐字 + 诊断事件）；显式"诊断我的公司"保留 consult（useStreaming diagnosis 模式零删减） |
| 2. useStreaming 扩展 vs useConversation 复活 vs 新 hook | A 扩展 useStreaming / B 复活 useConversation / C 新建 useConversationStream | 审计 D591 范围①明示二选一（A 或 B）；第一性原理（最少机制：A 复用 286 行健全管道，B/C 需复制解析器+flush 管道=重复）+ 铁律 37（B 复活后 useStreaming 若仅剩 CenterPanel 一个消费者仍是双轨；A 则一个 hook 两个 mode，零死代码） | **A**——扩展 useStreaming；useConversation.ts 删除（写集表外删除清单） |
| 3. 向导后直达对话的实现深度 | A 仅验证既有路由 / B 快速行动直发对话（预填） | 实测 §4.2（保存成功→ready→Chat 视图已成立）；审计范围③"D575 向导完成后直达对话"+ 北星"配置完即可对话"（用户面对空消息区不知道说话≠直达对话的产品承诺） | **B**——快速行动预填（draftPrefill 机制），向导「保存并进入」保持既有直达 |
| 4. 会话恢复形态 | A 不做 / B 恢复投影只读 / C 恢复+续轮 | D590 持久化的存在理由就是可恢复（审计 D591 验收②"刷新后会话还在"原文）+ dsh-client-ui-session 会话恢复范式 + D590 服务端 fromState 续轮已备（evidence 用例 2） | **C**——恢复投影 + currentSessionId 续轮（缺 sessionId 则新建，双向兼容） |
| 5. mock 假数据处置 | A 保留 / B 接真数据源 / C 置空诚实态 | 审计范围⑤原文"mock 假数据清理"；第一性原理（会话列表真数据源=GET /api/sessions，但列表 UI 改造超本任务范围=范围蔓延）；Anthropic 基线（假绿数据比空态更伤信任） | **C**——置空数组（诚实空态）；真会话列表接 GET /api/sessions 归 D593 报告链路任务 |
| 6. 铁律 40-45 适用域 | A 全量适用 / B 不适用+模式沿用 | §4.1 grep 实证（冻结对象零命中 electron-renderer）+ 审计 §4.4 方案 A（铁律保留=TUI 域）+ 铁律 41 模式本身是被事故验证的正确实现 | **B**——不适用（执法对象在 tui-v2）；bufferRef+16ms flush 模式刻意沿用；禁 LineBuffer 等类名作为模式纪律沿用 |

> 收敛检查：六项决策两参考系（第一性原理 + 审计原文/DSH 实证）均指向同一答案，无分歧。**参考：Anthropic/DeepSeek/第一性原理**。

## 6. What We Don't Do

| 不做 | 原因 | 归属 |
|---|---|---|
| src/ 后端任何文件变更 | D590 已闭环（端点/持久化/白名单/契约，evidence 齐）；本任务纯消费侧 | 无（已完成） |
| electron-renderer/src/hooks/sse-contract.ts 变更 | D590 已扩展四新帧（:36/:145-152），消费侧契约备好；测试零回归锁定 | 无（已完成） |
| LeftPanel/CommandPalette 会话列表接 GET /api/sessions | 真数据源存在但列表 UI 改造是独立垂直切片；本任务只清 mock（§5.4 决策 5） | D593 |
| electron/main.cjs、preload、IPC 通道修复 | ipc/bridge.ts 8/10 方法运行时不存在是独立缺陷面 | D594（审计 §7 Phase 2） |
| RightPanel 报告/方案 401、通知链路 | 报告链路独立任务 | D593 |
| TUI/tui-v2 任何文件 | 铁律 40 冻结 + 裁决 ③"TUI 保留不动" | 不做（D596 治理域） |
| "新对话"按钮 UI | clearSession 机制本期落库（§5.1），UI 入口等会话列表切片一起做（避免半截交互——铁律 4） | D593 |
| 流式 markdown 渲染/消息虚拟化/性能优化 | 当前消息量级无需；过度工程化警示（铁律 41 精神） | 按需另立 |
| ConversationEngine / L2 任何修改 | 五层边界；桌面接线是 L1 消费 | 不做 |

## 7. Test Requirements（测试先行——铁律 0-2/48；第一步 red，第二步 green）

**测试文件**：tests/electron/use-streaming-conversation.test.ts（新建）+ tests/electron/use-streaming-contract.test.ts（零回归锁定，不改）。
**模式**（沿 use-streaming-contract.test.ts 先例）：mock 全局 fetch 返回构造的 `Response`（SSE body 用 ReadableStream 逐帧 push），zustand store 用真实实例（`useConversationStore.getState()` 前置 reset）；恢复投影用例直接测纯函数 `restoreMessages`（§3 Q4）。

| # | 用例 | red（现状） | green（实现后） |
|---|---|---|---|
| 1 | conversation 模式 URL：sendMessage('你好') → fetch 收到 `POST …/api/conversations`，body `{message:'你好'}`（无 sessionId） | fetch 仍指 consult（诊断 payload） | 全绿 |
| 2 | **真流式**：SSE 流推 3 个 token 帧（'你'/'好'/'呀'）→ streamingText 经 16ms flush 最终含 '你好呀'（逐字累积非整块） | token 帧零消费，streamingText 恒空 | 全绿 |
| 3 | 提交回声+对账：open 帧 `{sessionId:'sess_x'}` → store.currentSessionId==='sess_x' 且 localStorage 落键；续轮第二请求 body 携带 sessionId | sessionId 被丢弃 | 全绿 |
| 4 | agent_message 帧 → assistant 全文落 messages；streamingText 清空；isStreaming 终态 false、phase 'done' | 帧被丢弃 | 全绿 |
| 5 | 诊断事件 flat 透传回归：conversation 流内 phase_started/degraded/complete → 既有诊断管道行为不变（进度条数据/降级消息/reportId 落 app-store） | 无此路径 | 全绿 |
| 6 | 会话恢复：restoreMessages 纯函数——user/assistant 投影保序；system/tool 等非对话角色跳过；畸形项（缺 content）跳过不抛 | 函数不存在 | 全绿 |
| 7 | 恢复降级：GET /api/sessions/:id 返回 404 → console.warn 被调用 + localStorage 键清除 + messages 保持空（不抛不阻断） | 无此路径 | 全绿 |
| 8 | diagnosis 模式回归：sendMessage(text, {mode:'diagnosis'}) → fetch 指 consult、body 为诊断形状 `{teamId, initiator}`；诊断 SSE 契约行为与 main@b54a0fb6 等价（consult 用例抽 1 条锁回归） | 已是现状（green 基线） | 全绿（防 conversation 改造波及） |
| 9 | 边界：abort 中断 → AbortError 静默返回（既有语义）；SSE data JSON 解析失败 → console.warn 跳帧不断流 | 部分既有 | 全绿 |
| 10 | 契约零回归：use-streaming-contract.test.ts 既有用例（15 诊断类型 + D590 四新帧归约）零改动全绿 | 绿（基线） | 绿 |

| 层 | 类型 | 数量 | 覆盖 |
|:---|---|:---:|---|
| L1 单元契约 | 组件 hook 集成（mock fetch SSE 流 + 真实 zustand store） | ≥8（表 1-9） | 正常/降级/边界/回归 |
| L2a 接线 | CenterPanel→useStreaming(conversation)→/api/conversations 生产链路 | 用例 1/3 | 真实端点 URL + body 形状 |
| L2b 降级 | 恢复 404/网络失败 console.warn + 诚实空态；error 帧 → 错误条数据落 store | 用例 7/9 | 铁律 24/31 不静默 |
| L2c 边界 | abort/解析失败跳帧/畸形恢复消息跳过 | 用例 9/6 | 防线语义 |

## 8. Wiring Verification

新 export 的生产调用点（测试调用不计——铁律 0-2 Step 5 WIRE CHECK）：

| 新 export / 变更 | 生产调用点（实现后 grep 必须命中） |
|---|---|
| sendMessage mode 参数 | electron-renderer/src/components/CenterPanel.tsx handleSend（grep `mode: 'diagnosis'` 在 WelcomeScreen→CenterPanel 链路 ≥1；conversation 为缺省零显式传参） |
| setCurrentSessionId / restoreMessages / clearSession | conversation-store 定义 + CenterPanel 恢复时序调用 setCurrentSessionId 间接经 useStreaming（open 帧）+ restoreMessages 在 CenterPanel ≥1；clearSession 本期 UI 零调用（§6 已声明预留，不构成 WIRE 缺口——导出但未消费的预留 API 需在本行显式登记，实现完成报告复述） |
| draftPrefill / setDraftPrefill | conversation-store 定义；WelcomeScreen.tsx 快速行动 onClick ≥1 + CenterPanel/Composer 消费点 ≥1 |
| 恢复 fetch | CenterPanel useEffect 内 `GET /api/sessions/`（grep `/api/sessions/` electron-renderer/src ≥1） |
| 删除复核 | `grep -rn "useConversation\b" electron-renderer/src`（排除 useConversationStore）零结果；`grep -rn "MOCK_CONVERSATIONS\|MOCK_WORKSPACES" electron-renderer/src` 零结果 |
| useStreaming 仍活着 | CenterPanel.tsx `useStreaming()` ≥1（唯一组件消费方保持，零新死代码） |

## 9. Architecture Layer

**L1 交互层（桌面前端 electron-renderer/src/）**，纯消费侧接线：

- 对后端仅经 HTTP（fetch /api/conversations、/api/sessions/:id，均 D590 白名单前缀）——不 import src/ 任何模块，五层边界零触碰。
- 不改 L2/L5、不改 sse-contract 契约单源、不改后端路由——写集全部在 electron-renderer/src/ + tests/electron/。
- 铁律 38：新代码 `as any`/`as never`/`as unknown as` = 0（恢复投影用类型守卫窄化，沿 sse-contract.ts:147 既有守卫形态）。
- 铁律 40-45 适用域裁决见 §5.4 决策 6（不适用；模式纪律沿用）。
- pre-commit/check-architecture 回归预期：零新增违规（无跨层 import 面）。

## 10. Completion Standard（DS 与本 doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: tests/electron/use-streaming-conversation.test.ts 全绿（≥8 用例；red 已先证——实现前该文件必须先存在且失败）
2. **DS2**: 真流式——桌面端（或等价 headless 挂真实后端）发一句话 → token 帧逐字进 streamingText → agent_message 全文上屏（物理证据：真实后端 + DEV_MODE=false 下端到端截图或日志贴完成报告；mock 测试不算此条证据）
3. **DS3**: 提交回声对账——open 帧 sessionId 落 store + localStorage['synova:last-session-id']；同会话第二条消息 body 携带 sessionId（服务端 fromState 续轮生效）
4. **DS4**: 刷新恢复——发一轮对话 → 刷新/重启渲染进程 → 消息区自动恢复该会话全部轮次（恢复失败走 console.warn + 空态，不阻断）
5. **DS5**: 向导后直达——D575 向导「保存并进入」→ 主界面即对话面板（既有路由验证）；欢迎页快速行动可预填/直发对话
6. **DS6**: 显式诊断入口保留——"诊断我的公司"路径走 consult（用例 8 回归绿）；诊断事件在 conversation 流内 flat 渲染正常（用例 5）
7. **DS7**: mock 清理——app-store 初始 conversations/workspaces 为空数组；`grep -rn "MOCK_CONVERSATIONS\|MOCK_WORKSPACES" electron-renderer/src` 零结果
8. **DS8**: 死代码删除——useConversation.ts 已删；`grep -rn "useConversation\b" electron-renderer/src`（排除 useConversationStore）零结果
9. **DS9**: 接线验证（§8 表）全部 grep 命中；use-streaming-contract.test.ts 零改动全绿；tsc 零新增错误；`as any`=0；全量 vitest 零新失败
10. **DS10**: 完成报告含 §5.4 六项决策记录（参考系+结论，S-12/K3 可核）+ 北星验收三句（入口/交互/结果各一句，附证据）

## 11. Auth Doc References

- docs/synova/research/L1全量审计-20260907/L1-audit-report.md（§3.5.1 逐文件 / §4.4 铁律处置 / §5 DSH 借鉴 D591 行 / §7 D591 行验收原文）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md（§5.2 帧协议/持久化时序/装配契约——本任务消费侧依赖的权威定义）
- docs/synova/audit-reports/D590-chat-sse-evidence-20260908/（red→green + curl 物理证据）
- .claude/PRODUCT-BRIEF.md（§三 怎么工作 / §六 P0）
- AGENTS.md（铁律 0-2/4/5/24/31/37/38/40-45/47/48）
- electron-renderer/src/hooks/sse-contract.ts（D590 扩展后契约单源，:36/:145-152 实测）
- src/routes/sessions.ts（:68-81 读回路径实测）、src/routes/conversations.ts（:323-328 端点实测）
- scripts/control-tower/dev-doc-gatekeeper.sh（本 doc 验收门禁）+ scripts/workflow/check-dev-doc-write-set.sh（写集对账）
- DSH 锚点（零 import，范式借鉴；审计 §5 一手源码）：dsh-client-ui-session lib/client.js:83-126、dsh-api-session-controller lib/client.js:875-896（提交回声）

## 12. 自检清单

- [x] 审计 §7 D591 行范围/验收逐条现场核实（非转述）；范围①二选一已裁决并留决策记录
- [x] 全部"X 存在/签名是 Y"当场 grep/read（useStreaming 286 行全文、conversation-store 63 行全文、CenterPanel/WelcomeScreen/App 全文、sse-contract 四新帧、sessions.ts:68-81、conversations.ts:323-328、useConversation 零消费者、app-store:88-97 mock、铁律 40-45 冻结对象 electron 侧零命中）
- [x] D590 已落 main 实证（git log b54a0fb6 + evidence 目录 9 文件在案）
- [x] 写集表 D381 格式（`### 5.1 写集 (4 修改 + 1 新建)`，标题下一行即表头）；删除走表外清单（--diff-filter=ACMR 语义）；clearSession 预留 API 在 §8 显式登记不构成 WIRE 缺口；写集预估与实际差异已显式说明（ChatPanel.tsx 不存在等）
- [x] 用户六问逐一回答（§4.3 表 + §5.4 决策 1/2/3/4/6）；端点选择对照 PRODUCT-BRIEF §三两套系统
- [x] 测试 red→green 对照 + 铁律 12 精神（真实 zustand store + 构造 SSE 流，不 mock 被测对象）
- [x] 决策参考 §5.4（S-12，六决策点双参考系收敛）
- [x] DS1-DS10 一一对应（S-10）；不做清单含文件路径与归属（Q2 排除项可物理验证）
- [x] 架构边界自查（§9）：零后端改动、零跨层 import、as any=0
- [x] 不是凭记忆；不涉及 scripts/audit/；不用 --no-verify
