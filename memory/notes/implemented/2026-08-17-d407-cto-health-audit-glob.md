---
status: implemented
date: 2026-08-17
task: D407
tags: [control-tower, cto-health, audit-glob]
---

# CTO-HEALTH audit glob 后缀变体兼容 + D394.json 冲突修复

## 决策
1. `gen-cto-health.py` audit 列 glob 从 `*D{num}.md` 单一模式改为：精确 `*D{num}.md` 优先，`*D{num}[a-z].md` 后缀兜底。
   - 起因：K3 审计报告命名存在后缀变体（`2026-08-17-D395a.md`），原 glob 匹配不到 → D395 audit 列误显 "—"。
   - 同时避免误匹配 `2026-08-16-D394-D398-strategy-consult.md` 这类同前缀组合文件。
2. `task-state/D394.json` 残留 merge 冲突标记（`<<<<<<< Updated upstream`）→ 清理并补写 impl 段（a8a5857e）。
3. D394/D396 审计报告经 GitHub API 合并入 main（audit/d394-report → c68ab4c1；audit/d396-report → c41017e1）。

## 验证
- gen-cto-health.py 幂等重跑：数据源指纹 2a5e9881c8ae 未变，不重写 → 仪表盘已正确。
- CTO-HEALTH §五：D394/D395=CONDITIONAL_PASS、D396=PASS、D402=spec_done。
