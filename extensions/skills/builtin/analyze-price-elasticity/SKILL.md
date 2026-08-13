---
name: analyze-price-elasticity
version: 1.0.0
description: "需求价格弹性分析"
category: analysis
tier: L2
expert: marketing
complexity: composite
---

# 需求价格弹性分析

## 概述
计算需求价格弹性系数，评估市场需求对价格变动的敏感程度，提供定价策略参考。

## 何时使用
- S-L2-003 — 需求价格弹性分析
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取价格与销量数据
沿 E-4.1(价值→价格) 和 E-4.4(竞争→份额) 获取价格与需求数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取边际成本
沿 E-3.1(运营→MC) 获取边际成本数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 3: 计算弹性
调用 COMPUTE-PRICE-ELASTICITY 计算弹性系数、交叉弹性和R²
  - 工具: T-COMPUTE-PRICE-ELASTICITY

### Step 4: 质量评估
检查置信区间、R²拟合度和多重共线性警告

## 输出格式
```
elasticity, elasticityType, crossElasticity[], recommendation, confidenceInterval, r_squared, multicollinearityWarning
```
