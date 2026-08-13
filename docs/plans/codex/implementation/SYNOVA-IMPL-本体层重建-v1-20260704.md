# Task A: Synova 本体层重建 + 图遍历能力增强

> 版本: v1.0 | 日期: 2026-07-04 | 状态: 实施中
> 关联方案: ../strategy/SYNOVA-DESIGN-本体层最终规范-v2.4-20260704.html
> 关联实施: 与 SYNOVA-IMPL-上层适配迁移-v1-20260704.md 并行执行

## 0. 执行前必读

SynovaAgent — 企业增长诊断系统。本体层从22节点+17边迁移到10实体+16边+4调节因子。本任务只创建新本体Schema和图遍历能力，不修改compute函数。

关键路径: 本体规范参见 strategy/SYNOVA-DESIGN-本体层最终规范-v2.4-20260704.html。

旧节点JSON (extensions/ontology/node-types/*.json) 保留不动直到Task B完成。

铁律: 铁律24(catch+log.warn+degraded), 铁律31(降级传播), 铁律38(as any=0), 禁止写任何兼容层。

## 1. 创建新本体 JSON Schema

### resource/ (13个JSON)
money.json, person.json, team.json, tool.json, agent.json, knowledge.json, client.json, channel.json, brand.json, ip.json, data.json, location.json, supplier.json

### activity/ (8个JSON)
production.json, acquisition.json, innovation.json, coordination.json, learning.json, governance.json, maintenance.json, compliance.json

### outcome/ (8个JSON)
financial.json, market.json, operational.json, people.json, innovation.json, risk.json, competitive.json, external.json

### edge-types/ (16个JSON，替换旧17个)
deploys, funds, produces, replenishes, depends_on, substitutes, augments, locks_in, depends_on_platform, informs, constrains, signal_transmits, metric_binds, decision_concentrates, incentive_binds, external_assumption

验收: 文件计数 + npx tsx scripts/validate-ontology.ts

## 2. 更新 ontology-loader.ts

只读新目录（resource/ activity/ outcome/），不保持对旧 node-types/ 的兼容读取。

## 3. 创建 graph-traversal.ts

实现 GraphTraversal: traverse(), getTemporalParams(), scanOutliers(), evaluateEdges()。含单元测试。

## 4. 创建 temporal-baseline.ts

Holt-Winters指数平滑。含单元测试。

## 5. 创建 migration-validator.ts

一次性验证工具。diff<1% pass, 1-5% review, >5% block。Phase 3时使用。

## 6. 验证脚本

scripts/validate-ontology.ts

## 7. 最终验收

npx tsc --noEmit && npx vitest run && npm run check:iron-laws

## 8. 旧代码处理

所有旧代码在本任务中保留不动。删除由 Task B 的 Phase 3 切换步骤执行。
