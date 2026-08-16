# Task Brief: D385: K3 审计产物合入仓库

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D385)
> 性质: 审计闭环——K3 审计工作区产物（D383 报告 + task-state 镜像）合入产品仓库

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 完成 D383 审计（CONDITIONAL PASS），产物在审计工作区（/Users/wane/Synova-k3独立审计，已提交 99820d6）。审计工作区只读产品仓库 → 镜像需合入产品仓库：task-state/D383.json（audit findings）+ 审计报告 docs/synova/audit-reports/2026-08-16-D383.md。

### b) 文件审计
- task-state/D383.json（合入 K3 findings，保留 fix_task_id=D384）
- docs/synova/audit-reports/2026-08-16-D383.md（复制落库）
- .claude/task-briefs/D385-audit-ingest.md（本文件）

### c) 决策
审计产物合入 = 审计闭环的一部分（台账引用路径需真实存在）。参考：第一性原理。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 读镜像 → ② 合入 D383.json findings → ③ 报告落库 → ④ 提交 → ⑤ K3 复审 D384 时闭环。
引用 D382 审计闭环铁律、M4（证据链完整）。

### b) 执行约束
- rule: "审计产物必须在产品仓库可引用"
  verify: "docs/synova/audit-reports/2026-08-16-D383.md 存在"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么：
- task-state/D383.json
- docs/synova/audit-reports/2026-08-16-D383.md
- .claude/task-briefs/D385-audit-ingest.md

不做什么：
- 不改审计报告内容（K3 产物原样）
- 不改 task-state/D384.json（D384 待 K3 复审）

## Q3: 验收 — 入口 → 交互 → 结果

入口：台账/审计报告引用路径
处理：产物合入产品仓库
结果：docs/synova/audit-reports/2026-08-16-D383.md 可访问 + D383.json audit findings 完整

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] docs/synova/audit-reports/2026-08-16-D383.md 在仓库
- [ ] task-state/D383.json audit.findings = 5 条（K3 镜像）
