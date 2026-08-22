# Task Brief: D501 as-any 检查排除测试文件

> 生成: 2026-08-22 | 任务: D501 | 认领: DeepSeek Harness（CTO，控制塔）
> 性质: 门禁 bug 修复（减负，非加固），符合 08-21 冻结边界裁决（修 bug 不冻结）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔 pre-commit-check.sh 组1 as-any 检查（铁律 38 零容忍）。挪 CI（D467）后本地软提示 + CI 权威，CI 用 `base...HEAD` diff 拦"新增 as any"。
### b) 文件审计
- scripts/pre-commit-check.sh:315-325 组1 as-any 检查——`git diff "$SYNO_DIFF_BASE"...HEAD -- src/ packages/` 无测试文件排除
- packages/test-kit/src/security-scanners.ts `findTsFiles`——排除 .test.ts/.test.tsx/.d.ts/node_modules（只查生产代码）
- packages/test-kit/tests/architecture/05-as-any-audit.test.ts（D471 引入）——as-any 审计器自身测试，fixture 含 `as any` 字符串
### c) 决策
K3 P1-2（2026-08-22）把 as-any 范围从 src/ 扩到 src/+packages/ 时未排除测试文件 → D471 的 as-any 审计测试 fixture 被 CI 误报 19 处。修复：git diff 加 pathspec 排除 .test.ts/.test.tsx/.d.ts，与 findTsFiles 排除规则一致（只查生产代码）。

## Q1: 调研 — 根因 + 历史教训
根因：D471（Win PR #95）引入 as-any 审计器的测试文件（fixture 含 `as any`），CI 的 as-any 检查把测试 fixture 误报为生产违规。测试器自身的用例标题即"非测试/非声明文件"，但 pre-commit-check.sh 组1 未落地该排除语义。
历史教训：K3 P1-2 范围扩展（src/→src/+packages/）漏排除测试文件 = 本次回归根；铁律 38 as any 只查生产代码，测试 fixture 是合法测试输入。
参考：第一性原理（as any 禁令针对生产代码，测试输入不算）+ 与 findTsFiles 排除规则对齐。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — 组1 as-any 检查的 git diff 加 pathspec 排除 .test.ts/.test.tsx/.d.ts
不做什么：
- 不改 packages/test-kit/src/security-scanners.ts（as-any 审计器实现）
- 不改 .github/workflows/ci.yml（CI 配置）

## Q3: 验收 — 入口 → 交互 → 结果
入口：CI 的 TypeScript + Lint + Iron Laws job 跑 pre-commit-check.sh
处理：as-any 检查用 base...HEAD diff + pathspec 排除测试/声明文件
结果：D471 分支 CI 不再误报 19 处 as any；生产代码新增 as any 仍被拦（不削弱铁律 38）

## 架构层:
scripts（控制塔，非产品五层 L1-L5）

## Done 标准
- [x] verify: bash -n scripts/pre-commit-check.sh 零错误
- [x] verify: 本地验证 pathspec 排除后 D471 分支 as any 命中 0（原 19）
- [x] verify: 生产文件（registry.ts/sog-core-schema.ts/sog-schema-registry.ts）无 as any 残留
