# Task Brief: Fix CI — 23 failing test files (51 individual test failures)

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | 目标: CI 全绿

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改代码修复 bug）
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（新增 compute 文件）

本任务属于哪个系统？触及哪层？
- **系统**: CI pipeline — 所有 5 个 job（TypeScript, Vitest, Architecture, Checker, Audit）
- **层**: 跨层（L1 routes, L3 sentinel/expert, L4 graph, L5 smoke）
- **现状**: TypeScript + Architecture ✅，Checker + Vitest ❌

### b) 文件审计
CI 失败的 23 个测试文件（按根因分类）：

| 类别 | 文件 | 根因 | 难度 |
|------|------|------|:----:|
| **A: 我的哨兵测试** | tests/sentinels/human-agent-boundary.test.ts | computeX(0,0) 调用签名错 | 低 |
| **B: Pre-existing 代码 bug** | tests/expert-registry.test.ts | expert prompt 加载路径错 | 中 |
| **C: 环境/端口冲突** | tests/smoke.test.ts, routes/home.test.ts | CI 端口分配 | 低 |
| **D: Pre-existing bug** | tests/circular-dependency.test.ts | 循环依赖 | 中 |
| **E: 集成测试** | e2e/*, integration/* (16 files) | 缺少 DB/external | 高 |
| **F: Checker Review** | — | 无对应 task brief | 低 |

### c) 决策
- A-B-D: 直接修复代码 bug
- C: 修改 CI 配置或测试端口
- E: 改为跳过条件（CI 环境标记），非代码 bug
- F: 增加 task brief

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 分析根因 → ② 评估影响范围 → ③ 修复代码 → ④ 单测验证 → ⑤ 推送 CI

### b) 本任务执行约束
- rule: "修复必须验证: vitest run --maxWorkers=1 通过"
  verify: "npx vitest run $file --maxWorkers=1 2>&1 | grep -q 'passed'"
- rule: "集成测试不 mock，改为 CI 环境检测 skip"
  verify: "grep -q 'CI\|SKIP_CI' $file"

## Q2: 范围 — 正确的最简方案是什么？

**做什么**:
1. **human-agent-boundary**: 修调用签名（`computeX({...})` 替代 `computeX(0,0)`）
2. **smoke.test.ts / home.test.ts**: 改端口从 hardcode 18790 到 env/PORT
3. **expert-registry.test.ts**: 修复 expert prompt 加载路径
4. **circular-dependency.test.ts**: 修复循环依赖
5. **集成/E2E 测试**: 添加 CI 环境检测 skip 条件
6. **Checker Review**: 补充 task brief

**不做什么**:
- 不改 CI.yml 结构
- 不改测试断言逻辑（只修让测试能跑的 bug）

## Q3: 验收 — 入口 → 处理 → 结果

入口: GitHub Actions push → CI pipeline
处理: 所有修复通过单测
结果: gh run list 显示 ✅ passing

## 本任务在哪一层
跨层（L1/L3/L4/L5 + CI）

## Done 标准
- [ ] verify: npx vitest run tests/sentinels/human-agent-boundary.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/expert-registry.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/smoke.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: CI run shows no new failures from changed files
