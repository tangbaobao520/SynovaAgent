# Task Brief: D804 DSH 标准派单（规格先行）+ 流程固化
> 生成: 2026-09-17 | 任务: D804 | 认领: synova-cto
#CRITERIA: A
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
治理文档层（非产品代码）：新增 DSH 标准派单（模板 + 两张 A 类卡）+ 固化条款。
### b) 文件审计
```
docs/synova/coordination/派单-D804-D803-DSH标准-20260917.md — 新建
task-state/D804.json / D803.json — 新建
```
### c) 决策
把"契约先行/切片/失败模式/反向验证"写成模板与卡判据；C4 闸与冻结门列入后续固化。
## Q1: 调研
DSH 0.1.6-alpha.1 实证：hook-protocol 先于实现、session-format v0→v1→v2→v3 增量迁移、policy 包独立、compaction 副作用包。参考：铁律 0-2（spec→test→impl→wire）。
## Q2: 范围
做什么：模板 + D804（M1 线1+线6）+ D803（线10）+ 固化条款。
不做什么：不改 `src/**`；不碰 `scripts/audit/**`；不改判分 `calc-progress.py`。
## Q3: 验收
入口：派单文档 §一 模板 ｜ 结果：执行方按八节出 dev doc，CTO 复核冻结后才动 src。
## 架构层
治理文档层（scripts 控制塔域）
## Done 标准
- [ ] verify: `bash scripts/control-tower/pre-dispatch-check.sh docs/synova/coordination/派单-D804-D803-DSH标准-20260917.md` → 机械项全通过
- [ ] verify: `task-state/D804.json` 与 `D803.json` 已登记

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/task-briefs/2026-09-17-D804-dsh-standard-dispatch.md | task |
| docs/synova/coordination/派单-D804-D803-DSH标准-20260917.md | task |
| task-state/D804.json | task |

