# D562 — K3 复审批派单（D558/D560/D561 闭合验证）+ 三连验收台账登记

> 派单: CTO | 2026-08-29 | 执行线: 🔍 K3（独立审计）| 类型: 复审（审计闭环铁律）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
审计线复审。前序三 FIX 已合 main：D558（PR #300，K3 GA 线批 P1 闭合）/ D560（PR #301，K3 impl-done 批 D549 FAIL 闭合）/ D561（PR #302，K3 impl-done 批 P1×3 闭合）。复审验证修复点闭合，不重审全部。

### b) 文件审计
- 复审对象 = 三 PR 写集 + 对应 Done 标准（brief 在 main）
- 台账：审计发现台账-DSH-CTO.md（本批验收记录由 CTO 同 commit 登记）

### c) 决策
复审批（K3 独立工作区建分支，报告 + 回填）。

## Q1: 调研
审计闭环铁律 D382：FIX 完成后复审闭合 P1/FAIL；K3 复审 = 对照上轮 blockers 逐条，不重审全部。

## Q2: 范围
做什么：
- docs/synova/coordination/审计派单-20260829-K3复审批-D558-D561.md：复审批派单文档（三任务上轮结论 → 本批复审项逐条）
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：三连验收闭环登记（CTO 物理复核记录 + 编码质量记录 + CTO 自误 D547 第四次 + 编码 P2 过报 749p 注释残留）
- task-state/D562.json：回填
- 修改 .claude/task-briefs/2026-08-29-D562-k3-reaudit-dispatch.md：本派单 brief 自身
- 修改 .github/workflows/ci.yml：g12/incident-loop 两 hermetic 测试入 canary（K3 P2-1 处置，25→27）
- 修改 docs/synova/coordination/K3审计清单-20260822.md：D558/D560/D561 复审 PASS 翻转

不做什么：
- 不改 scripts/audit/（审计红线）
- 不改三任务代码（已合 main，复审只验闭合）

## Q3: 验收（复审已回流 #304；canary 补齐随本 closeout；incident-loop Win 首测失败回撤）
入口：派单文档存在 + 台账条目存在
处理：K3 领取后独立复核三任务
结果：K3 复审报告 + 三任务 task-state 复审结论回填

## 架构层:

L0 控制塔（治理/审计协调，非 L1-L5 产品层）

## Done 标准
- [x] 派单文档可解析 verify: bash scripts/workflow/check-brief-parseable.sh "docs/synova/coordination/审计派单-20260829-K3复审批-D558-D561.md" 2>&1 | grep "可解析"
- [x] 台账登记落地 verify: grep -c "三连任务验收闭环" docs/synova/coordination/审计发现台账-DSH-CTO.md | xargs test 1 -ge
