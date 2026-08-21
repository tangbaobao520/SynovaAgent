---
状态: implemented
日期: 2026-08-21
决策: D443 用 GS-03/GS-05 复用模式建 GS-02 客户循环场景（JWT/SYNOVA_DB_PATH/后台 bootstrap），诚实 RED 暴露 crm-standard 映射 ↔ customer-demand-shift compute 契约错位
理由: D357 连接器已降级 MVP（上传路径），crm-standard 映射在 main，GS-02 不再被 Win 阻塞——但实测映射只提供 market_share/nps/satisfaction/brand/concentration_hhi/churn_rate，compute（aggregate.ts:32-38）需要 name/revenue/churn(boolean)/nps——交集仅 nps → revenue 恒 0、churn 恒 false → 即使节点匹配也永不输出 critical。这是 D355 同型的产品契约缺口，场景如实 RED 文档化，转绿留独立任务。
---

# D443 — GS-02 客户循环场景

## 决策上下文

- **触发场景**: D356/357/358 已确认不阻塞（D357 降级 MVP 上传 + crm-standard 映射在 main），按派活顺序建 GS-02。
- **实测**: 注入 ✅（Client 节点创建）；customer-demand-shift 触发后 findings 空——映射↔compute 契约错位（revenue/churn 缺失）。
- **参考系**: 参考：Anthropic（机器可验）+ 第一性原理（复用最少机制）+ 结论：复用 GS-03/05 模式 + 诚实 RED。

## 相关 D#

- D443（本任务，GS-02 客户循环）
- D357（连接器降级 MVP——上传路径依赖已满足）
- GS-03=D442 / GS-05=D445（模式复用来源）
- 转绿前置（建议独立任务）：crm-standard 映射补 revenue/churn 或 compute 改读 churn_rate
