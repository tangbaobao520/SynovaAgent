# Task Brief: Task A Step 2 — edge-types + loader

> 2026-07-04 | feat/prompt-architecture | L4

## Q0: 定位
L4 本体层。删除旧 17 边JSON，创建新 16 边JSON + 更新 loader。

## Q1: 调研
记忆: memory/engine-core-bridge-files.md。新边 id=edge/xxx，EdgeTypeDef 加 consumed_by_sentinels。

## Q2: 范围
做什么: edge-types 替换 + loader 更新
不做什么: node-types/、sentinels/computes、aggregate

## 架构层级: L4

## Q3: 验收: 16 边 JSON + tsc 通过

## Done 标准
- [x] verify: test -f extensions/ontology/edge-types/deploys.json
- [x] verify: grep -q ENTITY_DIRS src/l4/ontology-loader.ts
