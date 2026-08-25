# Task Brief: D458 — 多 session 并行冲突系统性根治

> 2026-08-18 | CTO | 控制塔

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
多 session 并行冲突（撞号/bypass冲突/current-brief冲突/生成物冲突）。根因：运行时状态当源代码跟踪。GIT-SYNC-PLAN 已定边界但漏执行 rm --cached。

### b) 文件审计
- .gitignore（清理自相矛盾规则）
- VERSION.md（新建，固化版本规范）
- 7 个运行时信号 git rm --cached
- docs/synova/coordination/PARALLEL-CONFLICT-ROOT-FIX.md（决策记录）

### c) 决策
三层：①运行时信号去跟踪 ②生成物单点生成门禁（待做）③bypass union（已做）。版本 V4.8.1 补丁。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- 第一性原理：运行时状态不该用 git 分支合并模型
- M8 共享暂存区竞争（D330/D331）、M6 版本锚点断裂
- GIT-SYNC-PLAN(08-14) 既定决策未执行完

## Q2: 范围 — 正确的最简方案

做什么：
- .gitignore
- VERSION.md
- .claude/current-brief（去跟踪）
- .claude/workflow-state.json（去跟踪）
- .codex/audit/audit-result.json（去跟踪）
- .codex/control-tower/health.json（去跟踪）
- .codex/control-tower/session-registry.json（去跟踪）
- .codex/settings/gatekeeper/.dashboard-signal（去跟踪）
- .codex/settings/gatekeeper/.health-check（去跟踪）
- docs/synova/coordination/PARALLEL-CONFLICT-ROOT-FIX.md
- task-state/D458.json
- memory/notes/implemented/2026-08-18-d458-parallel-root-fix.md
- .claude/task-briefs/2026-08-18-D458-parallel-root-fix.md
- .claude/current-brief

不做什么：
- .claude/bypass.log（保留跟踪，D457 union 已处理）
- task-state/D*.json（审计证据链，保留）
- docs/synova/audit-reports/（K3 报告，保留）
- 生成物 HTML 去跟踪（方案 A 否决，改方案 C 单点生成门禁——后续任务）

## Q3: 验收 — 入口 → 交互 → 结果

入口：git rm --cached 运行时信号
处理：去跟踪 + .gitignore 清理 + VERSION.md
结果：7 个运行时信号不再跟踪；版本规范固化 V4.8.1

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] 7 个运行时信号 git rm --cached
- [ ] VERSION.md 固化版本规范
- [ ] 磁盘文件保留（脚本读依赖不破坏）
- [ ] 提交经 synova-commit + 推送 + 入 main + 打 tag V4.8.1
