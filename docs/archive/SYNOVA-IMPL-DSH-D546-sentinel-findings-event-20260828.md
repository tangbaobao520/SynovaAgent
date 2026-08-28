---
north-star:
  服务用户: 企业主 + GA（哨兵发现/信号/工单在重启后不丢且可回放——K3 战略「护城河=本体被真实数据验证的速率」的数据地基）+ Mac/Win 两条事件化线的下游实现者（需要一份防分叉的公共契约）。
  服务场景: 哨兵 7×24 巡检产出 findings → 事件落库 → 回放/审计；Win 片2-A（D487 GA 会话事件）与 Mac 片1（findings 事件）双线并行，靠公共契约字段表防格式分叉。
  模块终态: 哨兵 findings 事件化**已由 D394 片1 落地**（sentinel_events append-only + I1/I2/I3，commit a8a5857e，audited PASS）——本任务把「片1 已建的地基」验收收口：与片2-A 契约对齐（字段级表 + 契约测试）、回放等价断言强化到 sha256、durationMs 回归网补齐、K3 旧线索与代码不符处如实标注。
  对齐北星: PRODUCT-BRIEF §三.2（哨兵定时巡检——两套核心系统之一）+ §六 P0「哨兵真实数据流」；K3 战略咨询 2026-08-16 §4.1/§4.6 + D394 台账（task-state/D394.json audited PASS）。
  完成标准: （入口）编码 session 在独立 clone 基线 e8ea8ed3 上建分支 →（处理）契约测试 + 回放 sha256 强化 + durationMs 回归 + 接线断言 →（结果）PR CI 三 job 全 success（贴结果）+ task-state 回填 slice=d394-slice1。可验证：DS1-DS8（§13）。
  当前进度: 事件化本体已交付且 K3 审计 PASS（2026-08-22）；本 spec 2026-08-28 交付——派单「findings 仅内存/覆盖式落库」前提与 main 现状不符（§4.1 诚实标注），真实剩余工作 = 契约对齐 + 回归补强，预计 src/ 零或极小改动。
---

# SYNOVA-IMPL-DSH-D546: 哨兵 findings 事件化（D394 片1 收口）— 契约对齐 + 回放断言 + durationMs 回归

> 归属: DeepSeek Harness（DSH）· dev doc | 2026-08-28 | slice: `d394-slice1`
> 基线: **origin/main @ e8ea8ed3**（spec 全部 file:line 基于此 sha；编码前按 §3.3 抽验防漂移——M7 教训）
> 执行方: 🛠 编码 session（独立 clone 工作——派单并行纪律；与 D544 写集零重叠）
> 上游: 派单 `docs/synova/coordination/派单-D546-sentinel-findings-event-20260828.md` / D394 片1 已交付（a8a5857e）/ Win 片2-A 契约 = `docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md`（PR #241 已合 main）
> ⚠️ **本 spec 相对派单的关键重定范围（诚实声明，派单交付要求 #3 同款纪律）**: ①「findings 仅内存/覆盖式落库」前提已过时——D394 片1（2026-08-17, a8a5857e）已交付 sentinel_events append-only + 投影 + 启动重放 + I1/I2/I3 三不变量，K3 审计 PASS（2026-08-22, task-state/D394.json）；②「durationMs 恒 1970」的真实位置是 src/agent/sentinel-service.ts (L97 历史形态)，不是派单所列 runner.ts 5 处——且已在 a8a5857e 修复（§7 逐行实证）；③ 因此 D546 的增量 = **验证在位 + 契约对齐（片1 先于片2-A 11 天，这是本单真正的新增价值）+ 回归网补强**，预计 src/ 零改动（防膨胀红线天然满足）。

---

## 1. Authority Doc Verification

**权威 ① — K3 战略咨询 §4.1（docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md，D394 spec §1 引原文）**:

> 三条 invariant：I1 可重建（kill -9 后重启，事件流重建状态与崩溃前等价）；I2 单源（状态只有事件流一个写入口，读路径全部从事件流或其投影派生）；I3 可审计（任何 finding 能从事件流回答「由哪些输入事件产生」）。**形似神不似预警**：双写 messages+events、读路径不动 → events 表沦为没人读的日志副本 → 三个月后数据漂移无人发现。

**权威 ② — K3 §4.6（durationMs bug 原文，D394 spec 引）**:

> ① src/agent/sentinel-service.ts 把 durationMs 当 checkedAt 时间戳（当前 :97；恒 1970-01-01）；② findings 无生命周期状态（open/acknowledged/resolved……）。建议并入 D394 片 1 一起做。

**权威 ③ — Win 片2-A 契约（D487 dev doc 原文摘录，契约对齐对象）**:

> src/store/session-store.ts | 修改 | SessionEventType 扩展诊断事件类型（如 'diagnosis_phase' | 'diagnosis_module' | 'diagnosis_report'）+ L131 event_type CHECK 约束同步扩展……
> 诊断事件落流用 appendEvent（复用 D500）……D500 的 session_events 是"会话唯一事实源"……
> 写集=src/agent/conversation-engine.ts + src/agent/diagnosis-launcher.ts + src/deploy/bootstrap.ts + src/server.ts + src/store/session-store.ts + tests/ ，与 DSH 线（scripts/ 、src/sentinel/ ）**零交集**。

**权威 ④ — 派单 D546**（写集/五断言验收/防膨胀红线/并行纪律，原文见 docs/synova/coordination/派单-D546-sentinel-findings-event-20260828.md）。

**权威 ⑤ — AGENTS.md 铁律**: 0-2（测试先行+接线）/ 24+31（降级诚实）/ 32（错误分类）/ 38（as any=0）/ 47（契约优先）/ 48（测试非空壳）。

---

## 2. Problem Statement

D394 片1 把哨兵状态迁移搬进了 append-only 事件流（sentinel_events 表 + runner 投影 + 启动重放），但留下三个收口缺口: ① **双线分叉风险**——Win 片2-A（D487）11 天后合入 main，两线各自定义事件信封，没有字段级公共契约，格式漂移无人察觉（K3「形似神不似」预警的跨线版本）；② **回放等价断言是抽查式**——现有 I1 测试只断言 checkedAt/durationMs/finding id 三处，不满足派单「sha256/逐字段一致」的验收口径；③ **durationMs 回归网缺失**——历史 bug（sentinel-service.ts:97 durationMs 当 checkedAt → 恒 1970）虽已修，但零回归测试，同样的「数值当时间戳」缺陷可无声复发。D546 = 用最小写集（主要是 tests/）把三缺口关闭。

---

## 3. Q0-Q4

### 3.1 Q0 项目拼图 + 文件审计

- **拼图**: L5 存储（sentinel_events 表，已存在）+ L3 哨兵 runner（写入口）。本任务不动架构位——事件层已在位，本任务产出物主要是**测试层的契约与回归网**。
- **文件审计（origin/main @ e8ea8ed3 实测）**:
  - src/sentinel/sentinel-events.ts (207 行): `SentinelEventType` 5 值 / `appendSentinelEvent`（I2 唯一写入口，throw fail-closed）/ `replaySentinelEvents`（seq 升序，坏行跳过）/ 表 DDL L88-99（seq AUTOINCREMENT + event_type CHECK + created_at DEFAULT datetime('now')）。
  - src/sentinel/runner.ts (1213 行): `persistRunEvents` L713-739（run_completed + 逐 finding 事件，唯一写入口）/ `projectRunRecord` L742-747（投影，每 sentinel 保留 50 条）/ `rebuildFromEvents` L753+（启动重放）/ `executeSentinel` L1053+（真实 check 路径，L1080-1081 duration 计算）。
  - src/agent/sentinel-service.ts (L97): `checkedAt: run.result.checkedAt`（历史 bug 修复后在位——§7 实证）。
  - src/store/session-store.ts (D500): `session_events` DDL L127-135 / `SessionEvent` L61-68 / `appendEvent` L272-287（返回 `{ok|degraded}`，UNIQUE(session_id,seq)）/ `SessionEventType` L58（'message'|'tool_result'|'system'，D487 将扩 diagnosis_*）。
  - `tests/sentinel/sentinel-events.test.ts`（292 行）: 建表/seq 无洞（SQL）/空表/幂等建表/fail-closed + I1 抽查等价（L156-168）+ kill -9 模拟（L170-197）+ I2/I3。
- **决策**: 不新建任何事件组件；tests/ 为主，src/sentinel/runner.ts 仅在契约测试暴露 payload 缺陷时小修（条件写集）。

### 3.2 Q1 调研（memory/历史教训）

- **S-14 无重复造轮子**: D487 doc 同款审计已证「D500 是地基，片2-A 是装配」——本任务同构:「D394 片1 是地基，D546 是契约收口」。全仓 grep 确认 appendSentinelEvent 仅 sentinel-events.ts 实现 + runner.ts 消费（8 个生产调用点，§9）。
- **D540 教训**: 交付贴 CI check-runs，本地绿不算 → DS7。
- **D545 教训**: 跨线取号先查占用 → D546 已由 alloc-task-id 登记本单。
- **D524 行号漂移（M7）**: spec 行号锚定 e8ea8ed3，编码前抽验。
- **K3「形似神不似」**: 事件流不是"没人读的日志副本"——本任务的契约测试 + 回放断言就是让事件流持续被读的机制。

### 3.3 Q2 范围（做什么 / 不做什么）

**做什么**（最小闭环）: ① 公共契约字段表落 spec（§8）+ 契约测试（新文件）；② I1 回放等价强化到 canonical-JSON sha256（改现有测试）；③ durationMs 回归测试（新文件，真实 check 路径 + 故障注入 red）；④ 接线断言（grep 现有 8+2+1 生产调用点）；⑤ task-state 回填 + L07 收益标注。

**写集（派单口径 + 实际收敛）**:

### 3.3.1 写集 (0 修改 + 0 新建代码文件为预期；本 spec 零代码写入——写集登记编码 session 的 4 区域，文件级明细见说明列)

| 文件 | 操作 | 说明 |
|---|---|---|
| src/sentinel/ | 条件修 | **预计零改动**；仅当 DS2 契约测试暴露 payload 缺陷（如时间戳非 ISO）时修 runner.ts persistRunEvents（L713-739），修复不得改 event_type 枚举与表 DDL |
| src/store/ | 预计零改动 | 复用评估结论 = 不走 D500 通道（§6），此目录预期零 diff |
| src/l3/ | 预计零改动 | 本任务不触 L3 洞察层（接线断言为只读 grep） |
| tests/sentinel/ | 编码·测试 | 文件级明细: ① 修改 sentinel-events.test.ts（I1 用例 L156-168 补 sha256 强化，DS3）；② 新建 sentinel-events-contract.test.ts（DS2，3 用例）；③ 新建 durationms-regression.test.ts（DS4，4 用例）——新建文件在 spec 阶段尚不存在，故首列保持目录粒度（check-dev-doc-write-set 语义） |

**不做什么（含文件路径，铁律 Q2 排除项）**:
- ❌ 不碰 electron-renderer/（D544 领地）与 tests/electron/（并行零重叠纪律——D544 写集）
- ❌ 不碰 scripts/audit/（K3 红线）、scripts/pre-commit-check.sh、.github/workflows/ci.yml
- ❌ 不碰 Win 领地: src/agent/conversation-engine.ts, src/agent/diagnosis-launcher.ts, src/deploy/bootstrap.ts, src/server.ts, src/store/session-store.ts (D487 写集——契约对齐只读其 doc + 测试映射，不改其文件)
- ❌ 不新建事件组件/守护进程/launchd/DSH 依赖（派单防膨胀红线）；不改 sentinel_events 表 DDL 与 event_type 枚举（已 audited）
- ❌ 不做 finding_transition 的 UI/API 消费面（生命周期已有写入口 L845，消费面属后续切片）

### 3.4 Q3 验收（入口 → 处理 → 结果）

- **入口**: 独立 clone（跨机）或同机 worktree 二选一，基线 = origin/main @ e8ea8ed3: `git fetch origin && git worktree add -b feat/d546-sentinel-findings-event .wt-d546 origin/main`（同机）或独立 clone 后 `git checkout -b feat/d546-sentinel-findings-event origin/main`。
- **处理**: 章5 测试三件（契约/回放 sha256/durationMs 回归）red→green → 接线 grep 断言。
- **结果**: PR → CI 三 job 全 success（贴结果）→ K3 审计 → CTO 合并 → task-state/D546 回填。

### 3.5 Q4 契约与测试（铁律 47/48）

契约已在位且冻结: `SentinelEventInput`（sentinel-events.ts L35-42）+ 表 DDL（L88-99）+ I1/I2/I3。本任务**新增**的是「双线公共契约」（§8 字段表）——测试形式 = 契约冻结测试 + 故障注入 red（喂「durationMs 当时间戳」的违约事件 → 断言必须红，证明网有效——S-5 red 覆盖失败模式）。回放断言升级为 canonical-JSON sha256 全投影等价。

---

## 4. Current State（2026-08-28 实测，全部基于 origin/main @ e8ea8ed3）

### 4.1 派单前提 vs 代码现状（诚实标注）

| 派单表述 | 实测现状 | 判定 |
|---|---|---|
| 「findings 流转现状: records 内存 + self-check」（L247/328-363） | records 确为内存投影（L742-747，50 条窗口），**但事件层已在位**: persistRunEvents（L713）+ appendSentinelEvent + rebuildFromEvents + sentinel_events 表（sentinel-events.ts 全文件） | **前提过时**——事件化本体已交付（a8a5857e, 2026-08-17，task-state/D394.json impl+audit PASS） |
| 「durationMs 候选 runner.ts L363/724/773/1081/1134，K3 报『恒 1970』」 | 5 处逐一实读（§7.1）: **全部为正确 duration 语义**（`Date.now() - startTime` 或透传），全仓 grep "1970" 零命中、`new Date(<durationMs>)` 模式零命中 | **线索错位**——历史 bug 在 src/agent/sentinel-service.ts (L97，K3 §4.6 原文即此)，已随 a8a5857e 修复 |
| 「D500 store 事件流已落地（复用评估，勿重做）」 | 属实: session_events + appendEvent + 双写 + UNIQUE(session_id,seq)（L127-135/L272-287） | 采纳——复用评估结论 §6 |
| 「PR #241 D487 dev doc 已合 main」 | 属实: `SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md`（129 行），写集含 src/store/session-store.ts | 契约对齐对象 ✓（§8） |

### 4.2 事件层现状盘点（本任务的验收基础）

| 资产 | 位置 | 状态 |
|---|---|---|
| 事件类型 | sentinel-events.ts L27-32 | run_completed / finding / finding_transition / signal / ticket_transition（5 值 CHECK） |
| 写入口 | runner.ts 8 处生产调用: L439（signal）L640/L689（ticket_transition）L716/L732（run_completed+finding，persistRunEvents 内）L845（finding_transition）L890（ticket resolved） | I2 单源成立 |
| 投影/重放 | persistRunEvents L371（self-check 路径）+ L1099（executeSentinel 主路径）；rebuildFromEvents 由 start() 调用一次 | I1 机制在位 |
| 测试覆盖 | tests/sentinel/sentinel-events.test.ts: 建表/seq 无洞（SQL）/空表/幂等/fail-closed/I1 抽查等价 L156-168/kill -9 模拟 L170-197/I2 L199/I3 L208 | **回放等价为抽查非 sha256**（缺口①）；**durationMs 零回归**（缺口③——tests/sentinel/ 全目录 grep: durationMs 仅作为 fixture 值 0/1/42，无正值断言、无纪元防护） |
| durationMs 修复 | src/agent/sentinel-service.ts L97 `checkedAt: run.result.checkedAt`（正确 ISO 时间戳来源） | 修复在位（§7.2 实证），无回归网 |

### 4.3 CI 口径（派单「三 job」的落点）

`.github/workflows/ci.yml` 9 个 check-run 中，本切片相关三 job = `TypeScript + Lint + Iron Laws` / `Vitest (1/2)` / `Vitest (2/2)`（DS7 贴此三项结果）；另要求 `Architecture Check` 绿（零成本高价值，一并贴）。

---

## 5. 章 1 · 事件模型（现状冻结 + 与 records 的关系）

**模型 = D394 片1 已交付形态，本任务冻结不改**（改 = 违防膨胀红线 + 需重新审计）:

| 要素 | 定义 | 证据（origin/main @ e8ea8ed3） |
|---|---|---|
| 事件类型 | `run_completed`（聚合锚点）/ `finding`（I3 级）/ `finding_transition`（open→acknowledged→resolved）/ `signal`（审计）/ `ticket_transition`（审计） | sentinel-events.ts L27-32 + CHECK 约束 L91 |
| 载荷 | run_completed: {sentinelId, sentinelName, checkedAt, durationMs, ok, error, degraded, cronJobId}；finding: {finding: {...SentinelFinding, status ?? 'open'}}；transition: {findingId/ticketId, from, to, at} | runner.ts L720-729 / L736 / L842 / L644 |
| 聚合键 | run 级 = `${sentinelId}@${checkedAt}`；finding/ticket 级 = 实体 id | L715 / L848 / L643 |
| 存储 | SQLite `sentinel_events`: seq AUTOINCREMENT + event_type CHECK + payload TEXT(JSON) + created_at DEFAULT datetime('now')；索引 seq/(event_type,sentinel_id) | sentinel-events.ts L88-99 |
| 与 records 关系 | records = **有损物化投影**（每 sentinel 50 条窗口，L745 shift）；事件流 = 完整事实源；读路径（GET /api/sentinel/findings，routes/sentinel.ts L27）走投影 | L742-747 + rebuildFromEvents L753 |
| 时间戳语义 | 事件行 created_at = SQLite datetime('now')（'YYYY-MM-DD HH:MM:SS' UTC）；payload 内业务时间戳（checkedAt/detectedAt/at）= JS toISOString()（ISO 8601 UTC） | L95 + runner.ts L354/L849 |

> 派单所称「覆盖式落库」的实际形态 = 投影 50 条窗口（有损但事件流无损）——语义正确，无需改。**durationMs 在 payload 中是 duration 语义（毫秒数），不是时间戳**——契约测试将把这一语义冻结为条款（§8 条款 C3）。

---

## 6. 章 2 · D500 复用评估（findings 事件走 store 通道还是独立通道）

**结论: 不并入 D500 session 通道；findings 事件维持 sentinel_events 独立通道（现状），双线以「公共信封契约」（§8）对齐。**

理由（全部读代码实证）:

1. **领域语义不同**: session_events 绑定 `session_id REFERENCES agent_sessions(id) ON DELETE CASCADE`（session-store.ts L129）——findings 无会话归属（哨兵 run 不是会话），并入需造假 session_id 或改外键 = 破坏 D500「会话唯一事实源」语义（D487 决策点 1 原文同样理由的反向适用）。
2. **类型枚举不同且各自 audited**: session_events CHECK ('message','tool_result','system')（D487 将扩 diagnosis_*）；sentinel_events CHECK（5 值）——两套 CHECK 均已过 K3 审计，合并 = 双线各改对方 audited 资产，违反并行纪律（「不跨线直接改对方文件」）。
3. **错误契约不同**: appendSentinelEvent throw fail-closed（SentinelsEventError，铁律 32）vs appendEvent 返回 `{ok:false, degraded:true}`（铁律 31）——各自成立，合并任一方 = 无谓的语义重构。
4. **防膨胀红线**: 派单明示「复用 D500 store **或现有通道**」——findings 的现有通道就是 sentinel_events（D394 片1 交付、audited PASS），复用充分。
5. **seq 语义差异不可调和**: sentinel 全流单 seq（无洞 SQL 断言在位）vs session per-session seq（UNIQUE(session_id,seq)）——两流各自正确，合并反而制造粒度混乱。

> 对齐方式（替代合并）: §8 公共信封契约 + DS2 契约测试把两线信封映射进同一组语义字段断言——「契约对齐」不要求「存储合并」。

---

## 7. 章 3 · durationMs bug 定位（诚实声明主章节）

### 7.1 派单 5 处候选逐一核验（origin/main @ e8ea8ed3，逐行实读）

| 行 | 代码（实测） | 语义 | 判定 |
|---|---|---|---|
| runner.ts L363 | `durationMs: Date.now() - startTime`（L338 `startTime = Date.now()`） | duration | 正确 |
| runner.ts L724 | `durationMs: record.result.durationMs`（payload 透传） | duration 透传 | 正确 |
| runner.ts L773 | `durationMs: Number(p.durationMs ?? 0)`（重放重建） | duration 重建 | 正确（旧事件缺失 → 0，为投影兜底非时间戳） |
| runner.ts L1081 | `result.durationMs = duration`（L1080 `Date.now() - startTime`） | duration | 正确 |
| runner.ts L1134 | `durationMs: duration`（record 构造透传） | duration | 正确 |

辅助证据: 全仓 grep `"1970"`（src/ 与 extensions/ 两目录）零命中；`new Date(<durationMs>)` 模式零命中；adapters 内 durationMs 同为 duration 语义（如 cpc-sentinel.ts L81 `Date.now() - now.getTime()`）。

### 7.2 真实定位与修复史（K3 原文线索 → 现状）

- **K3 §4.6 原文（权威 ②）**: 「src/agent/sentinel-service.ts 把 durationMs 当 checkedAt 时间戳（当前 :97；恒 1970-01-01）」——**历史 bug 的确切位置是 src/agent/sentinel-service.ts (L97)，不在 runner.ts**（派单把 D394 spec §2.2 缺陷 B 的文件张冠李戴到了 runner.ts 5 个 durationMs 行）。
- **修复已在位**: src/agent/sentinel-service.ts L93-98 实测 `checkedAt: run.result.checkedAt`（ISO 时间戳，来源正确）；git 历史: git log -S "durationMs" -- src/sentinel/ 显示 a8a5857e（2026-08-17, feat(D394)）为最近一次触及——修复随片1 交付，task-state/D394.json audit PASS（2026-08-22）。
- **诚实声明（派单交付要求 #3）**: K3/派单「runner.ts 5 处恒 1970」与当前代码**不符**——5 处均为正确 duration；历史缺陷在 sentinel-service.ts:97 且已修。D546 不再做"修复"，做**回归网**（DS4）。

### 7.3 回归测试要求（DS4 详设见 §10）

1. **真实 check 正值断言**: 经 `executeSentinel` 生产路径跑真实 builtin（integration-health-sentinel）→ `durationMs ∈ (0, 60000]`（非 0、非纪元级巨数）。
2. **纪元防护断言**: `checkedAt` 为 ISO 8601 且 `new Date(checkedAt).getFullYear() >= 2026`（「数值当时间戳」缺陷的表征 = 年份 1970）。
3. **映射断言**: sentinel-service findings 输出的 checkedAt 来源 = `run.result.checkedAt`（L97 现状锁定）。
4. **故障注入 red（S-5）**: 构造历史缺陷形态（`checkedAt: new Date(durationMs).toISOString()`）→ 年份断言必须红 → 证明回归网能抓住该缺陷模式。

---

## 8. 章 4 · 与片2-A 契约对齐（公共契约字段表）

### 8.1 字段级对照表（sentinel_events vs session_events，全部 file:line 实证）

| 信封语义 | sentinel_events（Mac 片1） | session_events（Win 片2-A / D500） | 公共契约判定 |
|---|---|---|---|
| 流序号 | `seq` AUTOINCREMENT，全流单调（无洞 SQL 断言已有，tests L118-126） | `seq` per-session（`UNIQUE(session_id,seq)`，MAX+1 续写，L134/L275-277） | C1: 流内单调整数（粒度差异如实记录：全局 vs 会话） |
| 事件类型 | `event_type` CHECK 5 值（run_completed/finding/finding_transition/signal/ticket_transition） | `event_type` CHECK 3 值（message/tool_result/system）→ D487 扩 diagnosis_phase/diagnosis_module/diagnosis_report | C2: 声明式枚举 + 命名空间分域（sentinel_* 域归 Mac，diagnosis_*/session_* 域归 Win），两线互不占用对方法定名 |
| 聚合标识 | `aggregate_id` TEXT（runKey / finding.id / ticketId，I3） | 无独立列（D487 事件靠 session 内 seq 链） | C3: `aggregate_id` 为**可选**字段（存在即须可追溯到产生事件） |
| 载荷 | `payload` TEXT JSON（camelCase 对象） | `payload_json` TEXT JSON | C4: 语义名统一 payload；列名差异（payload/payload_json）为存储细节，映射显式 |
| 行时间戳 | `created_at` DEFAULT `datetime('now')`（'YYYY-MM-DD HH:MM:SS' UTC） | 同款（L133） | C5: ✓ 同源格式，零对齐成本 |
| 载荷内时间戳 | checkedAt/detectedAt/at = `toISOString()`（ISO 8601 UTC） | D487 诊断事件 payload 由 Win 实现（未定） | **C6（核心条款）: payload 内一切时间戳字段一律 ISO 8601 UTC 字符串；禁止数值型纪元值、禁止 duration 值充当时间戳**（K3「恒 1970」缺陷的制度化防线） |
| 写失败语义 | throw（SentinelsEventError: code/phase/retryable，铁律 32） | 返回 `{ok:false,degraded:true,error}`（铁律 31） | C7: 两线各自成立；跨线消费方须同时容忍两种形态 |
| 不变量 | I1 可重建 / I2 单源 / I3 可审计（K3 §4.1） | model-visible⟺logged（D500） | 同范式异表述，契约表登记映射，不强制改名 |

### 8.2 对齐动作（最小实现）

1. **契约冻结测试（DS2）**: 新建 tests/sentinel/sentinel-events-contract.test.ts——① 构造真实形态 findings 事件（persistRunEvents 形态）→ 断言信封满足 C1-C6；② **故障注入 red**: 喂「durationMs 当 checkedAt」的违约 payload → C6 断言必须红（证明测试能抓违约，S-5）；③ 双线信封映射: 构造 sentinel_events 行与 session_events 行各一 → 映射到公共信封（C1-C6 语义字段）→ 断言同构。
2. **不改 Win 文件**: 对齐通过读 main 上 D487 doc（已完成）+ 本表 + 契约测试；Win 侧在片2-A 实现时按本表 C6 落 payload 时间戳（跨线协调记录于 task-state 回填 note）。

---

## 9. Wiring Verification（接线核对——现有生产调用点断言，S-3 测试调用不计）

| 断言 | 命令（在验收 worktree 内） | 期望（2026-08-28 实测基线） |
|---|---|---|
| appendSentinelEvent 生产调用 | grep -n "appendSentinelEvent" src/sentinel/runner.ts | **7 处调用行**: L439（signal）/ L640+L682（ticket_transition）/ L716+L732（run_completed+finding）/ L838（finding_transition）/ L883（ticket resolved）；另 L27 为 import |
| persistRunEvents 生产触发 | grep -n "this.persistRunEvents" src/sentinel/runner.ts | 2 处: L371（self-check）+ L1099（executeSentinel 主路径） |
| 启动重放接线 | grep -n "rebuildFromEvents" src/sentinel/runner.ts | 定义 L753 + start() 内调用（启动一次） |
| 唯一实现 | grep -rn "export function appendSentinelEvent" src/ | 仅 src/sentinel/sentinel-events.ts L119（无重复实现——S-14） |
| 读路径走投影 | grep -n "getRecentResults\|/findings" src/routes/sentinel.ts | L27 findings 路由 → runner 投影（I2 读路径派生） |

> 若编码 session 因 DS2 暴露 payload 缺陷而修改 runner.ts（条件写集），上述断言行号须在 PR 描述中重验并更新（M7 防漂移）。

---

## 10. 章 5 · Test Requirements — 测试与验收

### 10.1 测试三件（L1 单元/契约，node env；红绿语义 = 故障注入证明网有效）

| # | 文件 | 用例 | 断言 | red 证明（S-5） |
|---|---|---|---|---|
| DS2 | tests/sentinel/sentinel-events-contract.test.ts（新建） | ①findings 事件信封 ⊆ 公共契约 C1-C6；②双线信封映射同构；③C6 时间戳条款 | 逐字段 expect（铁律 48） | 用例③喂违约 payload（durationMs 冒充 checkedAt）→ 断言红 |
| DS3 | tests/sentinel/sentinel-events.test.ts（修改 L156-168 I1 用例） | I1 强化: 直写投影 vs rebuildFromEvents 重放投影 → canonical JSON（排序 key）sha256 全等 | `expect(sha256(replay)).toBe(sha256(direct))` + 保留原抽查 | 故障注入: 重放前删除一条 finding 事件 → sha256 断言红 |
| DS4 | tests/sentinel/durationms-regression.test.ts（新建） | ①真实 check durationMs ∈ (0,60000]；②checkedAt ISO + 年份 ≥2026；③sentinel-service checkedAt 来源 L97；④历史缺陷形态故障注入红 | 正值/ISO/年份/来源四处 expect | 用例④构造 `new Date(durationMs).toISOString()` → 年份 1970 断言红 |

### 10.2 验收断言（物理可复现，全部落 evidence/D546/）

1. **回放断言（派单口径）**: 写→落盘→重放一致 = DS3 sha256 全投影等价 + 既有 kill -9 用例（L170-197）保持绿。
2. **durationMs 断言**: DS4 ①②（真实 sentinel check 跑出合理正值，非 0/非 1970 纪元）。
3. **契约断言**: findings 事件字段 ⊆ §8.1 公共契约表 = DS2①（字段级，逐项对应表行）。
4. **接线断言**: §9 五条 grep 全命中。
5. **CI 断言**: PR check-runs 三 job（`TypeScript + Lint + Iron Laws` / `Vitest (1/2)` / `Vitest (2/2)`）全 success 贴结果 + `Architecture Check` 绿（本地绿不算——D540 教训）。
6. **L07 收益标注**: L07-3「监测结果持久化」（已 verified）→ 本任务后升级为「持久化 + 双线契约统一 + 回放 sha256 可证」——标注写入 task-state/D546.json 回填 note 与 PR 描述（不改 scripts/product-lines/，写集外）。
7. **零膨胀断言**: `git diff --name-only origin/main..HEAD` ⊆ 写集表 + package.json 零 diff（无新依赖）+ 无新组件/守护进程。

### 10.3 运行命令（编码 session 直接执行）

```bash
npx vitest run tests/sentinel/sentinel-events-contract.test.ts tests/sentinel/durationms-regression.test.ts
npx vitest run tests/sentinel/sentinel-events.test.ts        # 含强化后 I1 sha256
npx vitest run tests/sentinel/                               # 全 sentinel 域回归
npx tsc --noEmit                                             # 零新增错误
```

---

## 11. What We Don't Do（明确排除，含文件路径）

| 不做 | 原因 |
|---|---|
| 重建/迁移事件存储（并表、改 DDL、改 event_type 枚举） | D394 片1 audited PASS；§6 复用评估结论=独立通道；防膨胀红线 |
| 碰 src/agent/conversation-engine.ts, src/agent/diagnosis-launcher.ts, src/deploy/bootstrap.ts, src/server.ts, src/store/session-store.ts | Win 片2-A 写集（D487 权威③），跨线禁改 |
| 碰 electron-renderer/ 与 tests/electron/ | D544 领地（并行零重叠） |
| 碰 scripts/audit/、scripts/pre-commit-check.sh、.github/workflows/ci.yml | K3 红线 / 控制塔线 |
| 实现 finding_transition 的 API/UI 消费面 | 写入口已在位（L845），消费面属后续切片，本单防膨胀 |
| 为「5 处 durationMs」做任何"修复" | §7.1 实证全部正确；修复史在 sentinel-service.ts:97 且已完成——只加回归网 |

---

## 12. Architecture Layer

**L5 存储（sentinel_events，已存在）+ L3 runner（写入口，已存在）——本任务零架构位变更**。产出物在 tests/（L5 契约与回归的验证层）；条件修 runner.ts 也仅限 persistRunEvents payload 组装（L3→L5 写路径内，与 sentinel_tickets 同款，无新跨层）。`Architecture Check` job 复核。

---

## 13. Completion Standard（DS1-DS8，与章节一一对应，禁重编号/跳号/静默缺项——S-10）

1. **DS1** 契约对齐表 + 公共契约条款落 spec（§8.1 C1-C7）——dev-doc 已完成（本文档）。
2. **DS2** tests/sentinel/sentinel-events-contract.test.ts 3 用例全绿，含故障注入 red 证明（§8.2/§10.1）。
3. **DS3** I1 用例 sha256 强化 + 全文件绿（含既有 kill -9 用例不回归）。
4. **DS4** tests/sentinel/durationms-regression.test.ts 4 用例全绿（真实 check 正值 + 纪元防护 + 来源锁定 + 故障注入 red）。
5. **DS5** §9 五条接线 grep 全命中（PR 描述贴输出）。
6. **DS6** 零膨胀: diff ⊆ 写集 + package.json 零 diff + src/store/ src/l3/ 零改动。
7. **DS7** CI: PR check-runs 三 job（quality / Vitest 1/2 / Vitest 2/2）全 success 贴结果 + Architecture Check 绿（本地绿不算）。
8. **DS8** task-state/D546.json 回填: impl 段 + `"slice": "d394-slice1"` + status=impl_done + L07 收益标注（L07-3 → 持久化+可回放+双线契约统一）。

---

## 14. Auth Doc References

- 派单 D546: `docs/synova/coordination/派单-D546-sentinel-findings-event-20260828.md`（写集/五断言/防膨胀/并行纪律原文）
- K3 战略咨询 §4.1/§4.6: `docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md`（I1/I2/I3 + durationMs 原文）
- D394 片1 spec（前序交付）: `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D394-sentinel-events-20260816.md`；task-state/D394.json（impl a8a5857e + audit PASS 2026-08-22）
- Win 片2-A 契约: `docs/plans/codex/implementation/SYNOVA-IMPL-D487-ga-session-events-slice2a-20260828.md`（PR #241）
- D500 地基: `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md` + src/store/session-store.ts (L55-73/L127-135/L265-287 实测)
- 生产事实源（origin/main @ e8ea8ed3 只读实测）: src/sentinel/sentinel-events.ts (全文) 、 src/sentinel/runner.ts (L338-363/L700-800/L1053-1102/L439/L640/L682/L838/L883) 、 src/agent/sentinel-service.ts (L88-101) 、 src/routes/sentinel.ts (L27)
- PRODUCT-BRIEF §三.2/§六 P0；AGENTS.md 铁律 0-2/24/31/32/38/47/48

---

## 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|---|---|---|---|
| findings 事件通道 | A 并入 D500 session_events / B 维持 sentinel_events 独立 + 信封契约对齐 | 第一性原理（会话域 ≠ 哨兵域，session_id 外键不可伪造）+ D487 决策点 1 反向适用 + 派单防膨胀（「或现有通道」） | **B**——§6 五条理由 |
| durationMs 处置 | A 按 K3 线索修 runner.ts 5 处 / B 如实标注不符 + 补回归网 | 派单交付要求 #3（诚实声明条款）+ §7.1 逐行实证（5 处语义正确）+ 修复史 a8a5857e | **B**——修不存在/已修的 bug = 伪工作；回归网才是增量（DS4） |
| 契约对齐形态 | A 合并两表 / B 公共信封契约（字段表 + 契约测试）| Anthropic（契约优先，铁律 47）+ K3「形似神不似」预警（契约必须被测试持续读取）+ 并行纪律（不跨线改文件） | **B**——DS2 把契约变成可执行的防线 |
| 回放断言强度 | A 维持抽查断言 / B 升级 canonical-JSON sha256 全投影等价 | 派单验收口径（sha256/逐字段）+ K3 I1 原义（「等价」） | **B**——抽查挡不住投影丢失类漂移 |
| 本任务写集 | A 按派单全开（src/sentinel/ + src/store/ + src/l3/ + tests/）/ B 收敛为 tests/ 为主 + src/sentinel/ 条件修 | §4.1 现状（事件层已在位）+ S-14（不重做）+ 最小写集原则 | **B**——src/store/ 与 src/l3/ 声明预计零改动，diff 对账验证（DS6） |

> 参考：Anthropic（契约优先 + 物理证据）+ K3 战略咨询（invariant 与形似神不似预警）+ 第一性原理（以生产事实为准）。收敛检查：各决策点参考系指向一致，无分歧。

---

## 自检清单

- [x] 北星 front-matter（PRODUCT-BRIEF §三.2 + K3 护城河锚定）
- [x] **派单前提与代码不符处如实标注**（§4.1: 事件化已交付；§7: durationMs 位置错位且已修——派单交付要求 #3）
- [x] 现状全部实测 origin/main @ e8ea8ed3（sentinel-events.ts 全文 / runner.ts 8 调用点 / session-store schema / 测试覆盖 / 修复在位 L97）——无凭记忆项
- [x] 5 章 D546 必覆盖: 事件模型（§5）/ D500 复用评估（§6，先读 src/store/ 代码）/ durationMs 定位（§7，确切 file:line）/ 契约对齐（§8 字段级表）/ 测试与验收（§10，回放+回归+接线+L07）
- [x] 五断言验收逐条落 DS（回放 sha256 / durationMs 正值 / 契约字段 ⊆ 表 / CI 三 job 贴结果 / 接线 grep）
- [x] 写集表（§3.3.1）标题符合 D381 契约；排除项含 D544 领地与 Win 写集文件；与 D544 零重叠
- [x] red→green 语义 = 故障注入证明网有效（S-5，适配"实现已在位"的现实）
- [x] 防膨胀红线: 零新组件、package.json 零 diff 为 DS6 可验证项；DSH 借鉴 = 理念级（D500/D394 已内化，本任务零新借鉴代码）
- [x] 本 spec 零代码写入；不碰 scripts/audit/；基线 sha 锚定 + 行号抽验指令（M7）
