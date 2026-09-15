# Task Brief: D779 登记补齐（D727-D736 task-state 入 main）

> 生成: 2026-09-15 | 分支: docs/d779-taskstate-backfill | as any: 0
> 域: mac（task-state 属域判定豁免；单域）
> 主线贡献: infra:看板可信度 + 派单复核前置（复核 ① 项要求被引用的 D# 都有 task-state）
> 触发: 批五派单复核 ① 项点名 D734 无 task-state（实测：D727-D736 的登记只存在于未合分支 #536）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
治理层登记完整性：任务号只在未合 PR 里 = 看板不可见 + 派单复核 ① 项必红。

### b) 文件审计（实测）
- `git log --all --diff-filter=A -- task-state/D727.json` → 5732b5ab（#536 分支）；D733-D736 → c7431e24（同分支）
- main 上这 10 个文件**全部缺失**（`git cat-file -e origin/main:task-state/D73x.json` 实测）
- 批五派单（#569）复核 ① 项因此点名 D734

### c) 决策
字节复制（`git show <commit>:task-state/D###.json`）入 main —— #536 合并时同内容不冲突；不搬 #536 的派单文档（那是另一件事）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = main 上这 10 个 task-state 存在且与分支一致。② 测试 = 逐文件 `diff <(git show 5732b5ab:…) <(cat …)` 为空。③ 实现 = 复制。④ 接线 = 看板链路已存在。⑤ 验证 = 复核 ① 项转绿。

引用依据：D384（禁幻号）· 铁律 0（不假设共识：号在哪、状态为何都写进 note）· M4（执行证据链断裂）

### b) 本任务执行约束
- rule: "字节一致" verify: "for id in D727 … D736; do git show <src>:$id.json | diff - task-state/$id.json; done → 无差异（除 note/title 补写项，逐条在 PR 说明）"

### c) 决策参考系
参考：第一性原理（看板只认 main 上的 task-state）+ 最小动作 → 只搬登记，不搬文档。

### d) 相关 Note 引用
无。

## Q2: 范围 — 正确的最简方案

做什么：
- task-state/D727.json ~ D736.json（10 个，从 #536 分支 boid 复制 + 补 title/note/domain）
- task-state/D779.json（本任务）

不做什么：
- 不搬 docs/synova/coordination/派单-第三批-*（那是 #536 的内容）
- 不改 scripts/control-tower/pre-dispatch-check.sh（D771 已修）
- 不改 scripts/audit/**（K3 红线）

## Q3: 验收 — 入口 → 交互 → 结果

入口：`pre-dispatch-check.sh`（① 项）/ 看板快照
处理：task-state 入 main → 快照摄取 → 看板映射
结果：D727-D736 看板可见；批五派单 ① 项转绿

## 架构层: scripts（治理层：task-state）；不触 L1-L5
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: `for id in D727 D728 D729 D730 D731 D732 D733 D734 D735 D736; do test -f task-state/$id.json || echo MISSING $id; done` → 无 MISSING
- [ ] 链路走通: verify: `bash scripts/control-tower/pre-dispatch-check.sh docs/synova/coordination/派单-第五批-产品推进-20260915.md` → ① 项不再点名 D734
- [ ] 结果可见: verify: `python3 -c "import json;print(json.load(open('task-state/D734.json'))['title'])"` → 打印标题

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/task-briefs/2026-09-15-D779-taskstate-backfill.md | task |
| task-state/D727.json | task |
| task-state/D728.json | task |
| task-state/D729.json | task |
| task-state/D730.json | task |
| task-state/D731.json | task |
| task-state/D732.json | task |
| task-state/D733.json | task |
| task-state/D734.json | task |
| task-state/D735.json | task |
| task-state/D736.json | task |
| task-state/D779.json | task |

