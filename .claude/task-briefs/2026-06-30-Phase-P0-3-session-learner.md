# Task Brief: Phase P0-3 — SessionLearner 会话内学习

> 生成: 2026-06-30 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md §四

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（迁移到独立包 / 新建包）

本任务属于 L0 进化层第一层（会话内学习）。新建 `SessionLearner` 类于 packages/evolution/ 中。
- 性质：新建
- 触发时机：诊断 Phase 2（假设生成阶段）中用户否定/确认假设时
- 数据：纯内存，不持久化

### b) 文件审计
- `packages/evolution/src/session-learner.ts` — 新建
- `packages/evolution/src/index.ts` — 已存在，需增加 SessionLearner 导出
- `packages/evolution/src/evolution-types.ts` — 已有 SessionFeedback/SessionWeight 类型
- `src/l3/synova-diagnosis-engine-impl.ts` — 接线目标，Phase 2 假设生成阶段（约 L225-284）

关系：新建（SessionLearner）+ 扩展（diagnosis-engine-impl Phase 2 插钩子）

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC → ② 实现 → ③ 测试 → ④ 接线 → ⑤ 验证 → ⑥ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 46: 禁止 engine-core 引用

### b) 本任务执行约束
- rule: "SessionLearner 必须纯内存，不持久化到 AgentMemoryStore"
  verify: "grep -c 'AgentMemoryStore\|memoryStore\|remember\|recall' packages/evolution/src/session-learner.ts"
- rule: "接线必须在 synova-diagnosis-engine-impl.ts 中以 await import 方式懒加载"
  verify: "grep -q 'await import.*session-learner\|await import.*evolution' src/l3/synova-diagnosis-engine-impl.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `packages/evolution/src/session-learner.ts`
   - SessionLearner 类（纯内存 Map）
   - onHypothesisNegated(hypothesisId, reason) — 降低权重+调整追问方向
   - onHypothesisConfirmed(hypothesisId) — 提升相关哨兵权重
   - getWeights() — 返回当前权重快照（供诊断引擎读取）
   - reset() — 会话结束时清理
2. packages/evolution/index.ts 导出 SessionLearner
3. 接线到 synova-diagnosis-engine-impl.ts Phase 2（假设生成阶段）
   - 使用 await import('@synova/evolution') 懒加载
   - 在 emit(type:'expert_hypothesis') 前可注入学习权重

不做什么：
- 不改 src/l4/agent-memory-store.ts（session-learner 纯内存）
- 不改 post-diagnosis-processor.ts（Phase P0-2 已完成）
- 不改 src/l4/graph-bridge.ts
- 不改 packages/evolution/src/org-adapter.ts

## Q3: 验收 — 入口 → 交互 → 结果

入口：诊断 Phase 2 中用户对假设做否定/确认时
处理：SessionLearner 调整内部权重表（纯内存 HashMap）
结果：后续假设生成时可通过 getWeights() 读取调整后的优先级

## 本任务在哪一层
L0（横向层）— packages/evolution/

## Done 标准
- [x] verify: test -f packages/evolution/src/session-learner.ts
- [x] verify: grep -q 'SessionLearner' packages/evolution/src/index.ts
- [x] verify: grep -q "SessionLearner" src/l3/synova-diagnosis-engine-impl.ts
- [x] verify: npx vitest run tests/evolution/session-learner.test.ts 2>&1 | grep -q 'passed'
- [x] verify: npx tsc --noEmit 2>&1 | grep -c evolution; test $? -eq 1
