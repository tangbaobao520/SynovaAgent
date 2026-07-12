---
name: acquire-competitive-intel
version: 1.0.0
description: "获取竞争情报"
category: perception
tier: L1
expert: strategy
complexity: atomic
---

# 获取竞争情报

## 概述
获取市场竞争力相关情报，包括市场份额、竞争价格和七力评估数据。

## 何时使用
- S-L1-003 — 获取竞争情报
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取市场份额
沿 E-4.4(竞争→份额) 边查询市场分布
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取七力评估
沿 E-4.7(七力评估) 边查询七力评分
  - 工具: T-ACQUIRE-EDGE-DATA

## 输出格式
```
marketShares[], competitorPrices[], hhiIndex, sevenPowersScores
```
