# Task Brief: D964 阶段4 批次2 — 零引用文档归档（coordination + research，50 份）
> 认领: 🧭 synova-cto（并行 CTO）

## Q0: 定位
### a) 拼图
文档减负。批次1 归档 briefs（前缀内）；本批归档 `docs/synova/coordination` 与 `research` 的零引用文档到**仓根 archive/**（检验阶段1 新增的 archive/** 豁免根）。
### b) 文件审计
阶段0 零引用扫描：coordination 42 份 + research 8 份 = 50 份（均为历史派单/周报/研究章节）。
### c) 决策
只归档零引用集合；有引用者一律不动；批次1 之外的路径不动。

## Q1: 调研
铁律 35/37；D964 门禁影响 ③（归档前先扫引用，只归档零引用）。DSH 借鉴：无。

## Q2: 范围 — 最简方案
做什么:
- docs/synova/coordination/*.md（42 份零引用）与 docs/synova/research/**（8 份零引用）→ git mv 到 archive/docs-synova-coordination/ 与 archive/docs-synova-research/
- docs/authority/DOCS-REGISTRY.yaml：登记归档根 DOC-0119（D2 登记门禁同步）
- .claude/task-briefs/2026-09-25-D964-phase4-archive-batch2.md
不做什么（含文件路径）:
- 不碰 docs/plans/**（win 域）、docs/synova/audit-reports/**（K3 域）、scripts/audit/**、src/**
- 不删除任何文件；不动有引用文档

## Q3: 验收
入口: 归档 PR。
处理: git mv 50 份 + 登记归档根。
结果: 旧路径引用 0；D2 登记门禁对归档区 0 未登记；check-dsh-anchor OK。

## 架构层: docs（治理文档）
## Done 标准
- [ ] 归档后零引用复核 = 0 处引用
- [ ] DOCS-REGISTRY.yaml 含 DOC-0119（归档根），D2 门禁输出贴回执
- [ ] docs/plans/** 未被触碰
