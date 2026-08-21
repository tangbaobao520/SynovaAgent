<!--
  SYNOVA-IMPL-D469: 事件溯源 session log（Stage1 S1-1 / 施工图 D1；原编号 D463 与 mac 线 GS-05 撞号，2026-08-21 改号 D469）
  状态: dev doc | 2026-08-21 | 优先级 P1
  权威文档: docs/plans/Stage1任务卡序列-20260820.md（S1-1/D1）; docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md §4/§5.3; AGENTS.md 铁律 11/24/31/47/48
  依赖: 无（地基卡，先行；施工图 §6 建议 D1 先行让 CFG 校准写回落事件流）
  并行: 与 S1-2~S1-6 无文件交集（本卡 src/store/ + src/orchestrator/，与哨兵/控制塔零重叠），可 worktree 隔离并行
-->

# SYNOVA-IMPL-D469 事件溯源 session log

## 1. 权威文档引用

* **Stage1 任务卡 S1-1【D1】**（`docs/plans/Stage1任务卡序列-20260820.md`）：SessionStore 增加 append-only 事件流 + deriveMessages() 投影 + model-visible⟺logged 运行时断言；不引 DSH 代码，消费方接口不变。
* **DSH 迁移施工图 §4 能力映射第 1 行 + §5.3 自进化 E2 前置**：补 C 线 S3-5（自诊断可信度）/ S0（信任建立）根因——没有可回放的真相流。
* **DSH 事件溯源范式（借鉴理念，证据 H-05）**：append-only SessionEvent log + deriveMessages 投影 + model-visible⟺logged 不变量。
* **AGENTS.md 铁律 11/24/31**（静默降级禁止/degraded 传播）、**47/48**（契约优先/测试非空壳）。
* **K3 审计 v2 教训（D354/D357 P1-1）**：交付声明表必须覆盖全部 DS（本 doc §8 已落实）。

## 2. 代码审计——现状

### 缺陷 A：会话存储是"写死的消息表"，无可回放事件流

* `src/store/session-store.ts:57 export class SessionStore`；`getMessages(sessionId)`（L205-213）直接 `SELECT * FROM agent_messages WHERE session_id=? ORDER BY id ASC`——消息是"存下来的快照"，不是"可回放的事件"。
* 无 append-only 事件日志表、无 deriveMessages 投影、无 model-visible⟺logged 不变量——会话历史不可回放、不可审计（C 线 S3-5 根因）。
* 消费方 `src/orchestrator/session-manager.ts:45 export class SessionManager`，`addMessage(msg)`（L56）只 push 内存数组、`getMessages()`（L60）返回内存副本——**没有持久化到事件流**；进程重启即丢（内存态）。

### 缺陷 B：model-visible 输入无"必落 log"纪律

* `src/agent/conversation-engine.ts` 通过 `sessionManager.addMessage`（L533）记录用户输入，但无断言保证"进模型的消息必已落日志"——模型看到的内容可能比日志多/少（model-visible⟺logged 不变量缺失）。

### 复用与冲突

* 复用：SessionStore 的 SQLite 连接（constructor L60）、agent_sessions/agent_messages 表、SessionManager 的 config 注入模式（constructor L49，bootstrap.ts:679 实例化）。
* 冲突：无（本卡不动 ConversationEngine 对外接口、不动 routes/）。

## 3. 实现方案

核心：借鉴 DSH 事件溯源范式自研——SessionStore 增加 append-only 事件日志 + deriveMessages 投影；SessionManager 把 addMessage 持久化为事件 + model-visible⟺logged 断言。

### 3.1 写集 (2 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/store/session-store.ts | 修改 | 新增 `session_events` 表（session_id/event_type/payload_json/created_at，append-only）；`appendEvent(sessionId, eventType, payload)` 写入；`deriveMessages(sessionId)` 从事件流投影 MessageRow[]（替代/backing getMessages）；事件写入失败 → log.error + degraded（铁律 24/31） |
| src/orchestrator/session-manager.ts | 修改 | `addMessage(msg)` 改为经 SessionStore `appendEvent` 持久化（config 注入 SessionStore）；新增 model-visible⟺logged 断言（每次 addMessage 后校验事件已落 log，未落 → log.error + degraded） |
| tests/store/session-event-log.test.ts | 新建 | 事件流测试（red→green） |
| tests/orchestrator/session-manager-eventlog.test.ts | 新建 | 持久化 + 断言测试（red→green） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（纯产品代码，非门禁/工具行为变化）；`src/store/` + `src/orchestrator/session-manager.ts` 与其他 Stage1 卡零交集，但并行必须 worktree 隔离（D307）。

### 3.2 最终实现同 commit 回填

若实现偏离方案（如 deriveMessages 最终改为"保留 agent_messages 快照 + 事件流双写"而非"纯事件投影"，或 SessionManager 注入方式不同），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事

* 不动 ConversationEngine 对外接口（capability seam：能力可换、消费方不动）。
* 不动 routes/（无 API 变更）。
* 不做 UI 回放视图（Trajectory 留后续）。
* 不引 DSH 包/代码（rc.5 破坏性变更承诺）。

## 4. 测试要求（测试优先）

第一步写测试（red），第二步实现（green）。red 必须覆盖失败模式（S-5）：

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | session-event-log.test.ts | ≥3 断言 | ① 事件 append 后 deriveMessages 投影与原始消息一致（修复前无事件流 → red）；② 半截事件（缺尾部）投影不崩、degraded 标记；③ 空事件流 → 空投影（边界） |
| 单元 | session-manager-eventlog.test.ts | ≥3 断言 | ① addMessage 后事件已落 SessionStore（修复前仅内存 → red）；② model-visible 消息必在事件 log（未落 → 断言报警）；③ 事件写入失败 → degraded 传播不静默 |

* red 基准：修复前 SessionManager.addMessage 仅内存 push（重启即丢）→ 测试断言"事件已持久化"失败（red）；修复后落事件流（green）。
* 测试非空壳：正常/降级/边界三态。

## 4.5 决策参考

* 决策点：deriveMessages 用「纯事件投影」还是「事件流 + agent_messages 快照双写」？
* 参考系：第一性原理——事件溯源的本质是"唯一事实源 = 事件流"，消息历史是派生视图，快照双写引入双源漂移；Anthropic——可回放真相流是审计/自诊断的前提，纯事件投影最干净；收敛——纯事件投影 + deriveMessages。
* 结论：纯事件投影（agent_messages 表可保留为迁移期兼容，但生产读取走 deriveMessages）。完成报告必含决策记录（K3 可核）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| SessionStore.appendEvent / deriveMessages | `session-manager.ts` addMessage 生产路径（经 bootstrap.ts:679 注入） | `grep -n "appendEvent\|deriveMessages" src/orchestrator/session-manager.ts` 命中 |
| SessionManager 事件持久化 | ConversationEngine（src/agent/conversation-engine.ts:533 addMessage）生产链路 | `grep -n "addMessage" src/agent/conversation-engine.ts` 命中（已存在，仅验证持久化传导） |

* 生产调用点必须（S-3）：appendEvent/deriveMessages 必须在 SessionManager 生产装配路径真实调用（bootstrap.ts:679 注入），测试调用不计；DS 里 grep 验证。

## 6. 完成标准

* DS1 测试绿：`npx vitest run tests/store/session-event-log.test.ts tests/orchestrator/session-manager-eventlog.test.ts` 全绿；red 先行已证（内存态 → 事件持久化）。
* DS2 事件流表：`grep -n "session_events" src/store/session-store.ts` 命中建表 + appendEvent。
* DS3 投影接线：`grep -n "deriveMessages" src/orchestrator/session-manager.ts` 命中生产调用（经 bootstrap 注入）。
* DS4 model-visible⟺logged：`grep -n "model-visible\|model_visible\|degraded" src/orchestrator/session-manager.ts` 命中断言 + 降级传播。
* DS5 零回归：`bash scripts/control-tower/baseline-check.sh` tsc/测试/审计三基线无新增。
* DS6 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界文件。
* DS7 无绕过：pre-commit 13 组全过，bypass.log 无 `--no-verify`；提交走 synova-commit。
* DS8 推送 + CI：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（job 级；npm audit/Architecture 预存失败单独标注）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格、格式符合 verify-parallel 契约
* [ ] 测试 red→green 覆盖失败模式（内存态丢事件 / model-visible 未落 log / 半截事件）
* [ ] 接线要求 ≥1 生产调用点（bootstrap.ts:679 注入，测试调用不计）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：纯产品代码，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| session_events 事件流表已建 | grep -n "session_events" src/store/session-store.ts | 命中建表 + appendEvent |
| deriveMessages 已接生产路径 | grep -n "deriveMessages" src/orchestrator/session-manager.ts | 命中生产调用 |
| model-visible⟺logged 断言生效 | grep -n "model-visible\|degraded" src/orchestrator/session-manager.ts | 命中断言 + 降级 |
| 测试全绿 | vitest run tests/store/session-event-log.test.ts tests/orchestrator/session-manager-eventlog.test.ts | 全 pass |
| 范围一致 | git diff --name-only HEAD^ | 与写集一致，无越界 |
| 零回归 | bash scripts/control-tower/baseline-check.sh | 无新增 |
| 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS8 一一对应，缺项显式 descope（S-10，K3 D354/D357 P1-1 教训）；依赖非空禁止并行开 session（S-7）；§3.2 最终实现同 commit 回填（S-6）。
