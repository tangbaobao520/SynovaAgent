# Task Brief — D927 台账登记（第二批六项）+ K3 审计派单 + DSH 借鉴重新对比派单

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

治理/台账面，不动 src/** 产品代码。

- 触发：创始人 2026-09-23 四项指令——① 需 K3 审计的出派单指令 ③ 面板生成器可否派（另答）④ 台账须 CTO 亲自登记；⑤ DSH 借鉴卡现状核查（今日 DSH 再次更新）。
- 文件审计：`docs/synova/coordination/审计发现台账-DSH-CTO.md`（§五 演进记录，追加一行）；`docs/synova/coordination/派单-*.md`（两件新建）；`task-state/D927.json`（新建卡）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

参考：Anthropic/第一性原理 + 结论=**发现即登记，判据绑定时刻**。

- 台账六项均物理复现（非转述）：standard 源探测失效 / DSH_HOME 装错 home / 我误覆盖 D921 卡 / alloc 崩溃非中文名专属 / Phase 0 五次同类缺陷（升级创始人）/ DSH 借鉴族现状与版本锚点漂移。
- 时点漂移类（与 D918/D920 同族）→ 新增口径：状态类声明须写"截至 <测量时刻>"。

## Q2: 范围 — 正确的最简方案

做什么（逐条精确路径）：
- docs/synova/coordination/审计发现台账-DSH-CTO.md — 追加 2026-09-23 第二批六项（含我自己的失误）
- docs/synova/coordination/派单-K3审计-D918D922D926-20260923.md — K3 审计派单（5 件，12 必答题，含"待建声明是否可滥用"与"精简是否删掉无覆盖条款"两问）
- docs/synova/coordination/派单-DSH借鉴重新对比审计-20260923.md — B-01…B-20 现状矩阵 + 锚点重核 + 过时判定（含 CTO 实测现状起步）
- task-state/D927.json、.claude/task-briefs/2026-09-23-D927-ledger-k3-dsh-recheck.md

不做什么（含文件路径）：
- 不改 scripts/ 下任何脚本（本件为文档/台账，两个工具缺口的修法另行开卡）
- 不改 src/ 下任何产品代码
- 不碰 scripts/audit/**（审计红线）

## 写集

| 文件 | 类别 |
|---|---|
| `docs/synova/coordination/审计发现台账-DSH-CTO.md` | task |
| `docs/synova/coordination/派单-K3审计-D918D922D926-20260923.md` | task |
| `docs/synova/coordination/派单-DSH借鉴重新对比审计-20260923.md` | task |
| `task-state/D927.json` | task |
| `.claude/task-briefs/2026-09-23-D927-ledger-k3-dsh-recheck.md` | task |
| `.claude/bypass.log` | builtin（post-commit hook 运行期账本） |

## Q3: 验收 — 入口 → 交互 → 结果

入口：`python3 scripts/control-tower/check-citations.py <两份派单件> --repo .`（引用门禁）
处理：D919 新门禁核引用；台账追加一行六项
结果：两份派单件引用 0 违规（K3 件 6 条 / DSH 件 0 条）；台账行落库

## 架构层

治理/台账（`docs/synova/coordination` + `task-state`；不触五层依赖图）

## Done 标准

- [ ] `python3 scripts/control-tower/check-citations.py docs/synova/coordination/派单-K3审计-D918D922D926-20260923.md --repo .` → 违规 0
- [ ] 台账追加行含 6 项实测发现（含 CTO 自身失误，不隐藏）
- [ ] `bash scripts/pre-commit-check.sh` → 13 组通过
