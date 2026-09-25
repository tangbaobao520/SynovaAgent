# Task Brief: D964 阶段4 批次2（全量）— 50 份零引用文档归档（单 PR）
> 认领: 🧭 synova-cto（并行 CTO）

## Q0: 定位
### a) 拼图
文档减负。批次1 归档 274 份零引用 briefs（已合 #767）；本批把原拆成 6 个小 PR 的归档**合并为一个 PR**（CTO 2026-09-26 裁定，省 6× 全量 CI 负载）。
### b) 文件审计
阶段0 零引用扫描产出 50 份候选（42 份 `docs/synova/coordination/**` + 8 份 `docs/synova/research/Harness研究与Synova战略再定位-20260816/**`），六批零交集（复算命令见 PR 正文）。
### c) 决策
一次性 `git mv` 全量到**同域 `archive/` 子目录**（`/archive/` 已被 D2 登记门禁与引用门禁豁免；仓根 `archive/**` 实测判 win 域 ⇒ 会触发 D734 跨域，已弃用）。

## Q1: 调研
铁律 35（自动化优先）+ 铁律 37（归档前 grep 零引用）。DSH 借鉴：无（本地文档治理，不涉 DSH 通用管道）。

## Q2: 范围 — 最简方案
做什么:
- docs/synova/coordination/archive/**（42 份）与 docs/synova/research/archive/**（8 份）：`git mv` 迁移
- task-state/D964.json（写集声明源：含 50 条源路径 + 2 条 archive glob）
- .claude/task-briefs/2026-09-26-D964-phase4-archive-b2-all.md
不做什么（含文件路径）:
- 不改 scripts/audit/audit-rules.sh、scripts/control-tower/merge_writeset_gate.py、src/deploy/bootstrap.ts、docs/plans/**
- 不删除任何文件（只移动）；不动有引用的文档

## Q3: 验收
入口: 本 PR（单 PR 承载 50 份移动）。
处理: `git mv` + 写集声明。
结果: 归档前后**字节/行数/首标题/blob 四重一致（50/50）**；父目录结构正确；D2 登记门禁 0 未登记。

## 架构层: docs（治理文档）
## Done 标准
- [ ] 零丢失独立复算通过 50/50（blob hash 与 origin/main 同）
- [ ] 父目录 `docs/synova/{coordination,research}/archive/` 结构正确
- [ ] 不动 docs/plans/**、docs/synova/audit-reports/、src/**
