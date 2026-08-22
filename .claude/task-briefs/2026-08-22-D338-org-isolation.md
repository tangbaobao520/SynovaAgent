# Task Brief: D338 多租户数据隔离（orgId 逻辑隔离）+ GA 中国墙：action-store/graph-traversal/data-purger/overflow-graph-bridge/feedback-collector fail-closed 修复 + GA 路由去 default 回退 + 审计测试 + 逐表审计报告

> 生成: 2026-08-22 02:07:54 | 分支: feat/win-d338-org-isolation（worktree synova-wt-d338，base origin/main 69be07c8）| as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于哪个系统（GA诊断/哨兵/基础设施）？触及哪层？该层现有模块？新增/替换/扩展？

- 系统: 基础设施（数据安全纵深——单实例内多租户 orgId 逻辑隔离 + GA 中国墙，P1-A5 + P1-22 修复）
- 触及层: L1 交互（src/routes/ga-annotations.ts + ga-corrections.ts，fail-closed）+ L2 编排（src/agent/synova-agent.ts ActionStore 接线、src/agent/diagnosis-launcher.ts traverse 接线）+ L3 洞察（src/l3/data-lifecycle-service.ts purge 传 tenantId）+ L4 本体（src/l4/graph-traversal.ts、src/l4/data-purger.ts 补 graph 参数）；另跨层消费文件 src/growth/（action-store、feedback-collector）、src/cycles/overflow-graph-bridge.ts、src/config.ts（orgId 配置源）
- 现有模块: 图存储 graph 列强制（src/adapters/sqlite-graph-store.ts queryNodes/queryEdges `WHERE graph = ?`，L198/238）——既有隔离机制，本任务把泄漏面（省略 graph/硬编码全局命名空间）逐一关闭
- 操作: 修改（18 文件）+ 新建（tests/security/org-isolation-audit.test.ts + docs/synova/audit-reports/2026-08-22-D338-org-audit.md）+ 流程产物（dev doc §3.2 回填 + brief + reference-map）

### b) 文件审计
grep 关键词（orgId/enterprise_id/graph/'growth'/'default'）在 src/ 中，dev doc §2 已逐表审计（三路独立核验 + 人工复核 file:line 证据）：

- 已隔离 ✓（不修）: agent-memory-store（org_id 列+查询条件）、session-store（org_id）、audit-store（orgId 24 处/5 SQL）、delivery-queue-store、expert-platform/store、evidence-store、alert-rules、feedback_log（enterprise_id 列存在但过滤可选→缺陷 D）、knowledge-store（org_id）、sqlite-graph-store（graph 列强制）
- 缺陷文件（写集）: action-store.ts（6 处硬编码 'growth'）、graph-traversal.ts（L80/L139 省略 graph + L91 空串 '' bug）、data-purger.ts（L266/L411 省略 + L186/255/269 空串）、overflow-graph-bridge.ts（SNAPSHOT_GRAPH 全局常量）、feedback-collector.ts（queryFeedback WHERE 1=1 + enterprise_id 过滤可选）、ga-annotations.ts/ga-corrections.ts（7 处 `auth.orgId || 'default'` 回退）、synova-agent.ts（new ActionStore() 无 orgId）
- 好范式复用: computeCanvas L94 `graph = orgId || 'default'`、agent-observer L40 `graph = teamId || 'default'`、agent-memory-store L159 `${orgId}:${key}` 前缀惯例
- 关系: 复用（graph 列强制 + 既有分方法降级形态）；修改（18 文件）；新建（审计测试 + 审计报告）；无冲突（registry 已认领，D470/D471/D472 写集零交集，D472 共享消费者 getAggregatedSignals 冻结不碰）

### c) 决策
已有覆盖→复用：graph 列强制（决策点 1 graph 前缀）与既有降级形态（action-store 分方法 fail-closed 沿用）。无覆盖→新建：fail-closed 拒绝模式（ORG_REQUIRED 400 / degraded 返回）。冲突→无。
冲突取舍/多选项/架构选择 → DECISION-REFERENCE 四步框架已执行，8 个决策点（A-H）结论记录于 Q1c。



## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）:

# 决策参考框架（双参考系）

> 2026-08-13 创始人定 | 用途：遇到难决策/多选项/最佳实践选择时，强制走四步参考，并记录所用参考系
> 触发条件：①多选项需取舍 ②设计/架构方案选择 ③优先级排序 ④"最佳实践是什么"类问题 ⑤实现与文档声称冲突时

## 四步框架

```
① 第一性原理（DeepSeek/梁文峰）：这个问题的最简本质是什么？最少机制能解决吗？
② Anthropic 工程基线：隔离/失败即关闭/脚本验证/机器可验契约——哪条适用？
③ 开源实证（DeepSeek）：有可克隆的代码/架构参考吗？clone 下来看实际做法（成本/效率/结构）
④ 收敛检查：两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
```

## 双参考系边界

| 参考系 | 适用 | 不适用 |
|--------|------|--------|
| **Anthropic 工程实践** | agent 隔离、门禁/fail-closed、脚本化验证、机器可验契约、并行协作 | 成本/产品定位/模型选择 |
| **DeepSeek 第一性原理 + 开源实证** | 产品哲学、成本/效率/架构取舍、反内卷、开源参考（clone 仓库） | 工程流程细节（其仓库是模型/推理代码，非 agent 协作） |

## 梁文峰原则摘要（DeepSeek 参考时使用）

- **第一性原理**：不做无意义的炫技，回到问题本质
- **极致成本**：能用最少机制解决就不用多的（这正好支持"worktree 隔离 = 最少机制"而非 N 个门禁）
- **开源开放**：能参考开源实证就不闭门造车
- **反内卷**：机制是为了减少摩擦，不是为了增加流程

## 记录要求（可验证，不靠记忆）

- Codex 决策：在 dev doc / 本会话回复中**明确写"参考：Anthropic/DeepSeek/第一性原理 + 结论"**
- Claude Code 决策：dev doc 要求完成报告含**决策记录**（决策点 + 参考系 + 理由），K3 审计可核

## 已用案例

| 日期 | 决策 | 参考系 | 结论 |
|------|------|--------|------|
| 2026-08-13 | 并行 agent 冲突（串行 vs 并行） | Anthropic（隔离基线）+ DeepSeek（最少机制） | 收敛：worktree 隔离（D307）优先解锁并行 |


## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — dev doc §6 DS1-DS12（全部 grep/vitest 机器可验）+ 本 brief Q3 验收
  ② 测试 — tests/security/org-isolation-audit.test.ts 12 用例先写，red 先行（用例 1/4/5/6/7/8/9 对现状必失败；用例 11/12 为实施期同型缺陷 red-first，红证据存档进 dev doc §3.2）
  ③ 实现 — 18 修改 + 2 新建（fail-closed 全部带 log.warn + degraded/拒绝；as any 零；tsc + vitest 零失败）
  ④ 接线 — new ActionStore(undefined, config.orgId)（synova-agent:139）、createGraphTraversal(store, teamId)（diagnosis-launcher:145）、new DataPurger(..., tenantId)（data-lifecycle-service:75）——三处生产调用点
  ⑤ 验证 — 自检 6 问 + 全量回归 + DS1-DS12 grep 逐项

引用依据:
  - 铁律 0-2: spec → test → impl → wire → review → merge（dev doc 已是 spec，测试先行）
  - 铁律 7: 入口可触达（哨兵 Action 链路/GA 反馈路由/诊断 traverse 链路/数据生命周期 purge 链路均为既有入口）+ 链路完整 + 结果可见（拒绝 400/degraded 信号）
  - 铁律 24+31: fail-closed 全部 log.warn + degraded:true 传播（FeedbackQueryResult{entries,degraded}）
  - 铁律 33: tests/security/org-isolation-audit.test.ts（单元）
  - 铁律 38: as any 零（新代码零类型断言掩盖）
  - 铁律 47/48: 审计测试文件头 @input/@output/@degraded 契约；12 用例全部真实 expect 断言
  - memory: 2026-08-16-d355-l4-contract（L4 契约收敛先例）、2026-08-06-D316-dev-doc-verification（dev doc 声称须独立核验——已 3 agent + 人工复核，发现 10 处 doc/代码偏差记录于 dev doc §3.2）、2026-08-11-D329-session-identity（worktree + registry 认领流程）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: "queryFeedback 缺 enterpriseId 必须 fail-closed 拒绝（不再 WHERE 1=1 全量返回）"
  verify: "grep -n 'enterpriseId' src/growth/feedback-collector.ts | grep -v getAggregatedSignals"
- rule: "GA 路由不得回落 'default' 共享命名空间（7 处 auth 回退清零）"
  verify: "grep -n \"orgId: auth.orgId || 'default'\" src/routes/ga-annotations.ts src/routes/ga-corrections.ts ; test $? -ne 0"
- rule: "不触碰 DSH 地盘/冻结区/D470/D471/D472 写集"
  verify: "git diff --name-only HEAD | grep -E 'src/sentinel/|scripts/|src/store/|src/agent/loop-handlers|src/agent/main-agent|src/agent/data-ingest|src/agent/interactive-card|src/l3/ga-collaboration|extensions/ontology|packages/' ; test $? -ne 0"

### c) 决策参考系（DECISION-REFERENCE 四步已执行，8 决策点结论）
- 决策 A（synova-agent orgId 来源 — config.ts 加 orgId + SYNOVA_ORG_ID env 默认 'default'）: 参考：Anthropic（集中式配置源，loadConfig 唯一生产方）+ 第一性原理（实例级 org 身份与 P0-7 物理隔离语义一致，'default' 即该实例的 org）+ 结论：config.ts 进写集（S-6 回填）
- 决策 B（ActionStore fail-closed 形态 — 构造器 (store?, orgId?) + getGraph() 派生 `${orgId}:growth` + 分方法沿用既有降级形态）: 参考：Anthropic（失败即关闭，缺租户上下文宁可拒绝）+ DeepSeek（最少机制，图列强制零新增过滤点）+ 结论：graph 前缀 + 分方法拒绝（dev doc 决策点 1 定案执行）
- 决策 C（graph-traversal 绑定式 — createGraphTraversal(store, graph='default') + traverse 第 4 参覆盖，L91 空串 bug 一并修）: 参考：第一性原理（一处绑定覆盖两消费点，最少改动）+ Anthropic（向后兼容默认值）+ 结论：diagnosis-launcher 进写集
- 决策 D（data-purger 构造器第 4 参 graph + L186/255/269 空串 bug 一并修 + 调用点传 tenantId）: 参考：Anthropic（空串在 SqliteGraphStore 不归一 → soft-delete 恒 no-op，修复即正确性）+ 结论：data-lifecycle-service 进写集
- 决策 E（overflow snapshotGraph(enterpriseId) 私有派生 `${enterpriseId}:cycles`，消费方零改）: 参考：第一性原理（方法签名已带 enterpriseId，内部派生最少机制）+ Anthropic（私有函数零门禁面）+ 结论：3 处替换
- 决策 F（queryFeedback 改 FeedbackQueryResult{entries,degraded} — 生产调用方为零 grep 实证）: 参考：Anthropic（degraded 信号传播，铁律 31；[] 无法区分"拒绝"与"无结果"）+ 结论：形状变更仅影响测试（2 测试文件进写集）
- 决策 G（GA 路由 fail-closed 加在 requireGa 函数体 — 一处覆盖 7 个使用点，未来 handler 自动生效）: 参考：Anthropic（fail-closed 默认化，P1-22 原文要求）+ DeepSeek（最少机制，两处 vs 七处）+ 结论：ORG_REQUIRED 400 + 7 处回退清零；L196 数据回显保持不动
- 决策 H（审计测试静态断言 + 内存 SQLite + 记录式 mock — 无 supertest 实证）: 参考：Anthropic（机器可验契约，red 必须对现状失败）+ 结论：12 用例（9 red + 3 回归守卫；RED 1 实测 7 红 3 绿，用例 11/12 实施期各 1 红）

### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/growth/action-store.ts — 构造器 (store?, orgId?) + getGraph() 派生 `${orgId}:growth`；6 处 'growth' → graph；缺 orgId 分方法 fail-closed
- src/config.ts — SynovaConfig 加 orgId: string + loadConfig 读 SYNOVA_ORG_ID（默认 'default'）
- src/agent/synova-agent.ts — L139 new ActionStore(undefined, config.orgId)
- src/l4/graph-traversal.ts — createGraphTraversal(store, graph='default') + traverse 第 4 参覆盖；L80/L91/L139 传 graph（L91 空串 bug 修）
- src/agent/diagnosis-launcher.ts — L145 createGraphTraversal(store, teamId)
- src/l4/data-purger.ts — 构造器第 4 参 graph='default'；5 处调用（L186/255/266/269/411）改 this.graph（空串 bug 修）
- src/l3/data-lifecycle-service.ts — L75 new DataPurger(..., tenantId)
- src/cycles/overflow-graph-bridge.ts — snapshotGraph(enterpriseId) 私有派生 `${enterpriseId}:cycles`，替换 3 处 SNAPSHOT_GRAPH
- src/growth/feedback-collector.ts — queryFeedback 返回 FeedbackQueryResult{entries,degraded}；缺 enterpriseId → log.warn + {entries:[],degraded:true}；getAggregatedSignals 一字不动（D472 兼容）
- src/routes/ga-annotations.ts — requireGa 加 ORG_REQUIRED 400 分支；4 处 `|| 'default'` → auth.orgId
- src/routes/ga-corrections.ts — 同款；3 处回退清零
- src/l4/entity-resolver.ts — 缺口 E（缺陷 B 同型第三文件，计划外实测发现）: GraphStoreRO 接口补 graph + L51/204/205 转发（check-architecture 5 告警清零）
- src/cycles/investment-advisor.ts — 缺陷 C 消费侧（计划外实测发现）: simulateInvestment 加 enterpriseId 首参，4 处硬编码 'default' 清除
- src/routes/overflow.ts — POST simulate 从 body 取 enterpriseId（缺省 'default' = 实例默认 org）
- tests/growth/action-store.test.ts — 9 处构造点补 'test-org'（fail-closed 后兼容）
- tests/growth/feedback-collector.test.ts — 4 处调用点适配 .entries 新形态
- tests/routes/ga-enterprise.test.ts — D109 两条旧断言钉死 `|| 'default'` 漏洞 → 适配为 fail-closed 断言（DS6 要求该模式消失）
- tests/cycles/investment-advisor.test.ts — 3 处调用点补 enterpriseId 首参
- tests/security/org-isolation-audit.test.ts — 新建 12 用例（red→green 先行，含用例 11 缺口 E + 用例 12 缺陷 C 消费侧）
- docs/synova/audit-reports/2026-08-22-D338-org-audit.md — 新建逐表审计报告（DS1，O1-O8 观察项）
- docs/plans/codex/implementation/SYNOVA-IMPL-D338-org-isolation-audit-20260822.md — dev doc §3.2 回填（S-6）

不做什么（含文件路径）：
- 不改 src/store/ 冻结区（session-store/storage-backend 若需 orgId 修复 → deferred 记录与 DSH 协调）
- 不改 src/sentinel/、scripts/（DSH 地盘）
- 不改 src/agent/interactive-card.ts:173、src/l3/ga-collaboration.ts:211（GA 反馈上游硬编码 'default' 断点 → 审计报告观察项 + 知会 DSH）
- 不改 src/agent/loop-handlers.ts、src/agent/main-agent.ts（D472 写集）
- 不改 src/agent/data-ingest-service.ts、extensions/ontology/（D470 写集）、packages/（D471 写集）
- 不改 src/growth/feedback-collector.ts 的 getAggregatedSignals（L267-293 签名与全局聚合语义冻结，D472 只读依赖）
- 不改跨客户物理隔离（P0-7 已定案）；不碰 哇呢宝贝客户数据；不做审计 UI；不 bump VERSION.md

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
① 哨兵 Action 链路 — SynovaAgent.start() → ProactivePush → ActionStore（synova-agent.ts:139）
② GA 反馈链路 — POST/GET /api/ga/annotations、/api/ga/corrections（requireGa → auth.orgId）
③ 诊断 traverse 链路 — DiagnosisLauncher → createGraphTraversal(store, teamId)
④ 数据生命周期 purge 链路 — routes/data-lifecycle → executePurge → DataPurger(graph=tenantId)

处理（中间经过哪些步骤）：各缺陷点从「省略/硬编码/回退全局命名空间」改为「org 作用域 graph + fail-closed」——缺租户上下文 → log.warn + 拒绝（400 ORG_REQUIRED / degraded:true / 内存降级 / []），绝不回落 'default' 共享命名空间

结果（最终展示在哪）：审计测试 tests/security/org-isolation-audit.test.ts 12 用例全绿（red 先行已证 9 用例修复前失败）；审计报告 docs/synova/audit-reports/2026-08-22-D338-org-audit.md 逐表覆盖结论可见；GA 路由缺 orgId 请求收到 400 {code:'ORG_REQUIRED'}

## 架构层: L1 交互（src/routes/）+ L2 编排（src/agent/ + src/growth/ + src/config.ts）+ L3 洞察（src/l3/ + src/cycles/）+ L4 本体（src/l4/）
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: grep -n "new ActionStore" src/agent/synova-agent.ts 命中且传 orgId（DS7）
- [ ] 链路走通: vitest run tests/security/org-isolation-audit.test.ts 12 用例全 pass（red 先行已证: 修复前用例 1/4/5/6/7/8/9/11/12 失败）
- [ ] 结果可见: GA 路由源码无 `auth.orgId || 'default'`（DS6）；feedback-collector 缺 enterpriseId → {entries:[],degraded:true}（DS5）
- [ ] 契约 grep: DS2（action-store orgId.*growth）/DS3（l4 queryNodes/queryEdges 行均含 graph）/DS4（overflow enterpriseId graph 作用域）
- [ ] 零回归: vitest run tests/growth tests/l4 tests/cycles tests/agent tests/l3 tests/routes tests/security 绿（D472 兼容: loop-handlers 相关测试绿；基线失败集合与 69be07c8 diff 为空）+ tsc --noEmit 基线 28=28（DS9）
- [ ] 范围一致: git diff --name-only HEAD 与最终写集一致（18 修改 + 2 新建 + 3 流程产物: dev doc §3.2 回填 + brief + reference-map），不碰 DSH 地盘/冻结区（DS10）
- [ ] 无绕过: grep -n "no-verify" .claude/bypass.log 零命中（DS11）

---

## RED 先行证据（2026-08-22 02:32 存档 — 修复前 @69be07c8）

命令: `npx vitest run tests/security/org-isolation-audit.test.ts`
结果: **7 failed | 3 passed（10）** — 与计划用例表逐项预测一致
（计划正文「6 红 4 绿」为笔误；计划表逐用例预测 = 7 红 3 绿，实测完全吻合）

| 用例 | 预测 | 实测 | 失败原因（缺陷实证） |
|------|------|------|---------------------|
| 1. feedback 缺 enterpriseId 拒绝 | RED | × | WHERE 1=1 返回全量 2 条，degraded 缺失 |
| 2. feedback 带 enterpriseId 过滤 | 绿 | ✓ | — |
| 3. getAggregatedSignals 全局聚合 | 绿 | ✓ | — |
| 4. action-store graph 含 orgId | RED | × | 6 处图调用均为 'growth'（非 'org-a:growth'） |
| 5. action-store 缺 orgId fail-closed | RED | × | createAction 已写入 'growth'（调用数非零） |
| 6. traverse 图查询非省略非空串 | RED | × | queryEdges/queryNodes 省略 graph + getNode 传 '' |
| 7. DataPurger 显式图 | RED | × | updateNode/deleteNode/deleteEdge 传 ''、query 省略 |
| 8. overflow graph org 作用域 | RED | × | createNode/queryNodes 均为 'overflow_snapshots' |
| 9. GA 路由无 default 回退 | RED | × | ga-annotations 4 处 + ga-corrections 3 处回退、无 ORG_REQUIRED |
| 10. 已隔离表回归（静态） | 绿 | ✓ | — |

用例 11/12 为实施期新增（同型缺陷 red-first，分两批红证据）:
- 用例 11（缺口 E — entity-resolver 图转发）: RED 2 实测 1 failed | 10 passed — queryNodes 收到的 graph 被 GraphStoreRO 接口丢弃，回落默认命名空间
- 用例 12（缺陷 C 消费侧 — investment-advisor 租户透传）: RED 3 实测 1 failed | 11 passed — 4 处 getLatestSnapshot/getCycleSnapshots 硬编码 'default'，记录式 mock 捕获 'default:cycles'

实施后同一测试文件（一字不改，含 as unknown as 签名兼容注释）必须 12/12 全绿。
