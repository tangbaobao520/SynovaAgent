---
状态: implemented
日期: 2026-08-21
决策: D444 用 GS-02 同型模式建 GS-04 人才循环场景，诚实 RED 暴露 hr-standard 映射 ↔ key-person-risk compute 契约错位
理由: D357 已降级 MVP 上传路径，hr-standard 映射在 main，GS-04 可开工——但实测映射提供 headcount/turnover_rate/talent_density/e_nps/avg_tenure_months，而 key-person-risk（src/l3/key-person-risk.ts:46-52）从 Person 节点提取 name/domains/role（busFactor/orphanedDomains 所需）——映射不含 → findings 空，永不 critical。GS-02 同型（D355 先例），诚实 RED 文档化，转绿留独立任务。
---

# D444 — GS-04 人才循环场景

## 决策上下文

- **触发场景**: 派活顺序 GS-02 → GS-04；D357 不阻塞（MVP 上传 + hr-standard 映射在 main）。
- **实测**: 注入 ✅（Person 节点）；key-person-risk 触发 findings 空——映射↔compute 契约错位。
- **参考系**: 参考：Anthropic + 第一性原理（复用）+ 结论：复用 GS-02 模式 + 诚实 RED。

## 相关 D#

- D444（本任务，GS-04 人才循环）
- GS-02=D443（同型契约错位先例）、GS-03=D442 / GS-05=D445（模式来源）
- 转绿前置（建议独立任务）：hr-standard 映射补 name/domains/role 或 key-person-risk 改读现有字段
