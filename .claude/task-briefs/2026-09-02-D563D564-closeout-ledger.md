# D563/D564 终局台账登记 + K3 派审激活

> 派单: CTO 自办 | 2026-09-02 | 类型: 协调文档
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D563（diagnosis.ts 窄化）+ D564（incident-loop Win 修复）7 轮返工终局合并（#313 fc4424d5 + #314 5f7d69af）。台账登记 + 清单翻转 + K3 派审激活（派单文档已存在）。

### b) 文件审计
- docs/synova/coordination/审计发现台账-DSH-CTO.md（登记）
- docs/synova/coordination/K3审计清单-20260822.md（翻转）

### c) 决策
纯协调文档。

## Q1: 调研
审计闭环铁律 D382。

## Q2: 范围
做什么：
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：终局登记（cp1252 教训 + platform-checklist 三联缺陷 + 7 轮返工复盘）
- 修改 docs/synova/coordination/K3审计清单-20260822.md：D563/D564 已合并待复审
- 修改 .claude/task-briefs/2026-09-02-D563D564-closeout-ledger.md：本 brief

不做什么：
- 不改 scripts/audit/K3-AUDIT-PROTOCOL.md 等审计文件：审计红线

## Q3: 验收
入口：两文档在 main
结果：K3 可复审

## 架构层:

L0 控制塔（协调文档）

## Done 标准
- [x] 台账登记 verify: grep -c "D563/D564 终局" docs/synova/coordination/审计发现台账-DSH-CTO.md | xargs test 1 -ge
