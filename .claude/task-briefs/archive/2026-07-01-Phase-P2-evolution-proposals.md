# Task Brief: Phase P2 — 完整全局进化引擎 + FDE 审批流程

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | EVOLUTION-LAYER-v2.md §六 + §九

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（新建包）— packages/evolution/src/global-analyzer.ts
- [x] 纵向（新建 API 路由）— src/routes/evolution.ts

本任务完成 L0 进化层第三层的剩余功能：跨组织模式识别 + 提案审批流程 + 灰度发布接线。
- 性质：扩展已有模块（global-analyzer.ts）+ 新建（routes/evolution.ts）
- 与已完成模块的关系：
  - aggregateIndustryBaseline()（P1-2）→ 产出阈值建议 → 包装为 Proposal
  - RuleVersionManager（P1-3）→ 审批通过后调用 gradualRollout()
  - AgentMemoryStore → 存储 Proposal

### b) 文件审计
- `packages/evolution/src/global-analyzer.ts` — 已有 aggregateIndustryBaseline，需加 discoverIndustryPatterns + generateProposal
- `packages/evolution/src/evolution-types.ts` — 已有 IndustryPattern 类型，需加 EvolutionProposal 类型
- `packages/evolution/src/index.ts` — 需导出新函数
- `packages/evolution/src/rule-version-manager.ts` — 已有 gradualRollout，P2 调用它
- `src/routes/evolution.ts` — 新建（API 端点）
- `src/server.ts` — 需注册新路由

关系：扩展（global-analyzer）+ 新建（routes/evolution.ts）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题定义**：P1-2 能聚合行业阈值，P1-3 能版本管理。但缺少中间环节——聚合产生的阈值建议没有经过"审核→批准→灰度发布"流程。全局进化不能自动生效，必须有 FDE 人工门禁（ARCH-13 要求）。
2. **最小可行方案**：三部分——
   - 模式发现（`discoverIndustryPatterns`）：读取 user_correction 按 industry+sentinel 聚合 → ≥3 org 纠错同一哨兵 → 建议调整
   - 提案系统（`EvolutionProposal`）：包装发现/建议为结构化提案 → 存 AgentMemoryStore → API 暴露
   - FDE 路由（`routes/evolution.ts`）：CRUD + 审批 
3. **边界**：提案只管理 L0 进化层产出（阈值调整+模式发现），不管理原始哨兵配置或专家提示词。

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 7: 入口可触达（API）→ 链路完整（审批→应用）→ 结果可见（proposal 状态变化）
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 39: L1（routes/evolution.ts）通过 L2-service 调用 L4，不直接 import L4（使用 agent-memory-store 的惰性加载）
- ARCH-13 §6.5: 人工审核门禁 + 灰度发布 + 可回滚

### b) 本任务执行约束
- rule: "Proposal 审批通过后必须创建快照再灰度应用"
  verify: "grep -q 'createSnapshot\|gradualRollout' src/routes/evolution.ts"
- rule: "discoverIndustryPatterns 必须按 industry+sentinel 聚合 user_correction"
  verify: "grep -q 'user_correction\|sentinelId' packages/evolution/src/global-analyzer.ts"
- rule: "Proposal 状态机必须是 pending→approved/rejected→applied"
  verify: "grep -q \"'pending'\|'approved'\|'rejected'\|'applied'\" packages/evolution/src/global-analyzer.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `packages/evolution/src/evolution-types.ts` — 新增 `EvolutionProposal` 接口
2. `packages/evolution/src/global-analyzer.ts` — 新增：
   - `discoverIndustryPatterns(memoryStore)` — 聚合 user_correction 按 sentinelId 分组，≥3 org 有纠错 → 生成模式
   - `generateThresholdProposal(industry, suggestions)` — 将阈值建议包装为提案
   - `listProposals(memoryStore, status?)` — 查询提案
   - `approveProposal(memoryStore, proposalId, l3, rvm)` — 审批 → snapshot → gradualRollout → 标记 applied
   - `rejectProposal(memoryStore, proposalId)` — 标记 rejected
3. `packages/evolution/src/index.ts` — 导出新函数
4. `src/routes/evolution.ts` — 新建：
   - `GET /api/evolution/proposals` — 列出提案
   - `POST /api/evolution/proposals/:id/approve` — 审批通过
   - `POST /api/evolution/proposals/:id/reject` — 拒绝
   - `POST /api/evolution/aggregate/:industry` — 手动触发行业聚合（已有 aggregateIndustryBaseline）

不做什么：
- 不改 L1-L5 架构（routes/evolution.ts 通过惰性 import 调用 packages/evolution/）
- 不改 AgentMemoryStore 代码或表结构
- 不改 sentinel/runner.ts
- 不改 org-adapter.ts 或 session-learner.ts
- 不改 server.ts 的路由注册（只加一行 router.use）

## Q3: 验收 — 入口 → 交互 → 结果

入口：FDE 调用 `POST /api/evolution/aggregate/:industry` → 触发聚合 → 生成 Proposal → 存入 AgentMemoryStore
处理：FDE 调用 `GET /api/evolution/proposals` 查看 → `POST /api/evolution/proposals/:id/approve` 审批
结果：Proposal 状态从 pending → approved → 渐灰发布 → applied（RuleVersionManager.createSnapshot 被调用）

## 本任务在哪一层
L0（packages/evolution/）+ L1（src/routes/evolution.ts）

## Done 标准
- [x] verify: test -f src/routes/evolution.ts
- [x] verify: grep -q 'discoverIndustryPatterns' packages/evolution/src/global-analyzer.ts
- [x] verify: grep -q 'approveProposal' packages/evolution/src/global-analyzer.ts
- [x] verify: grep -q 'EvolutionProposal' packages/evolution/src/evolution-types.ts
- [x] verify: npx vitest run tests/evolution/global-analyzer.test.ts 2>&1 | tail -5 | grep -q 'Tests'
- [x] verify: npx vitest run tests/evolution/evolution-proposals.test.ts 2>&1 | tail -5 | grep -q 'Tests'
- [x] verify: npx tsc --noEmit 2>&1 | grep -c 'routes/evolution\|global-analyzer'; test $? -eq 1
