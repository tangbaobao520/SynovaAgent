---
name: enterprise-growth-diagnosis
version: 1.0.0
description: "全企业增长诊断"
category: diagnosis
tier: L3
expert: multi
complexity: expert
---

# 全企业增长诊断

## 概述
覆盖全部7维度和8位专家的全企业增长诊断，识别增长阻碍者并给出跨维度因果链。

## 何时使用
- S-CROSS-001 — 全企业增长诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 全维度数据收集
触发L1感知层全部5个Skill获取全维度数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 维度分析
触发L2分析层全部8个Skill进行各维度计算
  - 工具: T-QUERY-GRAPH

### Step 3: 诊断合成
调用 L3诊断层对应Skill进行跨维度诊断
  - 工具: T-CROSS-VALIDATE

### Step 4: 增长阻碍者识别
调用 CROSS-VALIDATE 在多专家间交叉验证增长阻碍者的识别
  - 工具: T-CROSS-VALIDATE

## 输出格式
```
growthBlocker, dimensionScores[7], crossDimensionalCausalChain, priorityInterventions, confidence
```
