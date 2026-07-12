---
name: detect-plan-deviation
version: 1.0.0
description: "方案偏差检测"
category: feedback
tier: L5
expert: action
complexity: expert
---

# 方案偏差检测

## 概述
自动检测预计与实际执行之间的偏差，分析趋势并判断是否需要触发重新诊断。

## 何时使用
- S-L5-003 — 方案偏差检测
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取预期vs实际
沿 E-2.1(资源分配)、E-3.1(产出)、E-4.1(价值→价格) 获取预期和实际数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 偏差分析
计算实际值对预计值的偏离程度和趋势方向
  - 工具: T-QUERY-GRAPH

### Step 3: 决策输出
判断是否需要触发重新诊断，输出调整建议

## 输出格式
```
deviations[], trendAnalysis, recommendedAdjustments[], shouldRetriggerDiagnosis
```
