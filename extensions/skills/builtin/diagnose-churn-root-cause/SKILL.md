---
name: diagnose-churn-root-cause
version: 1.0.0
description: "客户流失根因分析"
category: diagnosis
tier: L3
expert: marketing
complexity: expert
---

# 客户流失根因分析

## 概述
通过多维度分析定位客户流失的根本原因，生成流失干预优先级排序。

## 何时使用
- S-L3-002 — 客户流失根因分析
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取留存数据
沿 E-4.2(留存) 和 E-4.6(数据→改进) 获取客户留存趋势
  - 工具: T-COMPUTE-CUSTOMER-VALUE-SCORE

### Step 2: 计算锁定效应
调用 COMPUTE-CUSTOMER-LOCKIN 评估客户转换成本
  - 工具: T-COMPUTE-CUSTOMER-LOCKIN

### Step 3: 交叉验证
调用 CROSS-VALIDATE 确认流失信号可靠性
  - 工具: T-CROSS-VALIDATE

### Step 4: 根因定位
结合竞争位势和声誉飞轮数据，定位流失根因
  - 工具: T-COMPUTE-COMPETITIVE-POSITIONING, T-COMPUTE-CUSTOMER-DATA-LOOP

## 输出格式
```
churnRootCause, churnSegmentAnalysis[], retentionRateTrend, switchingCostAssessment, interventionPriority[]
```
