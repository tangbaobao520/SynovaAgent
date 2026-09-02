# D565 — test-kit CI 接线：棘轮基线测试入 CI 双平台（K3 P1）

> 派单: CTO 自办 | 2026-09-02 | 类型: 控制塔 CI 接线修复
> 来源: K3 D489 批 P1（M3 家族：门禁测试自身的 CI 接线缺失）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔 CI。packages/test-kit 是独立 package（自带 package-lock，不在 root workspaces）——root npm ci + root vitest（include=./tests/**）结构性覆盖不到它。D558 建立的棘轮基线测试（05-as-any-audit，含 as never 8 基线）只在本地执行——K3 P1 实证「门禁测试自身缺 CI 接线」。

### b) 文件审计
- .github/workflows/ci.yml：Vitest 矩阵 job（root）/ Architecture job（root tests/architecture + check-architecture.sh）
- packages/test-kit/：独立 package-lock + vitest.config（include=./tests/**/*.test.ts）+ tests/{architecture,unit,wire,security,observer-adapters,python-bridge,e2e}

### c) 决策
新增 CI job（不塞现有矩阵——独立 package 独立 npm ci）：ubuntu + windows 双平台跑 `cd packages/test-kit && npm ci && npx vitest run tests/architecture/`（含 05 棘轮）。范围先 architecture/（棘轮所在）；全量套件接线待 e2e/python-bridge 平台依赖评估后另行扩展（防引入新平台红）。

## Q1: 调研
M3 家族第三次（D540 P2-1 → D549 P1-3 → D561 P2-1）+ K3 D489 批 P1 第四次点名；D549 先例（新密封测试入 canary）；本轮 7 轮教训 = 单平台绿是水分——**新接线必须双平台**。

## Q2: 范围
做什么：
- 修改 .github/workflows/ci.yml：新增 test-kit-architecture job（ubuntu+windows 矩阵；cd packages/test-kit && npm ci && npx vitest run tests/architecture/）
- 修改 packages/test-kit/tests/architecture/05-as-any-audit.test.ts：无需改（本任务纯接线；若 Windows 路径敏感就地适配）
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：P1 闭环登记
- 修改 docs/synova/coordination/K3审计清单-20260822.md：P1-testkit 翻转
- 修改 .claude/task-briefs/2026-09-02-D565-testkit-ci-wiring.md：本 brief

不做什么：
- 不改 packages/test-kit/tests/ 非 architecture 测试（e2e/python-bridge 平台依赖另评）
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线
- 不改 src/（纯 CI 接线）

## Q3: 验收
入口：CI job test-kit-architecture 双平台
处理：push 后 CI 实跑（棘轮基线在 CI 真实执行 = M3 闭环）
结果：双平台 job 绿 + Windows 若红就地适配（本任务的目的就是暴露）

## 架构层:

L0 控制塔（.github/workflows/ CI 接线）

## Done 标准
- [x] CI job 存在 verify: grep -c "test-kit-architecture" .github/workflows/ci.yml | xargs test 2 -ge
- [x] 双平台 verify: grep -A6 "test-kit-architecture" .github/workflows/ci.yml | grep -c "windows-latest" | xargs test 1 -ge
- [x] 台账登记 verify: grep -c "test-kit CI 接线闭环" docs/synova/coordination/审计发现台账-DSH-CTO.md | xargs test 1 -ge
