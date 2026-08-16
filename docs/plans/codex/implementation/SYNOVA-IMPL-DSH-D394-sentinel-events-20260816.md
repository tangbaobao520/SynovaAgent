---
north-star:
  服务用户: 企业主 + FDE（哨兵发现/信号/工单在进程重启后不丢，kill -9 也能恢复完整状态）+ 实现线（任何 finding 可追溯到产生它的输入事件）
  服务场景: 哨兵 7×24 巡检跑出 finding/信号/工单，但状态只存 runner 内存 Map——进程崩溃/重启即丢，企业主刚看到的告警一重启就"消失"。本模块把 finding/signal/ticket 状态迁移全部落 append-only 事件流，内存态变事件流物化投影，启动重放重建
  模块终态: 哨兵状态事件溯源化——`sentinel_events` append-only 表（L5）是唯一写入口；runner 内存态 = 事件流投影；kill -9 重启后 `GET /api/sentinel/findings` 与崩溃前一致（I1 可重建/I2 单源/I3 可审计三条 invariant 全满足）
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检：25 个哨兵 7×24 自动跑 → 发现异常 → 对比基线 → 信号路由给专家 → 严重信号自动建工单」+ §六 P0「哨兵真实数据流：表建了但空着」——findings 持久化让真实数据流不因重启蒸发
  完成标准: 入口 `npm run dev` 启动 → 处理 触发哨兵 → kill -9 → 重启 → 重放事件流 → 结果 `GET /api/sentinel/findings` 输出与 kill 前一致 + 事件表 `seq` 单调无洞（SQL 可验）+ sentinel-service.ts:97 durationMs 当时间戳 bug 修复（checkedAt 不再恒 1970）
  当前进度: runner.ts `records` 为纯内存 Map（L125），findings 重启即丢；`sentinel_tickets` 已落库但 findings/signals 未持久化；sentinel-service.ts:97 用 durationMs 当时间戳 → checkedAt 恒 1970-01-01（K3 咨询 §4.1 + 08-14 全链路审计 findings 持久化分裂判定）
---

<!--
  SYNOVA-IMPL-DSH-D394: 哨兵 findings 事件化（片 1）— sentinel_events append-only 表 + 事件流投影 + durationMs bug 修复
  状态: dev doc | 2026-08-16 | 优先级 P0-片1（K3 战略咨询 §4.1 改切片）
  权威文档: K3 战略咨询 2026-08-16-D394-D398-strategy-consult.md §4.1（三条 invariant I1/I2/I3 + 形似神不似预警 + 验收锚点，已落 task-state/D394.json）+ K3 08-14 全链路审计（findings 持久化分裂）+ AGENTS.md 铁律 0-2/24/31/32/39/47/48
  依赖: 无（片 2 诊断会话事件化依赖 D355-D360 契约稳定，本片 1 不依赖；与 D355-D360 不同表不同代码路径）
  并行: 无（独占 src/sentinel/runner.ts + src/agent/sentinel-service.ts + 新增 src/sentinel/sentinel-events.ts；与 D396/D395/D402 写集零重叠，见 §3.3）
-->

# SYNOVA-IMPL-DSH-D394: 哨兵 findings 事件化（片 1）— 事件溯源 + durationMs bug 修复

> 一句话问题: 哨兵 findings/信号/工单的状态迁移**只在 runner 内存 `records` Map 里**（[runner.ts L125](src/sentinel/runner.ts:125) `private records = new Map<string, SentinelRunRecord[]>()`）——进程崩溃/重启即丢，企业主刚看到的告警一重启就"消失"。K3 咨询 §4.1 判定：必须事件化，内存态变事件流物化投影，启动重放重建；否则 events 表沦为"没人读的日志副本"（形似神不似预警）。附带修 sentinel-service.ts:97 durationMs 当时间戳 bug（checkedAt 恒 1970-01-01）。

## 1. 权威文档引用

**来源**: [K3 战略咨询](docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md)（§4.1，锚点已落 [task-state/D394.json](task-state/D394.json)）

> 哨兵 findings + 信号事件化：`src/sentinel/runner.ts`（findings 目前只在内存 records，重启即丢）→ 新增 `sentinel_events` append-only 表（L5），finding/signal/ticket 状态迁移全部事件写入；runner 内存态变事件流物化投影，启动重放重建。**三条 invariant**：I1 可重建（kill -9 后重启，事件流重建状态与崩溃前等价）；I2 单源（状态只有事件流一个写入口，读路径全部从事件流或其投影派生）；I3 可审计（任何 finding 能从事件流回答「由哪些输入事件产生」）。**形似神不似预警**：双写 messages+events、读路径不动 → events 表沦为没人读的日志副本 → 三个月后数据漂移无人发现。附带修 `src/agent/sentinel-service.ts:97` durationMs 当时间戳 bug（恒 1970-01-01）。

> §4.6（第 6 项发现，并入片 1）：「findings 时间戳与生命周期正名」——K3 08-14 审计记录的两个小而致命的缺陷，不属于任何现有 D 任务：① `src/agent/sentinel-service.ts` 把 durationMs 当 checkedAt 时间戳（当前 :97；恒 1970-01-01）；② **findings 无生命周期状态**（open/acknowledged/resolved 在 tickets 表有，findings 本身无）。建议并入 D394 片 1 一起做（同一批代码路径），不独立立项。

**来源**: [K3 08-14 全链路审计](docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)（findings 持久化分裂）

> 活运行证明 L3 计算能力本身是真的，断裂在数据进出两端……哨兵 findings 只在内存，重启即丢。

**来源**: [AGENTS.md 铁律](AGENTS.md)（24 异常处理 / 31 降级信号传播 / 32 错误分类 / 39 五层架构 / 47 契约优先 / 48 测试非空壳）

> 铁律 39: L5 存储层只被 L4 依赖。本任务 sentinel_events 表属 L5，runner（L3）经 db 句柄写入——与现有 `sentinel_tickets` 同款（runner.ts:153-166 已建表 + L422-429 已写），不新增跨层违规。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 缺陷 A（P0）: findings 只在内存 records，重启即丢

[runner.ts L125](src/sentinel/runner.ts:125) — `records` 为纯内存 Map；[L652-664](src/sentinel/runner.ts:652) `executeSentinel` 把 run record push 进 Map（只保留最近 50 条）后**无任何落库**：

```ts
const history = this.records.get(sentinel.config.id) || [];
history.push(record);
if (history.length > 50) history.shift();   // 内存态，重启即丢
this.records.set(sentinel.config.id, history);
this.totalRuns++;
```

对比：`sentinel_tickets` 已落库（[runner.ts L153-166](src/sentinel/runner.ts:153) 建表 + [L422-429](src/sentinel/runner.ts:422) 写工单），但 findings/信号**没有**对应持久化——K3 08-14 全链路审计点名的"findings 持久化分裂"。

### 2.2 缺陷 B（P1）: durationMs 当时间戳 → checkedAt 恒 1970

[sentinel-service.ts L97](src/agent/sentinel-service.ts:97) — `getSentinelFindings` 把 `run.result.durationMs`（执行耗时 ms，如 15）当时间戳喂给 `new Date()`：

```ts
checkedAt: new Date(run.result.durationMs).toISOString(),  // durationMs=15 → "1970-01-01T00:00:00.015Z"
```

`SentinelCheckResult` 已有正确的 `checkedAt: string` 字段（[types.ts L71](src/sentinel/types.ts:71)），应直接用 `run.result.checkedAt`。同文件 [L198](src/agent/sentinel-service.ts:198) `getSentinelExpertReports` 与 [L226](src/agent/sentinel-service.ts:226) `getSentinelTickets` 已正确用 `f.detectedAt`——仅 L97 用错。

### 2.3 缺陷 C（P1，K3 §4.6 第 6 项）: findings 无生命周期状态

[types.ts L41-58](src/sentinel/types.ts:41) `SentinelFinding` 接口**无 status 字段**——open/acknowledged/resolved 生命周期在 [runner.ts L161](src/sentinel/runner.ts:161) `sentinel_tickets` 表有（`CHECK(status IN ('open','acknowledged','resolved','dismissed'))`），但 findings 本身无。K3 §4.6 判定为"小而致命的缺陷"，并入片 1：`SentinelFinding` 加 `status` 字段（默认 `open`），状态迁移与 ticket_transition 同款事件化（`finding_transition` 事件），实现 I3 可审计的完整闭环（finding 从产生到解决全程可追溯）。

### 2.4 接线现状（真实调用方，grep 实测）

| 调用方 | 位置 | 说明 |
|--------|------|------|
| sentinel-service.ts | L13 `getGlobalSentinelRunner()` | 读 runner.getRecentResults()（L85） |
| sentinel-service.ts | L78-122 `getSentinelFindings` | L1 API 查询入口，读内存 records |
| routes | `GET /api/sentinel/findings` | 经 sentinel-service 返回（验收锚点的读出口） |
| runner.start() | L150-166 | 建 `sentinel_tickets` 表（新表同款挂这里） |

## 3. 实现方案

### 3.1 写集 (3 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/sentinel/sentinel-events.ts](src/sentinel/sentinel-events.ts) | 新建 | L5 事件存储抽象：`createSentinelEventsTable(db)` + `appendSentinelEvent(db, event)` + `replaySentinelEvents(db)`（seq 单调、append-only、fail-closed） |
| [src/sentinel/runner.ts](src/sentinel/runner.ts) | 修改 | ①`start()` 建表（同款挂 sentinel_tickets 处）；②`executeSentinel` 写 `run_completed`/`finding` 事件；③`aggregateAndDispatch` 写 `signal`/`ticket_transition`/`finding_transition` 事件；④`records` 变事件流物化投影（启动 `replaySentinelEvents` 重建） |
| [src/sentinel/types.ts](src/sentinel/types.ts) | 修改 | `SentinelFinding` 加 `status?: 'open' \| 'acknowledged' \| 'resolved'` 字段（默认 `open`，K3 §4.6 findings 生命周期正名） |
| [src/agent/sentinel-service.ts](src/agent/sentinel-service.ts) | 修改 | 修 durationMs bug（L97 `new Date(run.result.durationMs)` → `run.result.checkedAt`） |
| [tests/sentinel/sentinel-events.test.ts](tests/sentinel/sentinel-events.test.ts) | 新建 | 三路径 + 三条 invariant + findings 生命周期测试（≥11 用例，见 §4） |

### 3.2 修复模式

**sentinel_events 表（append-only，seq 单调无洞，SQL 可验）**:

```sql
CREATE TABLE IF NOT EXISTS sentinel_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,     -- I1/I3: 单调无洞，重放顺序即事件顺序
  event_type TEXT NOT NULL CHECK(event_type IN ('run_completed','finding','finding_transition','signal','ticket_transition')),
  sentinel_id TEXT NOT NULL,
  aggregate_id TEXT,                          -- I3: finding 追溯其 run（= sentinelId + checkedAt 键）
  payload TEXT NOT NULL,                      -- JSON: 完整对象（run/finding/signal/ticket）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sentinel_events_seq ON sentinel_events(seq);
CREATE INDEX IF NOT EXISTS idx_sentinel_events_type ON sentinel_events(event_type, sentinel_id);
```

**事件写入（I2 单源：只有 `appendSentinelEvent` 一个写入口）**:

```ts
// 契约（sentinel-events.ts）:
//   @input  — db: Database.Database, event: { event_type, sentinel_id, aggregate_id?, payload }
//   @output — void（追加一行，seq 由 AUTOINCREMENT 分配）
//   @degraded — 写入失败 → log.error + 抛 SentinelsEventError(.code/.phase='persist'/.retryable=true)（铁律 32）
//   @error  — 表不存在 → 先 createSentinelEventsTable（幂等）再写；db 不可用 → fail-closed（不静默）
export function appendSentinelEvent(db, event): void { /* INSERT INTO sentinel_events ... */ }
```

**物化投影（I1 可重建：启动重放重建 records Map）**:

```ts
// runner.start() 追加: 建表后 → this.rebuildFromEvents()
// rebuildFromEvents(): SELECT * FROM sentinel_events ORDER BY seq
//   → run_completed 重建 run record（含 checkedAt/durationMs/ok）
//   → finding 按 aggregate_id 挂回对应 run 的 result.findings
//   → finding_transition 重建 finding.status（open→acknowledged→resolved 迁移链）
//   → signal 重建聚合信号列表; ticket_transition 重建工单状态
// records Map 从"写入口"降级为"投影"，读路径（sentinel-service）不变，仍走 getRecentResults()
```

**durationMs bug 修复（sentinel-service.ts L97）**:

```ts
// 修复前: checkedAt: new Date(run.result.durationMs).toISOString()  // 恒 1970
// 修复后:
checkedAt: run.result.checkedAt,   // SentinelCheckResult.checkedAt 已是 ISO 字符串（types.ts:71）
```

**数据安全边界（K3 §4.1 L197：append-only 固有权衡，不设计就是事故）**:

> 事件不可变 ⟹ 事后无法擦除。片 1 的 finding 事件流按现有数据安全四层处理：findings 本身是 L2 脱敏证据层（人名/金额已脱敏），事件 payload 只含 finding 的脱敏字段（id/severity/title/description/suggestion/relatedNodeId/status）——**不含 L3 原始数据**。PII 前置过 `security/PIIScrubber` 的完整边界（含 LLM 消息含 PII 的场景）在片 2（诊断会话事件化）落地，本片 1 的 finding 事件流天然处于 L2 脱敏层，不引入新 PII 暴露面。若未来 finding 的 evidence 字段要携带 L3 原始数据，必须在 append 前过 Scrubber（本片 1 不扩展 evidence 到 L3）。

### 3.3 不做的事

| 不做 | 文件 | 归属 |
|------|------|------|
| 诊断会话事件化（片 2） | `src/agent/**`、`src/l3/**` | **D394 片 2**（部署后，硬依赖 D355-D360 契约稳定 + PII 过 Scrubber） |
| fork/resume（片 3） | — | **Q4 期权** |
| 改 `sentinel_tickets` 现有建表/写工单逻辑 | `src/sentinel/runner.ts` | 只加 `ticket_transition` 事件，不动原 INSERT（可加，不替换） |
| OpenViking HTTP 集成 | — | K3 终版：现在不做（L3 数据不出企业），留 D398 片 2 决策 |
| 改 registry 核心 / manifest 阈值契约 | `src/sentinel/registry.ts`、`extensions/sentinels/*/manifest.json` | 无需改（`types.ts` 仅加 `SentinelFinding.status` 字段，见 §3.1 写集） |
| 改 engine-context.ts 集中建表 | `src/init/engine-context.ts` | 归 Win Claude 领地；本任务表建在 runner.start()（与 sentinel_tickets 同款，DSH 哨兵切片内） |

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/sentinel/sentinel-events.test.ts`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| `createSentinelEventsTable` 建表 → `sentinel_events` 存在 + seq 主键 | 表不存在 | 表存在 |
| `appendSentinelEvent` 写 1 条 → seq 单调递增（第 2 条 seq=2） | 无表/无写入 | seq 单调无洞 |
| **I1 可重建**：写 run+finding 事件 → `replaySentinelEvents` → 重建 records 与写入前等价（findings 全量/checkedAt 一致） | 无重放 | 重建等价 |
| **I1 可重建（kill -9 模拟）**：新建 db 实例（模拟重启）→ 重放旧事件流 → findings 与崩溃前一致 | 无持久化 | 一致 |
| **I2 单源**：读路径（getRecentResults/getSentinelFindings）只读投影，不直读 events 表 | 无投影 | 读投影 |
| **I3 可审计**：任一 finding 经 aggregate_id 追溯到 run_completed 事件（seq 链完整） | 无追溯 | 追溯命中 |
| `appendSentinelEvent` db 不可用 → 抛错误（fail-closed，不静默吞） | 无错误分类 | 抛 SentinelsEventError |
| 边界：空事件表 → `replaySentinelEvents` 返回空投影（不抛） | 无实现 | 空投影 |
| durationMs bug：`getSentinelFindings` 的 checkedAt = run.result.checkedAt（非 1970） | checkedAt 恒 1970 | checkedAt 正确 |
| findings 生命周期：新 finding 默认 `status='open'` + 写 `finding` 事件 | 无 status 字段 | status=open + finding 事件 |
| findings 状态迁移：open→acknowledged→resolved 写 `finding_transition` 事件 + 重放后 status 一致 | 无迁移/无事件 | finding_transition + 重放一致 |
| 回归：`sentinel_tickets` 现有写工单逻辑不回归 | — | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥12 | 上述 12 用例（正常/降级/边界/I1/I2/I3/生命周期/回归） |
| L2a | 接线 | 1 | sentinel-events.ts 被 runner.ts 真实调用（append + replay） |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 事件表位置 | A 集中 engine-context.ts / B runner.start() 内建（同 sentinel_tickets） | 第一性原理（哨兵切片领地内，避免跨所有权写 src/init/）+ 铁律 39（不新增跨层） | **B**——DSH 哨兵切片内，与 sentinel_tickets 同款 |
| 读路径形态 | A 双写（records + events 并存，读 records）/ B 单源（events 唯一写入口，records 变投影） | K3 形似神不似预警原文"双写 messages+events、读路径不动 → events 沦为日志副本" + I2 单源 | **B**——单源，records 降级为投影 |
| 事件粒度 | A 只写 run 级（一条 event = 一次 run 全量 findings）/ B 写 finding 级（每条 finding 一条 event） | I3 可审计（finding 级才能回答"由哪些输入事件产生"）+ 第一性原理（append-only 事件粒度 = 状态迁移粒度） | **B**——finding/signal/ticket 逐条事件，run_completed 作聚合锚点 |
| 重放时机 | A 每次查询重放 / B 启动时重放一次建投影，后续增量追加 | Anthropic（启动重放 + 增量追加 = 事件溯源标准模式）+ DeepSeek（最少机制：不每次查询重算） | **B**——启动重放建投影，运行期事件边写边投影 |

> 收敛检查：四决策点两参考系指向同一答案（runner 内建表 + 单源投影 + finding 级事件 + 启动重放），无分歧。**参考：Anthropic + DeepSeek + 第一性原理**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| sentinel-events 被 runner 调用 | `grep -n "appendSentinelEvent\|replaySentinelEvents\|createSentinelEventsTable" src/sentinel/runner.ts` 命中调用（非仅 import） |
| `executeSentinel` 写事件 | `grep -n "appendSentinelEvent" src/sentinel/runner.ts` 命中 executeSentinel 路径（finding/run_completed） |
| `aggregateAndDispatch` 写事件 | `grep -n "appendSentinelEvent" src/sentinel/runner.ts` 命中 signal/ticket_transition 路径 |
| `start()` 重放 | `grep -n "replaySentinelEvents" src/sentinel/runner.ts` 命中 start() 建表后 |
| durationMs 修复 | `grep -n "run.result.checkedAt" src/agent/sentinel-service.ts` 命中 L97 修复行（无 `new Date(run.result.durationMs)` 残留） |
| 生产调用点（读出口） | `grep -rn "getSentinelFindings" src/routes/` 命中路由调用（GET /api/sentinel/findings） |
| seq 单调无洞 | SQL 可验：`SELECT COUNT(*) = MAX(seq) FROM sentinel_events` 且 `MIN(seq)=1`（测试断言） |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/sentinel/sentinel-events.test.ts` 全过（≥12 用例；red 已证）
2. DS2: `sentinel_events` 表建在 runner.start()（`seq INTEGER PRIMARY KEY AUTOINCREMENT` 单调无洞，SQL 可验）
3. DS3: **I1 可重建**——写事件 → 新建 db 实例重放 → findings/records 与崩溃前等价（测试断言 + 验收锚点 `kill -9` 重启后 `GET /api/sentinel/findings` 一致）
4. DS4: **I2 单源**——状态只有 `appendSentinelEvent` 一个写入口；读路径（getRecentResults）只读投影
5. DS5: **I3 可审计**——任一 finding 经 aggregate_id 追溯到 run_completed 事件（seq 链完整）
6. DS6: `executeSentinel` 写 `run_completed`/`finding` 事件 + `aggregateAndDispatch` 写 `signal`/`ticket_transition`/`finding_transition` 事件（grep 命中调用点）
7. DS7: durationMs bug 修复——`getSentinelFindings` 的 checkedAt = `run.result.checkedAt`（非 1970），`grep -n "new Date(run.result.durationMs)" src/` 零残留
8. DS8: findings 生命周期正名（K3 §4.6）——`SentinelFinding.status` 字段存在（默认 `open`）+ 状态迁移写 `finding_transition` 事件（grep 命中）
9. DS9: 形似神不似防线——**无双写**（records Map 不再是独立写入口，只作投影；读路径不动但数据源改事件流）
10. DS10: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
11. DS11: 推送 + CI 验证：`git log origin/<branch>..HEAD` 为空 + CI 逐 job 绿（预存 npm audit/Architecture 单独标注）
12. DS12: 完成报告须含**决策记录**（§4.5 四决策点的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS12 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10，D331 审计教训）。

## 7. 自检清单

- [x] K3 咨询 §4.1 三条 invariant（I1/I2/I3）+ 形似神不似预警 + 验收锚点核实（task-state/D394.json 已落）
- [x] K3 咨询 §4.6 第 6 项「findings 时间戳与生命周期正名」核实（durationMs :97 + findings 无 status 字段，types.ts:41-58 实测）
- [x] runner.ts findings 内存态现场核实（L125 records Map + L652-664 push 后无落库）
- [x] sentinel-service.ts:97 durationMs bug 现场核实（`new Date(run.result.durationMs)`）
- [x] 接线现状 grep 实测（sentinel-service 读 getRecentResults；routes 读 getSentinelFindings）
- [x] 类型契约 read 真实定义（SentinelCheckResult.checkedAt: string 存在，types.ts:71）
- [x] 领地边界核实（engine-context.ts 归 Win Claude，本任务表建 runner.start() 内，DSH 哨兵切片不越界）
- [x] 决策参考已记录（§4.5，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-DS12，S-10）；写集表标题紧跟表头（D381 格式契约）
- [x] 片 2/片 3 显式排除（§3.3，K3 切片边界遵守）
- [x] 不是凭记忆
- [x] 不用 --no-verify
