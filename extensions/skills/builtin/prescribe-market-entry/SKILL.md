---
name: prescribe-market-entry
version: 1.0.0
description: "市场进入评估"
category: prescription
tier: L4
expert: strategy
complexity: expert
---

# 市场进入评估

## 概述
评估新市场吸引力，分析进入壁垒、竞争强度和需求预测，输出进入策略和ROI预测。

## 何时使用
- S-L4-003 — 市场进入评估
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取外部环境数据
沿 E-4.7(七力)、E-4.4(份额)、E-0.1(主动扫描)、E-0.3(外部回响) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 市场结构诊断
调用 COMPUTE-MARKET-STRUCTURE-DIAGNOSIS 和 COMPUTE-HHI
  - 工具: T-COMPUTE-MARKET-STRUCTURE-DIAGNOSIS, T-COMPUTE-HHI

### Step 3: 竞争与需求评估
调用 COMPUTE-COMPETITIVE-POSITIONING 和 COMPUTE-DEMAND-FORECAST
  - 工具: T-COMPUTE-COMPETITIVE-POSITIONING, T-COMPUTE-DEMAND-FORECAST

### Step 4: 定价与ROI
调用 COMPUTE-LERNER-INDEX 评估定价能力，整合进入策略和ROI预测
  - 工具: T-COMPUTE-LERNER-INDEX

## 输出格式
```
marketAttractiveness, entryBarriers[], competitiveIntensity, demandProjection, entryStrategy, projectedROI
```
