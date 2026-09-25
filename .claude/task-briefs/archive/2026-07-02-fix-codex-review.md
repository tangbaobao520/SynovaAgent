# Task Brief: 修复 Codex 审查发现的 3 项问题

> 生成: 2026-07-02 | 分支: feat/prompt-architecture | 基于 Codex 审查报告

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 横向（修复已有模块）— packages/evolution/

3 个独立修复：

| # | 问题 | 模块 | 文件 |
|---|------|------|------|
| 7 | 纠错叠加层无 supersededBy | org-adapter.ts + evolution-types.ts | 3 个文件 |
| 8 | 组织基线未更新 | org-adapter.ts | 2 个文件 |
| 测试位置 | 测试在 tests/evolution/ 不在包内 | — | 只验证不移 |

### b) 文件审计
- `packages/evolution/src/org-adapter.ts` — processCorrections 加 supersededBy；afterDiagnosis 加基线更新
- `packages/evolution/src/evolution-types.ts` — AgentMemoryStoreLike.list 返回加 key
- `src/sentinel/baseline-store.ts` — 现有 BaselineStore，只需 import 使用
- `tests/evolution/` — 9 个测试文件，位置合规（不改变）

关系：修复（不改架构，只加字段和调用）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

**#7 supersededBy：**
- 问题：processCorrections 写入 GraphStore 后，原始 memory 条目没有标记为"已处理"
- 解法：处理后在原条目的 value JSON 中加 `supersededBy` + `processedAt` 字段
- 前置条件：`list()` 返回中需要 `key` 字段定位原条目

**#8 基线更新：**
- 问题：afterDiagnosis 不更新组织基线
- 解法：诊断完成后调用 BaselineStore.getBaselineStore().record()
- 注意：BaselineStore 在 src/sentinel/ 中。通过动态 import 避免跨层静态依赖

**测试位置：**
- tests/evolution/ 是项目的标准测试目录（所有包测试都在 tests/ 下）
- package/evolution/ 没有 tsconfig 独立编译，无法独立运行测试
- 不改变——当前做法符合项目规范

引用依据：
- 铁律 24+31: 每个 catch 有 log + degraded
- 铁律 39: 跨层调用动态 import，不静态 import

### b) 本任务执行约束
- rule: "list() 返回必须包含 key 字段"
  verify: "grep -q 'key' packages/evolution/src/evolution-types.ts"
- rule: "processCorrections 必须在处理后标记 supersededBy"
  verify: "grep -q 'supersededBy\|processedAt' packages/evolution/src/org-adapter.ts"
- rule: "afterDiagnosis 必须更新基线"
  verify: "grep -q 'BaselineStore\|getBaselineStore\|baseline' packages/evolution/src/org-adapter.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `evolution-types.ts` — AgentMemoryStoreLike.list 返回加 `key: string`
2. 所有 mock `makeMemoryStore()` — list 返回加 `key`
3. `org-adapter.ts` — processCorrections 处理后在值 JSON 加 `supersededBy` + `processedAt`
4. `org-adapter.ts` — afterDiagnosis 末尾动态 import BaselineStore 并 record()
5. 测试验证

不做什么：
- 不改 BaselineStore 代码
- 不改 AgentMemoryStore 代码
- 不移动测试文件（项目规范如此）

## Q3: 验收 — 入口 → 交互 → 结果

入口：OrgAdapter.afterDiagnosis() → processCorrections() + baseline update
处理：处理纠错后标记 supersededBy → 记录基线
结果：AgentMemoryStore 中 user_correction 的 value 包含 processedAt 和 supersededBy；基线被记录到 BaselineStore

## 本任务在哪一层
L0（packages/evolution/）

## Done 标准
- [x] verify: grep -q 'key' packages/evolution/src/evolution-types.ts
- [x] verify: grep -q 'supersededBy' packages/evolution/src/org-adapter.ts
- [x] verify: grep -q 'getBaselineStore' src/agent/post-diagnosis-processor.ts
- [x] verify: npx vitest run tests/evolution/ --reporter=verbose 2>&1 | tail -5 | grep -q 'passed'
