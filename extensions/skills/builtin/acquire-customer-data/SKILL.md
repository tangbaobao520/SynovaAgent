---
name: acquire-customer-data
version: 1.0.0
description: "获取客户数据"
category: perception
tier: L1
expert: marketing
complexity: atomic
---

# 获取客户数据

## 概述
从本体层获取客户相关数据，包括客户列表、留存率、流失率和LTV。

## 何时使用
- S-L1-002 — 获取客户数据
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取客户基础数据
沿 E-4.1(价值→价格) 和 E-4.2(客户留存) 边查询客户列表与留存率
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取渠道与反馈
沿 E-4.3(渠道触达) 查询渠道数据，沿 E-4.6(客户数据→产品改进) 查询NPS
  - 工具: T-ACQUIRE-EDGE-DATA

## 输出格式
```
clients[], retentionRates, churnRates, NPS, LTV
```
