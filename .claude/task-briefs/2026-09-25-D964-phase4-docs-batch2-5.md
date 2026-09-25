# Task Brief: D964 阶段4 批次2-5 — 零引用文档归档（10 份）
> 认领: 🧭 synova-cto（并行 CTO）

## Q0: 定位
### a) 拼图
文档减负。批次1 归档 briefs；本批（2-5）归档 `docs/synova/coordination|research` 的零引用文档到**同域 archive 子目录**（mac 域，满足 D734 单域 + ≤12 文件预算）。
### b) 文件审计
阶段0 零引用扫描产出 50 份候选，按 10 份/批拆分（PR 预算上限 12，brief 属治理产物豁免）；本批为第 5 批。
### c) 决策
只归档零引用集合；归档落在原域内的 `archive/` 子目录（`/archive/` 已被登记门禁与引用门禁豁免）。
**为什么不用仓根 `archive/**`**：实测仓根 archive 被判 **win 域** → 与 mac 文档混提触发 D734「变更跨域」硬阻断（PR #772 实证）。

## Q1: 调研
铁律 35/37；D734 单域约束；D964 门禁影响 ③（归档前扫引用，只归档零引用）。DSH 借鉴：无。

## Q2: 范围 — 最简方案
做什么:
- 本批 10 份零引用文档 → `docs/synova/<sub>/archive/`
- task-state/D964.json（写集声明源）
- .claude/task-briefs/2026-09-25-D964-phase4-docs-batch2-5.md
不做什么（含文件路径）:
- 不碰 docs/plans/**（win 域）、docs/synova/audit-reports/**（K3 域）、scripts/audit/**、src/**
- 不删除文件；不动有引用文档

## Q3: 验收
入口: 本批 PR。
处理: git mv 10 份。
结果: 旧路径引用 0；D2 登记门禁 0 未登记；PR 预算 ≤12 文件且单域。

## 架构层: docs（治理文档）
## Done 标准
- [ ] 零引用复核 = 0 处引用
- [ ] PR 预算门禁通过（单域 + ≤12 文件）
- [ ] docs/plans/** 未被触碰
