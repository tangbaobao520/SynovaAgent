# Task Brief: D553 impl-done-disposal-and-audit-dispatch

> 生成: 2026-08-28 | 任务: D553 | 认领: CTO (DeepSeek Harness)
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 决策参考：第一性原理（impl_done 无审计结论 = 状态悬空，K3 结论是闭环唯一凭证）+ Anthropic（审计闭环铁律：另起 FIX 任务，报告 git 跟踪）+ 收敛结论：处置=回填证据 + 派审计批，不改状态机

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制体系层（task-state 状态收口 + 审计派单）。main 权威 task-state 扫描：30 个 impl_done 任务中，
13 个已有 K3 审计报告（报告文件在 main，派生状态应由生成器置 audited）、17 个无审计结论（悬空）。

### b) 文件审计
- `git ls-tree origin/main task-state/` 30 个 impl_done：13 有 audit 段+报告文件（D502/D503/D504/D505/D533/D536/D540-D544/D546/D547）
- 17 无审计结论：D501 D508 D509 D513 D515 D516 D520 D521 D524 D525 D526 D534 D535 D537 D538 D549 D550
- impl.commit=PENDING ×3（D509/D513/D516）——M7 漂移纪律（K3 P2-3）：已回填真实 hash（dbdcdbcf/90d787c2/503d04ca）
- D515 的 K3 FAIL 结论无报告文件（M4 类缺口，仅在 D516 note 提及）——派单要求 K3 补录
- D393 README：status 由生成器（gen-cto-health.py）从工件派生，人工不维护 status 字段

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 审计闭环铁律（2026-08-16 创始人裁决）：K3 出问题另起 FIX 任务，禁改原任务——本批只派审，不改交付
- K3 P2-3（2026-08-22）：task-state impl.commit 大面积 PENDING/local = M7 漂移——回填纪律本次执行
- M4（执行证据链断裂）：D515 FAIL 结论不在 git = 同型苗头——派单显式要求补报告
- D393/D399：status 派生制——不手改 status，改工件（报告文件/commit），生成器重算

## Q2: 范围 — 正确的最简方案

做什么：
- task-state/D509.json D513.json D516.json impl.commit 回填（PENDING → 真实 hash）
- 审计派单文档 docs/synova/coordination/审计派单-20260828-impl-done处置批.md（17 任务表 + 审计要求 + D515 补报告要求）
- gen-cto-health.py 重生成 CTO-HEALTH.md（派生状态刷新，审 diff 后提交）

不做什么：
- 不手改 task-state status/audit 字段（D393 派生制；唯一例外 = 本批回填的 impl.commit 证据字段）
- 不审计任何任务（禁止自我审计，红线）——派单交 K3
- 不写审计标准（K3 红线）
- 不碰在途 D551 文件（TASK-ROUTING.md/D551.json/D551 spec/编码指令-D551，dev-doc session 在途）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：main task-state 扫描（30 impl_done 分类）
处理（中间步骤）：证据回填 → 派单撰写 → CTO-HEALTH 重生成审 diff → 提交 PR
结果（最终展示）：审计派单落 main（PR #280）；K3 拿派单可直接开工；CTO-HEALTH §五 派生状态刷新

## 架构层: 控制体系（治理资产），非 L1-L5 产品层

## Done 标准: 以下全部物理可验

- [x] verify: git show HEAD:task-state/D509.json | grep -q dbdcdbcf —— PENDING 三处清零（D509/D513/D516）
- [x] verify: ls docs/synova/coordination/审计派单-20260828-impl-done处置批.md —— 派单含 17 任务表 + D515 补报告要求
- [x] verify: git diff HEAD~1 -- docs/synova/CTO-HEALTH.md | head —— 重生成 diff 已审（只允许派生状态行变化，无意外内容）
- [x] verify: git ls-tree --name-only origin/main docs/synova/coordination/ | grep impl-done处置批 —— PR #280 合并后命中
- [x] verify: git log origin/main..HEAD --oneline —— PR #280 合并后为空（全量入 main）
- [x] 派单说明已交付创始人（可直接复制转 K3 session）
