---
name: analyze-break-even
version: 1.0.0
description: "盈亏平衡分析"
category: analysis
tier: L2
expert: finance
complexity: atomic
---

# 盈亏平衡分析

## 概述
计算盈亏平衡点，评估安全边际，分类企业盈亏状态（正常/警戒/危险）并给出行动含义。

## 何时使用
- S-L2-001 — 盈亏平衡分析
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取数据
沿边获取固定成本(FC)、平均可变成本(AVC)和价格(P)
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算盈亏平衡
调用 COMPUTE-BREAK-EVEN 计算盈亏平衡点和安全边际
  - 工具: T-COMPUTE-BREAK-EVEN

### Step 3: 分类评估
对结果分类（正常/警戒/危险），输出行动含义和降级状态

## 输出格式
```
bepQuantity, bepRevenue, safetyMargin, bepClassification, actionImplication
```
