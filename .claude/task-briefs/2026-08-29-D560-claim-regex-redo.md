# D560 — D549 重做：claim-regex 测试动态化 + canary 密封补齐（K3 FAIL 闭合）

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: K3 impl-done 处置批（2026-08-28-D501-D550-impl-done-batch.md，D549=FAIL）
> 类型: FIX（审计闭环铁律 D382）；完成后需 K3 复审
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔测试层。K3 判 D549 FAIL：PR #272（756573df）合并的 FIX 分支 731d2469 提交消息声称「claim-regex 测试硬编码行号修复 + 6 新密封测试入 CI canary」，实际 diff 仅 task-state/D549.json 11 行零代码——M2 声称 vs 事实最重级。main 上 claim-regex-narrow.test.sh:71 仍 `sed -n '749p'` 硬编码（guard 已漂到 :753）→ T5b 恒红且不在 canary 清单。

### b) 文件审计
- tests/control-tower/claim-regex-narrow.test.sh：L71 sed -n '749p' 硬编码（D542/D543 加行漂移根因）
- .github/workflows/ci.yml：canary 清单（for t in 列表）——claim-regex-narrow 不在列（check-canary-drift 可证）
- D542/D543 先例：动态 grep 替代硬编码 sed 行号

### c) 决策
无覆盖 → 重做（动态 grep + 清单补齐 + 真实代码提交）。

## Q1: 调研
铁律 48（测试非空壳）；M2 零容忍（本次 FAIL 根因 = 提交消息声称代码但 diff 无代码——K3 已固定证据）；D542 先例（ci-strict-visible 动态定位）；S-5 先红再绿。

## Q2: 范围
做什么：
- 修改 tests/control-tower/claim-regex-narrow.test.sh：T5b 动态 grep（sed -n '749p' → 运行时 grep 定位 guard 行，D542 同款手法）
- 修改 .github/workflows/ci.yml：canary 清单补 claim-regex-narrow.test.sh；核实「19→25」声称——若确有 6 个新密封测试未入列则补齐，无则如实登记不虚报
- task-state/D560.json：回填（impl_done + commit + evidence）
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：本批回流登记 + CT-47（合并门禁缺失）
- 修改 docs/synova/coordination/K3审计清单-20260822.md：impl-done 批翻转 ✅ + D560/D561 立项行

不做什么：
- 不改 scripts/pre-commit-check.sh（guard 本身无缺陷，D542/D543 已修）
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线
- 不改 D549.json（K3 审计结论保留；D560 完成后复审由 K3 回填）

## Q3: 验收
入口：bash tests/control-tower/claim-regex-narrow.test.sh
处理：先红（漂移模拟：guard 行号 +1 → T5b 失败）→ 动态化后绿 → 入 canary
结果：本地全绿 + CI 双平台 job 级绿 + canary 清单含 claim-regex-narrow

## 架构层:

L0 控制塔（tests/ + .github/workflows/，非 L1-L5 产品层）

## Done 标准
- [x] T5b 动态化 verify: grep -c "sed -n '749p'" tests/control-tower/claim-regex-narrow.test.sh | xargs test 0 -eq
- [x] canary 入列 verify: grep -c "claim-regex-narrow" .github/workflows/ci.yml | xargs test 1 -ge
- [x] 本地全绿 verify: bash tests/control-tower/claim-regex-narrow.test.sh 2>&1 | grep "0 失败"
- [x] 回填完成 verify: python3 -c "import json; d=json.load(open('task-state/D560.json')); assert d['status']=='impl_done' and d['impl']['commit']"
