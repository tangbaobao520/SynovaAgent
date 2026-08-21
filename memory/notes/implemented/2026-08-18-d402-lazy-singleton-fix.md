---
状态: implemented
日期: 2026-08-18
决策: D402 用 ??= 惰性单例修复 federated 兜底写入即蒸发（getPipeline/getStore 同修 + T6b 改写为写后读回断言）
理由: K3 D391 审计 P1-1 判定 getPipeline() 每请求 new FederatedPipeline() 导致 mark-shareable 写入实例 A（响应后销毁）→ GET federated/pending 读全新实例 B 恒空——201 假成功比恒 503 更具欺骗性（铁律 5/11）。修复选 ??= 惰性单例而非生产注入：K3 转 PASS 条件原文 + 最少机制（一行改，不加启动接线）；getStore 同型缺陷同修不留半套；DB 持久化是 D244 独立演进项，本任务只做进程内写后读回。T6b 此前把"200 空列表"断言为正确（把缺陷写成规格），改写为写后读回可见。
---

# D402 — federated 兜底写入即蒸发修复（惰性单例）

## 决策上下文

- **触发场景**: FDE 调 `POST /api/admin/knowledge/:id/mark-shareable` 标记可共享 → 201 成功；GA 随后调 `GET /api/admin/knowledge/federated/pending` 永远读到空列表——写入进了"当次请求的临时实例"，响应后销毁。
- **根因**: `getPipeline()` 返回 `federatedPipeline ?? new FederatedPipeline()`（每请求 new）；FederatedPipeline 状态在实例内内存 Map；生产 `setFederatedPipeline` 零调用方 → 模块级 federatedPipeline 恒 null。
- **修复**: `federatedPipeline ??= new FederatedPipeline()`（惰性单例，首次构造后缓存复用）；getStore 同款 `knowledgeStore ??= new KnowledgeStore(getDatabase())`；T6b 改写为"写后读回"断言。
- **参考系**: 参考：K3 审计 + Anthropic + 第一性原理（spec §4.5 四决策点全部收敛）

## 相关 D#

- D402（本任务，K3 D391 审计 P1 修复）
- D391（admin-knowledge L1→L4 跨层修复 + M3 注入兜底——本任务修其 P1 残留）
- D244（联邦知识原始设计，内存态无 DB 表——DB 持久化是其独立演进项）
