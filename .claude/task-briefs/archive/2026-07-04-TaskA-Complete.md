# Task Brief: Task A — 本体层重建 + 图遍历能力增强 (完整)

> 2026-07-04 | feat/prompt-architecture | L4 本体层

## Q0: 定位
本体层重建。从旧 22 节点+17 边迁移到新 29 实体+16 边。
- Step 1: 29 实体 JSON (resource/activity/outcome)
- Step 2: 16 新边 JSON + loader 更新
- Step 3: graph-traversal.ts (BFS + outliers + edge eval)
- Step 4: temporal-baseline.ts (Holt-Winters)
- Step 5: migration-validator.ts
- Step 6: scripts/validate-ontology.ts

## Q1: 调研
记忆: memory/engine-core-bridge-files.md。禁止桥接，纯新建。

## Q2: 范围
做什么: 全部 Step 1-6
不做什么: compute 函数、专家文件、哨兵 aggregate

## 架构层级: L4

## Q3: 验收
- 29 entities + 16 edges JSON 有效
- tsc --noEmit 零错误
- 测试通过
- validate-ontology.ts 输出 valid

## Done 标准
- [x] verify: npx tsx scripts/validate-ontology.ts
- [x] verify: npx tsc --noEmit
- [x] verify: npx vitest run tests/l4/
