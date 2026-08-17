# Task Brief: D408 — 收尾批次（session-registry + todos + bypass 证据落库）

> 2026-08-17 | CTO (DeepSeek Harness) | 控制塔维护

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人授权（2026-08-17）：任务收尾统一归 CTO，最终推送由 CTO 完成，保证 code/dev-doc/audit 一一对应。本批次为收尾机制的首次执行：把 DSH 线控制塔运行时证据落库。

### b) 文件审计
- `.codex/control-tower/session-registry.json`：D389-D407 session 写集登记（822 行新增）
- `docs/synova/product-lines/todos.yaml`：refresh-all 生成（含 K3 D355/D373 审计条目）
- `.claude/bypass.log`：D407 三次提交 COMMITTED 记录（提交后追加）

### c) 决策
按「你提交你的」：只提交控制体系产出，跳过编码测试产物与运行时信号。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 历史惯例：session-registry/health/current-brief 随 D334/D335/D336 批次提交过。
- M4（证据链断裂）：bypass.log 记录必须落库，否则推送对账失败。

## Q2: 范围 — 正确的最简方案

做什么：
- .claude/bypass.log
- .codex/control-tower/session-registry.json
- docs/synova/product-lines/todos.yaml
- .claude/task-briefs/2026-08-17-D408-closeout-registry-todos.md
- task-state/D408.json
- memory/notes/implemented/2026-08-17-d408-closeout-registry-todos.md

不做什么：
- extensions/industries/saas-tech/thresholds.json（编码测试产物）
- extensions/industries/test-write/thresholds.json（编码测试产物）
- tests/output/expert-quality-cross-industry.json（编码测试产物）
- .codex/audit/audit-result.json（运行时信号）
- .codex/settings/gatekeeper/.dashboard-signal（运行时信号）
- .codex/settings/gatekeeper/.health-check（运行时信号）
- .codex/control-tower/health.json（运行时信号）
- .claude/current-brief（运行时指向）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：收尾机制（任务结束 → CTO 汇总 → 推送）
处理（中间步骤）：暂存 → brief → synova-commit → push → GitHub API merge
结果（最终展示）：registry/todos/bypass 入 main；D408=impl_done；三仪表盘一致

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] session-registry 含 D389-D407 全部登记
- [ ] todos.yaml generated_at 更新且含 K3 审计条目
- [ ] bypass.log 含 D407 三次提交 full-hash 记录
- [ ] 提交经 synova-commit + 推送 + 入 main
