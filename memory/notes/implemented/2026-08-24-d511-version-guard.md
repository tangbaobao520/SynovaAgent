---
status: implemented
date: 2026-08-24
task: D511
tags: [control-tower, version-guard, ct-42, gate-14]
---

# D511 — 版本守卫门禁（pre-commit 组 14，V4.10.0）

## 决策

- **bump 级别 V4.10.0（MINOR）而非派单标题 V4.9.1（PATCH）**：规范 §二明确"新增机制/门禁组 = MINOR"，规范权威高于派单标题（dev doc §5.3 分歧记录）。
- **宁紧勿松（A 全拦）**：注释/文案类门禁改动也要求 bump 或走逃生舱——物理判定简单可靠，CT-42 教训是漏 bump 而非多 bump。
- **守卫自身不豁免（§5.4-2）**：新建守卫与接线/VERSION.md 天然同 commit 全过，无需豁免自身，避免永久旁路缺口。
- **version.log 入库（§5.4-3）**：control_tower_log.py 实际写入 .codex/control-tower/logs/version.log（schema 路径标记与物理路径不同），git add -f 入库——机器可读证据链。

## 机制

门禁文件变更（scripts/control-tower/、scripts/pre-commit-check.sh、scripts/workflow/、scripts/install-hooks.sh、scripts/hooks/、scripts/check-*.sh）⟹ .codex/control-tower/VERSION.md 必须同 commit bump。三态退出（D328）：0 过 / 1 拦 / 2 守卫降级 fail-closed（D331）。逃生舱 SYNO_SKIP_VERSION_GUARD=1 记 degraded-events.log（铁律 11）。

## 附带修复（同 commit）

G12 认领 TSV 生成 `sed "s|^|$BNAME\t|"` 在 macOS BSD sed 下 `\t` 不展开 → TSV 损坏 → Mac 上所有代码文件误报"不在 Q2 范围"（此前仅纯文档提交走 DOC_ONLY 早退幸免）。改 awk 拼 tab，判定逻辑零变化。

## 权威

- dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D511-version-guard-20260823.md（27d1ca5f）
- 规范: docs/synova/coordination/版本管理规范-控制塔.md §一/§二/§四
