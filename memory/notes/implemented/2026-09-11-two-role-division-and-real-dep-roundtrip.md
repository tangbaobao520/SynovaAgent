---
状态: implemented
日期: 2026-09-11
决策: 回到两角色分工（Codex 写 dev-doc + 验收合并；Claude Code 在独立 clone 实现）；dev-doc 测试要求新增「真实依赖 round-trip」强制项
理由: D701（导航决策驱动来源落地）Codex 全程单人实现，为求快跳了三步——无真 red、无提交前自审、在主工作区直接写码（违反 V5.2.0 隔离纪律）。代价实证：`DecisionRecordStore.create` 用 randomUUID 当 record.id，而真实 `SqliteGraphStore.createNode` 恒生成 `node-${uuid}` 且忽略 props.id → `get/update` 在真实 store 下取不回；**合并后**自审才发现。根因是假 store 按 props.id 建档（比真实宽松），而 dev-doc §4 只要求「先写测试跑红」，没要求用真实依赖做 round-trip。
---

## 决策

1. **回到两角色分工**：Codex 写 dev-doc + 验收/合并；Claude Code 在独立 clone（`.sessions/<sid>/repo`）实现 + 交交付报告（DS1-DSn 逐条证据 + 自检 5 问）。Codex 不在主工作区写产品代码。
2. **dev-doc 强制新增「真实依赖 round-trip」测试要求**：凡持久化/外部依赖（GraphStore/SQLite/文件/HTTP），dev-doc §4 必须要求至少一条**用真实依赖**验证「写→读回→更新」闭环的测试（假 store / mock 需**镜像真实依赖的关键语义**，如 id 生成规则）。

## 为什么两角色分工的价值不是「分工」而是「强制自审」

Claude Code 的交付报告格式（DS1-DSn 证据 + 自检 5 问）**物理逼出复核**；Codex 单人全程反而没人逼。D701 单人跑被 CI 抓到 3 个问题（组4 接线 / 组6 brief body / G12 反引号），但**抓不到「假 store 掩盖真依赖语义」这类逻辑缺陷**——那只能靠对着真实依赖自核。

## 为什么规格漏洞比执行漏洞更致命

store-id bug **两个流程都会漏**：dev-doc 没要求真实 store round-trip，谁实现都容易踩。所以补「真实依赖 round-trip」到 dev-doc 测试要求，比事后自责更有价值（机制 > 自觉）。

## 参考系

- 铁律 12（集成测试 cover 真实路由，不 mock 管线）；铁律 48（测试非空壳）
- V5.2.0 隔离模型（D540）：主工作区 Codex 专用，任务走独立 clone
- 第一性原理：假替身与真实依赖的语义差 = 单测绿但生产不可用的经典盲区

## D701 修复留痕（已合并）

- PR #491（`f5de7499`）：create 用 `createNode` 返回值作 record.id；`toProps` 不写 id；`fromProps(id, props)` 从节点 id 取；测试假 store 对齐真实 store
- 台账：PR #492（`2b4568ab`）+ PR #490（`bec59c34`）
- 关联观察（pre-existing）：`goal-store.createGoal` 同样忽略 store 返回 id，`getGoal(goalId)` 在真实 store 下取不回——另卡评估
