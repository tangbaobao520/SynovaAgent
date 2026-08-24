# Task Brief — 文档体系改革新文件落库（第一批）

## Q0: 定位
### a) 项目拼图
文档体系改革（DSH 2026-08-19~20）的新增文件落库：编年史/权威层/文档机制脚本/测试/归档。
### b) 文件审计
见 docs/authority/COMMIT-PLAN-20260820.md 批次 1（新建）+ 批次 2 + 批次 4。
### c) 决策
仅提交新增文件；被修改的跟踪文件（AGENTS/CLAUDE/LOOP/pre-commit 等）由 DSH 后续补交。

## Q1: 调研
历史教训：D315（改了必须提交）；D334/D335（多机 PR 工作流，main 只进 PR）。

## Q2: 范围
做什么：
- CHRONICLE.md
- INDEX.md
- START-HERE.md
- docs/archive/TOMBSTONE-20260820.md
- docs/archive/08-代码审计报告-20260603.md
- docs/archive/REMEDIATION-PLAN-20260603.md
- docs/authority/ARCHITECTURE.md
- docs/authority/COMMIT-PLAN-20260820.md
- docs/authority/DOCS-REGISTRY.yaml
- docs/authority/DRIFT-LEDGER.md
- docs/authority/GOVERNANCE.md
- docs/authority/PRD.md
- docs/authority/STATUS.md
- docs/authority/SYSTEM-HEALTH.md
- docs/authority/TASK-DRAFTS.md
- docs/authority/TRIAGE-CLASSIFICATION-20260820.md
- docs/authority/chronicle-drafts/2026-06.md
- docs/authority/chronicle-drafts/2026-07.md
- docs/authority/chronicle-drafts/2026-08.md
- scripts/doc-system/check-doc-truth.sh
- scripts/doc-system/chronicle-monthly-wrapper.sh
- scripts/doc-system/doc-categories.sh
- scripts/doc-system/doc-registry-gate.sh
- scripts/doc-system/doc-staleness.sh
- scripts/doc-system/doc-triage.sh
- scripts/doc-system/generate-chronicle-monthly.sh
- scripts/doc-system/install-chronicle-schedule.sh
- tests/doc-system/check-doc-truth.test.sh
- tests/doc-system/doc-categories.test.sh
- tests/doc-system/doc-registry-gate.test.sh
- tests/doc-system/doc-staleness.test.sh
- tests/doc-system/doc-triage.test.sh
- tests/doc-system/generate-chronicle-monthly.test.sh

不做什么（含文件路径）：
- 不修改 AGENTS.md
- 不修改 CLAUDE.md
- 不修改 LOOP.md
- 不修改 knowledge/shared/README.md
- 不修改 docs/synova/DOCUMENT-INVENTORY.md
- 不修改 scripts/pre-commit-check.sh

## Q3: 验收
入口：git synova-commit → 处理：提交新文件 → 结果：新增文件全部入库 + PR 可合并。

## 架构层: L0
文档体系（权威层/编年史）+ 文档机制脚本（scripts/doc-system + tests/doc-system）
## Done 标准
- [x] 新增文件全部提交 (verify: git status --short 无本批 doc-system/authority/CHRONICLE 残留)
- [x] PR 创建成功 (verify: gh pr list --state open 含本分支)
