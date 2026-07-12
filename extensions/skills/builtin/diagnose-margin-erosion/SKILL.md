---
name: diagnose-margin-erosion
version: 1.0.0
description: "利润率下降根因分析"
category: diagnosis
tier: L3
expert: finance
complexity: expert
---

# 利润率下降根因分析

## 概述
从成本端、收入端、竞争端、结构端四维度定位利润率下降的根本原因，提供干预路径。

## 何时使用
- S-L3-005 — 利润率下降根因分析
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取利润率数据
沿 E-2.1(资金分配)、E-3.1(运营)、E-4.1(价值→价格) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 成本端分析
调用 COMPUTE-DOL、COMPUTE-BREAK-EVEN、COMPUTE-MARGINAL-COST、COMPUTE-FIXED-COST-RIGIDITY
  - 工具: T-COMPUTE-DOL, T-COMPUTE-BREAK-EVEN, T-COMPUTE-MARGINAL-COST, T-COMPUTE-FIXED-COST-RIGIDITY

### Step 3: 收入与竞争端分析
调用 COMPUTE-PRICE-ELASTICITY 和 COMPUTE-COMPETITIVE-POSITIONING
  - 工具: T-COMPUTE-PRICE-ELASTICITY, T-COMPUTE-COMPETITIVE-POSITIONING

### Step 4: 交叉验证与根因定位
调用 CROSS-VALIDATE 和 QUERY-GRAPH 定位根因
  - 工具: T-CROSS-VALIDATE, T-QUERY-GRAPH

## 输出格式
```
marginTrend, rootCause, decomposition, interventionPath
```
