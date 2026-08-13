---
name: diagnose-cashflow-health
version: 1.0.0
description: "现金流健康诊断"
category: diagnosis
tier: L3
expert: finance
complexity: expert
---

# 现金流健康诊断

## 概述
四层追溯协议的现金流健康诊断：表层症状→中层传导→底层结构→根因定位。

## 何时使用
- S-L3-001 — 现金流健康诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 交叉验证
确认现金流信号的可靠性——多数据源交叉验证
  - 工具: T-CROSS-VALIDATE

### Step 2: 现金流三分法分解
将现金流拆分为经营/投资/融资三类，独立评分
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 3: 四层追溯
表层症状→中层传导→底层结构→根因定位
  - 工具: T-QUERY-GRAPH

### Step 4: 综合诊断
整合分析结果，得出严重度、建议行动和置信度
  - 工具: T-COMPUTE-BREAK-EVEN, T-COMPUTE-DOL, T-COMPUTE-CAPITAL-ALLOCATION

## 输出格式
```
diagnosis, rootCause, evidenceChain[], severity, recommendedActions[], confidence, crossValidationStatus
```
