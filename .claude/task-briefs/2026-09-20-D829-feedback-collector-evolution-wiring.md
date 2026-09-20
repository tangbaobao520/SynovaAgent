# D829 — packages/evolution 接线：feedback-collector 有真实消费方（线 17-1）

> 小队：批十四 · 编码队员 C ｜ 工作树 `.synova-wt-team14` ｜ 分支 `team/win-batch14`
> 基线：`origin/main@4f3bb21c`（工作树 `d527abcb`）
> 规格批准：待队长批（本文件 = 流程 ①，未批不写码）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
`packages/evolution` = **L0 横向切面**（不在五层内，铁律 39 不适用跨层判定，但**禁止反之引入跨层**）。
本卡目标 = 产品线 17-1 验收点：「反馈有真实消费方（feedback-collector 被真实调用，老板说『你判错了』能被消费）」——当前 `status: failed`。

### b) 文件审计（物理 grep，非记忆；全部在 `.synova-wt-team14` 内执行）
| 结论 | 证据（命令 + 结果） |
|---|---|
| 派单件「2,503 行零生产引用」**不成立** | 动态 `import('@synova/evolution')` 生产调用点 4 处（见下） |
| `SessionLearner` 已接线 | `src/l3/synova-diagnosis-engine-impl.ts:238`（`new SessionLearner()`）、`:266`、`:280` |
| `OrgAdapter` 已接线 | `src/agent/post-diagnosis-processor.ts:247`（`new OrgAdapter`） |
| `loadL0()` 已接线 | `src/routes/evolution.ts:23` |
| `RuleVersionManager` 已接线 | `src/routes/evolution.ts:93,101` |
| **`collectFeedback` 并非零调用——队长扫描漏了一处** | **`src/routes/chat.ts:70-71`：`const { collectFeedback } = await import('@synova/evolution'); collectFeedback({...})`** |
| 但该调用点**不持久化** | `packages/evolution/src/feedback-collector.ts:55` — 第二参 `memoryStore` 未传 → `persisted=false`；`:53` 只落模块级内存 Map |
| 且该调用点**静默降级** | `src/routes/chat.ts:76` `.catch(() => {})`（空吞，铁律 24）；`:77` `catch { log.debug(...) }` 无 degraded 传播 |
| **真缺口 = 读取/消费侧零消费方** | `getFeedbackByOrg` / `getFeedbackByAction` 在 `src/` **零调用**（仅 `packages/evolution/src/index.ts:52-53` 导出 + `tests/evolution/feedback-collector.test.ts`） |
| 下游消费者存在但永远读不到东西 | `packages/evolution/src/org-adapter.ts:199-204` / `:275-280` 读 `type='enterprise_fact' + tags:['user_correction']`；`src/` 无任何生产者写入该形状 → 消费者空转 |
| `collectAllFeedback` 有调用但**零参**（placeholder 假成功） | `src/routes/evolution.ts:210` `await collectAllFeedback()` — 无 memoryStore → `events: []` 假 200；且 `feedback-collector.ts:86` 用 `orgId: ''` 查询，本就永远读不到真实 org（本卡**不改**，见 Q2 排除项） |
| 同型陷阱（不走） | `src/l3/ga-collaboration.ts:62 setFeedbackCollector` 全仓零调用者（死缝）；`src/routes/ga-calibration.ts:13` 注释明示「禁 ga-collaboration 死链 GAFeedbackHandler」 |
| 同名混淆（不是本卡对象） | `src/growth/feedback-collector.ts` 已接线（`workspace-data.ts:141`、`ga-calibration.ts:203-`、`loop-handlers.ts:377`） |

**→ 缺口重述（比派单件更准）**：写侧在 `chat.ts:71` 存在但**不落库、静默失败**；读取/消费侧（`getFeedbackByOrg` + `OrgAdapter`）**零生产读者** → 「老板说『你判错了』」进了内存就被丢弃，L0 消费不到。

### c) 决策
接线点维持队长冻结值 = **`src/routes/ga-calibration.ts`**（GA 纠错回流活单源，与全队写集零交集）。
判据：`getFeedbackByOrg` 零读者 + `OrgAdapter` 空转 = 需在**真实业务路径**上补「生产者（持久化）+ 读者（真实入口可查）」两段。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 规格 — 本文件（待队长批）→ ② 测试先行（红线断言先红）→ ③ 实现（package 侧映射 + 路由侧接线）→ ④ 接线验证（穿路由 handler，非 mock 管线）→ ⑤ 反向验收（抽掉接线必须报红）

参考（D333 四步）：第一性原理＝反馈须「有写入方、有读取方、有下游消费者」三者齐备才叫闭环；Anthropic 工程基线＝契约优先 + 测试先行（铁律 47/48）；开源实证＝本仓既有先例 `src/routes/chat.ts:70`（L1 动态 `import('@synova/evolution')` 合法）、`src/routes/evolution.ts:101`（L0 构造注入 memoryStore）；收敛结论＝**L0 决策语义放 packages/evolution，L1 只做薄调用 + 读取出口**。

### b) 执行约束
- 铁律 0-2：spec → test → impl → wire → review → merge
- 铁律 24/31：本卡**不得复制** `chat.ts:76` 的 `.catch(() => {})` 空吞；收集失败 → `log.warn` + 响应 `evolutionDegraded: true`
- 铁律 38：`as any` / `as never` / `as unknown as` = 0
- 铁律 47/48：新增导出函数带 JSDoc 输入/输出/降级契约；测试有 expect 且覆盖正常/降级/边界
- 铁律 39：`packages/evolution` 为 L0 横向切面；L1→L0 动态 import 沿用既有先例（`chat.ts:70`、`evolution.ts:23`）
- 验收标准：`docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md`（禁 grep 命中当完成、禁 mock 管线、三问自查）
- M4：`synova-commit` 自带 push，不手工再 push

### c) 接线点确认（含「为什么会被触发」）
**入口**：`POST /api/ga/calibration`（已挂载 `src/server.ts:406`）
**用户动作**：GA（增长顾问 / 老板）在 GA 协同面板对一条诊断结论 / 诊断逻辑 / 信号提交纠错 —— `targetType ∈ {diagnosis_conclusion, diagnosis_logic, signal_relevance}` × `action ∈ {mark_error, rewrite_logic, demote_signal, add_context}`
**调用点**：`src/routes/ga-calibration.ts:207-222`（既有 growth 回流双写处），其后追加 L0 收集（本轮新增行号以实施后为准）
**为何必然被触发**：凡 `action ∈ {mark_error, rewrite_logic, demote_signal}` 的 201 成功路径都会经过该分支（`REFLUX_DECISION` 映射非空即进入），非死代码、非 cron-only、非测试专用开关

## Q2: 范围 — 正确的最简方案

做什么
- packages/evolution/src/feedback-collector.ts：新增 `collectGaCalibrationFeedback()`（GA 校准动作 → evolution decision 映射 + 委托 `collectFeedback`，JSDoc 契约）；`org-adapter` 消费形不变
- packages/evolution/src/index.ts：导出新函数 + 其输入类型
- src/routes/ga-calibration.ts：`POST /api/ga/calibration` 在 growth 回流后调用 L0 收集（传真实 AgentMemoryStore → `persisted=true`）；新增只读出口 `GET /api/ga/calibration/evolution-feedback`（org 隔离，读收集器 + 读持久化行）
- tests/evolution/feedback-collector.test.ts：新函数映射/降级/边界单测
- tests/routes/ga-calibration.test.ts：穿真实路由 handler 的 L0 收集 + 可查断言 + 下游 `OrgAdapter` 消费断言（≥3 条同 sentinelId 纠错 → 阈值自适应真实触发）
- tests/routes/evolution-rule-version.test.ts：**新增**（见「写集冲突清单」的 D829-EXT-1 请求）——`POST /api/evolution/proposals/:id/approve` 真实 handler → 断言留下 `evolution_snapshot` 版本记录
- task-state/D829.json、memory/notes/implemented/2026-09-20-D829-feedback-collector-consumer.md、docs/synova/product-lines/evidence/D829-evidence-20260920.md

不做什么
- 不改 src/routes/chat.ts（既有生产调用点不持久化 + 静默降级 → 登记遗留，见 §遗留）
- 不改 src/routes/evolution.ts（:210 零参假成功 → 登记遗留）
- 不改 src/growth/feedback-collector.ts（同名不同实现，非本卡对象）
- 不改 src/l3/ga-collaboration.ts（死缝，勿走）
- 不改 src/server.ts（路由已挂载，本卡不新增挂载）
- 不改 scripts/audit/**（K3 域）
- 不改 scripts/control-tower/**（CTO 域）
- 不改 src/store/session-store.ts（A 写集）
- 不改 src/routes/conversations.ts（A 写集）
- 不改 src/l1/im-inbound.ts（B 写集）

#CRITERIA: A

## 写集

| 文件 | 归属（task/builtin + 理由） |
|---|---|
| `packages/evolution/src/feedback-collector.ts` | task — GA 校准 → evolution decision 映射（L0 语义留 L0） |
| `packages/evolution/src/index.ts` | task — 导出新函数 + 类型 |
| `src/routes/ga-calibration.ts` | task — 接线点（生产者持久化 + 只读出口） |
| `tests/evolution/feedback-collector.test.ts` | task — packages/evolution 改动的配对测试 |
| `tests/routes/ga-calibration.test.ts` | task — 路由配对测试（穿真实 handler） |
| `tests/routes/evolution-rule-version.test.ts` | task — **新建，D829-EXT-1 待队长批**（验收点 3 证据） |
| `task-state/D829.json` | task — 卡面状态/证据 |
| `.claude/task-briefs/2026-09-20-D829-feedback-collector-evolution-wiring.md` | task — 本文件 |
| `memory/notes/implemented/2026-09-20-D829-feedback-collector-consumer.md` | task — 铁律 49 四态 Note（**落 implemented/ 而非 proposed/**：D829.json 状态 = impl_done，`check-notes-lifecycle.sh` 会把 proposed/ 下同 D# 的 Note 判为僵尸条目 → 阻断） |
| `docs/synova/product-lines/evidence/D829-evidence-20260920.md` | task — M5 证据（按任务号命名） |
| `.claude/current-brief` | builtin — 运行期指针（不提交） |

## 写集冲突清单（M2 硬要求）

| 目标文件 | 队内其他切片 | 未提交改动 | 在飞 PR | 其他卡 | 裁决 |
|---|---|---|---|---|---|
| `packages/evolution/**` | 无（仅 D829） | 无 | 无（队长扫描 §二） | 仅 D829 | ✅ C 独占 |
| `src/routes/ga-calibration.ts` | 无 | 无 | 无 | 无 | ✅ C 独占（队长 §四 登记并冻结） |
| `tests/evolution/feedback-collector.test.ts` | 无 | 无 | 无 | 无声明 | ⚠️ 存量文件，本卡声明后由 C 独占 |
| `tests/routes/ga-calibration.test.ts` | 无 | 无 | 无 | 无声明 | ⚠️ 存量文件，本卡声明后由 C 独占 |
| `tests/routes/evolution-rule-version.test.ts` | 无 | 不存在 | 无 | 无 | 🆕 新建，无重叠（**D829-EXT-1 请队长批**） |

**越界声明**：本卡不碰 `src/store/**`、`src/l1/**`、`src/l4/**`、`src/init/**`、`src/routes/sessions.ts`、`scripts/**`（A/B/波2 与 CTO/K3 写集）。

## Q3: 验收 — 入口 → 交互 → 结果

入口：`POST /api/ga/calibration`（GA 提交纠错，`mark_error` / `rewrite_logic` / `demote_signal`）
处理：校验 → AgentMemoryStore 落校准条目 → growth 回流（既有）→ **L0 `collectGaCalibrationFeedback`**（新增：decision 映射 + 传 memoryStore → `persisted=true`，落 `enterprise_fact` + `tags:['user_correction', <decision>, <sentinelId>]`）
结果：
1. `GET /api/ga/calibration/evolution-feedback` 可查（collector 记录 + 持久化行）
2. 下游 `OrgAdapter.adjustThresholds(orgId)` 真实消费（≥3 条同 sentinelId → 阈值自适应）
3. `POST /api/evolution/proposals/:id/approve` 真实执行 → AgentMemoryStore 留 `tags:['evolution_snapshot']` 版本记录

## 架构层: L0（packages/evolution 横向切面）+ L1（src/routes 接线与读取出口）

## Done 标准

- [ ] D829-1 穿真实路由 handler：`POST /api/ga/calibration`（mark_error）→ 201 且 `evolutionCollected` 非空，`getFeedbackByOrg(orgId)` 可查到该条（decision='reject'、actionId=targetId） verify: `node_modules/.bin/vitest run tests/routes/ga-calibration.test.ts -t "D829"`
- [ ] D829-2 持久化形状正确：AgentMemoryStore 存在 `type='enterprise_fact'` + `tags` 含 `user_correction`/`reject`/`<sentinelId>` 的行，值为该 FeedbackRecord JSON verify: `node_modules/.bin/vitest run tests/routes/ga-calibration.test.ts -t "D829"`
- [ ] D829-3 下游真实消费：同 sentinelId 注入 3 条 GA 纠错后 `OrgAdapter.adjustThresholds(orgId)` 返回 ≥1 条阈值调整 verify: `node_modules/.bin/vitest run tests/routes/ga-calibration.test.ts -t "D829"`
- [ ] D829-4 规则版本可观测：`POST /api/evolution/proposals/:id/approve` 真实 handler → AgentMemoryStore 新增 `tags:['evolution_snapshot']` 行且 `listSnapshots()` 含该快照 verify: `node_modules/.bin/vitest run tests/routes/evolution-rule-version.test.ts`
- [ ] D829-5 降级诚实：memoryStore 写失败 → 校准仍 201 + `evolutionDegraded: true` + `log.warn` 非空吞 verify: `node_modules/.bin/vitest run tests/routes/ga-calibration.test.ts -t "D829"`
- [ ] D829-6 反向验收：抽掉 `collectGaCalibrationFeedback` 调用 → D829-1/D829-2 必须报红（两次原始输出入证据） verify: `node_modules/.bin/vitest run tests/routes/ga-calibration.test.ts -t "D829"`
- [ ] D829-7 类型与门禁：tsc 0 error、`as any`/`as never`/`as unknown as` = 0 verify: `node_modules/.bin/tsc --noEmit`

## 遗留（不在本卡写集，报队长）
1. `src/routes/chat.ts:71` 既有 `collectFeedback` 调用不传 memoryStore + `:76` `.catch(() => {})` 空吞 → 建议独立卡（chat.ts 非本卡写集）
2. `src/routes/evolution.ts:210` `collectAllFeedback()` 零参 → 恒 `events: []` 假成功；且 `feedback-collector.ts:86` `orgId: ''` 查询恒空 → 建议独立卡
3. 本卡仅覆盖 GA 纠错路径的 L0 收集；`user_behavior` / `external_data` / `diagnosis_contradiction` 三路仍无生产入口（线 17-2/17-4 范围）
