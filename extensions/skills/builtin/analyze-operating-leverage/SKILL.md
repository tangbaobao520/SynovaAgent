---
name: analyze-operating-leverage
version: 1.0.0
description: "经营杠杆分析"
category: analysis
tier: L2
expert: finance
complexity: atomic
---

# 经营杠杆分析

## 概述
计算经营杠杆系数(DOL)，评估固定成本占比对利润波动的影响方向和放大倍数。

## 何时使用
- S-L2-002 — 经营杠杆分析
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取数据
沿边获取固定成本(FC)、可变成本(VC)和收入
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算DOL
调用 COMPUTE-DOL 计算经营杠杆系数
  - 工具: T-COMPUTE-DOL

### Step 3: 风险评估
分类杠杆等级，评估方向放大效应和风险水平

## 输出格式
```
dol, dolClassification, directionAmplification, riskLevel, degraded, warnings[]
```
