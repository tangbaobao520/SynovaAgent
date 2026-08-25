# Task Brief: D440 — 控制台自动生成接 CI（dashboard-auto.yml）

> 2026-08-18 | CTO (DeepSeek Harness) | CI 自动化

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人（2026-08-18）：控制台右边栏"老样子"根因 = generate-dashboard.py / founder-truth.py 是手动生成快照，无自动触发（M3 机制建成未接线）。要求接 CI 自动化。

### b) 文件审计
- .github/workflows/dashboard-auto.yml（新）：push main → 跑两个生成器 → 产物变化开 bot PR
- 复用 product-progress.yml 的 bot 分支模式（auto/dashboard）

### c) 决策
founder-truth 用 --offline（避免 workflow 内自调用 GitHub API 死循环）；generate-dashboard 纯本地。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- M3 机制建成未接线：生成器存在但无触发 → CI 自动
- product-progress.yml 的 bot PR 模式（D373 悬挂分支自愈）复用
- D373 fail-closed：PR 创建失败 = 红灯

## Q2: 范围 — 正确的最简方案

做什么：
- .github/workflows/dashboard-auto.yml
- task-state/D440.json
- .claude/task-briefs/2026-08-18-D440-dashboard-ci.md
- .claude/current-brief

不做什么：
- scripts/control-tower/generate-dashboard.py（不改生成器本身）
- scripts/control-tower/founder-truth.py（不改）
- scripts/audit/（K3 专属）

## Q3: 验收 — 入口 → 交互 → 结果

入口：push main / 手动 dispatch
处理：checkout → generate-dashboard → founder-truth --offline → diff 有变化提交 bot 分支
结果：auto/dashboard PR 自动创建；控制台每次数据变化自动更新

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] dashboard-auto.yml 语法合法（actionlint 或 yaml 解析）
- [ ] 本地跑通两个生成器（--offline 模式）
- [ ] bot 分支 PR 机制复用 product-progress 模式
- [ ] 提交经 synova-commit + 推送 + 入 main
