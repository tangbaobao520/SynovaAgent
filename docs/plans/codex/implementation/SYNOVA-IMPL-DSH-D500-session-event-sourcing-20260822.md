---
north-star:
  服务用户: FDE（诊断过程可回放、可审计——"上次诊断为什么得出这个结论"可追溯）+ 企业主（信任建立：系统说"现金流告警"时有据可查）+ 审计线（K3 可回放复核）
  服务场景: 会话/诊断过程目前是"存下来的快照"——消息存在 agent_messages 表、状态存在 state_json，但**没有可回放的真相流**：出了结论分歧，无法回答"当时的完整输入是什么"；进程崩溃后内存态会话直接丢失；S0 信任建立无根
  模块终态: SessionStore 持有 append-only 事件流（session_events 表）作为会话唯一事实源；消息历史从事件流 deriveMessages() 派生（model-visible ⟺ logged 不变量）；可回放审计 + fork/resume；事件写入失败显式 degraded（铁律 24/31）
  对齐北星: PRODUCT-BRIEF.md §五「全链路打通」+ §六 P0「诊断报告质量验证」——可信度是产品根基；施工图 §5.5 审计"事件溯源（D1/B1）落地后天然获得"
  完成标准: 入口 生产链路一次真实对话 → 处理 会话全程事件落 log → 结果 回放重建的消息历史与实际一致（测试断言）+ model-visible 输入未落 log 时断言报警（可验证）
  当前进度: SessionStore 是关系模型（sessions+agent_messages 表+FTS5，314 行）；SessionManager 是内存态（addMessage 只 push 数组，重启即丢）；ConversationEngine 经 sessionManager.addMessage 记录用户输入（conversation-engine.ts:616）；bootstrap.ts:679 实例化 SessionManager（无 SessionStore 注入）。缺口：无事件流、无 deriveMessages、无 model-visible⟺logged 断言
---

<!--
  SYNOVA-IMPL-DSH-D500: 事件溯源 session log（Stage1 D1，借鉴 B1；取代 Win 线 D469 草稿）
  状态: dev doc | 2026-08-22 | 优先级 P1（Stage1 序 1——派发文档序：D2→D3→D4→D1，D1 放最后因涉及 src/store 需 Win 协调）
  权威文档: 派发 Stage1-派发-devdoc-20260821.md Spec 1 + 施工图 DOC-0114 §4 能力映射/§5.3/§5.5 + 借鉴清单 B1 + dsh-session README + 2026-08-22 并发写缺陷研究
  依赖: 无（地基卡）；⚠️ 涉及 src/store（🔵 借 DSH 层，归 Win），写集需与 Win 核对——编码实现前必须 grep 确认 src/store 归属
  并行: 与 D472（D2）/ D474（D3，原 D470）/ D473（D4）零文件交集（本卡 src/store/ + src/orchestrator/session-manager.ts + src/agent/conversation-engine.ts 只读）
  取代: D469（Win 线 8-21 草稿，gatekeeper FAIL：缺 C3/C4 章节、无 north-star、未登记 task-state）——本 doc 为 D1 正式 spec
-->

# SYNOVA-IMPL-DSH-D500: 事件溯源 session log

> 一句话问题: 会话存储是"写死的消息表"不是"可回放的事件流"——`getMessages()` 直接 `SELECT * FROM agent_messages`（session-store.ts:205），消息是快照不是事件；SessionManager 只 push 内存数组（session-manager.ts:57），进程重启即丢。C 线 S3-5（自诊断可信度）+ S0（信任建立）的根因是"没有可回放的真相流"。借鉴 dsh-session 范式（B1：append-only 事件流 + deriveMessages + model-visible⟺logged），自研事件日志层，**不引 DSH 包**（施工图 R1：Stage 3 前零 DSH 代码依赖）。

## 1. Authority Doc Verification

**来源**: [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 1 / D1）

> Spec 1：D1 事件溯源 session log（借鉴 B1）。借鉴点 dsh-session 的 append-only 事件流 + `deriveMessages()` + surface 投影；落地对象 `src/store/session-store.ts`（现状：sessions 表 + messages 表关系模型，需增加 append-only 事件流）；补缺口 S3-5（自诊断可信度）+ S0（信任建立）；验收 append-only 事件流 + 消息从事件派生 + 可回放。⚠️ 涉及 src/store（🔵 借 DSH 层，归 Win），写集需与 Win 核对，dev-doc 先出 spec，编码实现前 grep 确认 src/store 归属。

**来源**: [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§4 能力映射第 1 行 + §5.3 E2 前置 + §5.5 审计）

> 会话存储 → core/session（事件溯源，model-visible⟺logged）：Stage 1 借鉴理念自研；Stage 3 后换实现。E2 前置：事件溯源可回放（D1）+ snapshot 可复现（D3）。§5.5 审计四要素之"审计"：✅ 事件溯源（D1/B1）落地后天然获得。

**来源**: [第六章借鉴清单 B1](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)（6.1 表 B1 行）

> 事件溯源 session log + model-visible⟺logged：唯一事实源、可回放审计、可 fork/resume——补 S3-5（自诊断可信度）+ S0（信任建立）的根因。落地方式：Synova 的 SessionStore 增加 append-only 事件流 + deriveMessages。

**来源**: [dsh-session README](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/README.md)

> Event-sourced session log：A `Session` is the append-only source of truth——the LLM message history is *derived* from it. `deriveMessages()` incrementally projects each new surface entry once. `model-visible ⟺ logged`。崩溃修复：`TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` 合成结果（不静默）。

**来源**: [并发写入 seq 乱序缺陷研究](docs/synova/research/SYNOVA-RESEARCH-DSH-会话并发写入seq乱序缺陷-20260822.md)（2026-08-22，DSH 实测教训）

> DSH rc.8 崩溃恢复并发写导致事件 seq 乱序落盘 → resume 失败（DeepSeek API 拒绝）。教训：① seq 必须单调（禁止回退）② 崩溃恢复基于持久化 lastSeq 而非内存回滚 ③ 并发写须 per-session 串行 ④ tool_call↔tool/result 顺序校验。**Synova 自研事件流必须内建这四条防线的测试**（S-5 失败模式覆盖）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（11/24/31 降级 + 0-2 接线 + 47/48 契约）

> 铁律 24/31: catch 必须有 log + degraded；静默降级禁止。事件写入失败 → log.error + degraded: true（显式，不静默）。

## 2. Problem Statement

C 线 S3-5（自诊断可信度，P0-block 已转交：完成度误判）+ S0（信任建立）的根因：**没有可回放的真相流**。三个具体断点：

1. **消息是快照不是事件**：`src/store/session-store.ts:205-213` `getMessages()` 直接查 `agent_messages` 表——存的是"当时的消息副本"，不是"发生了什么"的可回放记录。改坏/丢失消息 = 无法恢复真相（S3-5 根因）。
2. **会话态不持久**：`src/orchestrator/session-manager.ts:56-57` `SessionManager.addMessage()` 只 `this.messages.push(msg)`（内存数组，:57 实测）——进程重启即丢；ConversationEngine 经 `sessionManager?.addMessage()`（conversation-engine.ts:616）记录用户输入，但无任何持久化落点（模型看到的 ≠ 日志有的，model-visible⟺logged 不变量缺失）。
3. **无审计路径**：`bootstrap.ts:679` 实例化 SessionManager（无 SessionStore 注入）——会话数据与存储层脱节；K3 复核"当时输入是什么"无从下手。

对齐北星：可信度是产品根基（PRODUCT-BRIEF §六 P0「诊断报告质量验证」）——事件流是"让系统自我证明"的地基。

## 3. Current State（2026-08-22 grep/read 实测）

### 3.1 已存在（复用不重造）

| 资产 | 位置 | 状态 |
|------|------|------|
| SessionStore 类 | `src/store/session-store.ts:57` | ✅ SQLite 连接 + agent_sessions/agent_messages 表 + FTS5 + WAL |
| addMessage/getMessages | `session-store.ts:198-213` | ✅ 关系模型写入/读取 |
| 诊断检查点 | `session-store.ts:276-313` | ✅ 崩溃恢复雏形（saveDiagnosisCheckpoint） |
| SessionManager 类 | `src/orchestrator/session-manager.ts:45-60` | ✅ 内存态 + 压缩逻辑（Iter 6） |
| 生产实例化 | `src/deploy/bootstrap.ts:679` | ✅ `new SessionManager()`（无注入） |
| ConversationEngine 消费 | `src/agent/conversation-engine.ts:616` | ✅ `sessionManager?.addMessage({role:'user',...})` |
| SessionStore 其他消费者 | `data-lifecycle-service.ts:50/73/90` + `knowledge-agent.ts:489` + `cli.ts:72` + `data-purger.ts:84` | ✅ 列表/状态消费（不受影响） |
| **SessionStore.addMessage 直连生产调用方（8 处，双写下沉后自动受益）** | `cli.ts:143/209/228` + `im-inbound.ts:144/196` + `graceful-shutdown.ts:129` + `stuck-session-detector.ts:101` + `restart-recovery.ts:120` | ✅ 2026-08-22 实测——事件流双写下沉到 addMessage 内部后，这 8 处无需逐个修改 |

### 3.2 缺陷 A（P1）: 无 append-only 事件流

`session-store.ts` 无 `session_events` 表、无 `appendEvent`、无 `deriveMessages`。消息以关系行存储（可 UPDATE/DELETE 的 mutable 快照），非 append-only。

### 3.3 缺陷 B（P1）: SessionManager 内存态，重启即丢

`session-manager.ts:57` `this.messages.push(msg)`——无持久化。ConversationEngine:616 写入的内存消息在进程重启后消失，会话历史不可重建（与 agent_sessions 表脱节）。

### 3.4 缺陷 C（P1）: model-visible⟺logged 不变量缺失

无任何断言保证"进模型的消息必已落日志"。模型上下文与持久化日志可以漂移（多/少/不一致）——S3-5"完成度误判"的机制根源。

## 4. What We Build

### 4.1 写集 (4 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/store/session-store.ts](src/store/session-store.ts) | 修改 | ① 新增 `session_events` 表（session_id/seq/event_type/payload_json/created_at，append-only，seq 单调 + UNIQUE(session_id, seq)）② **`addMessage()` 内部双写**：写 agent_messages（现有，兼容）+ appendEvent 写 session_events——**8 处直连调用方（cli/im-inbound/graceful-shutdown/stuck-session-detector/restart-recovery）自动获得事件流，无需逐个改调用方**（缺陷 A/B）③ `deriveMessages(sessionId)`：从事件流投影 MessageRow[]（backing getMessages）④ 崩溃恢复：基于持久化 lastSeq 续写（不内存回滚），缺陷 A/B/C |
| [src/orchestrator/session-manager.ts](src/orchestrator/session-manager.ts) | 修改 | ① 注入 SessionStore（constructor 可选参数，兼容 bootstrap 无注入的现状）② `addMessage(msg, sessionId?)` 双写：内存数组（现逻辑，压缩用）+ 经 sessionStore.addMessage 持久化（若注入且传 sessionId）③ 新增 model-visible⟺logged 断言：每次 addMessage 后校验事件已落 log，未落 → log.error + degraded（缺陷 C） |
| [src/agent/conversation-engine.ts](src/agent/conversation-engine.ts) | 修改 | sessionId 传参：`sessionManager?.addMessage(msg, sessionId)`（现 :616 无 sessionId → 事件无归属；conversation-engine 已有 this.sessionId 字段 :358/:408，缺陷 B 接线） |
| [src/deploy/bootstrap.ts](src/deploy/bootstrap.ts) | 修改 | **生产装配（2026-08-22 实现补充——写集表初始未列，§8 架构边界已预示"SessionManager 经 bootstrap 注入 SessionStore 不触门禁"）**：`new SessionManager({}, new SessionStore(db))` 注入事件存储——无此装配则生产路径事件流不生效（铁律 4 交付不完整） |
| [tests/store/session-event-log.test.ts](tests/store/session-event-log.test.ts) | 新建 | 事件流测试（red→green，见 §5） |
| [tests/orchestrator/session-manager-eventlog.test.ts](tests/orchestrator/session-manager-eventlog.test.ts) | 新建 | 持久化 + 断言测试（red→green，见 §5） |


> **接力登记（2026-08-28, D487）**：本卡写集（session-store / conversation-engine / bootstrap 等）由 **D487 GA 诊断会话事件化装配（D394 片2-A）** 串行继承演进——本卡已合入 origin/main（写集全部落地，V5.0.1 惯例：已交付任务的写集被后继任务继承是串行演进，非并行冲突）。D487 在 D500 地基（session_events/appendEvent/deriveMessages 不变量）上做生产装配，未重建、未回退任何 D500 交付。见 [SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md](SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md)。
> ⚠️ **Win 协调（S-7/S-8 共享资源标注）**：`src/store/session-store.ts` 按 TASK-ROUTING §一归 Win Claude（src/ 除 sentinel/cron/mcp 外）；派发文档 Spec 1 明示"涉及 src/store 归 Win，写集需与 Win 核对"。编码实现前：① 编码 session 先 grep `src/store/` 当前认领状态（check 是否有 Win 在途改动）② 与 Win 核对写集（本卡 5 文件 vs Win 在途工作区）③ 核对通过才开工。`conversation-engine.ts` 本卡只读 + 一行传参（:616），风险最低。
>
> **事件写入下沉决策（2026-08-22 实测修正）**：SessionStore.addMessage 直连生产调用方 8 处（cli.ts:143/209/228、im-inbound.ts:144/196、graceful-shutdown.ts:129、stuck-session-detector.ts:101、restart-recovery.ts:120）——若只在 SessionManager 层做双写，这些路径产生的事件流缺失（model-visible⟺logged 在这些路径断裂）。修正：**双写下沉到 SessionStore.addMessage 内部**，SessionManager 注入后经同一路径，全部调用方自动获得事件流。

### 4.2 修复模式

**session_events 表（session-store.ts initSchema 追加）**:

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,                    -- 单调递增，崩溃恢复基于持久化 lastSeq
  event_type TEXT NOT NULL,                -- 'user_message' | 'assistant_message' | 'tool_result' | 'system'
  payload_json TEXT NOT NULL,              -- { role, content, toolCallId?, name? }
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, seq)                  -- 物理防 seq 重复（2026-08-22 并发写缺陷教训①）
);
CREATE INDEX IF NOT EXISTS idx_session_events_sess ON session_events(session_id, seq);
```

**appendEvent（seq 单调 + 并发防线）**:

```ts
/**
 * appendEvent — append-only 事件写入
 * 契约:
 *   @input  — sessionId, eventType, payload
 *   @output — { ok: true, seq } | { ok: false, degraded: true, error }（写入失败显式降级，铁律 24/31）
 *   @error  — UNIQUE(session_id, seq) 冲突 → log.error + degraded（并发防线，seq 不重放）
 *   崩溃恢复: 续写基于 SELECT MAX(seq)（持久化 lastSeq），禁止内存 seq 回退（2026-08-22 教训②）
 */
```

**deriveMessages（事件流 → 消息投影）**:

```ts
/**
 * deriveMessages — 从事件流投影消息历史
 * 契约:
 *   @input  — sessionId
 *   @output — MessageRow[]（按 seq 排序；投影 message/tool_result 两类 surface 事件，log-only 跳过）
 *   @degraded — 事件流含损坏 payload（半截）→ log.warn + 返回可重建前缀 + degraded: true（铁律 24）
 *   空事件流 → []（边界）
 *   model-visible ⟺ logged: 投影输出 = 模型看到的输入（不变量，测试断言）
 *   ⚠️ 2026-08-22 实现修正：tool_result 事件投影为 assistant 角色（非 "tool"）——
 *      Synova 消息契约 MessageRow.role = system|user|assistant（agent_messages 表 CHECK 同），
 *      conversation-engine 用 assistant 承载工具结果，无独立 tool 角色；对齐现有模型避免类型膨胀。
 */
```

**SessionStore.addMessage 内部双写（session-store.ts:198 改造——事件下沉，8 处直连调用方自动受益）**:

```ts
addMessage(sessionId: string, role: MessageRow['role'], content: string): void {
  this.db.prepare('INSERT INTO agent_messages (session_id, role, content) VALUES (?,?,?)')
    .run(sessionId, role, content);  // 现有写路径保留（兼容 + FTS5 触发器依赖）
  // 事件流双写（2026-08-22 修正：下沉到存储层，cli/im-inbound 等 8 处直连调用方无需逐个改）
  const res = this.appendEvent(sessionId, 'message', { role, content });
  if (!res.ok) {
    log.error({ sessionId, role }, 'appendEvent 双写失败 — model-visible⟺logged 断裂');
    this.lastDegraded = true;  // 降级信号传播（铁律 31），调用方检查
  }
  this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=?')
    .run(new Date().toISOString(), sessionId);
}
```

**SessionManager 注入 + 断言（session-manager.ts:57 改造）**:

```ts
addMessage(msg: Message, sessionId?: string): void {
  this.messages.push(msg);  // 内存态保留（压缩逻辑依赖）
  if (sessionId && this.sessionStore) {
    this.sessionStore.addMessage(sessionId, msg.role as 'user' | 'assistant', msg.content);
    // model-visible⟺logged 断言: 进模型的必已落 log（addMessage 内部双写，未落 → store.lastDegraded）
    if (this.sessionStore.lastDegraded) {
      log.error({ sessionId, msg: msg.role }, 'model-visible⟺logged 断言失败 — 事件未落 log');
      this.degraded = true;  // 降级信号传播（铁律 31）
    }
  }
}
```

### 4.3 不做的事

| 不做 | 原因 |
|------|------|
| 删 agent_messages 表 / 双写 | 迁移期兼容（D469 决策：agent_messages 保留为迁移期兼容，生产读取走 deriveMessages）；删除归 Stage 4 切换 |
| 做 surface 压缩/compaction 投影 | dsh-session 的 surface 层是完整范式，本卡只做事件流+派生最小闭环（E2 前置接缝）；压缩留后续 |
| 做 fork/resume API | dsh-session 有 fork 范式；本卡只建"可回放"地基，fork 留后续（施工图 §5.3 接缝已预留） |
| 改 FTS5 搜索 / 诊断检查点 | 已有功能不碰（搜索读 agent_messages_fts，检查点读 diagnosis_checkpoints——保持现状） |
| 引 DSH 包 | R1 红线：Stage 3 前零 DSH 代码依赖，本卡纯自研 SQLite 事件表 |
| 改 routes/ API | 无 API 变更（消费方接口不变，capability seam） |

## 5. Test Requirements（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建两个测试文件，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| L1 appendEvent：写入事件 → deriveMessages 投影与原始消息一致 | 无事件流 → 投影不存在（red） | 一致 |
| L1 seq 单调：连续 append 3 条 → seq = 1,2,3（无回退） | 无事件流 | 1,2,3 |
| L1 seq 冲突：手动插重复 seq → 显式 degraded（不静默覆盖） | 无约束 | 冲突拒绝 + degraded |
| L1 崩溃恢复：模拟内存回退（lastSeq=3 再写 seq=2）→ 按持久化 lastSeq 续写 4 | 无恢复逻辑 | 续写 4 |
| L1 半截事件：事件流缺尾部 → 投影不崩 + degraded: true | 无投影 | 可重建前缀 + degraded |
| L1 空事件流 → 空投影（边界） | 无投影 | [] |
| L1 addMessage 双写：`store.addMessage(sessionId, role, content)` 后 session_events 有对应事件（直连路径自动受益） | 仅写 agent_messages | 双写命中 |
| L1 直连调用方：模拟 cli/im-inbound 直连 `store.addMessage` → 事件流产生（无需改调用方） | 无事件流 | 事件流产生 |
| L1 model-visible⟺logged：SessionManager addMessage 后事件已落 SessionStore | SessionManager 仅内存 push（重启即丢）→ 断言失败 | 已落 |
| L1 断言失败：模拟双写失败 → log.error + degraded 标记（不静默） | 无断言 | degraded |
| L1 回归：getMessages 输出与 deriveMessages 一致（backing 语义） | — | 一致 |
| L2a 接线：ConversationEngine:616 addMessage 传 sessionId → 事件可归属 | 无 sessionId → 事件无归属 | 归属 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥12 | 上述 12 用例（正常/降级/边界/并发防线/直连双写/断言/回归） |
| L2a | 接线 | 1 | ConversationEngine addMessage(sessionId) 生产调用 |

## 6. Wiring Verification

| 新 export/函数 | 生产调用点 | 确认方式 |
|---------------|-----------|---------|
| SessionStore.addMessage 双写（appendEvent 下沉） | 8 处直连生产调用方（cli/im-inbound/graceful-shutdown/stuck-session-detector/restart-recovery）+ session-manager 注入路径 | `grep -n "appendEvent" src/store/session-store.ts` 命中（addMessage 内部调用，非仅定义） |
| SessionStore.deriveMessages | **getMessages 内部调用（backing 语义）→ data-exporter 等生产读取路径**（2026-08-22 复核修复：原 deriveMessages 零生产消费方，仅测试调用；现 getMessages 改走 deriveMessages，消息真相统一从事件流派生） | `grep -n "deriveMessages" src/store/session-store.ts` 命中定义 + `grep -n "return this.deriveMessages" src/store/session-store.ts` 命中 getMessages 内调用 |
| SessionManager 事件持久化 | ConversationEngine:616 addMessage(msg, sessionId) | `grep -n "addMessage" src/agent/conversation-engine.ts` 命中（含 sessionId 实参） |
| model-visible⟺logged 断言 | session-manager.ts addMessage 内 | `grep -n "degraded\|model-visible" src/orchestrator/session-manager.ts` 命中 |
| 生产装配 | bootstrap.ts:679 注入链 | `grep -n "new SessionManager\|SessionStore" src/deploy/bootstrap.ts` 命中（确认注入方式） |

> ⚠️ **2026-08-22 复核降级声明（S-10，子代理 C13307E1 交叉审查确认）**：ConversationEngine 的 sessionManager 注入在**生产为悬空 seam**——5 个引擎实例化点（cli.ts:118 / mcp/index.ts:222 / im-inbound.ts:180 / conversation-engine.ts:783 fromState / tui-v2:41）均未传带 SessionStore 的 SessionManager（tui-v2 传的 SessionManager 无 store；bootstrap:682 的注入无 ConversationEngine 消费）。**生产事件流实际生效路径 = 8 处直连 store.addMessage（cli/im-inbound 等，双写下沉覆盖）**；engine 内部消息（reply 等）走 engine.messages 数组不落事件流。conversation-engine.ts:617 传 sessionId 为**能力预留 seam**（engine 注入 sessionManager 时生效）。engine 全量装配归后续任务（需改 4 入口传 store，超本卡写集）。

## 7. Test Requirements（契约明细，铁律 47/48）

### 7.1 L1 单元契约 — session-event-log.test.ts + session-manager-eventlog.test.ts（≥12 用例）

- 正常路径：append→derive 一致；seq 单调；getMessages 与 deriveMessages 一致；addMessage 双写命中
- 降级路径：写入失败 → degraded:true + log；半截事件 → 可重建前缀 + degraded
- 边界条件：空事件流；seq 冲突；崩溃恢复续写；直连调用方（cli/im-inbound 模式）双写
- 失败模式覆盖（S-5）：seq 回退（2026-08-22 缺陷①）/ 恢复重放（缺陷②）/ 断言静默（缺陷③）/ 内存态丢失（缺陷 B）/ 直连路径漏写（broken 下沉）

### 7.2 L2a 接线契约

- conversation-engine.ts:616 addMessage 带 sessionId 实参（grep 断言）
- session-manager 构造注入 SessionStore（bootstrap.ts:679 或等效装配点）

### 7.3 L2b 降级契约

- appendEvent 失败 → SessionManager.log.error + degraded 标记（铁律 24/31，不静默）
- deriveMessages 半截事件 → log.warn + 可重建前缀 + degraded（不假装完整）

### 7.4 L2c 边界契约

- 空事件流 → []（不崩）
- seq 冲突（并发写）→ UNIQUE 拒绝 + degraded（不覆盖）
- 未注入 sessionStore 的 SessionManager（现状 bootstrap:679 无注入）→ addMessage 走内存态不回退（向后兼容）

## 8. Architecture Layer

**L5（存储层）→ 消费方 L2（编排）**。依据：
- `src/store/session-store.ts` = L5 存储（SQLite，铁律 39：L5 → L4）
- `src/orchestrator/session-manager.ts` = L2 编排（ConversationEngine 子组件）
- `src/agent/conversation-engine.ts` = L2（本卡只读 + 一行传参）
- 施工图 §3.2：src/store 归 🔵 借 DSH（Stage 1 借鉴范式，Stage 3 后换实现）——本卡是范式自研，不引包
- **架构边界实测（2026-08-22 修正）**：`check-architecture.sh` 只查 L2→L4（agent/orchestrator import l4/）、L1→L3/L4/L5、L3→L5（直接 db 操作）——**不查 L2→L5**（orchestrator import store/ 不在检测范围，grep 实证 scripts/check-architecture.sh 无 L2→L5 规则）。且现有代码已有 L3→L5 先例（data-lifecycle-service.ts:50 `new SessionStore(getDatabase())`）。SessionManager 经 bootstrap 注入 SessionStore 不触发现有架构门禁，无需 L4 桥接。

## 9. Completion Standard（DS 与 dev doc 一一对应，禁重编号/跳号/静默缺项——S-10）

1. DS1: `tests/store/session-event-log.test.ts` + `tests/orchestrator/session-manager-eventlog.test.ts` 全过（≥12 用例；red 已证——内存态无事件流在修复前断言失败）
2. DS2: session_events 表——`grep -n "session_events" src/store/session-store.ts` 命中建表 + UNIQUE(session_id, seq)
3. DS3: appendEvent——`grep -n "appendEvent" src/store/session-store.ts` 命中定义 + seq 单调（测试断言 1,2,3）
4. DS4: deriveMessages——`grep -n "deriveMessages" src/store/session-store.ts` 命中定义；投影与 getMessages 一致（测试断言）
5. DS5: 崩溃恢复——基于持久化 lastSeq 续写（测试断言：内存回退后续写 4）
6. DS6: seq 冲突防线——重复 seq → 拒绝 + degraded（测试断言，2026-08-22 教训①）
7. DS7: addMessage 双写下沉——`grep -n "appendEvent" src/store/session-store.ts` 命中 addMessage 内部调用（8 处直连调用方自动受益，测试断言 cli/im-inbound 模式双写命中）
8. DS8: model-visible⟺logged——SessionManager addMessage 落 log + 断言失败 → log.error + degraded（grep + 测试断言）
9. DS9: 接线——conversation-engine.ts:616 addMessage 带 sessionId（grep 断言，✅）；SessionManager 注入链在 bootstrap 生产路径（✅ bootstrap:682 注入 store）。**2026-08-22 复核降级**：ConversationEngine 的 sessionManager 注入为**能力预留 seam**（5 个引擎实例化点未传带 store 的 SessionManager，生产事件流经 8 处直连 store.addMessage 生效）——详见 §6 降级声明
10. DS10: 零回归——`bash scripts/control-tower/baseline-check.sh` 无新增失败；现有会话/搜索/检查点测试全绿
11. DS11: 写集一致——`git diff --name-only HEAD^` 与 §4.1 写集一致，无越界文件
12. DS12: 无绕过——pre-commit 13 组全过、bypass.log 无 `--no-verify`
13. DS13: 完成报告含决策记录（§4.2 事件表 schema/双写下沉/崩溃恢复三处模式选择的参考系与结论，S-12）+ **Win 协调记录**（与 Win 核对 src/store 写集的过程与结论）——K3 可核

> 交付声明必须覆盖以上 DS1-DS13 全部并标注状态（✅/⏸/❌+理由）；禁止重编号/跳号/静默缺项。

## 10. Auth Doc References

- [Stage1 派发文档](docs/synova/coordination/Stage1-派发-devdoc-20260821.md)（Spec 1 / D1）
- [DSH 迁移施工图](docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md)（§4 / §5.3 / §5.5）
- [第六章借鉴清单 B1](docs/synova/research/Harness研究与Synova战略再定位-20260816/第六章-借鉴清单与走出自己的特色-20260816.md)
- [dsh-session README](/Users/wane/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/README.md)
- [并发写入 seq 乱序缺陷研究](docs/synova/research/SYNOVA-RESEARCH-DSH-会话并发写入seq乱序缺陷-20260822.md)
- [session-store.ts](src/store/session-store.ts) / [session-manager.ts](src/orchestrator/session-manager.ts) / [conversation-engine.ts](src/agent/conversation-engine.ts) / [bootstrap.ts](src/deploy/bootstrap.ts)
- TASK-ROUTING.md §一（src/store 归 Win——协调标注）§四（Stage 1 归 Mac DSH 派发）
- AGENTS.md 铁律 11/24/31/39/47/48

## 11. 自检清单

- [x] session-store.ts 关系模型实测（getMessages:205 / addMessage:198 / 无事件表）
- [x] SessionManager 内存态实测（session-manager.ts:57 push，无持久化）
- [x] bootstrap.ts:679 实例化实测（new SessionManager() 无注入）
- [x] ConversationEngine:616 addMessage 实测（无 sessionId 实参；**已有 this.sessionId 字段 :358/:408，传参可行**）
- [x] SessionStore 消费者盘点（data-lifecycle/knowledge-agent/cli/data-purger——本卡不动）
- [x] **SessionStore.addMessage 直连调用方 8 处实测（cli/im-inbound/graceful-shutdown/stuck-session-detector/restart-recovery）——双写下沉决策依据（2026-08-22 修正）**
- [x] **check-architecture.sh 无 L2→L5 规则实测（只查 L2→L4/L1→L3/L4/L5/L3→L5）——架构边界结论修正（2026-08-22）**
- [x] dsh-session README 精读（deriveMessages / model-visible⟺logged / TOOL_NOT_STARTED 崩溃修复）
- [x] 2026-08-22 并发写缺陷研究融入（四条防线全进测试，S-5）
- [x] D469 草稿取代声明（gatekeeper FAIL 实跑验证：C3/C4 阻断）
- [x] 决策参考已记录（§4.2 三决策点 + 双写下沉 + Win 协调记录要求）
- [x] 测试 red→green 覆盖失败模式（S-5：seq 回退/恢复重放/断言静默/内存丢失/直连路径漏写）
- [x] DS 与 dev doc 一一对应（DS1-DS13）；写集表标题紧跟表头（D381 格式契约）
- [x] 与 D472/D474（原 D470）/D473 写集零交集（并行安全，S-7/S-8）；src/store Win 协调已标注
- [x] 不是凭记忆；不用 --no-verify

## 12. 复核修复记录（2026-08-22 impl 后独立复核 + 子代理 C13307E1 交叉审查，commit 214ac7f2 + 复核提交）

> 创始人要求交付后批判性复核。发现并修复 4 个真实问题 + 1 个诚实降级（K3 可核）:

1. **降级信号粘滞（高）**：`store.lastDegraded` / `manager.degraded` 一旦置 true 永不重置——一次 transient 失败（磁盘满/约束）后，后续成功写入仍持续误报 degraded，污染 model-visible⟺logged 断言。修复：成功路径重置（commit 214ac7f2）。
2. **deriveMessages 零生产消费方（高）**：事件日志"生产端只写不读"——deriveMessages 仅测试调用，dev doc §6 "在生产读取路径被调用"声称不成立。修复：getMessages 改走 deriveMessages（backing 语义），data-exporter 等生产读取路径统一从事件流派生消息真相。
3. **seq 冲突测试声称≠实测（中）**：原"seq 冲突"测试从未构造真实冲突（appendEvent 自动 MAX+1 永不冲突）。修复：补真实 UNIQUE 约束冲突测试（直接 SQL 插重复 seq → 物理拒绝 + 原事件不覆盖）。
4. **断言分支未测（中）**：manager 断言失败测试只走 catch 分支（FK 首写失败），store.lastDegraded→manager 断言分支（:83-86）未覆盖。修复：补 drop 表 → appendEvent 失败 → manager 断言分支测试。
5. **engine 悬空 seam（诚实降级）**：ConversationEngine 的 sessionManager 注入在生产无消费方（5 个引擎实例化点均未传带 store 的 SessionManager）——生产事件流经 8 处直连 store.addMessage 生效；engine 内部消息事件化归后续装配任务。§6/§9 声明已降级标注。
