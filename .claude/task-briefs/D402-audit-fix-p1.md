# Task Brief: D402: D391 审计 P1 修复（派活登记）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D402) | 认领: 📋 synova-devdoc（spec）+ 实现待定
> 来源: K3 D391 审计 CONDITIONAL PASS（P1×2 闭合后转 PASS）
> **规格归属：spec 由 synova-devdoc 产出；本 brief 仅派活登记。**

## 任务定义
- **P1-1（功能性）**：federated 兜底路径写入即蒸发、返回 201 假性成功——`getPipeline` 每请求新实例，federated 写入不持久
- **P1-2（流程性）**：D391 无 dev doc、无 task brief，偏离 D309 既有方案无文档授权——补写

## 参考材料（main 上可自取）
- 审计报告: docs/synova/audit-reports/2026-08-16-D391.md（P1 详情 + 转 PASS 条件）
- 问题代码: src/routes/admin-knowledge.ts + src/services/federated-pipeline.ts
- D309 历史: docs/synova/DASHBOARD-CN.md（D309 行）
- 铁律: AGENTS.md（铁律 0-2/24/31）

## 产出物
- SYNOVA-IMPL-DSH-D402-federated-fix-20260816.md（补 D391 缺失文档 + P1-1 修复 spec）

## 验收锚点
- P1-1: federated 写入后重启可读（非 201 假成功）
- P1-2: dev doc 含 D309 偏离授权说明

## 实现归属
- src/ 业务（federated-pipeline）→ Win Claude（D391 已实现者）；或 DSH 哨兵无关，按认领定
