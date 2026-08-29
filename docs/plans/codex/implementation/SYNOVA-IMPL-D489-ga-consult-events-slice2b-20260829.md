<!--
  SYNOVA-IMPL-D489: D394 片2-B GA 诊断会话事件化·consult 路由接线
  状态: impl-done（片2-B 已接线，待 K3 审计）| 2026-08-29 | 优先级 P1-片2
  权威文档: docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md; docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md; docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md; docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md
  借鉴: DSH D1 事件溯源范式（append-only + deriveMessages + model-visible⟺logged）——D500 已确立落地，本切片只做生产装配，不引 DSH 代码
  依赖: D500（事件溯源地基，已交付 audited）+ D487（片2-A 已合 main）
  并行: 无
-->

# SYNOVA-IMPL-D489 D394 片2-B：GA 诊断会话事件化·consult 路由接线

## 1. 权威文档引用

- **K3 战略咨询** `docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md`：D394 片2 =「GA 诊断过程可回放 = 交付物可自证（信任层完整形态）」；片2 硬依赖 D355-D360 契约稳定（已满足）。
- **D487 dev doc（片2-A）** `docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md`：明确「routes/diagnosis.ts 的 consult 路由直建 SynovaDiagnosisEngine、不经 DiagnosisLauncher（片2-B 范围）」——本切片就是这条遗留缺口的闭环。
- **D500 地基** `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md`：session_events 表 + appendEvent + deriveMessages 已交付，本切片不重建。
- **DSH 迁移施工图** `docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md` §5.3：事件溯源可回放 = 审计要素；Stage 1 借鉴清单 D1（会话存储/事件溯源范式）。
- **AGENTS.md 铁律**：铁律 39（L1 经 DiagnosisEngine 接口，不直触 engine-core）；铁律 24/31（catch 显式降级 + degraded 传播）；铁律 0-2（测试先行 red→green）；铁律 48（测试非空壳）。

## 2. 代码审计——现状

### 缺陷 A：consult 路由直建引擎、不经 DiagnosisLauncher

`src/routes/diagnosis.ts` 的 POST /api/diagnosis/consult 路由（L96 起）当前直接 import 并创建引擎：

- L134 `const { createSynovaDiagnosisEngine } = await import('../l3/synova-diagnosis-engine-impl');`
- L135-146 `createSynovaDiagnosisEngine(...)` 直接构造 `SynovaDiagnosisEngineImpl`（L557 `createSynovaDiagnosisEngine: DiagnosisEngineFactory`）。
- L163-164 手工包一层 `engine: DiagnosisEngine`（只透传 runConsultation）。
- L181 `const result = await engine.runConsultation(teamId, {...}, onEvent)` —— **完全绕过 `DiagnosisLauncher`，因此诊断阶段/模块/报告事件不落 session_events**。

### 现状：DiagnosisLauncher 已实现事件落流（D487 交付）

`src/agent/diagnosis-launcher.ts`（D487 片2-A 已合并）：

- L24-31 `export type SessionStoreLike`（appendEvent 签名含 diagnosis_phase/module/report）。
- `persistEvent(eventType, payload)` 内部读 `this.ctx.sessionStore`，调用 `store.appendEvent(sessionId, ...)`，写失败/无 store 时 log.warn + 跳过（铁律 24/31）。
- `persistingOnEvent` 透传 onEvent + 双写：phase_started/completed → diagnosis_phase；其余 → diagnosis_module。
- `startDiagnosis()` 结束后 `persistEvent('diagnosis_report', ...)`。
- 关键守卫：`if (!this.ctx.sessionId) return;`（无会话 id 不落 '' 桶）——因此**路由侧必须先 createSession 得到 sessionId**。

### sessionStore/sessionId 在路由侧的可用性

- `src/server.ts:244` `app.locals.orchestration = { eventBus, hookRunner, sessionManager, stateMachine, wiring, db, eventStore }` —— db 可用，sessionStore 未直接暴露。
- resume 路由已有构造先例 `src/routes/diagnosis.ts:358-359`：`new SessionStore((req.app.locals.orchestration as { db: unknown })?.db as never)`。
- `SessionStore.createSession(orgId)` 返回带 id 的会话（D487 测试 `tests/agent/diagnosis-session-events.test.ts` 已实证）。

### 无重复造轮子审计（S-14，DSH 迁移排查）

| 检查 | 要求 | 结果 |
|------|------|------|
| 全仓 grep 现有实现 | `grep -rn "persistEvent\|appendEvent\|DiagnosisLauncher" src/` | `src/agent/diagnosis-launcher.ts` 已实现 persistEvent + SessionStoreLike；`src/store/session-store.ts` 已实现 appendEvent/createSession/getEvents/deriveMessages（D500） |
| 施工图可借鉴清单对照 | 事件溯源范式 | D1 会话存储/事件溯源已由 D500 确立，本切片复用不重建 |
| 既有层确认 | 是否已有「路由侧诊断事件落流」 | 无——这是片2-B 唯一缺口，非重复 |
| 结论 | 复用/重建/借鉴 | **复用 DiagnosisLauncher + SessionStore（D500/D487），打通 consult 路由，不重建事件溯源** |

## 3. 实现方案

### 3.1 写集 (1 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/routes/diagnosis.ts | 修改 | consult 路由（L96 起，引擎创建 L134-146 / 运行 L181）改用 DiagnosisLauncher：从 `req.app.locals.orchestration.db` 构造 SessionStore（L359 先例）→ createSession(teamId) 得 sessionId → 组装最小 EngineContext → `new DiagnosisLauncher(ctx, engine)` → `launcher.startDiagnosis(initiator.role, initiator.name, onEvent)` 替换原 `engine.runConsultation(...)`；SSE onEvent 透传保持，report 缓存（completedReports）与 GET /report 行为不变 |
| tests/routes/diagnosis-consult-events.test.ts | 新建 | 路由级事件落流测试（见 §4） |
| task-state/D489.json | 新建 | 任务状态登记 |

> 共享资源标注（S-8）：写集不含 VERSION.md（功能装配，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；与 DSH 线零交集。

### 3.2 最终实现同 commit 回填（S-6）

实现偏离 §3.1 时（如 EngineContext 字段组装细节、sessionStore 判空分支、launcher 返回 null 的降级处理），必须在同一提交更新本节为最终形态。

**最终形态（D489 交付实测，2026-08-29）**——consult 路由（L96 起）实现顺序：

1. 会话装配（toolRegistry 构造后）：读 `req.app.locals.orchestration.db`（resume 路由 L358-359 同款 `as never` 先例）；db 在场才 `new SessionStore(db)` + `createSession(teamId)` 得非空 sessionId；SessionStore 构造/createSession 抛错时 `log.warn` + `sessionStore=undefined` + `sessionId=''` 降级继续（铁律 24/31）。
2. 引擎创建与手工包装 `engine: DiagnosisEngine` 保持不变（透传 runConsultation 第 3 参 undefined 第 4 参 onEvent）。
3. 最小 EngineContext 字面量：provider=路由现有 provider；messages=concerns 映射为 user 消息；orgId=teamId；sessionId；toolRegistry；hookRunner/eventBus/evidenceCollector/corroborationEngine/graphBridge/graphStore 全 null；flags 双 false；loggerPrefix='routes/diagnosis'；diagnosisEngine=engine；sessionStore 经 `as EngineContext` 断言挂载（excess property 挂载点，无 `as any`）。
4. `new DiagnosisLauncher(engineCtx, engine)` 后，原 SSE onEvent 回调体原样提为 `const onEvent`，`launcher.startDiagnosis(initiator.role, initiator.name || initiator.role, onEvent)` 替换原 `engine.runConsultation(...)`。
5. launcher 返回 null（引擎异常已被其内部捕获并发 error 事件）时路由 `sseError(res, 'DIAGNOSIS_FAILED', failed?.message || '诊断引擎不可用')` 显式收尾（铁律 24/31）。

行为差异（§4.5 已裁定可接受，交付实测复认）：concerns 经 launcher slice(0,200)；SSE 首条多 launcher 初始 phase_started(phase 1)；ctx.provider 在场触发 background-review（fire-and-forget + `.catch(log.warn)` 降级不阻断）；report 事件只落库不推 SSE。

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 不改 src/agent/diagnosis-launcher.ts | D487 已交付，事件落流逻辑复用 |
| 不改 src/store/session-store.ts | D500 已交付 |
| 不做 fork/resume（D394 片3） | Q4 期权 |
| 不做 D398 组织记忆 | 依赖片2 + N13 闭环，数据回流后 |
| 不接 GraphBridge 同步（ctx.graphBridge = null） | consult 路由当前无 GraphBridge 同步，接上会扩面；保持零行为变化，GraphBridge 同步归 ConversationEngine 路径 |
| 不改 scripts/、src/mcp/、electron/ | DSH 线，越界 |

## 4. 测试要求（测试优先）

**先写测试（red）→ 再实现（green）**。测试文件 `tests/routes/diagnosis-consult-events.test.ts`，≥3 expect，覆盖正常/降级/边界。

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 路由 | 单元（fake engine + 内存 SessionStore） | 4 | ① consult 走 DiagnosisLauncher 后 session_events 含 diagnosis_phase/module/report（red=现状直建引擎零事件 → green）；② SSE onEvent 透传仍触发（事件流不丢）；③ 无 db（orchestration.db 缺失）时降级不崩（无 sessionStore 跳过落流，诊断仍返回结果）；④ report 缓存 + GET /report 行为零回归 |

RED 必须覆盖失败模式（S-5）：现状（直建引擎）下 ① 断言「事件流含诊断事件」失败——这是真实的「绕过」事故场景（不经 launcher = 事件不落流），不是 happy-path red。

## 4.5 决策参考（S-12）

**决策点**：consult 路由用「完整 DiagnosisLauncher 替换」还是「在 onEvent 里内联 persistEvent」？

- 参考系：第一性原理（片2 目标 = 诊断过程可回放；DiagnosisLauncher 是唯一已实现的落流编排器）+ D487 dev doc（「不经 DiagnosisLauncher = 片2-B 范围」，语义即补上）+ S-14 无重复造轮子（内联 persistEvent 会复制 D487 逻辑）。
- 结论：**完整替换为 DiagnosisLauncher，graphBridge=null**（避免重复落流 + 避免 GraphBridge 同步扩面）。可选组件（evidenceCollector/corroborationEngine/hookRunner/eventBus）全 null，launcher 内部守卫降级。
- 风险如实声明：launcher 会额外发射 phase_started（phase 1）起始事件 + 契约门禁/安全门禁（轻量）；report 事件只落库不推 SSE——均为可接受、非破坏性变化。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| DiagnosisLauncher（已 export，D487） | src/routes/diagnosis.ts consult 路由 | `grep -rn "new DiagnosisLauncher" src/routes/diagnosis.ts` 命中 ≥1 生产调用点 |
| SessionStore.createSession | src/routes/diagnosis.ts | `grep -rn "createSession" src/routes/diagnosis.ts` 命中 |

接线为生产路径（SSE consult 真实触发），非测试调用。

## 6. 完成标准（DS1..DS8）

- DS1 接线：`grep -n "new DiagnosisLauncher" src/routes/diagnosis.ts` 命中，且 `grep -n "engine.runConsultation" src/routes/diagnosis.ts` 只剩 launcher 内部/原手工包装已移除（生产 consult 路径经 launcher）。
- DS2 会话装配：`grep -n "createSession\|SessionStore" src/routes/diagnosis.ts` 命中（sessionId 非空，事件不落 '' 桶）。
- DS3 测试全绿：`vitest run tests/routes/diagnosis-consult-events.test.ts` 4/4 pass，且 red 先行实证（实现前 ① 失败）。
- DS4 零回归：`vitest run tests/agent/diagnosis-session-events.test.ts` 全绿（launcher 回归，D487 5/5）；`tsc --noEmit` 零新增（相对当前 30 基线，30 条全在 `extensions/sentinels/_extinct/`）。
- DS5 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界（不碰 scripts/、mcp/、electron/、launcher、session-store）。
- DS6 as any=0：`grep -rn "as any" src/routes/diagnosis.ts` 零命中。
- DS7 无绕过：`grep -n "no-verify" .claude/bypass.log` 零命中。
- DS8 推送+CI：`git log origin/main..HEAD --oneline` 空 + CI 任务相关 job（TypeScript+Lint+Iron Laws / Vitest×2 / Architecture / Checker）绿（job 级）。

## 7. 自检清单

- [ ] 每个代码审计 claim 已 grep 实证（file:line），不是凭记忆
- [ ] 写集表符合 contract（标题后紧跟表格，文件级粒度）
- [ ] 测试 red→green + 非空壳 + 覆盖正常/降级/边界 + 失败模式 red
- [ ] DS1..DS8 机器可验证，命令真实
- [ ] §5 接线含 ≥1 生产调用点（非测试）
- [ ] 无越界（不碰 DSH/scripts/K3 audit）
- [ ] 隔离模型（S-15）：任务走独立 clone，主工作区 Codex 专用
- [ ] 不是凭记忆，不用 --no-verify

## 8. 交付声明（声称↔证据对照，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| consult 路由经 DiagnosisLauncher | grep -n "new DiagnosisLauncher" src/routes/diagnosis.ts | 命中 ≥1 |
| sessionId/sessionStore 已装配 | grep -n "createSession\|new SessionStore" src/routes/diagnosis.ts | 命中 |
| 测试全绿 | vitest run tests/routes/diagnosis-consult-events.test.ts | 4/4 pass |
| 零回归 | vitest run tests/agent/diagnosis-session-events.test.ts | 全 pass（D487 5/5） |
| as any = 0 | grep -rn "as any" src/routes/diagnosis.ts | 0 命中 |
| 范围一致 | git diff --name-only HEAD^ | 与写集一致无越界 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 0 命中 |
| 推送+CI | git log origin/main..HEAD --oneline | 空 |
