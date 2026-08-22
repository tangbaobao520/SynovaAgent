# Task Brief: D474 snapshot keyless 回放 + 黄金数据集门禁（Stage1-D3）

> 生成: 2026-08-22 | 任务: D474（原 D470，2026-08-22 撞号改号，创始人裁定）| 认领: DeepSeek Harness（编码）
> 权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D474-golden-dataset-gate-20260822.md
> 依赖: D396（三层快照执行器）/ D51（F1 评分器）——本任务补"黄金数据集接线 + keyless 录制 + severity 对比"

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属治理层（L0 测试/门禁层）：把黄金数据集（data/golden/wani-baby-v1.json）接入门禁。D396 已交付三层快照执行器 + pre-push/CI 接线；缺口：① check-golden-regression.sh 零接线（M3 建了不接线）② 无 keyless 录制模式（快照只能手写）③ findingsFnRegistry 空转（显式 descope，哨兵 aggregate 依赖 GraphStoreReader 不符合同步纯函数契约）。
### b) 文件审计
- scripts/ci/golden-snapshot-runner.ts: 新增 recordComputeSnapshot + runGoldenDatasetCheck
- scripts/ci/golden-case-checker.ts: runAllChecks 追加阶段 5 + --record 模式
- scripts/pre-push-check.sh: golden-case 区块（L244 附近）追加 check-golden-regression --verify-only
- tests/ci/golden-case-checker.test.ts: 新增 ≥8 用例
- data/golden/wani-baby-v1.json: 只读（sentinels = {哨兵名: {expected, value}} 结构，16 哨兵）
### c) 决策
findingsFnRegistry 显式 descope（S-10）——哨兵 aggregate 依赖 L4 GraphStoreReader + async，强行适配 = 快照测的不是真实函数。本卡只登记 compute 纯函数 + severity 级对比。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考 DSH snapshot 测试 keyless 回放范式（跑真实代码生成快照 → 人工确认冻结 → 回放 diff）。决策：① keyless 录制 = recordComputeSnapshot 跑 registry 真实函数返回冻结候选（录制 ≠ 判定）② 黄金数据集 diff 契约 = severity 级对比（数据集 sentinels 是 {expected,value} 结构非 FindingSnapshot[]）③ 接线点 = pre-push golden-case 区块（checksum 校验 + 真跑 compute，两者独立判定任一红即阻断）。
历史教训：M3 建了不接线（check-golden-regression 零调用）——WIRE CHECK grep 是硬门禁。
参考：Anthropic 工程基线（机器可验契约 + 脚本验证）+ DeepSeek snapshot keyless 范式 + 第一性原理（输出可复现 = 跑真实代码 diff 冻结快照）+ 结论：keyless 录制 + severity 对比 + pre-push 接线三件套。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/ci/golden-snapshot-runner.ts
- scripts/ci/golden-case-checker.ts
- scripts/pre-push-check.sh
- tests/ci/golden-case-checker.test.ts
- task-state/D474.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D474-golden-dataset-gate-20260822.md
不做什么：
- 不改 scripts/ci/golden-case-checker.ts 的 F1 判定逻辑（computeF1Score/deriveActual，K3 明令冻结）
- 不改 scripts/workflow/check-golden-regression.sh 本体逻辑（已有完整 checksum 校验，本次只接线）
- 不改 src/ 业务逻辑（compute 阈值/哨兵 aggregate 归 D355-D360 Win 线）
- 不改 .github/workflows/ci.yml（CI golden-case job 已跑同命令）
- 不改 data/golden/wani-baby-v1.json 及其 checksums（冻结快照）

## Q3: 验收 — 入口 → 交互 → 结果
入口：git push（pre-push golden-case 区块）+ 手动 npx tsx scripts/ci/golden-case-checker.ts
处理：recordComputeSnapshot 录快照 → runGoldenDatasetCheck 读 wani-baby → 已登记 compute 纯函数跑真实代码 → severity 对比
结果：改坏 cash-runway.ts 阈值 → severity 漂移 → passed:false（红）；恢复 → passed:true（绿）；checksum 不匹配 → check-golden-regression 红

## 架构层:
基础设施（L0 测试/门禁层）

## Done 标准
- [x] verify: npx vitest run tests/ci/golden-case-checker.test.ts 全过（≥8 新用例，含录制/severity 对比/降级/红-绿）
- [x] verify: grep -n "recordComputeSnapshot" scripts/ci/golden-case-checker.ts 命中调用（非仅 import）
- [x] verify: grep -n "runGoldenDatasetCheck" scripts/ci/golden-case-checker.ts 命中调用
- [x] verify: grep -n "check-golden-regression" scripts/pre-push-check.sh 命中生产调用行
- [x] verify: bash scripts/control-tower/baseline-check.sh 无新增失败；D396 三层快照原用例全绿
