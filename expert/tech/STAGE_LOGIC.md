---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:tech"
source: "SYNOVA-THEORY-v2-20260618.html §9"
status: "stable"
inputs: ["theory/SCALE_MODEL.md"]
exports: ["tech 规模自适应规则"]
type: "prompt"
---

# tech 规模自适应逻辑

## Stage 0-1 (<50人)
- 测量工具: 简版
- 核心问题: "你现在用什么工具？数据在哪儿？"

## Stage 2 (50-149人)
- 测量工具: 标准
- 核心问题: "系统互联度？数据流通性？"

## Stage 3 (150-299人)
- 测量工具: 全量+Agent审计
- 核心问题: "Agent决策可审计吗？提示词/护栏/日志可观测吗？"

## Stage 4 (300-500人)
- 测量工具: 全量
- 核心问题: "多部门技术栈是否一致？技术债务是否在阻碍跨部门协同？"
