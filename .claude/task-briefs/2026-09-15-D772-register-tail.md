# Task Brief: D772 收口登记（D769 卡 + D770/D771 自身台账）

> 生成: 2026-09-15 | 分支: docs/d772-register-tail | as any: 0
> 域: mac（task-state 属域判定豁免；单域）
> 主线贡献: infra:看板可信度（拆单后续，把 D760~D769 十张卡与 D770/D771 自身台账补齐）
> 触发: D770 PR #565 触及 D734 上限 13>12 → 按门禁指引拆单（不调上限），D769 登记移到本单

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测、主动发现、自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
治理层收口：把拆单剩下的登记补齐，使「DSH 借鉴卡 B-11~B-20 = D760~D769」在看板上完整可见，并登记 D770/D771 自身台账。
链路：`task-state/D###.json` → `derive-board-sources.py`（读 origin/main）→ `source-snapshot.json` → 适配器每 5 分钟同步 → Host 账本 `ledger-v2.json`。

### b) 文件审计（实测）
- #565 差异 13 文件（10 卡 + 计划 + brief + `.claude/bypass.log` 自动登记）> D734 上限 12 → 拆出 D769（B-20，最低优先）。
- D770/D771 的 task-state 在各自 PR 中因预算被移出（#565/#566 均卡 12 上限）→ 本单补齐，避免「计划表引用但看板不可见」的幻号再现。

### c) 决策
不新建机制：同一链路补数据；不调 D734 上限（门禁指引明写「拆 PR，禁调高上限」）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = 三个 task-state 落地后，看板链路可见。② 测试 = 既有适配器测试不改（42 例）。③ 实现 = 3 个数据文件。④ 接线 = 链路已存在。⑤ 验证 = snapshot/账本出现 D769/D770/D771。

引用依据：D734（预算不可调，拆单）· D384（禁幻号）· 诚实原则（不把拆单说成一次做完）

### b) 本任务执行约束
- rule: "上限未被动过" verify: "grep -n 'MAX_FILES=12' scripts/control-tower/check-pr-budget.sh → 命中"

### c) 决策参考系
参考：第一性原理（规则说拆单就拆单，不改规则迁就自己）+ Anthropic 基线 → 直接拆。

### d) 相关 Note 引用
无（未触治理脚本区/规则文档区）。

## Q2: 范围 — 正确的最简方案

做什么：
- task-state/D769.json — B-20 速览族卡登记
- task-state/D770.json · D771.json — 本批两任务自身台账
- task-state/D772.json — 本收口任务台账

不做什么：
- 不改 scripts/control-tower/check-pr-budget.sh（上限不动）
- 不改 docs/synova/coordination/整体推进计划-主线-20260913.md（计划表已在 #565 更新）
- 不改 dsh/plugins/task-board-adapter/**（适配器不动）
- 不改 scripts/audit/**（K3 红线）

## Q3: 验收 — 入口 → 交互 → 结果

入口：看板同步链路（origin/main 派生快照 → 5 分钟同步）
处理：task-state 落地 main → 快照摄取 → 看板映射
结果：看板含 D760~D769 十张卡 + D770/D771/D772 台账

## 架构层: scripts（治理层：task-state）；不触 L1-L5
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: `for id in D769 D770 D771 D772; do test -f task-state/$id.json || echo MISSING $id; done` → 无 MISSING
- [ ] 结果可见: verify: `python3 -c "import json;print(json.load(open('task-state/D769.json'))['title'][:16])"` → 打印「DSH 借鉴卡 B-20」
- [ ] 预算内: verify: `git -c core.quotepath=false diff --name-only origin/main...HEAD | wc -l` → ≤12

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/task-briefs/2026-09-15-D772-register-tail.md | task |
| task-state/D769.json | task |
| task-state/D770.json | task |
| task-state/D771.json | task |
| task-state/D772.json | task |

