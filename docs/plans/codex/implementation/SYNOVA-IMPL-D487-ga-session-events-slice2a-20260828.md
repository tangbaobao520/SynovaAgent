<!--
  SYNOVA-IMPL-D487: D394 片2-A——GA 诊断会话事件化装配（D500 地基接线，交付物可自证）
  状态: dev doc | 2026-08-28 | 优先级 P1
  切片: GA-SESS-2A（D394 片2 第一子切片：诊断过程落事件流 + engine 装配）
  权威文档: docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md（D394 片2：GA 诊断过程可回放=交付物可自证，硬依赖 D355-D360 完成）; SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md（D1 事件溯源地基：session_events 表 + appendEvent + 双写）; 施工图 DOC-0114 §5.3/§5.5（事件溯源可回放=审计要素）; AGENTS.md（GA 表述，FDE 已统一改 GA）
  依赖: D500（事件溯源地基已交付，audited）+ D355/D358/D360（L4/L5 契约已稳——片2 硬依赖已满足）+ D394 片1（哨兵 findings 事件化，Mac 已做）
  并行: 写集=src/agent/conversation-engine.ts + src/agent/diagnosis-launcher.ts + src/deploy/bootstrap.ts + src/server.ts + src/store/session-store.ts + tests/，与 DSH 线（scripts/、src/sentinel/）**零交集**；若必须并行先 worktree 隔离
  借鉴: DSH dsh-session 事件溯源范式（append-only + deriveMessages + model-visible⟺logged）——D500 已确立落地，本切片只做生产装配，不引 DSH 代码
-->

# SYNOVA-IMPL-D487 D394 片2-A：GA 诊断会话事件化装配

## 1. 权威文档引用

* **K3 咨询**（docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md）：
  * D394 片2 =「GA 诊断过程可回放 = 交付物可自证（信任层完整形态）」；
  * 片2 **硬依赖 D355-D360 的 L4/L5 契约先稳**（L204）——D355/D358/D360 已完成，依赖满足；
  * D398（组织记忆）前置 = 片2 完成 + N13 闭环（L288）。
* **D500 地基**（SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md）：D1 事件溯源已交付——`session_events` 表（session-store.ts L127）+ `appendEvent`（L272）+ agent_messages 双写（L238-254）；**但审计标注「engine 悬空 seam：5 个引擎实例化点未传带 store 的 SessionManager，conversation-engine:617 生产死代码」**——地基在 store 层，生产链路未装配。
* **GA 表述**（AGENTS.md V5.1.1）：FDE 统一改 GA（Growth Advisor），本文档全用 GA。

## 2. 代码审计——现状（全部实测 file:line）

### 缺口 A：D500 事件溯源地基未接 GA 诊断生产链路（engine 悬空 seam）
* `src/deploy/bootstrap.ts` L682：`new SessionManager({}, new SessionStore(db))`——**带 store 的 SessionManager 已创建**。
* `src/server.ts` L116：`services.sessionManager`——server 层持有。
* `src/agent/conversation-engine.ts` L67/L349/L399：`sessionManager?: SessionManager` 字段存在 + `this.sessionManager = config.sessionManager || null`（L399）——**但 5 个引擎实例化点未传**（D500 审计实证；conversation-engine L617 附近的生产路径未用 sessionManager）。
* 后果：GA 诊断对话**不落 session_events 事件流**（或落但 engine 未消费）——「诊断过程可回放」在 store 层有地基、在生产链路零生效。

### 缺口 B：GA 诊断过程只有 checkpoint 快照，无事件流
* `src/agent/diagnosis-launcher.ts` L21：`SessionStoreLike.saveDiagnosisCheckpoint`（快照式）；L125：`sessionId, phase, completedModules, partialReport` 存 checkpoint——**是快照不是事件**。
* `src/routes/diagnosis.ts`：通过 `DiagnosisEngine` 接口（L18）调用，`DiagnosisEvent` 类型存在（L18）——**事件有类型但未落 session_events**。
* 后果：诊断的阶段推进/模块结果/报告产出不可回放——「上次诊断为什么得出这个结论」无法从事件流追溯（K3 咨询的核心价值）。

### 现状确认（实测）
* `session-store.ts` L58：`SessionEventType = 'message' | 'tool_result' | 'system'`——**无诊断事件类型**（phase/module/report）——需扩展；L131 的 `event_type CHECK(event_type IN ('message','tool_result','system'))` **约束需同步扩展**（否则诊断事件 INSERT 失败）。
* `conversation-engine.ts` 支持 `config.sessionManager` 注入（L399）——装配点就绪，只差实例化点传参。
* GA 诊断链路：diagnosis.ts（L1 接口）→ diagnosis-launcher（会话上下文 + eventBus L62）→ ConversationEngine——装配路径清晰。

### 无重复造轮子审计（S-14，2026-08-28 实测）
* **D500 是地基，本切片是装配**：session_events/appendEvent/deriveMessages 已由 D500 交付（grep 实证 L127/L272）——本切片**不重建**事件溯源，只做：① 实例化点传 sessionManager（seam 修复）② 诊断事件落流（用 appendEvent）③ 事件类型扩展。
* 全仓 grep：`appendEvent` 仅 session-store.ts（唯一实现）；`saveDiagnosisCheckpoint` 仅 diagnosis-launcher.ts——无重复路径。
* DSH 迁移：事件溯源范式已由 D500 确立（借鉴 dsh-session 不变量），本切片只装配不引代码。

## 3. 实现方案

### 3.1 写集 (4 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/conversation-engine.ts | 修改 | sessionManager 装配——5 个引擎实例化点（bootstrap/server/tui 等）统一传 `config.sessionManager`；生产路径（L617 附近）消费 sessionManager（消息走 SessionStore 而非仅内存/旧路径） |
| src/agent/diagnosis-launcher.ts | 修改 | 诊断阶段事件落流——eventBus 的阶段推进/模块结果/报告产出调 `appendEvent(sessionId, 'system'/'tool_result', {phase, module, ...})`（诊断事件类型，见 session-store） |
| src/store/session-store.ts | 修改 | SessionEventType 扩展诊断事件类型（如 'diagnosis_phase' \| 'diagnosis_module' \| 'diagnosis_report'）+ **L131 event_type CHECK 约束同步扩展**（漏扩则 INSERT 失败）+ appendEvent 类型校验同步 |
| src/deploy/bootstrap.ts + src/server.ts | 修改 | 实例化点传 sessionManager（bootstrap L682 已创建 → 传入 ConversationEngine；server L116 services.sessionManager 传入诊断链路） |
| tests/agent/diagnosis-session-events.test.ts | 新建 | 诊断全链路事件流断言：① consult 一次 → session_events 含阶段/模块/报告事件（red=现状仅 checkpoint 无事件 → green）；② 回放 deriveMessages/事件序列与诊断过程一致（交付物可自证）；③ 双写失败 → degraded 显式（铁律 31） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（功能装配，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；与 DSH 线零交集。

### 3.2 最终实现同 commit 回填（D487 实测，2026-08-28）
若实现偏离方案（如诊断事件类型命名不同、或装配点在 orchestrator 而非 bootstrap、或事件落流改在 diagnosis.ts 路由层而非 launcher），必须在本节同 commit 回填最终形态（S-6）。

**事件类型命名（无偏离）**：diagnosis_phase / diagnosis_module / diagnosis_report，按 §3.1 建议落地。

**装配点（偏离回填）**：§3.1 假设实例化点在 bootstrap/server——grep 实测 ConversationEngine 实例化点为 **cli.ts（新建 + fromState 恢复）×2、l1/im-inbound.ts、mcp/index.ts、tui-v2/index.ts、conversation-engine.fromState**；server.ts **无** ConversationEngine 实例化（services.sessionManager 已入 orchestration wiring，零改动即命中 DS1 grep）；routes/diagnosis.ts 的 consult 路由直建 SynovaDiagnosisEngine、不经 DiagnosisLauncher（片2-B 范围）。最终装配形态：
* `EngineConfig.sessionStore?: SessionStoreLike`（launcher 导出内联类型，铁律 39 不 import L5）→ 构造器注入 engineCtx（内联 cast，EngineContext 接口不加 L5 字段）→ launcher `persistingOnEvent` 双写落流。
* cli 新建/恢复两分支传 `sessionManager+sessionStore`；im-inbound 同（builtinStore 先建）；mcp 经 getDatabase() 守卫（无 db 环境降级内存态，log.warn）；tui-v2 透传 services。
* deploy/bootstrap：SessionStore 提升具名实例 + `ctx.set('sessionStore')` + BootstrapServices.sessionStore（供 server 侧消费与片2-B）。

**落流机制（偏离回填）**：§3.1 说"eventBus 的阶段推进调 appendEvent"——launcher 现状不经 eventBus 发诊断事件，实际为 **onEvent 包装器 persistingOnEvent 双写**（onEvent 透传给调用方 + appendEvent 落 session_events）；phase_started/phase_completed → diagnosis_phase，其余（模块/发现/降级/错误）→ diagnosis_module；runConsultation 成功后追加 diagnosis_report（回放顺序终点）；失败路径 error 事件也落流。写入失败 log.warn + 诊断继续（铁律 24/31）。

**CHECK 迁移（偏离回填）**：§3.1 只提"L131 CHECK 同步扩展"——CREATE TABLE IF NOT EXISTS 不更新已有表约束，实际追加**旧库幂等表重建迁移**（sqlite_master 建表 SQL 缺 diagnosis_phase 判定 + BEGIN/COMMIT 原子重建 + ROLLBACK 保护）。

**附加发现（D500 第二处悬空）**：tui-v2/lib/bootstrap.ts L130 `new SessionManager({...})` 未注入 store（本文件不在原写集）——一并接入，tui-v2 入口消息事件持久化生效。

**其他**：fromState 增加可选 wiring 参数（恢复会话续写同一事件流）；L669 自动诊断发起人 'FDE'→'GA'（GA 表述约束；L139-163 系统 prompt 内 FDE 文案为 prompt copy 未动）。测试 5 用例映射 §4 ①-⑤（⑤"无 sessionManager 注入"实测以 sessionStore 为轴，sessionManager 为同型可选依赖）。

### 3.3 不做的事
* **不重建事件溯源**（D500 已交付 session_events/appendEvent/deriveMessages——复用）。
* 不做 fork/resume（D394 片3，Q4 期权，本切片只做可回放）。
* 不做 D398（组织记忆/会话变记忆——依赖片2 + N13 闭环，数据回流后）。
* 不碰 DSH 线（scripts/、src/sentinel/、electron/）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 集成 tests/agent/diagnosis-session-events.test.ts（新建） | 5 | ①consult 一次 → session_events 含诊断阶段/模块/报告事件（red=现状仅 checkpoint）；②回放事件序列与诊断一致（可自证）；③双写失败 → degraded 显式；④deriveMessages 不破坏既有消息（回归）；⑤无 sessionManager 注入时降级不崩（兼容旧路径） |

**RED 必须覆盖失败模式（S-5）**：用例①以现状断言——consult 后 session_events **无诊断事件**（只有 checkpoint，red=未装配）→ 修复后事件流完整（green=可回放）。用例③双写失败显式 degraded（铁律 31，不静默）。

## 4.5 决策参考（S-12）
* 决策点 1：诊断事件落流用 appendEvent（复用 D500）vs 新建诊断事件表？
  * 参考系：第一性原理——D500 的 session_events 是"会话唯一事实源"，诊断事件是会话的一部分；新建表破坏单一事实源（model-visible⟺logged 不变量）。
  * 结论：扩展 SessionEventType + 复用 appendEvent（D500 地基）。
* 决策点 2：装配点在哪（bootstrap 传参 vs orchestrator 注入）？
  * 参考系：Anthropic——最小改动 + 生产入口唯一：bootstrap L682 已创建带 store SessionManager，就近传入；orchestrator 注入增加间接层。
  * 结论：bootstrap/server 实例化点传参（现有 seam 就绪，L399 已支持）。
* 决策点 3：诊断事件粒度（阶段级 vs 消息级）？
  * 参考系：第一性原理——可自证的最小充分粒度：阶段推进 + 模块结果 + 报告产出（能回答"为什么得出这个结论"）；消息级由 D500 双写已覆盖。
  * 结论：阶段/模块/报告事件（新增类型），消息事件复用 D500。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| appendEvent 诊断事件（扩展类型） | diagnosis-launcher（eventBus → appendEvent） | `grep -rn "appendEvent" src/agent/diagnosis-launcher.ts` 命中 |
| sessionManager 装配 | bootstrap/server 实例化点 → ConversationEngine | `grep -rn "sessionManager" src/deploy/bootstrap.ts src/server.ts` 命中且传入 |

> 生产调用点（S-3）：GA 诊断生产入口 = diagnosis.ts（consult SSE）→ diagnosis-launcher（事件落流）；bootstrap/server 是引擎装配生产入口；测试调用不计入。

## 6. 完成标准

* **DS1 装配接线**：`grep -rn "sessionManager" src/deploy/bootstrap.ts src/server.ts` 命中（实例化点传入）+ `grep -rn "config.sessionManager" src/agent/conversation-engine.ts` 命中（消费）。
* **DS2 诊断事件落流**：`grep -rn "appendEvent" src/agent/diagnosis-launcher.ts` 命中（阶段/模块/报告事件）+ `grep -n "diagnosis_phase\|diagnosis_module\|diagnosis_report" src/store/session-store.ts` 命中（类型扩展）。
* **DS3 测试全绿**：`vitest run tests/agent/diagnosis-session-events.test.ts` 全 pass（5 用例；red 先行已证）。
* **DS4 零回归**：`vitest run tests/agent/diagnosis-launcher.test.ts tests/agent/conversation-engine.test.ts` 绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（5 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（诊断无事件流 → 可回放；双写失败 degraded）
* [ ] 接线要求真实（appendEvent/sessionManager 生产调用）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：功能装配，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 装配接线 | grep -rn "sessionManager" src/deploy/bootstrap.ts src/server.ts + grep -rn "config.sessionManager" src/agent/conversation-engine.ts | 双命中 |
| DS2 诊断事件落流 | grep -rn "appendEvent" src/agent/diagnosis-launcher.ts + grep -n "diagnosis_" src/store/session-store.ts | 双命中 |
| DS3 测试全绿 | vitest run tests/agent/diagnosis-session-events.test.ts | 5/5 pass |
| DS4 零回归 | vitest run tests/agent/diagnosis-launcher.test.ts tests/agent/conversation-engine.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**本切片是 D394 片2 第一子切片（GA-SESS-2A）**——只做"诊断过程可回放"的生产装配（D500 地基接线 + 诊断事件落流），**不重建事件溯源、不做 fork/resume（片3 Q4）、不做 D398**；**复用 D500 的 session_events/appendEvent/deriveMessages（S-14 无重复审计已证）**；GA 表述（不用 FDE）；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
