---
name: analyze-customer-value
version: 1.0.0
description: "客户价值评估"
category: analysis
tier: L2
expert: marketing
complexity: composite
---

# 客户价值评估

## 概述
综合评估客户价值，包括客户价值评分、盈利能力分层、需求浓度和LTV分布。

## 何时使用
- S-L2-004 — 客户价值评估
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取客户数据
沿 E-4.1、E-4.2、E-4.6 获取客户交易、留存和反馈数据
  - 工具: T-COMPUTE-CUSTOMER-VALUE-SCORE

### Step 2: 计算盈利能力
调用 COMPUTE-CUSTOMER-PROFITABILITY 计算客户盈利能力分层
  - 工具: T-COMPUTE-CUSTOMER-PROFITABILITY

### Step 3: 分析需求结构
调用 COMPUTE-CUSTOMER-DEMAND-STRUCTURE 分析需求浓度和LTV
  - 工具: T-COMPUTE-CUSTOMER-DEMAND-STRUCTURE

## 输出格式
```
customerValueScore, profitabilityTiers[], demandConcentration, topClients[], ltvDistribution
```
