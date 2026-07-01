# Task Brief: Fix 3 fixable CI exclude tests (industry-loader, l3-wiring, expert-file-loader)

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 目标：缩小 CI exclude 列表

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 横向（修复已有模块）

CI 排除列表中 3 个测试可通过修复代码 bug 或断言使其通过：

| 文件 | 当前状态 | 根因 |
|------|---------|------|
| `tests/l4/industry-loader.test.ts` | 1/3 fail | `degraded=true` 但测试期望 false |
| `tests/orchestrator/l3-wiring.test.ts` | 未知 | 需诊断 |
| `tests/agent/*.integration.test.ts` | 未知 | 需诊断 |

### b) 文件审计
- `src/l4/industry-loader.ts` — 加载行业模板时可能返回 degraded
- `src/orchestrator/l3-wiring.ts` — L3 组件接线
- `src/agent/expert-file-loader.ts` — 专家文件加载

### c) 决策
只修断言过期的文件和代码 bug，不改功能。

## Q2: 范围

**做什么**:
1. 诊断并修复 `industry-loader` degraded 问题
2. 诊断并修复 `l3-wiring` 测试
3. 诊断并修复 `expert-file-loader` 集成测试

**不做什么**:
- 不改 e2e（需要 LLM API）
- 不改 smoke / data-pipeline（需要基础设施）

## Q3: 验收

入口: `npx vitest run {每个文件} --maxWorkers=1`
结果: 通过后从 vitest.config.ts CI exclude 移除

## Done 标准
- [ ] verify: npx vitest run tests/l4/industry-loader.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/orchestrator/l3-wiring.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/agent/expert-file-loader.integration.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: git grep -q 'industry-loader\|l3-wiring\|agent/.*integration' vitest.config.ts && echo 'removed'
