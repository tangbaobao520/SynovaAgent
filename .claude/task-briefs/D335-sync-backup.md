# Task Brief: D335: 防线闭环 — 提交端同步门禁 + synova.db 异地自动备份

> 生成: 2026-08-14 | 分支: feat/d335-sync-backup | as any: 0
> #CRITERIA: A

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

**本任务层级**: 基础设施（控制塔）— 非 L1-L5 业务代码。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人 2026-08-14 复核 D334 防线后指出两个漏洞：
① 防线"开工端"仍是软机制（skill/铁律靠 agent 自觉，物理强制只在 push 端）
② synova.db（企业诊断数据）只在 Mac 本地磁盘，无异地备份——代码有三地备份，
数据只有一份。本任务补上两端：提交端物理门禁 + 数据异地自动备份。

### b) 文件审计
- `scripts/control-tower/synova-commit` — 提交唯一路径，挂载点：pre-commit 之前（487 行附近）。→ 扩展
- `scripts/backup/` — 不存在。→ 新建（backup-db.sh + install-backup-launchd.sh）
- `data/backups/` — 应用内同盘备份，停更于 08-09（crontab 被系统权限拦）。→ 不依赖 crontab，用 launchd
- `tests/control-tower/` — 已有 push-sync-guard.test.sh（D334）风格。→ 新增 2 个测试
- 冲突检查：无。check-branch-sync.sh 与 check-bypass-log.sh 同层不同职责。

### c) 决策
无冲突。参考：Anthropic/DeepSeek/第一性原理 + 结论：
- 提交端门禁挂 synova-commit（唯一提交路径，物理强制"基于过期基线禁止提交"）
- 备份用 sqlite3 .backup（一致性快照）+ launchd（Mac 原生、无需 root、不依赖被拦的 crontab）

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 业界最佳实践
SQLite 官方文档：在线备份唯一安全方式是 backup API（.backup 命令），直接 cp 可能拷到
写一半的库。macOS 定时任务首选 launchd（Apple 官方推荐，crontab 在 macOS 已被弃用且
受 TCC 权限限制）。

### b) memory/ 历史教训
- V3.9 教训：硬阻断 100% 有效，软机制 0% 有效 → 开工端检查做成 synova-commit 硬阻断
- 铁律 11 静默降级禁止 → fail-open 全部显式提示 + degraded 日志
- 铁律 48 测试非空壳 → 正常/降级/边界/接线全覆盖
- memory/bash32-compat.md — Mac bash 3.2（测试避免 mapfile/全角括号贴变量）

### c) 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论：两端物理门禁 + launchd 自动备份 + iCloud 异地。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/check-branch-sync.sh — 提交端同步门禁（main 落后/基线过期/分叉 → 硬阻断；SYNO_SKIP_BRANCH_SYNC=1 逃生舱；fetch 失败 fail-open）
- scripts/control-tower/synova-commit — 挂载 check-branch-sync.sh（pre-commit 之前，D319 tag 机制逻辑保持原样）
- scripts/backup/backup-db.sh — sqlite3 .backup 一致性快照 + 原子落盘 + integrity_check + 14 份轮转 + 日志
- scripts/backup/install-backup-launchd.sh — 生成 launchd plist（每天 03:30）+ launchctl load（幂等）
- tests/control-tower/branch-sync-guard.test.sh — 8 用例（main 落后/同步/基线过期/分叉/最新/降级/逃生舱/接线）
- tests/control-tower/backup-db.test.sh — 6 用例（正常/可读/轮转/源缺失/目标不可建/日志）
- .codex/control-tower/VERSION.md — bump V4.7.7（PATCH：门禁行为变化）
- CLAUDE.md — 铁律 0-4 数据资产备份 + 版本号同步 V4.7.7
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 补数据备份章节

不做什么：
- 不改 src/ 任何业务代码（本任务是控制塔基础设施）
- 不改 .github/workflows/ci.yml（存量红灯独立任务）
- 不改 data/synova.db 内容（只读备份）
- 不做 GitHub branch protection 的 API 自动化（无 token；网页手工设置，创始人已在操作）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任何机器执行 synova-commit（提交）→ 分支同步门禁自动前置检查；launchd 每天 03:30 自动跑备份
处理（中间步骤）：fetch 远端 main → 落后/分叉 → 硬阻断并提示 pull/rebase；sqlite3 .backup 快照 → 原子落盘 → 完整性校验 → 轮转
结果（最终展示）：阻断时 agent 看到明确修复命令；备份成功后 iCloud 出现 synova-backup-*.db（最多 14 份）

## 架构层: 基础设施
控制塔/工程治理（五层之外）

## Done 标准:
- [x] verify: `bash tests/control-tower/branch-sync-guard.test.sh` 返回 exit 0（11 用例全过）
- [x] verify: `bash tests/control-tower/backup-db.test.sh` 返回 exit 0（9 用例全过）
- [x] verify: `bash -n scripts/control-tower/check-branch-sync.sh && bash -n scripts/backup/backup-db.sh` 返回 exit 0
- [x] verify: `grep -c "check-branch-sync.sh" scripts/control-tower/synova-commit` 输出 ≥ 1（接线）
