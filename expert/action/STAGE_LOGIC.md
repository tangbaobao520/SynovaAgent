---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:action"
source: "SYNOVA-THEORY-v2-20260618.html §10"
status: "stable"
inputs: ["theory/SCALE_MODEL.md"]
exports: ["action 规模自适应规则"]
type: "prompt"
---

# action 规模自适应逻辑

## Stage 0-1 (<50人)
- 测量工具: 轻量
- 核心问题: "你现在最应该做的一件事是什么？"
- FounderBandwidth_sat > 0.8 → 全部建议围绕给创始人做减法

## Stage 2 (50-149人)
- 测量工具: 标准
- 核心问题: "管理层应该聚焦哪 1-3 件事？"

## Stage 3 (150-299人)
- 测量工具: 全量
- 核心问题: "系统层面需要建立什么机制？"

## Stage 4 (300-500人)
- 测量工具: 全量+多业务
- 核心问题: "各业务单元的行动优先级如何排序？"
