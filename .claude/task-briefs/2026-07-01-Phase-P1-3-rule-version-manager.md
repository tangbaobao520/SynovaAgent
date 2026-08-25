# Task Brief: Phase P1-3 — RuleVersionManager 规则版本管理

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | ARCH-13 保留组件

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（新建包）— packages/evolution/

本任务属于 L0 进化层第三层基础设施。为全局进化提供安全阀。
- 性质：新建
- 为什么重要：全局进化的阈值调整直接影响所有组织的诊断结果。
  没有版本管理 = 每次聚合产生的调整都不可逆。一旦发现误调，
  无法回滚。这是 ARCH-13 明确要求的风险控制措施。
- 与现有模块的关系：
  - global-analyzer.ts（P1-2）— 聚合结束后调用 snapshot()
  - org-adapter.ts（P0-2）— 阈值调整应被快照覆盖
  - AgentMemoryStore — 存储快照数据

### b) 文件审计
- `packages/evolution/src/rule-version-manager.ts` — 新建
- `packages/evolution/src/evolution-types.ts` — 已有 evolution_snapshot type
- `packages/evolution/src/index.ts` — 需导出
- `packages/evolution/src/org-adapter.ts` — 阈值调整逻辑（快照覆盖对象）
- `packages/evolution/src/global-analyzer.ts` — 聚合产出（快照覆盖对象）

关系：新建（rule-version-manager），不冲突

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题定义**：全局进化的阈值/规则调整需要版本管理。误调不可回滚 → 阻止采用。
2. **最小可行方案**：快照 = 序列化所有已应用的调整 + 写时复制。回滚 = 反写。
3. **边界**：只管理 L0 进化层产出的调整（阈值、基线、纠错统计），不管理原始哨兵配置。

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 37: Dead code 不入仓库
- ARCH-13 风险控制 §6.5: 模型退化、过度拟合、规则冲突

### b) 本任务执行约束
- rule: "snapshot 必须存储当前所有 threshold_adjustment 和 industry_baseline 的快照"
  verify: "grep -q 'threshold_adjustment.*industry_baseline\|recall\|list' packages/evolution/src/rule-version-manager.ts"
- rule: "rollback 必须完整恢复阈值状态，不能部分恢复"
  verify: "grep -q 'rollback' packages/evolution/src/rule-version-manager.ts"
- rule: "gradualRollout 必须使用 orgPool + percentage 双参数控制范围"
  verify: "grep -q 'orgPool\|percentage' packages/evolution/src/rule-version-manager.ts"
- rule: "evolution_snapshot 必须有创建时间和版本描述"
  verify: "grep -q 'createdAt\|description\|version' packages/evolution/src/rule-version-manager.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `packages/evolution/src/rule-version-manager.ts`
   - `createSnapshot(description)` — 读取所有 threshold/industry 记忆 → 序列化 → 写入 type:'evolution_snapshot'
   - `listSnapshots()` — 列出所有快照
   - `rollbackTo(snapshotId)` — 读取快照 → 遍历反写每个阈值 → 清理当前调整
   - `gradualRollout(pool, percentage)` — 取 pool 中前 N% 的组织应用调整
2. `packages/evolution/src/index.ts` 导出
3. `tests/evolution/rule-version-manager.test.ts`

不做什么：
- 不改 global-analyzer.ts（P1-2 已完成）
- 不改 org-adapter.ts（P0-2 已完成）
- 不改 src/l4/agent-memory-store.ts 代码或表结构
- 不改 packages/evolution/src/evolution-types.ts（L3WriteAPI 接口已定义）
- 不改 src/sentinel/runner.ts

## Q3: 验收 — 入口 → 交互 → 结果

入口：global-analyzer 聚合完成后 → createSnapshot('2026-07 行业聚合')
处理：序列化阈值 → 持久化 → 返回 snapshot ID
结果：AgentMemoryStore 中可查到 type:'evolution_snapshot' 的记忆，且内容可被反序列化恢复

## 本任务在哪一层
L0（packages/evolution/）

## Done 标准
- [x] verify: test -f packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'createSnapshot' packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'rollbackTo' packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'gradualRollout' packages/evolution/src/rule-version-manager.ts
- [x] verify: npx vitest run tests/evolution/rule-version-manager.test.ts 2>&1 | tail -5 | grep -q 'Tests'
