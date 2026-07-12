---
name: acquire-financial-data
version: 1.0.0
description: "获取财务数据"
category: perception
tier: L1
expert: finance
complexity: atomic
---

# 获取财务数据

## 概述
从本体层获取企业财务数据，包括资本、收入、成本和现金流信息。不涉及推理，仅数据查询。

## 何时使用
- S-L1-001 — 获取财务数据
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取资本结构
沿 E-1.1(获取资本) 和 E-1.2(资金来源比例) 边查询资本池与债务权益结构
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取收入与成本
沿 E-5.1(利润再投资) 边查询收入池与成本结构
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 3: 获取现金流
查询 GraphStore FINANCIAL 节点，获取现金流数据
  - 工具: T-ACQUIRE-EDGE-DATA

## 输出格式
```
capitalPool, revenuePool, costStructure, cashflowStatements[]
```
