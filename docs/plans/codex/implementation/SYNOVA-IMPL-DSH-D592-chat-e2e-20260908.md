---
north-star:
  服务用户: GA 与创始人——需要一条可重复运行的物理证据回答"老板发消息→流式回复→会话持久化→刷新恢复，这条闭环到底通没通"，而不是单测绿（mock LLM）或一次性 curl 手工证明
  服务场景: D590/D591 合并后，产品进度页线 2（对话交互）的 2-1/2-2/2-5 需要真实链路证据；K3 复核与创始人验收需要"一条命令可重跑"的 E2E
  模块终态: tests/e2e/conversation-flow.e2e.test.ts + 配套 runner 一键复现对话全闭环（真实 server 进程 + 本地 LLM 替身 + scratch DB + 进程重启恢复），产线 2-1/2-2/2-5 拿到带 at 时间戳的 test 类 evidence，推进到 pending_k3 待 K3 裁决
  对齐北星: PRODUCT-BRIEF.md §二（直接用户=GA）/§三（GA 采访企业主的交互形态=对话轨）+ product-lines.yaml 线 2 value"老板用对话触发诊断，回答是流式的"
  完成标准: bash docs/synova/product-lines/evidence/D592-run-e2e.sh → create+resume 两段 vitest 零 skip 全绿 → 3 份 evidence JSON（schema=1/record_type=test/at 非空）落位 → calc-progress.py 重算三点证据更新
  当前进度: D590（b54a0fb6）+ D591（#430）已合并 main，对话闭环仅有集成测试（mock provider，tests/routes/conversations.test.ts ①-⑭）与一次性 curl evidence（D590 evidence 目录）；tests/e2e/ 12 文件零对话覆盖；2-1/2-2/2-5 证据停留在单测级（D589 批）。本 spec = D592 实现规格，编码线未开工
---

<!--
  SYNOVA-IMPL-DSH-D592: 对话 E2E 场景 + 产线 2-1/2-2/2-5 证据
  状态: dev doc | 2026-09-08 | 优先级 P0（L1 审计 Phase 1 关键路径第三棒——物理验证闭环）
  权威文档: L1 全量审计报告 §5/§7（D592 行）/§8.2 + D590 spec + D591 spec + D590 evidence（本地替身先例）+ AGENTS.md 铁律 0-2/12/24/31/33/38/47/48 + product-lines.yaml 线 2 + evidence/README.md（D589 批机制说明）
  依赖: D590（b54a0fb6 已落 main）+ D591（#430 已落 main）——均已合并，本任务纯测试与证据域
  并行: 写集 tests/e2e/ + docs/synova/product-lines/evidence/，与 D593/D595/D596 零交集
  编码线: Claude Code（tests/ 归 Claude 写集例外内）
  任务号: D592（task-state/D592.json，status=claimed；TASK-ROUTING 无同模块认领冲突，2026-09-08 grep 实测）
  红线: 不碰 src/（零生产代码变更）、scripts/audit/、product-lines.yaml、VERSION.md、scripts/golden-scenarios/（DSH 域）；DSH 零 import（G1）——只读源码借鉴范式
-->

# D592: 对话 E2E 场景 + 产线 2-1/2-2/2-5 证据

> 一句话问题: 对话链路的服务端（D590）与桌面端（D591）已合并 main，但"用户发消息 → 流式回复 → 会话持久化 → 刷新恢复"闭环的全部证据是 mock provider 的集成测试 + 一次性手工 curl——没有一条**可重复运行**的真实进程 E2E；产线 2-1/2-2/2-5 的证据停留在单测级（D589 批），"ConversationEngine 端到端未验证"的审计判语需要被物理证据替换。

## 1. Authority Doc Verification

**来源 A**: [L1 全量审计报告](../../synova/research/L1全量审计-20260907/L1-audit-report.md)（2026-09-07，2026-09-08 复核修订版）

> §7 D592 行（范围/验收原文）: "① tests/e2e 对话场景: 配置→发消息→流式→触发诊断→报告落库可取（GS-01 前置段）② ConversationEngine 重放自检测试（借鉴 agent-loop invariant: 请求消息≡SessionStore 重建结果）③ 产线 2-1/2-2/2-5 evidence（带 at 时间戳，衔接 D589 规则）"；验收: "① E2E 绿（真实 key 或网关 mock server）② 2-1 verified（K3 复核后）"。

> §8.2.1（阻塞与依赖原文）: "E2E 需要真实 LLM key: ……要么创始人提供测试 key，要么批准搭网关 mock server（OpenAI 兼容假端点）。"——**D590 已落地并验证"本地替身"选项**（见来源 C），本 spec 沿用，非新裁决。

> §5 DSH 借鉴锚点（D592 行）: dsh-agent-loop 请求重建 invariant + dsh-api-gateway 帧协议。**零 import，范式借鉴**（G1 零依赖红线）。

**来源 B**: [D590 spec](SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md)（已实现落 main b54a0fb6）+ [D591 spec](SYNOVA-IMPL-DSH-D591-desktop-chat-wiring-20260908.md)（已实现合并 #430）。

**来源 C**: [D590 evidence](../../synova/audit-reports/D590-chat-sse-evidence-20260908/)（run-ds2-ds3-evidence.sh + e2e-sse-full-stream.log.txt）——**本地 OpenAI 兼容替身 + 真实 server 全链路先例**：替身返回普通 JSON，实流仍产出 42 个逐字 token 帧（`grep -c '^event: token'` 实测 42）；env 契约（DEV_MODE=false/JWT_SECRET/SYNOVA_DB_PATH scratch/LLM_BASE_URL 指替身/SYNOVA_SKIP_MCP=1）与 Node v22 ABI 锁定纪律全部在案。

**来源 D**: [AGENTS.md](../../../AGENTS.md) 铁律 0-2（测试先行+接线验收）、12（集成测试 cover 真实路由不 mock 管线）、24/31（异常处理+降级信号传播）、33（测试命名 `*.e2e.test.ts`）、38（as any 零容忍）、47/48（契约优先/测试非空壳）。

**来源 E**: [product-lines.yaml](../../synova/product-lines/product-lines.yaml) 线 2（对话交互）验收点原文: 2-1"对话触发诊断（说人话就能开一次诊断）"note"ConversationEngine 存在，端到端未验证"；2-2"回答是流式的（逐字出来，不等整段）"；2-5"多轮对话上下文不丢（聊到第 10 轮还记得第 1 轮）"evidence 绑定 `test:会话线程`；2-7 k3_only（仅 K3 复核可 verified）。

**来源 F**: DSH 锚点（本机一手源码，2026-09-08 当场 read 验证，零 import）:
- 请求重建不变量（`@deepseek-ai/dsh-agent-loop/lib/invariant.js`，install 内 llm/stream 钩子）: `if (JSON.stringify(options.messages) !== JSON.stringify(expected)) fail("llm request for session \"…\" diverges from the dispatch-time durable derivation (log-reconstruction desync)")`——LLM 请求的 messages 必须严格等于从 session event log 重建的结果，不等即 fail。
- 五帧协议+心跳（`@deepseek-ai/dsh-api-gateway/lib/index.js`）: 客户端帧严格校验（`type==="open"` 须 exactKeys ["type","streamId","endpoint","payload"]，:122-133）；mux server 心跳 heartbeatIntervalMs + ping/pong 计数（:199-240）。

## 2. Problem Statement

对齐北星锚定块：审计 Phase 1 的目标是"老板一句话→流式回答→落库可恢复"，D590/D591 已把链路建成，但**"建成"与"验证过"之间隔着一条物理证据鸿沟**——

1. **E2E 层零覆盖**: tests/e2e/ 现有 12 文件（2026-09-08 `ls` 实测）无一涉及对话端点；对话的全部测试在 tests/routes/conversations.test.ts（①-⑭），其 provider/诊断引擎工厂均为 `vi.mock`——引擎与真实 provider HTTP 层、真实 server 进程装配（中间件序/orchestration.db 注入/白名单）从未在 E2E 层同场验证。
2. **一次性证据不可复跑**: D590 evidence 的 curl 证据（e2e-ds2-ds3-curl.log.txt）是手工脚本单次产物，无断言、无退出码契约，K3 复核无法"一条命令重跑"。
3. **重启恢复无自动化证明**: conversations.ts:65 进程内 `sessionEngines` 引擎缓存使同进程测试永远命中缓存——`loadState→fromState` 跨进程恢复路径只有"杀进程重启"才能触达；现有集成测试与 curl 证据都无法自动覆盖它。
4. **产线证据停在单测级**: 2-5 的 latest evidence（stale-reverify-D589-line2.json，at=2026-09-08T02:15:37+08:00）quote 是三套件 29 用例单测；2-1 note 自认"端到端未验证"。审计 D592 验收②明示 verified 由 K3 复核完成——本任务职责是把机器证据推到 pending_k3 队列（机制上限，见 §3 Q1c），不虚报 verified。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

a) **项目拼图**: 本任务在 **L1 交互层的测试与证据域**（tests/e2e/ + docs/synova/product-lines/evidence/），被测对象是 D590 已上线的对话 SSE 端点（src/routes/conversations.ts，black-box HTTP 消费，零 src/ 修改）。Phase 1 关键路径 D590→D591→D592 的第三棒：前两棒"建成"，本棒"物理验证 + 证据入账"。

b) **文件审计**（grep/read 实测 2026-09-08，main@bdfad5c0）:
- `ls tests/e2e/` → 12 文件（auth-register-flow/customer-flow/diagnosis-pipeline.e2e 等），**零对话 E2E**；auth-register-flow.e2e.test.ts 是外部 server 模式权威先例（PORT=3099 + JWT_SECRET + scratch DB + beforeAll 探活 /api/healthz + ctx.skip 降级，:60-69）。
- 被测端点真实定义（read 实测）: POST /api/conversations（conversations.ts:324）+ POST /api/conversations/:id/messages（:329）；SSE 帧序 open(:246)→token(:252 onToken 直通)→agent_message(:268)→[诊断事件 flat(:294)→complete(:296)]→end(:309)；流前 JSON 错误 400(:162)/404(:183)/409(:207)/503(:172)；同会话忙锁 busySessions(:52,:206-208)；心跳 15s（web-adapter.ts:16,29）。
- 会话读回: GET /api/sessions/:id（sessions.ts:68-81）返回 `{ok, session, messages}`，messages 由 SessionStore 事件流投影（getMessages）。
- 白名单: auth.ts:110-112 三前缀（/api/diagnosis/consult、/api/conversations、/api/sessions）；server.ts:355-356 挂载（sessionsRoutes 旁）。
- 证据机制: calc-progress.py 证据发现 = `docs/synova/product-lines/evidence/` **扁平 glob("*.json") 不递归**（:77-83 read 实测）；record_type=test 绿+新鲜 → pending_k3，K3 pass 才 verified（evidence/README.md §四 机制说明）；机器分支新鲜度仍用 date-only（:227 `git_touched_after(line_modules, latest["date"])`，CT-62 修复仅落 k3 路径 :189/:204）——**evidence 的 at/date 之后任何线 2 modules（src/agent/ 等）提交都会使其转 stale，本任务零 src/ 写集正是保鲜前提**。
- `.gitignore`:76-79 `evidence/` 全局忽略但 `!docs/synova/product-lines/evidence/` 豁免——新证据文件 git add 无需 -f（`git ls-files` 实测目录已跟踪）。
- 复用判定: auth-register-flow 测试骨架、D590 evidence runner 脚本骨架、stale-reverify-D589-line2.json evidence 契约（schema=1/record_type=date/at/note/verdicts）全部现成；**不新建测试框架、不动 calc-progress.py、不动 yaml**。

c) **决策**: 已有覆盖 → 复用 + 新增（测试文件/runner/JSON 均为新建，零修改条目）。与在途任务写集零交集（D593 碰 src/routes/diagnosis.ts+electron、D595 碰 src/mcp/、D596 碰 src/ 死文件——均不落 tests/e2e/ 与 evidence/）。

### Q1: 调研

a) **业界最佳实践**: 黑盒 E2E = 真实进程 + 外部依赖替身（test double）+ 探活降级 + 机器断言——不 mock 被测管线（铁律 12），只替**系统边界外的非确定性依赖**（LLM）；SSE 消费端断言逐帧解析 `event:`/`data:` 行对；并发类断言用**可控延迟替身**保证窗口确定性，不靠 sleep 赌时序。

b) **DSH 范式**（零 import，§1 来源 F 锚点一手验证）:
- **请求重建不变量 → E2E 断言**: "SSE 交付的 token 串 ≡ GET /api/sessions/:id 读回的 assistant content ≡ 事件流投影"——D590 集成用例⑥已测（mock 层），D592 在真实进程 + 真实落库 + **跨进程重启**下复测（invariant 的"dispatch-time durable derivation"物理等价物）。
- **帧协议验证**: open/sessionId 回声、token 逐字、agent_message 全文兜底、end 终帧、错误帧有序——对齐 dsh-api-gateway "open 帧严格校验 + 终态必达"语义；心跳 15s 由 web-adapter.ts:16 已实现，E2E 长流样本可观测（不断言 15s 节奏本身，避免时序脆弱）。

c) **memory/ 历史教训**:
- **S-2/S-3/S-5**（dev doc 纪律）: 写集表"记录含 X"必须真实实现；接线=生产调用点真实传递；测试必须覆盖失败模式（409/404/400/abort 断言即负向组），非仅 happy path。
- **D589 批教训**（evidence/README.md）: ① evidence **必须带 at**（bot 证据 at 缺失 → CT-62 保守误判）；② Node 版本 ABI——better-sqlite3 编译于 Node 22（NODE_MODULE_VERSION 127），Node 24 全量跑出 350 假败，**runner 必须锁 Node 22 并显式检查**；③ machine 分支 date-only 粒度 → 本任务 evidence 生成后应尽快随 spec 同期提交，减少被后续线 2 提交击穿为 stale 的窗口。
- **GS-01 诚实 RED 模式**（scripts/golden-scenarios/GS-01-first-diagnosis/README.md）: 无 LLM key 的断言组恒可跑；真实 LLM 组门控 + 如实 RED 不伪造全链路绿——D592 沿用: 替身为默认（恒可跑），真实 key 为可选门控（SYNOVA_E2E_REAL_LLM=1）。
- **M3 模式**: 接线必须 read 被调用方真实定义——本 spec 已 read conversations.ts 全文 333 行、sessions.ts 读回段、auth.ts 白名单段、base.ts 流式解析段、web-adapter.ts 帧写入段。

### Q2: 范围 — 正确的最简方案

**做什么**: ① tests/e2e/conversation-flow.e2e.test.ts（对话闭环/多轮上下文/忙锁/断线/诊断桥触发/负向边界/白名单对照/重启恢复，共 9 用例两段式）② docs/synova/product-lines/evidence/D592-run-e2e.sh（一键复现 runner: scratch 环境 + LLM 替身 + 真实 server 两段启停 + vitest 调用 + evidence JSON 生成 + 零 skip 校验）③ 3 份 evidence JSON（d592-e2e-2-1/2-2/2-5.json，record_type=test 带 at）④ 运行日志落位（create/resume 两段 vitest 输出）。

**不做什么（含文件路径）**: 见 §6。

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**: `bash docs/synova/product-lines/evidence/D592-run-e2e.sh`（本机无真实 key、无预置 server 亦可跑）。
- **交互**: runner 起 LLM 替身（:9201）+ 真实 server（:3099，DEV_MODE=false，scratch DB）→ vitest 两段执行——创建段（闭环/读回/多轮/忙锁/断线/诊断桥/负向/白名单对照）→ **kill server → 同 scratch DB 重启** → 恢复段（重启读回/重启续轮）。
- **结果**: 两段 vitest exit 0 且零 skip；evidence/ 下 3 份 JSON + 2 份日志落位；`python3 scripts/product-lines/calc-progress.py` 重算显示 2-1/2-2/2-5 证据更新为 D592 批（状态 pending_k3，K3 复核后 verified——机制上限如实）。

### Q4: 契约与测试（铁律 47/48，写代码前定义）

**E2E 文件环境契约**（对 runner 的接口，全部 env 注入、文件内无硬编码端口）:
- `@input` — `PORT`（server 端口，缺省 3099 对齐 auth-register-flow detectPort）；`SYNOVA_E2E_RESUME=1`（恢复段开关）；`SYNOVA_E2E_STATE`（state 文件绝对路径，创建段写/恢复段读，JSON `{sessionId, userMessage, assistantPrefix, messageCount}`）；`SYNOVA_E2E_REAL_LLM=1`（真实 key 门控，T6 升级断言强度）。
- `@output` — vitest 退出码（0=全绿）；state 文件（创建段产出）。
- `@degraded` — server 探活失败（beforeAll /api/healthz 3s×重试）→ 各 it 显式 `ctx.skip()` 并 `console.warn('[D592] server 未启动——请经 D592-run-e2e.sh 运行')`（非静默空跑；evidence 运行要求零 skip）；`SYNOVA_E2E_RESUME=1` 但 state 文件缺失/畸形 → 全部用例显式 fail（不 skip——恢复段缺输入是 runner 契约破坏，必须红）。

**LLM 替身契约**（runner 内 node 内联 http server，D590 先例扩展两点）:
- OpenAI 兼容 POST /chat/completions → `{choices:[{message:{role:"assistant",content}}]}`；content 动态含**请求消息计数**: `已收到本会话第 <n> 次请求（历史 <m> 条消息）…`（n=该替身累计请求数，m=请求体 messages 数组长度）——多轮上下文物理证明的探针（T3/T9 断言 m 单调增长，即引擎真实把历史送到了 provider）。
- 每次响应延迟 ~300ms（`SYNOVA_E2E_LLM_DELAY_MS` 可调）——忙锁窗口确定性（T4）与断线窗口确定性（T5）的物理保障。

**evidence JSON 契约**（逐字段对齐 stale-reverify-D589-line2.json）: `schema:1`、`record_type:"test"`、`source`（runner 命令 + Node 版本 + git HEAD）、`date`（YYYY-MM-DD）、`at`（ISO 带时区）、`note`、`verdicts[]`（acceptance_point="2-1"/"2-2"/"2-5"、verdict="pass"、quote（用例清单+帧计数等物理数字）、quote_ref（tests/e2e/conversation-flow.e2e.test.ts + 日志路径））。由 runner 以模板生成（at 用 `date -Iseconds`），禁止手抄时间戳。

## 4. Current State（2026-09-08 实测，main@bdfad5c0，全部 grep/read 当场验证）

### 4.1 被测链路现状（D590 交付，本任务零改动）

| 环节 | 位置 | E2E 消费方式 |
|---|---|---|
| 对话入口 | conversations.ts:324/:329（POST /api/conversations、POST /api/conversations/:id/messages） | fetch POST，无 Authorization 头 |
| SSE 帧 | open:246 / token:252 / agent_message:268 / 诊断事件 flat:294 / complete:296 / error:314 / end:309；心跳 web-adapter.ts:29 | 手写 `event:`/`data:` 逐帧解析（useStreaming:220-260 同型） |
| 流前错误 | 400:162 / 404:183 / 409:207 / 503:172（均 JSON 非 SSE） | 负向断言组 |
| 忙锁 | busySessions Set（:52），占用中第二请求 409（:206-208），finally 释放（:319） | T4 |
| 断线语义 | setOnClosed(:215)→settle 后仍落库 ③④⑤（:255-257），"已见前缀 ⊆ 落库内容"（中断锚） | T5 |
| 持久化 | addMessage user:249 / assistant:255 / updateSession:256 / saveState:257 | 读回断言 |
| 诊断桥 | phaseComplete→buildDiagnosisEngine(:274)→launcher.startDiagnosis(:294)→complete 帧(:296) | T6 |
| 读回 | sessions.ts:68-81 `{ok, session, messages}` | T2/T7/T9 |
| 白名单 | auth.ts:110-112 三前缀；server.ts:355-356 挂载 | 全程无凭证 + T8 对照探针 |

### 4.2 测试与证据现状（缺口所在）

- tests/routes/conversations.test.ts ①-⑭ 全绿（D590 交付），但 `vi.mock` provider/config/诊断引擎工厂 + `listen(0)` 进程内 app——真实 server 装配、真实 provider HTTP、跨进程重启均不在覆盖内。
- tests/e2e/ 12 文件（`ls` 实测）零对话场景；auth-register-flow.e2e.test.ts 为本任务模式模板（PORT=3099 + JWT_SECRET + scratch DB + beforeAll 探活 :60-69 + ctx.skip :78）。
- D590 evidence: e2e-sse-full-stream.log.txt（实流 42 token 帧）+ run-ds2-ds3-evidence.sh（替身+scratch env 先例）——**单次手工**，无断言无退出码契约。
- 产线证据: 2-5 latest = stale-reverify-D589-line2.json（单测级，at=2026-09-08T02:15:37+08:00）；2-1/2-2 无 D589 后新证据；yaml 内三点 status 均 uncommitted + calc 状态机走 test→pending_k3→K3→verified（evidence/README.md §四）。

### 4.3 关键架构事实（E2E 设计依据，逐条实测）

1. **非流式替身亦产逐字 token**: ConversationEngine 流式轮次经 toolLoop.streamWithToolLoop（conversation-engine.ts:871-873）→ tool-loop-executor 逐字 `for (const ch of` + sleep(5)（铁律 42 三处）——D590 实流 42 帧逐字是物理证明。替身无需实现 SSE 流式（`base.ts:173-182` 的 `delta.content` 流式解析是 provider 能力，非本测试依赖）。
2. **诊断桥确定性触发**: processMessageStream phase 0 分支（:767-786）: `phaseComplete = turnCount >= maxTurns(默认 6) || detectPhaseComplete(userInput)`，门槛 `turnCount >= minTurns(=min(3,maxTurns)=3)`；detectPhaseComplete 关键词表 :881-889（'没有了'/'就这些'/'差不多了'/'可以了'/'开始诊断'/'开始分析'/'好的'/'ok'/'没问题'）。**第 3 轮发送含"开始诊断"的消息 → 桥必然触发**（HTTP 装配无 intentRouter，无维度覆盖拦截——:770-772 无 intentRouter 分支的 minTurns 直判）。触发后路由先发 phaseComplete 回复（viewAdapter.showAgentMessage，:779）再跑诊断——"访谈完成"文案 + ≥1 诊断事件是确定性断言；六阶段全绿依赖 LLM 质量，归真实 key 门控（GS-01 同型）。
3. **重启恢复唯一触达路径**: sessionEngines 进程内缓存（:65,:224-240）——同进程第二请求恒命中缓存；`loadState→fromState`（:226-234）只在缓存未命中（进程重启）时执行。**双段 runner 是测到该路径的唯一形态**（§5.3 决策 3）。
4. **scratch 环境契约**（D590 runner 实证可用）: `SYNOVA_DB_PATH=$WORK/d592.db SYNOVA_DATA_DIR=$WORK DEV_MODE=false JWT_SECRET=<显式> LLM_API_KEY=d592-standin LLM_BASE_URL=http://127.0.0.1:$LLMPORT LLM_MODEL=d592-standin-model SYNOVA_SKIP_MCP=1 PORT=$PORT npx tsx src/index.ts`；探活 GET /health 或 /api/healthz。
5. **Node 22 ABI 锁**: better-sqlite3 编译于 Node 22（NODE_MODULE_VERSION 127），Node 24 假败 350 例（D589 批实证）——runner 头部检查 `node -p process.versions.node` 主版本 ≠ 22 → 显式报错退出（不静默带病运行）。

## 5. What We Build

### 5.1 写集 (0 修改 + 7 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| tests/e2e/conversation-flow.e2e.test.ts | 新建 | 9 用例两段式 E2E（契约见 §5.2-A/§7） |
| docs/synova/product-lines/evidence/D592-run-e2e.sh | 新建 | 一键 runner（契约见 §5.2-B） |
| docs/synova/product-lines/evidence/d592-e2e-2-1.json | 新建 | 2-1 evidence（§3 Q4 契约，runner 模板生成） |
| docs/synova/product-lines/evidence/d592-e2e-2-2.json | 新建 | 2-2 evidence（同上） |
| docs/synova/product-lines/evidence/d592-e2e-2-5.json | 新建 | 2-5 evidence（同上） |
| docs/synova/product-lines/evidence/D592-e2e-create.log.txt | 新建 | 段1 vitest 全量输出（runner 落盘） |
| docs/synova/product-lines/evidence/D592-e2e-resume.log.txt | 新建 | 段2 vitest 全量输出（runner 落盘） |

> 新建文件 dev doc 交付时以**目录级条目**声明（未存在文件报"文件不存在"假阳，D580/D590 先例）；实现提交（33705431）后已精确化为上表 7 个确切文件名（check-dev-doc-write-set U2a 反向对账 + 计数对账，D590 61aa839d 同款）。零修改条目——src/ 零触碰是本任务红线也是 evidence 保鲜前提（§3 Q0b）。

### 5.2 关键实现契约

**A. E2E 测试文件**（tests/e2e/conversation-flow.e2e.test.ts，黑盒: 仅 import vitest + node:fs，**零 src/ import**、零 @deepseek-ai import（G1））

```
beforeAll: 探活 GET http://localhost:$PORT/api/healthz（3s 超时；失败 → serverDown=true → 各 it ctx.skip + console.warn）
SSE 消费 helper: fetch POST → res.body 手写解析（按行累积，event:/data: 行对 → {event, data}[]；abort 经 AbortSignal）
state 文件: 创建段结束写 {sessionId, userMessage, assistantPrefix, messageCount}；恢复段读取校验
```

**B. runner 脚本**（D592-run-e2e.sh，幂等可重跑，D590 run-ds2-ds3-evidence.sh 骨架扩展）:

```
① Node 主版本检查（≠22 → 报错退出，D589 ABI 教训）
② 端口预清理（lsof :3099/:9201，探测型 swallow-ok）+ mktemp -d scratch
③ 起 LLM 替身（node 内联: OpenAI 兼容 + 消息计数 reply + 300ms 延迟）
④ 起 server（§4.3-4 env 契约）+ 探活 ≤90s
⑤ 段1: npx vitest run tests/e2e/conversation-flow.e2e.test.ts → tee D592-e2e-create.log.txt；exit≠0 → 收集现场日志后 exit 1
⑥ kill server → 同 scratch DB 重启 + 探活（物理重启，无任何进程内伪造）
⑦ 段2: SYNOVA_E2E_RESUME=1 SYNOVA_E2E_STATE=<state> vitest 同文件 → tee D592-e2e-resume.log.txt
⑧ 零 skip 校验（两份日志 grep " skipped" 必须为 0 skip；有 skip = fail）
⑨ 以模板生成 3 份 evidence JSON（at=$(date -Iseconds)；source 记录 Node 版本+git HEAD+runner 命令）
⑩ 清理替身/server/scratch（evidence 日志已落 evidence/ 目录）
```

**C. 真实 key 门控**（可选，非 DS 验收项）: `SYNOVA_E2E_REAL_LLM=1` 且环境已配置真实 key 时，T6 断言升级为 complete 帧 + report 非空 + report 可取（GS-01 L1-6 同型）；默认替身模式 T6 只断言桥接触发语义——两种模式的断言强度差异写进 T6 用例注释与 evidence note（不伪造全链路绿）。

### 5.3 决策参考（S-12/D333）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| 1. LLM 来源 | A 真实 key / B vi.mock 层 mock / C 本地 OpenAI 兼容替身 | 第一性原理（被测对象=对话管线非 LLM，替身消外部非确定性）+ 审计 §8.2.1 两选项之"网关 mock server"已被 D590 落地验证（42 token 帧实流）+ GS-01 门控先例 | **C**——替身默认恒可跑；真实 key 为可选门控（§5.2-C）；零 key 依赖即零派单阻塞 |
| 2. server 模式 | A 测试内自孵化（beforeAll spawn） / B 外部 server + 探活 + skip | 仓内惯例（auth-register-flow/customer-flow 同型）+ 全量 `npm run test` 不背 server 启动成本与端口冲突风险 + founder 指定参考即 auth 模式 | **B**——外部 server；可重复性由 runner 脚本承载（一条命令 = 起环境和跑测试全包） |
| 3. 重启恢复验证形态 | A 单进程内伪造"重启" / B 双段 runner（kill + 同 scratch DB 重启） | 第一性原理（sessionEngines 进程内缓存使 A 物理测不到 fromState 路径，§4.3-3）+ D590 curl 证据的手工重启即 B 的雏形 + D591 验收②"刷新后会话还在"的物理语义 | **B**——段1 写 state → 真杀进程 → 段2 恢复；唯一诚实的重启证明 |
| 4. 场景 c（诊断桥）取舍 | A 不做 / B 断言六阶段全绿+报告 / C 断言桥接触发语义 | founder 派单"c 视诊断桥接是否稳定决定" + §4.3-2 触发条件确定性（关键词+minTurns+无 intentRouter）+ B 依赖 LLM 质量属 GS-01 real-LLM 域 + 2-1 证据需要"对话触发诊断"落点 | **C**——触发语义（"访谈完成"文案 + ≥1 flat 诊断事件 + 终帧∈{complete,error} + end）进默认套件；报告质量断言归 SYNOVA_E2E_REAL_LLM 门控（§5.2-C） |
| 5. evidence 落位 | A docs/synova/audit-reports/ 打包目录 / B product-lines/evidence/ 扁平落位 | calc 证据发现=该目录扁平 *.json 不递归（:77-83 实测）+ founder 写集预估同域 + .gitignore:79 豁免免 -f | **B**——JSON/logs/runner 全部扁平落 evidence/；calc 直接消费 |
| 6. 与 D589 批 2-5 证据的关系 | A 覆盖旧文件 / B 新文件并存 | calc 取每验收点 **latest** 证据（verdicts_by_point 聚合，:296）+ D589 批是历史台账不可改写 | **B**——新 JSON 并存成为 latest；旧文件不动（改历史证据 = 污染证据链） |

> 收敛检查: 六项决策两参考系（第一性原理 + 本仓 D590/GS-01/auth-register 实证）均指向同一答案，无分歧。**参考：Anthropic/DeepSeek/第一性原理**。

## 6. What We Don't Do

| 不做 | 原因 | 归属 |
|---|---|---|
| src/ 任何文件变更 | 纯测试与证据任务；被测链路 D590 已闭环（evidence 在案）；零 src/ diff 同时是 evidence 新鲜度前提（§3 Q0b） | 不做 |
| scripts/audit/、product-lines.yaml、VERSION.md | 红线（K3 专属 / 创始人所有） | 不做 |
| scripts/golden-scenarios/ 新增或修改 | DSH 域（TASK-ROUTING 登记）；审计 D592 行"GS-01 前置段"指**被 GS-01 覆盖前的对话段**由本任务补齐，非要求改 GS 场景；GS-01 管诊断 consult 链，D592 管对话链，互补不重叠 | 不做（GS 域另行派工） |
| calc-progress.py CT-62 机器分支 at 粒度修复（:227 date-only → latest.get("at")） | 控制塔域（scripts/product-lines/ 改动须走 ctrl-tower-change）；本任务只按现有机制出证据 | 控制塔另立 |
| 桌面端（electron-renderer）E2E | 桌面真流式属 D591 写集且其 DS2 物理证据已交付；HTTP E2E 已物理覆盖同一 SSE 契约（桌面与 E2E 消费同源端点） | 已覆盖/已交付 |
| 性能/压力测试（并发轮次>2、长会话 100 轮） | 本任务验证正确性闭环；线 20（长会话上下文管理）另有人负责 | 线 20 |
| 心跳 15s 节奏断言 | 时序脆弱断言违背 E2E 稳定性原则；心跳存在性由 web-adapter.ts:29 代码与集成层覆盖 | 不做 |
| ConversationEngine turnCount 跨重启连续性断言 | EngineState 不含 turnCount（conversations.ts:58-63 注释自认，L2 零修改红线）；E2E 断言 messages 历史连续（用户可见语义），不断言引擎内部计数 | Stage 3（L2 演进） |

## 7. Test Requirements（测试先行——铁律 0-2/48）

**测试文件**: tests/e2e/conversation-flow.e2e.test.ts（新建，`*.e2e.test.ts` 铁律 33）。**red 语义**: 交付前 tests/e2e/ 零对话覆盖（`ls tests/e2e/` 物理事实）即 red 基线——本任务 red→green 体现为"零覆盖 → 9 用例全绿 + 零 skip"，每用例同时锁定失败模式（S-5: 负向组 T4/T7/T8 非仅 happy path）。

**段 1 — 创建段（默认模式，8 用例）**:

| # | 用例 | 断言要点（全部 expect，铁律 48） |
|---|---|---|
| T1 | 生产态闭环: POST /api/conversations `{message}` 无 Authorization（server 为 DEV_MODE=false） | SSE 帧序 = open(`sessionId≈/^sess_/`,phase) → token×N(**N≥5**) → agent_message(`content ≡ token 串拼接`) → end；帧间无 error |
| T2 | 读回+重建不变量: GET /api/sessions/:id | `ok=true`；`session.id` 回声；messages 投影 ≡ `[{role:'user',content:原文},{role:'assistant',content:≡token拼接}]` 顺序+内容一致（log-reconstruction desync 断言，DSH invariant 落地） |
| T3 | 多轮上下文物理证明: 同 sessionId 第二条消息 | 第二轮 agent_message 含替身消息计数（历史条数 ≥ 第一轮值+2）；读回 4 条消息（2 轮 user+assistant）；**历史真实到达 provider**（替身探针） |
| T4 | 并发忙锁: req1 收到 open 帧后同 sessionId 发 req2 | req2 → **409** `{code:'SESSION_BUSY'}`（流前 JSON 非 SSE）；req1 end 后 req3 → 200 完整流（释放后可再发） |
| T5 | 断线不丢: 收到 ≥1 token 后 abort fetch | 轮询读回（≤10s, 500ms 间隔）直到 assistant 出现；**已见 token 前缀 ⊆ 落库 assistant content**（中断锚语义） |
| T6 | 诊断桥触发: 3 轮访谈，第 3 轮含"开始诊断"（minTurns=3 已达，§4.3-2） | 第 3 轮流含"访谈完成"文案 + **≥1 个诊断 flat 事件**（event 行 ∈ phase_started 等）+ 终帧 ∈ {complete, error} + end；REAL_LLM 门控模式升级断言 complete+report 非空（§5.2-C） |
| T7 | 负向边界: 未知 sessionId 续轮 → 404 NOT_FOUND；空 message → 400 VALIDATION_ERROR | 均流前 JSON（Content-Type 非 event-stream），不挂起 |
| T8 | 白名单在岗对照: 无凭证 GET /api/ga/calibration | **401**（中间件在岗证明——防"全局放通"假绿；对照 T1 的免凭证 200 构成认证边界双向断言） |

**段 2 — 恢复段（SYNOVA_E2E_RESUME=1，1 用例）**:

| # | 用例 | 断言要点 |
|---|---|---|
| T9 | 重启恢复: runner 已 kill+重启 server（同 scratch DB）；读 state 文件 | GET 读回含段 1 全部轮次（sessionId 一致、messageCount 一致）；POST 同 sessionId 续轮 → open 回声**同 sessionId** + 新 agent_message（替身计数继续增长=跨进程上下文恢复）+ 读回条数 +2 |

| 层 | 类型 | 数量 | 覆盖 |
|:---|---|:---:|---|
| L1 单元契约 | E2E 场景（真实 server 进程 + 真实落库 + 替身 LLM，铁律 12 不 mock 管线） | 9（T1-T9） | 正常闭环/读回不变量/多轮/并发/断线/诊断桥 |
| L2a 接线 | 生产端点物理消费: conversations.ts:324 挂载经 server.ts:356、sessions 读回 sessions.ts:68、白名单 auth.ts:110-112 | T1/T2/T8 + 全用例 | 真实进程内生产链路可达 |
| L2b 降级 | server 未启动 → 显式 skip + warn（非静默空跑）；诊断桥 error 帧路径（T6 终帧∪error）；REAL_LLM 缺失 → 门控如实降级 | beforeAll/T6/§5.2-C | 降级显式不伪造（铁律 24/31） |
| L2c 边界 | 409 忙锁/404/400/断线 abort/重启/白名单对照 401 | T4/T5/T7/T8/T9 | 防线语义（S-5 失败模式覆盖） |

## 8. Wiring Verification

本任务**零新生产 export**（写集全部在 tests/ 与 docs/）——接线验证的对象是"E2E 对生产端点的物理消费 + runner 对真实进程的启动"（铁律 0-2 Step 5 WIRE CHECK 的测试域等价物）:

| 消费的生产点（既有定义） | E2E 消费点（实现后运行即证明） |
|---|---|
| POST /api/conversations（src/routes/conversations.ts:324，挂载 src/server.ts:356） | T1/T3/T4/T6/T9 fetch 命中（真实进程，非 listen(0) 进程内 app） |
| POST /api/conversations/:id/messages（conversations.ts:329） | T3/T4/T9 续轮命中 |
| GET /api/sessions/:id（src/routes/sessions.ts:68-81） | T2/T5/T9 读回命中 |
| 白名单三前缀（src/middleware/auth.ts:110-112） | T1 无凭证 200 + T8 对照 401 双向证明 |
| 409 忙锁 / 404 / 400 流前错误（conversations.ts:207/:183/:162） | T4/T7 负向命中 |
| runner 启动的 server 进程 | D592-run-e2e.sh 探活+启停（物理进程，日志落 evidence/） |

> 验证命令: `bash docs/synova/product-lines/evidence/D592-run-e2e.sh && echo PASS`（exit 0 = 全部消费点真实命中）；`grep -rn "@deepseek-ai" tests/e2e/conversation-flow.e2e.test.ts` 零结果（G1）。

## 9. Architecture Layer

**L1 交互层测试域**（tests/e2e/ + docs/synova/product-lines/evidence/），被测对象为 L1 routes 装配的真实进程:

- 黑盒 E2E: 仅 import `vitest` + `node:fs`（对齐 auth-register-flow 的零 src/ import 形态）——不 import src/ 生产模块（diagnosis-pipeline.e2e 的 import src/providers 形态**不沿用**，那是门控单测混型，非黑盒 E2E）。
- 五层边界零触碰: 无跨层 import、无 L2/L5 代码变更；evidence JSON 与 runner 为文档域产物。
- 铁律 38: `as any`/`as never`/`as unknown as` = 0（SSE 帧解析用 unknown + 类型守卫窄化）。
- G1 红线: DSH 零 import——invariant/帧协议只作范式断言注释引用（§1 来源 F 原文）。
- pre-commit 回归预期: 组 2（新测试文件有 expect）✓、组 4（无新 export）✓、组 5（零跨层）✓、组 12（写集=声明目录）✓。

## 10. Completion Standard（DS 与本 doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1**: tests/e2e/conversation-flow.e2e.test.ts 落位——9 用例（T1-T9）契约与 §7 一致；黑盒（零 src/ import、零 @deepseek-ai import，grep 双零）
2. **DS2**: D592-run-e2e.sh 一键复现——Node 22 检查、替身+server 双段启停、零 skip 校验全实现；`bash D592-run-e2e.sh` exit 0 且两份日志**零 skip 全 pass**（物理证据: D592-e2e-create.log.txt / D592-e2e-resume.log.txt 落 evidence/）
3. **DS3**: 3 份 evidence JSON 落位——schema=1 / record_type=test / at 非空 / verdicts 分别指向 2-1、2-2、2-5；quote 含物理数字（token 帧数、消息计数、用例通过数）；quote_ref 指向测试文件与日志
4. **DS4**: calc 重算证据——`python3 scripts/product-lines/calc-progress.py`（或 CTO 惯用调用形态）输出中 2-1/2-2/2-5 的 evidence 集含 D592 批；**状态预期为 pending_k3**（K3 复核才 verified——机制上限如实写进完成报告，禁虚报 verified）
5. **DS5**: 红线核验——`git diff --name-only` 与写集一致（src/、scripts/audit/、product-lines.yaml、VERSION.md、scripts/golden-scenarios/ 零触碰）；`as any`=0
6. **DS6**: 完成报告含 §5.3 六项决策记录（参考系+结论，K3 可核）+ 北星验收三句（入口/交互/结果各一句附证据）+ 已知边界如实声明（T6 替身模式不断言报告质量；turnCount 跨重置不覆盖；evidence 保鲜依赖后续无线 2 modules 提交）

## 11. Auth Doc References

- docs/synova/research/L1全量审计-20260907/L1-audit-report.md（§5 DSH 借鉴 / §7 D592 行 / §8.2 依赖）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D590-chat-sse-endpoint-20260908.md（§5.2 帧协议/忙锁/中断锚——被测契约的权威定义）
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D591-desktop-chat-wiring-20260908.md（桌面消费侧，已交付）
- docs/synova/audit-reports/D590-chat-sse-evidence-20260908/（本地替身先例 + curl 证据 + env 契约）
- docs/synova/product-lines/product-lines.yaml（线 2 验收点 2-1/2-2/2-5/2-7 原文）+ docs/synova/product-lines/evidence/README.md（D589 批机制说明: at 纪律/Node ABI/pending_k3 上限）+ 同目录 stale-reverify-D589-line2.json（evidence JSON 字段权威样例）
- .claude/PRODUCT-BRIEF.md（§二/§三）+ AGENTS.md（铁律 0-2/12/24/31/33/38/47/48）
- tests/e2e/auth-register-flow.e2e.test.ts（外部 server 模式权威先例）
- scripts/product-lines/calc-progress.py（:77-83 证据发现 / :189,:204,:227 新鲜度——只读引用）+ vitest.config.ts（:28-35 e2e include/CI exclude）+ .gitignore（:76-79 evidence 豁免）
- DSH 源码锚点（零 import，一手 read 2026-09-08）: @deepseek-ai/dsh-agent-loop/lib/invariant.js（log-reconstruction desync 原文）、@deepseek-ai/dsh-api-gateway/lib/index.js:122-133,:199-240（open/cancel 帧校验 + 心跳）
- scripts/control-tower/dev-doc-gatekeeper.sh（本 doc 验收门禁）+ scripts/workflow/check-dev-doc-write-set.sh（写集对账）

## 12. 自检清单

- [x] 审计 §7 D592 行范围/验收逐条现场核实（非转述）；"GS-01 前置段"已裁决为互补而非改 GS 场景（§6）
- [x] 全部"X 存在/签名是 Y"当场 grep/read（conversations.ts 333 行全文、sessions.ts:68-81、auth.ts:110-112、server.ts:355-356、web-adapter.ts 帧写入、base.ts:173-182 流式、tool-loop 逐字 sleep(5)、detectPhaseComplete :881-889、minTurns=3、busySessions、sessionEngines 缓存、vitest e2e include/CI exclude、calc 证据发现 :77-83、.gitignore:76-79、D590 实流 42 token 帧）
- [x] DSH 两锚点一手源码验证（invariant desync 原文 / open 帧严格校验+heartbeat），G1 零 import
- [x] 写集表 D381 格式（`### 5.1 写集 (0 修改 + 7 新建)`，标题下一行即表头）；新建走目录级条目（D580/D590 先例）+ 实现期精确化义务显式声明；删除清单无（零删除）
- [x] 测试 red→green 语义适配验证型任务（零覆盖→9 用例全绿）+ S-5 失败模式覆盖（T4 忙锁/T5 断线/T7 负向/T8 对照 401）
- [x] 决策参考 §5.3（S-12，六决策点双参考系收敛）；founder 五问逐一回答（范围→§5.3-4/重启→§5.3-3/LLM→§5.3-1/证据格式→§3 Q4+§5.3-5/环境→§5.3-1,2）
- [x] DS1-DS6 一一对应（S-10）；不做清单含文件路径与归属（Q2 排除项可物理验证）
- [x] 证据机制上限诚实声明（test→pending_k3，K3 才 verified；evidence 保鲜条件与 CT-62 现状——§3 Q0b/DS4/DS6）
- [x] 不是凭记忆；不涉及 scripts/audit/；不用 --no-verify
