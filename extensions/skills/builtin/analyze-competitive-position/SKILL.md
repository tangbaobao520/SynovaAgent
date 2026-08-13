---
name: analyze-competitive-position
version: 1.0.0
description: "竞争位势评估"
category: analysis
tier: L2
expert: strategy
complexity: composite
---

# 竞争位势评估

## 概述
基于七力框架和HHI指数评估企业竞争位势，识别市场结构类型和竞争威胁。

## 何时使用
- S-L2-005 — 竞争位势评估
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取竞争数据
沿 E-4.7(七力评估) 和 E-4.4(份额) 获取竞争数据
  - 工具: T-COMPUTE-COMPETITIVE-POSITIONING

### Step 2: 计算HHI
调用 COMPUTE-HHI 计算市场集中度指数
  - 工具: T-COMPUTE-HHI

### Step 3: 综合评估
整合七力评分与HHI，判断市场结构类型和竞争优势趋势

## 输出格式
```
sevenPowersScore, hhiConcentration, marketStructure, competitiveAdvantage, trendDirection, threats[]
```
