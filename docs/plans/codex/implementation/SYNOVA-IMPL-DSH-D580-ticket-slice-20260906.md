<!--
  SYNOVA-IMPL-DSH-D580: 告警工单切片 — 8-2 工单入库断言 + 8-3 去重键稳定化 + 8-4 状态机 API
  状态: dev doc (spec-only 提交先行, D556 先例) | 2026-09-06 | 优先级 P1 (K3 全链路审计 P2-3 + N14 残留)
  权威文档: 派单-D580-20260906 + K3 P2-3 + AUDIT-FINDINGS-LEDGER D339 裁决 A + DSH借鉴指引 B-19 + AGENTS.md 铁律 24/31/47/48
  依赖: D354 (signal/notif/conflict 键已稳定——本单补 finding 键); D463 (自动工单写路径已在表); D577 (threshold 注入, 回归基线)
  并行: D579 (scripts/product-lines 域) / D578 (scripts/desktop 域) / P0 文档批 (docs/authority 域) — 写集零重叠
  提交策略预登记（spec-only 提交的预期漂移, D577 §5.1 先例）: 上表 7 修改文件在 spec 阶段零 diff、4 新建文件不存在——check-dev-doc-write-set.sh (G12c, 软检查) 对 spec-only 提交将报预期漂移; 消解 = 编码首个 commit 同批提交 spec 文件, 届时全部命中零漂移。gatekeeper C6 只验写集表可提取（不受影响）。
-->

# D580: 告警工单切片（8-2 入库 / 8-3 去重稳定化 / 8-4 状态机 API）

> 一句话问题: 哨兵工单的**写路径与读路径分裂**（K3 P2-3: 表有 INSERT 但 GET /tickets 读内存派生），finding.id 含时间戳导致**去重键不稳定**（N14 残留: D354 只修了 signal/notif/conflict 三键，aggregate finding 键未修），且**工单无状态机 API**（工单级 acknowledge/resolve/dismiss 只能改库，无端点）。

---
north-star:
  服务用户: GA（增长顾问）——7×24 哨兵巡检产出告警后，需要一个可信的工单收件箱（看到 → 认领 → 办结）
  服务场景: 哨兵 cron 巡检发现 critical 异常 → 自动建工单落表 → GA 通过 API 打开/处理工单 → 重启后工单与去重状态不丢
  模块终态: 工单写读同源（表为准、内存只兜底且显式 degraded）；同问题不重复轰炸（稳定 finding id + 持久化通知去重）；工单全生命周期可由 API 驱动（open→acknowledged→resolved / open→dismissed，非法迁移 409）
  对齐北星: PRODUCT-BRIEF.md §三-2「哨兵定时巡检：发现异常 → 对比基线 → 信号路由给专家 → 严重信号自动建工单」+ §二「直接用户 = GA」
  完成标准: 派单 §三-4 三场景测试全绿（critical 注入 → 工单落表 GET 可见；同 finding 二次 check 不重复开单/不重复通知；acknowledge→resolve 全链路 + 非法迁移 409）
  当前进度: D463 建单写路径已落 sentinel_tickets 表；K3 P2-3 读路径仍读内存（分裂）；N14 finding.id 含时间戳（D354 未覆盖 aggregate 层）；通知去重 = 内存 Map 10min 硬编码（重启即丢，且违背 D339 裁决 A 的 5min）
---

## 1. Authority Doc Verification

**来源 1**: [派单-D580-告警工单切片-20260906.md](D580 派单)（§一 写前核实 6 项 / §二 三点 + 波及面红线 / §三 spec 必答 4 题 / §五 写集约束）

> | A | 8-2 工单入库接线统一: getSentinelTickets() 改为读 sentinel_tickets 表（写读同源），保留内存派生为表空时降级 + degraded 标注（铁律 24）……
> | B | 8-3 去重键稳定化: ① aggregate finding.id 去时间戳 → 内容稳定键……② 通知去重状态持久化（内存 Map → DB 表或 journal，重启不丢；窗口 5min 按 D339 裁决 A，常量可配）③ B-19 哲学裁决持久化载体
> | C | 8-4 工单状态机 API: 新增工单级状态变更端点（POST /api/sentinel/tickets/:id/transition，open→acknowledged→resolved / open→dismissed，非法迁移 409）

**来源 2**: K3 全链路审计 P2-3（经派单 §一-③ 转述，CTO 已物理复核为真）:

> K3 P2-3 教训「写路径与读路径必须同源」（派单 §一-⑥ 原文）

**来源 3**: [AUDIT-FINDINGS-LEDGER.md](审计发现台账) L106 — D339 创始人裁决 A:

> 决策 | N14 去重窗口 ✅ 裁决 A（文档改 5 分钟，任务地图 v2 已改 2026-08-13）

**来源 4**: [DSH借鉴指引-v2-20260904.md](docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md) §4 B-19（派单 §一-④ 指定借鉴）:

> | B-19 | 持久化分级哲学：提醒/会话走日志（冷恢复免费），伴随会话的长跑作业走内存——「按死后是否需要复活选路线」（dsh-schedule vs dsh-jobs 对照） | Sentinel 工单/哨兵任务的存储选型准则 |

DSH 源码锚点实测: `@deepseek-ai/dsh-schedule/lib/index.js` L401-405 区域 — `applyScheduleChanges` 文档注释「This is the single transition authority shared by full-log replay and the incremental Session projection」——单一状态迁移权威 + full-log replay 模式已核实存在。借鉴遵守 G1 零 import（只读源码学哲学，自写实现）。

**来源 5**: AGENTS.md 铁律 24/31（异常处理 log + degraded 显式）/ 铁律 47（契约优先）/ 铁律 48（测试三路径非空壳）/ 铁律 9（关键变更 grep 全仓库传播）。

## 2. Problem Statement

三个缺口，一个共同根源（状态的身份与存储不可信）:

1. **8-2 读路径分裂（K3 P2-3）**: `getSentinelTickets()`（src/agent/sentinel-service.ts L253-279）从 `runner.getRecentResults()` 内存 findings 派生伪工单（id = `` `${sentinelId}_${f.id}` ``），**从不读 sentinel_tickets 表**——表里 D463/D466 写入的工单（含 status 状态机字段）GA 永远看不到。GA 处理工单 = 改一行内存投影，重启即失。
2. **8-3 去重键不稳定（N14 残留）**: 43/44 个 extensions/sentinels/*/aggregate.ts 的 finding.id 以 `-${now.getTime()}` 结尾（实测清单见 §4.3）——同问题每轮新 id。D354 修了 signal/notif/conflict 三键（tests/sentinel/dedup-key-stability.test.ts 契约在案），**finding 键未修**。叠加: 通知去重状态 = 内存 Map（runner.ts L185-187），10min 硬编码（D339 裁决 A 应为 5min），重启即丢。
3. **8-4 工单无状态机 API**: 表 DDL 四态（open/acknowledged/resolved/dismissed）与自动销单路径（runner.ts L988-996）已存在，但**无工单级状态变更端点**——现有 POST /api/sentinel/alerts/:id/action 是卡片级 confirm/dismiss（routes/sentinel.ts L101-136），作用于 finding 卡片而非工单行。

横切影响: finding.id 不只是展示键——它是事件重放投影索引（runner.ts L909 `findingById.set(finding.id, finding)`）、finding 状态迁移匹配键（L951）、事件 finding_transition 重放查找键（L919-926）。id 不稳定 = finding 生命周期状态跨轮失效。

## 3. Q0-Q4

### Q0: 定位 — 项目拼图 + 文件审计

**a) 项目拼图**: 垂直切片跨 L1/L2/L3。主体在 L3 哨兵域（src/sentinel/runner.ts + extensions/sentinels/），经 L2 编排服务（src/agent/sentinel-service.ts）暴露给 L1 路由（src/routes/sentinel.ts）。数据落在 L5 SQLite（sentinel_tickets 表 + 新 dedup 表），由 L3 runner 持有 db 句柄读写（既有先例: L677/L720 INSERT、L988 UPDATE——check-architecture.sh 的 L3→L5 检查仅扫描 src/l3/，src/sentinel/ 不在拦截面，先例合规）。

**b) 文件审计**（全部实测，行号为 2026-09-06 HEAD 7afbb23f 现值）:

| 现场 | 位置 | 实测结论 |
|---|---|---|
| 工单表 DDL | src/sentinel/runner.ts L209-220 | sentinel_tickets: id/signal_id/severity(CHECK 四值)/expert_type/diagnosis/suggested_actions/status(CHECK open,acknowledged,resolved,dismissed)/created_at/resolved_at |
| 写路径①专家工单 | runner.ts L677-683 | INSERT OR REPLACE, id = `` ticket-${signalId}-${expertType} ``, signal_id = signal.id |
| 写路径②自动工单 | runner.ts L707-727（调用点 L591-595） | INSERT OR REPLACE, id = `` ticket-${signal.id}-auto ``, expert_type='auto'；注释声称「信号 id 已由 D354 去时间戳 → 去重键稳定」 |
| 读路径（缺口 A） | src/agent/sentinel-service.ts L253-279 | getSentinelTickets 从 getRecentResults() 内存派生，不读表 |
| 路由层 | src/routes/sentinel.ts L88-97 / L101-136 | GET /tickets 转发内存派生（L90 读 req.query.status 但**未使用**——死变量）；POST /alerts/:id/action 是卡片级 |
| N14 缺口 | runner.ts L185-187 + L1131-1144 | notificationSentTimestamps = 内存 Map<sentinelId, ms>；NOTIFICATION_DEDUP_MS = 10\*60\*1000 硬编码 |
| N14 根因 | extensions/sentinels/customer-demand-shift/aggregate.ts L78/L87/L105/L114/L125/L137/L150 | 7 处 id 全部 `` `e4-xxx-${now.getTime()}` `` |
| signal id 派生 | src/sentinel/signal-aggregator.ts L144 + L177-183 | id = `` sig_${entity} ``，entity = title 冒号前缀或前 30 字符（**不含 finding.id**） |
| finding.id 消费方 | runner.ts L909 / L919-926 / L951 | 事件重放索引 / finding_transition 重放 / migrateFindingStatus 匹配（§4.2 全清单） |
| 自动销单 | runner.ts L981-1019 | closeTicket: `` signal_id LIKE '%'+sentinelId+'%' `` → UPDATE resolved |

**c) 决策**: 复用 sentinel_tickets 表（写路径已在，补读路径 + 状态机）——不新建工单存储；通知去重按 B-19 裁决走独立 SQLite 表（§5.3 裁决）；finding.id 采用「去时间戳后缀」最小机制而非哈希键（§5.5 裁决 1）。

### Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- **memory 教训**: N14/D354（同问题每轮新 id → 5/30 分钟窗口永不生效——本轮 D339 裁决 5min + 键稳定化一并执行）；K3 P2-3（写读同源）；D463/D466（自动工单幂等靠 INSERT OR REPLACE，前提是键稳定）；D336 多角色认领制（本单写集与 D579/D578 零重叠已核）。
- **Anthropic 工程基线**: 单一事实源（表为准，内存显式降级标注）；状态机显式化（合法迁移白名单，非法显式拒绝 409 而非静默）；fail-closed（degraded 必须可辨，铁律 24/31）。
- **开源实证**: Linear/GitHub issue 状态机 = 白名单迁移 + 409/422 拒绝非法迁移；dsh-schedule 单一迁移权威（B-19 锚点，§1 来源 4）。
- **决策参考系（S-12，多选项决策全部收录 §5.5 决策表）**: 参考：Anthropic + DSH B-19 + 第一性原理 + 结论（收敛检查无分歧）。

### Q2: 范围 — 正确的最简方案

**做什么**:
- src/sentinel/runner.ts — 新增工单读方法 + 状态机迁移方法 + 通知去重持久化（新表 DDL + TTL 清理 + 5min 可配窗口）
- src/agent/sentinel-service.ts — getSentinelTickets 改表读优先 + 空表/db 失败降级；新增 transitionSentinelTicket
- src/routes/sentinel.ts — GET /tickets 接通 status 过滤 + degraded 透出；新增 POST /tickets/:id/transition
- extensions/sentinels/（43 文件，仅 id 生成行）— 去时间戳后缀
- tests/sentinel/ + tests/routes/ — 4 新建 + 3 既有断言修复（§5.1 写集表）

**不做什么**:
- 不改 scripts/audit/audit-check.py（K3 红线，永不碰）
- 不改 scripts/product-lines/product-lines.yaml（D579 领地，CT-42 不触发）
- 不改 src/sentinel/signal-aggregator.ts（写集外；title 前缀实体键的值漂移问题如实记录为已知限制，§6）
- 不改 src/server.ts（sentinel 路由挂载已存在，无需动）
- 不改 src/config.ts（5min 窗口 env 覆盖在 runner.ts 内实现）
- 不改 VERSION.md（D579 编码阶段将 bump，单写者纪律）
- 不改 electron-renderer/（实测 GET /tickets 无前端消费方——§4.4）

### Q3: 验收 — 入口 → 交互 → 结果

- **入口**: ① cron 触发哨兵 check 产出 critical finding；② GA 调 GET /api/sentinel/tickets；③ GA 调 POST /api/sentinel/tickets/:id/transition。
- **处理**: ① aggregate 产出稳定 id finding → 聚合 → 自动工单 INSERT OR REPLACE 落表；② runner.listSentinelTickets 读表（空表/读失败 → 内存派生 + degraded 标注）；③ transitionTicket 校验状态机白名单 → UPDATE + ticket_transition 审计事件。
- **结果**: ① 工单行落 sentinel_tickets 且 GET 反映该行（8-2）；② 同 finding 二次 check 行数不增、窗口内通知不重发（8-3）；③ acknowledge→resolve 全链路 200，非法迁移 409，未知工单 404（8-4）。

### Q4: 契约与测试

全部新契约 JSDoc 三要素（@input/@output/@degraded/@error）见 §5.2-5.4 代码锚；测试三路径（正常/降级/边界）矩阵见 §7（铁律 47/48）。red 先行: §7 red→green 表在实现前必须 red。

## 4. Current State（2026-09-06 实测，全部 grep/read 验证）

### 4.1 六个现场

见 §3 Q0-b 表格（行号实测）。补充两点:

- GET /tickets 的 `status` query 参数（routes/sentinel.ts L90）读取后**未传递未使用**——死变量；新实现必须在表读 SQL 与内存 fallback 两条路径都真实生效。
- DDL 的 status CHECK（runner.ts L216）已含四态枚举——8-4 无需改表，只补 API。

### 4.2 finding.id 消费方全清单（波及面红线 §二-注意 的 grep 实测）

全仓 grep `.id`/`findingId` 消费 finding.id 的下游（2026-09-06 实测）:

| # | 消费方 | 位置 | 稳定键影响 | 处置 |
|---|---|---|---|---|
| 1 | 事件重放投影索引 | runner.ts L909 `findingById.set(finding.id, finding)` | 同 id 后轮覆盖前轮（最新胜出）——语义正确 | 无需改 |
| 2 | finding_transition 重放 | runner.ts L919-926 | 稳定 id 后跨轮可命中（现状: 跨轮 miss → log.warn 跳过） | 改善，无需改 |
| 3 | migrateFindingStatus | runner.ts L951 `if (f.id !== findingId) continue` | 同上 | 无需改 |
| 4 | 工单 signal_id 关联 | runner.ts L677/L720 写入值 = signal.id = `` sig_${entity} ``（signal-aggregator.ts L144） | **signal_id 从不含 finding.id**——finding.id 稳定化不影响工单关联语义 | 无迁移需要（必答裁决见 §5.5-4） |
| 5 | 卡片级 action | routes/sentinel.ts L119 → interactive-card.ts | findingFinder 未注入（L115-120 实参无 findingFinder），details 走「未找到」降级 | 无需改 |
| 6 | 内存伪工单 id | sentinel-service.ts L265 `` `${sentinelId}_${f.id}` `` | 8-2 改造后此派生整体消失 | 随 A 项移除 |
| 7 | 既有测试断言 | threshold-injection.test.ts L134、threshold-manifest-flip.test.ts L50-51 | `` startsWith('e4-churn-crit-') `` 尾横杠断言在去后缀后 **break**（'e4-churn-crit'.startsWith('e4-churn-crit-') = false） | 断言去尾横杠（写集内修复） |

> 其余 grep 命中（tests/skill/d66-manifests、tests/ci/golden-case-checker、tests/phase4-ecosystem、tests/l3/e2e-report-adapter）为 'ph**ase4-**'/'e2e' 子串误命中，非 finding.id 消费方（已逐个 open 核实）。

### 4.3 时间戳污染面（43/44 文件实测清单）

`grep -rln 'getTime()\|Date.now()' extensions/sentinels/*/aggregate.ts` → **43 个文件**（全仓 aggregate 共 44）。唯一例外: 已含稳定 id 的文件不计入修改。代表性样例（全清单入 evidence）: api-coverage（5 处）、business-model-coherence（4 处）、capital-health（16 处）、channel-capacity（5 处）、customer-demand-shift（7 处）、data-health（6 处）、cash-runway（仅 L100 `` cr-error-${Date.now()} `` 1 处，其余 id 已稳定）。

### 4.4 既有测试与消费方基线

- tests/sentinel/ 现存 26 项（25 test.ts + 1 adapters 目录，派单口径 26 文件）——回归基线，全绿后才算完。
- tests/sentinel/dedup-key-stability.test.ts（D354 契约）: L152-167 通知去重测试用「间隔 12 分钟越过 10 分钟窗口」——窗口改 5min 后该用例仍绿（12 > 5），但需补「窗口内命中去重」用例 + 注释口径同步。
- tests/sentinel/sentinel-runner-auto-ticket.test.ts（D466）: better-sqlite3 :memory: + 自建 TICKET_DDL 模式——新测试对齐此模式。
- tests/sentinel/sentinel-service-closure.test.ts: mock runner 仅含 runOnce/aggregateAndDispatch——getSentinelTickets 改造后若消费新 runner 方法，此 mock 需同步补方法。
- GET /api/sentinel/tickets 前端消费方: **无**（electron-renderer 仅消费 /api/sentinel/signals——LeftPanel.tsx L72-73、RightPanel.tsx L488 实测；src/tui/ 零 tickets 引用）。响应形状扩展低风险，仍保持旧字段向后兼容。

## 5. What We Build

### 5.1 写集 (7 修改 + 4 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/sentinel/runner.ts | 修改 | ①新增 listSentinelTickets(status?) 表读方法；②新增 transitionTicket(id, to) 状态机方法（白名单 + 审计事件）；③通知去重持久化（新表 DDL + 读写 + 启动 TTL 清理）；④窗口 10min→5min（D339 裁决 A）+ env 可配 |
| src/agent/sentinel-service.ts | 修改 | ①getSentinelTickets 表读优先 + 空表/db 失败 → 内存派生 fallback + degraded 标注；②TicketsResponse 扩展 source/degraded/status 字段；③新增 transitionSentinelTicket |
| src/routes/sentinel.ts | 修改 | ①GET /tickets 接通 status 过滤（消灭死变量）+ degraded/source 透出；②新增 POST /tickets/:id/transition（400/404/409/503 映射）；③文件头端点清单注释同步 |
| extensions/sentinels/ | 修改 | 目录级条目——43 个 aggregate 文件仅 id 生成行去时间戳后缀（`` -${now.getTime()} `` / `` -${Date.now()} ``），其余行零触碰 |
| tests/sentinel/dedup-key-stability.test.ts | 修改 | 窗口口径 10min→5min 注释同步 + 新增「窗口内命中去重（不重发）」用例 |
| tests/sentinel/threshold-injection.test.ts | 修改 | L134 startsWith 尾横杠断言适配稳定 id（e4-churn-crit- → e4-churn-crit） |
| tests/sentinel/threshold-manifest-flip.test.ts | 修改 | L50-51 同款尾横杠断言适配 |
| tests/sentinel/finding-id-stability.test.ts | 新建 | 43 aggregate 全量 id 稳定性（import.meta.glob 全扫 + fake timer 双跑同 id + 单轮内 id 互异） |
| tests/sentinel/ticket-store.test.ts | 新建 | listSentinelTickets 表读/空表/db 失败 + 通知去重持久化（重启恢复 = 新 runner 实例同库）三路径 |
| tests/sentinel/ticket-transition.test.ts | 新建 | 状态机全部合法迁移 + 非法迁移 + 终态幂等拒绝 + resolved_at 语义 |
| tests/routes/sentinel-tickets.test.ts | 新建 | 真实 router 接线：GET /tickets（table/memory-fallback 双源）+ POST transition 的 200/400/404/409/503 全映射 |

> 编码 commit 时上表 11 条目应全部命中 git diff（spec-only 提交阶段的预期漂移见文件头预登记）。**VERSION.md 不在本表**（D579 单写者）；task-state/D580.json、.claude/task-briefs/、memory/notes/、evidence 目录为流程工件，豁免登记（check-dev-doc-write-set.sh SKIP 口径）。

### 5.2 A 项（8-2）: 工单入库接线统一 — 写读同源

**L3 新增**（src/sentinel/runner.ts，紧邻 closeTicket 放置）:

```ts
/**
 * listSentinelTickets — 工单读路径（写读同源, D580 8-2 修复 K3 P2-3）
 * 契约:
 *   @input  — status?: 'open' | 'acknowledged' | 'resolved' | 'dismissed'（缺省返回全部）
 *   @output — 工单行数组（created_at DESC, LIMIT 200），字段对齐 sentinel_tickets DDL
 *   @degraded — 本方法不吞错: db 失败/表不存在 → 抛出，由 L2 调用方统一降级
 *               （降级决策单点在 sentinel-service，铁律 31 传播链清晰）
 *   @error  — 表不存在（start() 未调用）→ 同上抛出
 */
listSentinelTickets(status?: TicketStatus): TicketRow[]
```

**L2 改造**（src/agent/sentinel-service.ts getSentinelTickets）:

```ts
/**
 * getSentinelTickets — 工单查询（D580 8-2: 表为准, 内存只兜底）
 * 契约:
 *   @input  — status?: TicketStatus（透传）
 *   @output — { ok: true, source: 'table', tickets } — 表有行（权威路径）
 *             { ok: true, source: 'memory-fallback', degraded: true, tickets } — 表空或读失败
 *   @degraded — 表空（0 行）或 db 异常 → 内存派生 fallback + degraded: true + log.warn
 *               （铁律 24: 区分 db 失败[warn] 与表空[info 级 fallback]；两者都显式标注）
 *   @error  — 不抛（内部全捕获，降级形状完整）
 */
```

- TicketsResponse 扩展: `source: 'table' | 'memory-fallback'`、`degraded?: boolean`、ticket 项增 `status` 与 `resolvedAt?`；旧字段 id/title/severity/createdAt 保持（向后兼容，实测无前端消费方但契约不破）。
- severity 映射: 表值 'emergency' → 响应 'critical'（对齐现有内存派生 L267 先例）。
- title 派生: diagnosis JSON parse → `.title ?? summary?.slice(0, 80) ?? signal_id`（parse 失败 → log.warn + signal_id 兜底——区分 ENOENT 型缺失与 JSON 损坏，铁律 24）。
- 两条数据源并存时**以表为准，内存只兜底**（必答 3 裁决）。status 过滤: 表路径 SQL WHERE，fallback 路径内存过滤——两条路径都必须真实生效。

### 5.3 B 项（8-3）: 去重键稳定化 + 持久化

**① finding.id 去时间戳**（extensions/sentinels/ 43 文件，仅 id 生成行）:

- 规则: 删除 id 模板字符串中的 `` -${now.getTime()} `` / `` -${Date.now()} `` 后缀，保留既有类别前缀。例: `` `e4-concent-crit-${now.getTime()}` `` → `` `e4-concent-crit` ``。**每文件其他行零触碰**；若同一文件内同轮可能产出同前缀 id（实测 43 文件均为 if/else 互斥分支，不存在），以 finding-id-stability.test.ts 的单轮互异断言物理兜底。
- cash-runway/aggregate.ts L100 的 `` `cr-error-${Date.now()}` `` 一并去时间戳（该文件其余 id 已稳定，不动）。

**② 通知去重持久化**（runner.ts）:

```ts
// 新表（start() 内, 与 sentinel_tickets DDL 并排）:
// CREATE TABLE IF NOT EXISTS sentinel_notification_dedup (
//   key TEXT PRIMARY KEY,          -- = sources[0].sentinelId（键粒度与既有内存 Map 一致, 不改语义）
//   last_sent_ms INTEGER NOT NULL  -- epoch ms（ INTEGER 便于窗口比较; 不用 datetime('now') 秒级 TEXT ）
// );
```

- `markNotificationSent`: 内存 Map 写穿 + 表 UPSERT（try/catch → 失败 log.warn degraded，内存兜底——行为与改造前一致，不静默）。
- `isNotificationDuplicate`: 优先读表（命中即回填内存缓存）；db 失败 → 回退内存 Map + log.warn。窗口判断逻辑不变（`` Date.now() - last < NOTIFICATION_DEDUP_MS ``）。
- 启动 TTL 清理（必答 2）: `DELETE FROM sentinel_notification_dedup WHERE last_sent_ms < ?`（now - window）——过期记录天然惰性无害（窗口判断返回 false），启动清一次防表膨胀即可，不建定时任务（最少机制）。
- 窗口: `NOTIFICATION_DEDUP_MS` 10min → **5min**（D339 裁决 A 落地），env `SENTINEL_NOTIFICATION_DEDUP_MS` 可覆盖（正整数校验，非法值 → 缺省 + log.warn）。

### 5.4 C 项（8-4）: 工单状态机 API

**L3**（runner.ts）:

```ts
/**
 * transitionTicket — 工单状态机迁移（D580 8-4）
 * 契约:
 *   @input  — ticketId: string; to: 'acknowledged' | 'resolved' | 'dismissed'
 *   @output — { ok: true, ticket: TicketRow }（迁移后行）
 *             { ok: false, error: 'TICKET_NOT_FOUND' }            （无此行）
 *             { ok: false, error: 'ILLEGAL_TRANSITION', from, to } （白名单外迁移）
 *   @degraded — db 失败 → { ok: false, degraded: true, error } + log.warn（铁律 24/31）
 *   @error  — 不抛（全捕获分类返回, HTTP 映射在 L1）
 * 状态机（白名单, 其余一律 ILLEGAL_TRANSITION）:
 *   open → acknowledged | open → dismissed | acknowledged → resolved
 *   resolved / dismissed = 终态（任何再迁移 → ILLEGAL_TRANSITION; 同态迁移亦 409）
 * resolved_at 语义: 仅 'resolved' 写 datetime('now')（列名语义纯度; dismissed 保持 NULL——
 *   不为它新增 closed_at 列, 最少机制, 决策见 §5.5-6）
 * 审计: 迁移成功 → appendSentinelEvent({ event_type: 'ticket_transition', aggregate_id: ticketId,
 *   sentinel_id: row.signal_id || ticketId, payload: { ticketId, from, to, at } })——
 *   事件写入失败 → log.warn 不阻断（对齐 L687-696 既有降级先例）
 */
transitionTicket(ticketId: string, to: 'acknowledged' | 'resolved' | 'dismissed'): TransitionResult
```

**L2**（sentinel-service.ts）: `transitionSentinelTicket(id, to)` — 校验 to 枚举（非法 → ok:false error:'INVALID_TARGET'，路由 400）→ 透传 runner → 结果原样传播（含 degraded）。

**L1**（routes/sentinel.ts）:

```ts
// POST /api/sentinel/tickets/:id/transition   body: { to }
//   200 { ok: true, ticket }   — 迁移成功
//   400 { ok: false, error }   — body 缺 to / to 非法枚举
//   404 { ok: false, error: 'TICKET_NOT_FOUND' }
//   409 { ok: false, error: 'ILLEGAL_TRANSITION', from, to }
//   503 { ok: false, degraded: true }  — db 不可用
```

### 5.5 spec 必答 4 题裁决（含决策参考表, S-12）

**裁决 1（必答 1）finding.id 稳定键组成**: **不加哈希，去时间戳后缀即稳定键**。既有类别前缀（e4-concent-crit / f3-spread-crit / t2-api-warn…）已编码「哨兵维度缩写 + 指标类别 + 严重度」，正是派单要求的「sentinelId + 类别」语义；「关键维度值哈希」不引入——① 实测 43 文件内同类别 finding 每轮至多 1 条（if/else 互斥），键已在类粒度唯一；② 维度身份变化（top 客户更替、atrisk 集合增减）由 INSERT OR REPLACE 刷新工单 diagnosis 内容承载（工单 = 问题类，不是问题快照），行身份不变更正确；③ 哈希 = 新机制 + 每文件维度选型 + crypto 依赖，违背最少机制。**消失后复现 = 同 finding（同 id）**: 窗口语义 = 通知去重窗口内静默、窗口过后重新通知（这是窗口存在的意义）；工单侧 INSERT OR REPLACE 将 status 重置 open（D463 既有语义，复现重开单合理，保留并文档化）。

**裁决 2（必答 2）去重持久化载体**: **独立 SQLite 表 sentinel_notification_dedup**。三选项对照: ① sentinel_tickets 加列——拒绝: 工单键（ticket id）与去重键（sentinelId）基数不对齐，且工单=工作流状态、去重=限流状态，关注点分离；② journal 文件——拒绝: B-19 的日志路线是为「冷恢复免费」的复杂状态机（dsh-schedule full-log replay + 单一迁移权威）服务，dedup 状态死后只需恢复「最后发送时间」单事实，KV 一行即可，日志重放是杀鸡用牛刀（第一性原理: 最少机制）；且 journal 引入第二个持久化介质 = 两处状态源，违背 K3 P2-3「写读同源」的姊妹原则（单一权威）。③ 独立表——选中: 与 sentinel_tickets 同库同事务域（runner 已持 db 单一权威），重启复活语义 = 启动时一行 SELECT 即得，TTL 过期记录启动时 DELETE（§5.3-②）。收敛检查: Anthropic（单一事实源）与 B-19（按复活需求选型——dedup 需要复活 → 持久化；持久化介质选最简 KV 表）指向同一答案。

**裁决 3（必答 3）8-2 降级语义**: degraded 暴露 = 响应体 `source: 'table' | 'memory-fallback'` + `degraded: true` 双标记（结构化字段优先于约定字符串，前端可直接分支展示「历史工单暂不可用」）；两条数据源并存**以表为准，内存只兜底**——表有行时内存派生永不参与。表空即降级（派单字面要求）: 健康系统 critical 历史应为表行，0 行通常意味着写路径故障或冷启动——降级标注比静默空列表诚实；代价是新装环境首次展示 fallback + degraded（可接受，注释文档化）。

**裁决 4（波及面）signal_id 关联迁移策略**: 实测 ticket.signal_id 写入值 = signal.id = `` sig_${entity} ``（signal-aggregator.ts L144），**finding.id 从不进入 signal_id**——finding.id 稳定化对工单关联零影响，无迁移需要。顺带实测发现: closeTicket 的 `` signal_id LIKE '%sentinelId%' ``（runner.ts L990-995）在现状下匹配不到 auto 工单（sig_xxx 不含 sentinelId 字面）——**既有缺口如实记录，本单不修**（修它需改工单写入值语义并验证 L3WriteAPI 消费方，超出派单三点范围；记入 §6 已知限制 + memory note 供后续任务认领）。

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| finding.id 稳定键 | A 去时间戳后缀 / B 前缀+维度值哈希 | 第一性原理（键=类身份，值漂移由内容承载）+ Anthropic（最少机制）+ 43 文件互斥分支实测 | **A** |
| 去重载体 | A 加列 / B journal / C 独立表 | B-19（复活需求 → 持久化；介质选最简）+ K3 P2-3（单一权威） | **C** |
| 工单读降级 | A 表空返回空列表 / B 表空 → 内存 fallback + degraded | 派单字面要求 + 铁律 24（显式降级不静默） | **B** |
| resolved_at 语义 | A resolved+dismissed 都写 / B 仅 resolved 写 | 列名语义纯度 + 最少机制（不新增列） | **B** |
| 状态机严格度 | A 宽松（任何→任何）/ B 白名单（派单字面）| 派单 §二-C 字面 + Linear/GitHub 状态机实证 | **B** |

> 收敛检查: 五个决策点双参考系均收敛，无分歧。**参考：Anthropic + DSH B-19 + 第一性原理**。

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/sentinel/signal-aggregator.ts | 写集外（派单 §五）。已知限制如实记录: extractEntityKey（L177-183）取 title 冒号前缀/前 30 字符——title 含活值（如「客户流失率过高 (数量23%…)」无冒号走 30 字符截断）时 entity 键随值漂移 → sig id 漂移 → auto 工单 id（`` ticket-${signal.id}-auto ``）漂移。同输入数据双跑不受影响（验收场景成立），值漂移场景可能产生新工单行。后续修复需动 extractEntityKey 值剥离——已记入 memory note 供独立任务认领 |
| 修 closeTicket 的 signal_id LIKE 匹配缺口 | 裁决 4: 既有缺口，本单不修（见 §5.5-4） |
| 改专家工单写路径（runner.ts L677） | expert 工单 id `` ticket-${signalId}-${expertType} `` 语义独立，D463/D463 闭环已验收，不动 |
| 新增通知渠道 / 改 dispatchNotification | 通知派发层（src/notifications/）不在派单范围；本单只管去重状态 |
| 改 POST /alerts/:id/action 卡片语义 | 卡片级与工单级是两个交互面，并存不冲突（§2-3） |
| 改 DDL / 迁移 sentinel_tickets | 四态 CHECK 已满足 8-4；dedup 走新表 |
| VERSION.md / scripts/product-lines/ | D579 单写者 + CT-42 不触发（派单 §四-4） |
| electron-renderer/ 适配 | 无消费方（§4.4 实测）；响应向后兼容 |

## 7. Test Requirements（测试先行 — 铁律 0-2/47/48）

**第一步（red）**: §5.1 四个新建测试在实现前必须 red（对齐 dedup-key-stability.test.ts 的 red 基准传统）。

**L1 单元（tests/sentinel/）**:

| 用例 | 层 | red（实现前） | green（实现后） |
|------|:---:|------|------|
| finding-id-stability: 43 aggregate 各自双跑（fake timer 推进 >1min）→ id 数组逐元素相等 | L1 | 现 id 含时间戳 → 双跑 id 必异 → red | 同输入同 id |
| finding-id-stability: 单轮内 id 互异（Set 尺寸 = 数组长度） | L1 | 已绿（回归护栏） | 保持 |
| finding-id-stability: 空库/降级分支产出的 id（degraded/error 路径）同样稳定 | L1 | red | green |
| ticket-transition: open→acknowledged / acknowledged→resolved / open→dismissed 全部 200 形状 | L1 | 方法不存在 → red | 状态落表 + 审计事件落 sentinel_events |
| ticket-transition: acknowledged→dismissed / resolved→任何 / 同态迁移 → ILLEGAL_TRANSITION + from/to 字段 | L1 | red | 409 映射 |
| ticket-transition: 未知 id → TICKET_NOT_FOUND | L1 | red | 404 映射 |
| ticket-transition: 仅 resolved 写 resolved_at; dismissed 保持 NULL | L1 | red | green |
| ticket-store: 插入工单后 listSentinelTickets 返回行（含 status 过滤生效） | L1 | red | green |
| ticket-store: 空表 → getSentinelTickets 走 memory-fallback + degraded:true + source 标注 | L1 | red | green |
| ticket-store: db 句柄损坏（抛错注入）→ 同上 fallback + log.warn（vi.spyOn 断言非静默） | L1 | red | green |
| ticket-store: 通知去重持久化——runner A 发送 → 销毁 → 同库新 runner B → 窗口内 isDuplicate 命中 | L1 | red（重启即丢） | green |
| ticket-store: 窗口 5min——env 覆盖生效 + 非法 env 回退缺省 | L1 | red（10min 硬编码） | green |

**L2a 接线（tests/routes/sentinel-tickets.test.ts，真实 router 不 mock 管线 — 铁律 12）**:

| 用例 | red | green |
|------|------|------|
| GET /api/sentinel/tickets（表有行）→ 200 + source:'table' + status 字段在场 | 端点行为旧 | 新 |
| GET /api/sentinel/tickets?status=open → 过滤真实生效（死变量修复的物理证明） | red | green |
| POST /api/sentinel/tickets/:id/transition 合法迁移 → 200 { ok, ticket } | 路由不存在 → 404 | 200 |
| 同端点: 非法迁移 → 409 + from/to；未知 id → 404；body 缺 to → 400；runner 抛错 → 503 + degraded | red | green |

**L2b 降级**: 上表 ticket-store 三条降级用例 + 路由 503 用例（degraded 传播链: runner → service → route 响应体，铁律 31 全链）。

**L2c 边界**: 状态机终态幂等拒绝 / 同态 409 / env 非法回退 / INSERT OR REPLACE 重复触发幂等（D466 既有用例保持绿）/ dedup-key-stability 新增「窗口内命中不重发」用例。

**既有测试修复**（写集内 3 文件）: threshold-injection L134、threshold-manifest-flip L50-51 尾横杠断言；dedup-key-stability 窗口口径。sentinel-service-closure 的 runner mock 按需补方法（保持绿）。

## 8. Wiring Verification

| 新/改 export | 生产调用点（真实传递, 测试调用不计） | 验证命令 |
|------|------|------|
| runner.listSentinelTickets | sentinel-service.ts getSentinelTickets L253 区域（表读分支） | `grep -n "listSentinelTickets" src/agent/sentinel-service.ts src/sentinel/runner.ts`（≥2 生产点） |
| runner.transitionTicket | sentinel-service.ts transitionSentinelTicket（新） | `grep -n "transitionTicket" src/agent/sentinel-service.ts` |
| service.transitionSentinelTicket | routes/sentinel.ts POST /tickets/:id/transition handler（新） | `grep -n "transitionSentinelTicket" src/routes/sentinel.ts` |
| POST /tickets/:id/transition | routes/sentinel.ts router.post 注册 → server.ts L56 sentinelRoutes 挂载（/api/sentinel 前缀，既有） | `grep -n "tickets/:id/transition" src/routes/sentinel.ts` + `grep -n "routes/sentinel" src/server.ts` |
| getSentinelTickets 表读改造 | routes/sentinel.ts L91（既有调用点不变，行为改造） | curl 冒烟: `curl -s localhost:3000/api/sentinel/tickets \| head -c 200` 含 source 字段 |
| 稳定 finding id | aggregate check → runner 事件持久化（persistRunEvents）→ 重放索引 L909 | finding-id-stability.test.ts 全量 + `grep -c "getTime()" extensions/sentinels/*/aggregate.ts` 逐文件 0 命中（id 行） |

架构自检: L1 routes 只 import L2 sentinel-service（既有 import 块 L15-21，新增 transitionSentinelTicket 同块）——零新增跨层; runner 直 SQL 有既有先例且不在 check-architecture.sh 拦截面（§3 Q0-a）。

## 9. Architecture Layer

**垂直切片 L1+L2+L3（数据落 L5, 经 L3 句柄）**——按用户可见行为拆（GA 可见的工单收件箱）, 不按技术层拆（铁律 1）。主体逻辑（读方法/状态机/去重持久化）在 L3 sentinel/runner.ts: 它已持有 db 句柄与工单写路径（L677/L720/L988 先例），写读同源要求读写同处一地; L2 sentinel-service 保持薄服务（降级决策单点）; L1 routes 保持协议映射。extensions/sentinels/ 为 L3 哨兵适配器（文件驱动扩展点, 仅 id 行触碰）。不新增文件到 src/（零新文件 → 零新接线面 → 最少机制）。

## 10. Completion Standard（DS 与 spec 一一对应, 禁重编号, 缺项显式 descope — S-10）

1. **DS1**: 43 个 aggregate finding.id 全部去时间戳——`grep -rn 'getTime()\|Date.now()' extensions/sentinels/*/aggregate.ts` 仅剩非 id 行命中（逐文件核对入 evidence）；finding-id-stability.test.ts 全绿（双跑同 id + 单轮互异 + 降级路径稳定）。
2. **DS2**: 通知去重持久化——新表 DDL + 重启恢复用例绿（同库新 runner 窗口内命中）+ TTL 启动清理 + 窗口 5min（D339 裁决 A）+ env 可配；dedup-key-stability.test.ts 补窗口内命中用例后全绿。
3. **DS3**: getSentinelTickets 表读同源——表有行 → source:'table'；空表/读失败 → memory-fallback + degraded:true（log 非静默断言）；status 过滤两条路径真实生效（死变量修复）。
4. **DS4**: transitionTicket 状态机——三条合法迁移绿 + ILLEGAL_TRANSITION/TICKET_NOT_FOUND 分类 + 终态拒绝 + resolved_at 语义（仅 resolved 写）+ ticket_transition 审计事件落 sentinel_events。
5. **DS5**: POST /api/sentinel/tickets/:id/transition 路由注册 + 200/400/404/409/503 全映射（tests/routes/sentinel-tickets.test.ts 走真实 router）+ 文件头端点清单注释同步。
6. **DS6**: 派单 §三-4 三场景验收测试全绿（可作为 ticket-store/transition/routes 测试的集成用例或独立场景文件）: ① customer-demand-shift 注入 churn_rate>critical → 工单落表且 GET 可见；② 同 finding 二次 check 不重复开单/不重复通知（id 稳定验证）；③ acknowledge→resolve 全链路后 GET 反映终态。
7. **DS7**: 波及面证据链——finding.id 消费方 grep 清单（§4.2 七项）+ 断言修复清单落 `docs/synova/audit-reports/D580-ticket-slice-evidence-20260906/`（README + consumers-grep + red-green 三件, 对齐 D577 evidence 结构; 禁用根级 evidence/——.gitignore L76）。
8. **DS8**: 回归——tests/sentinel/ 26 文件全绿（含 D577 threshold-injection + flip, 修复断言后）；tsc 28=28 基线；全量 vitest 失败集与 main 基线 diff=空；as any = 0。
9. **DS9**: 铁律自检——新契约 JSDoc 三要素在场（§5.2-5.4 锚）；catch 全部 log + degraded 分类；无死代码残留（内存伪工单派生代码随 A 项移除后 grep 零引用）。
10. **DS10**: 写集一致——`git diff --name-only` 与 §5.1 表 11 条目全命中零漂移（spec 文件随编码 commit 同批入库）；无 Q2 排除项文件出现在 diff。
11. **DS11**: 完成报告 DS1-DS11 一一对应（✅/⏸/❌+理由）+ 决策记录（§5.5 五决策点参考系与结论, S-12）+ 已知限制声明（§6 前两条）。
12. **DS12**: 治理——零 VERSION bump / 零 product-lines 触碰（CT-42 不触发）；memory note（proposed → 随落地 git mv implemented/）被编码 commit 引用（铁律 49 commit-msg 门禁）；K3 审计入口就绪（审计由创始人另行安排）。

## 11. Auth Doc References

- docs/synova/coordination/派单-D580-告警工单切片-20260906.md（任务权威: 三点 + 必答 4 题 + 写集约束）
- docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md L106（D339 裁决 A: 去重窗口 5min）
- docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §4 B-19（持久化分级哲学）
- .claude/PRODUCT-BRIEF.md §三-2（北星: 严重信号自动建工单）
- AGENTS.md 铁律 0-2/9/24/31/47/48 + CLAUDE.md 铁律 39（五层边界）
- tests/sentinel/dedup-key-stability.test.ts（D354 键稳定契约先例）
- docs/synova/audit-reports/D577-sentinel-threshold-wiring-evidence-20260905/（evidence 结构先例）
- docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md（D381 指定结构范例）

## 附: 自检清单

- [x] 派单六项写前核实逐项复核（六现场行号实测, §3 Q0-b）
- [x] 波及面红线: finding.id 消费方全清单 grep 实测（§4.2, 七项含误报排除）
- [x] spec 必答 4 题全部落位（§5.5, 均带实测证据 + 决策参考系）
- [x] 多选项决策 5 项全收录决策表（S-12, §5.5）
- [x] 测试 red→green 对照表（§7, 覆盖正常/降级/边界/接线）
- [x] 写集表 D381 格式（标题行下紧跟表头; 目录级条目规避 glob 通配 — check-dev-doc-write-set.sh -F 定面匹配不认通配, 实测脚本 L117）
- [x] spec-only 提交预期漂移预登记（文件头, D577 §5.1 先例）
- [x] 与 D579/D578/P0 文档批写集零重叠（§5.1 不含 scripts/product-lines、scripts/desktop、docs/authority）
- [x] DS 一一对应（DS1-DS12, S-10）; 声称即引用（全部行号 2026-09-06 实测）
- [x] 不用 --no-verify; VERSION.md 禁碰
