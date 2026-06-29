# Task Brief: Phase P0-2 — 实现 OrgAdapter 组织自适应引擎

> 生成: 2026-06-30 | 分支: feat/prompt-architecture | 基于 EVOLUTION-LAYER-v2.md §五

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（迁移到独立包 / 新建包）

本任务属于 L0 进化层第二层（组织自适应）。新建 `OrgAdapter` 类于 packages/evolution/ 中。
- 性质：新建
- 触发时机：诊断完成后（post-diagnosis-processor.ts 末尾）

### b) 文件审计
- `packages/evolution/src/org-adapter.ts` — 新建
- `packages/evolution/src/index.ts` — 已存在，需增加 OrgAdapter 导出
- `src/agent/post-diagnosis-processor.ts` — 已存在，需在末尾增加 OrgAdapter 调用
- `src/routes/diagnosis.ts` — 已有 runPostDiagnosisProcessing 接线

关系：新建（OrgAdapter）+ 扩展（post-diagnosis-processor 末尾加钩子）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC → ② 实现 → ③ 测试 → ④ 接线 → ⑤ 验证 → ⑥ 提交 CI

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 46: 禁止 engine-core 引用

### b) 本任务执行约束
- rule: "OrgAdapter 必须支持降级 (L3 不可用时仍可运行 processCorrections)"
  verify: "grep -q 'l3: null' packages/evolution/src/org-adapter.ts"
- rule: "post-diagnosis-processor 中的 OrgAdapter 调用必须懒加载 (动态 import)"
  verify: "grep -q 'await import' src/agent/post-diagnosis-processor.ts | grep evolution"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 新建 `packages/evolution/src/org-adapter.ts` — OrgAdapter 类
   - afterDiagnosis() 主入口
   - processCorrections() — 纠错→解析事实→GraphStore
   - adjustThresholds() — ≥3次纠错→阈值自适应上调20%
   - closeStaleTickets() — 关过期ticket (L3WriteAPI 可选)
2. packages/evolution/index.ts 导出 OrgAdapter
3. post-diagnosis-processor.ts 末尾加 OrgAdapter.afterDiagnosis() 调用（懒加载）
4. org-adapter.test.ts — 8 个测试用例

不做什么：
- 不改 src/l4/agent-memory-store.ts（代码或表结构）
- 不改 src/sentinel/runner.ts（L3WriteAPI 在 Phase P1-1）
- 不改 src/routes/chat.ts（Phase P0-1 已完成）

## Q3: 验收 — 入口 → 交互 → 结果

入口：诊断完成后 → post-diagnosis-processor → OrgAdapter.afterDiagnosis()
处理：读取 user_correction → 解析事实→GraphStore写入 → 计数纠错→阈值上调
结果：AgentMemoryStore 中有 type:'threshold_adjustment' 的记忆 + GraphStore 节点属性更新

## 本任务在哪一层
L0（横向层）— packages/evolution/

## Done 标准
- [x] verify: test -f packages/evolution/src/org-adapter.ts
- [x] verify: grep -q 'OrgAdapter' packages/evolution/src/index.ts
- [x] verify: grep -q 'OrgAdapter' src/agent/post-diagnosis-processor.ts
- [x] verify: npx vitest run tests/evolution/org-adapter.test.ts 2>&1 | grep -q '8 passed'
- [x] verify: npx tsc --noEmit 2>&1 | grep -c evolution; test $? -eq 1
