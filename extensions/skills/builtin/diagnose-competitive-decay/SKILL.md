---
name: diagnose-competitive-decay
version: 1.0.0
description: "竞争位势衰减诊断"
category: diagnosis
tier: L3
expert: strategy
complexity: expert
---

# 竞争位势衰减诊断

## 概述
诊断竞争位势随时间衰减的方向和速度，识别护城河侵蚀信号，生成战略响应选项。

## 何时使用
- S-L3-004 — 竞争位势衰减诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取竞争数据
沿 E-4.7(七力)、E-4.4(份额)、E-4.5(采购议价) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算位势指标
调用 COMPUTE-COMPETITIVE-POSITIONING 和 COMPUTE-HHI
  - 工具: T-COMPUTE-COMPETITIVE-POSITIONING, T-COMPUTE-HHI

### Step 3: 威胁分析
调用 COMPUTE-COMPETITOR-FEATURE-THREAT 和 COMPUTE-COMPETITOR-PRICING-LANDSCAPE
  - 工具: T-COMPUTE-COMPETITOR-FEATURE-THREAT, T-COMPUTE-COMPETITOR-PRICING-LANDSCAPE

### Step 4: 综合诊断
整合趋势与威胁矩阵，生成战略响应选项
  - 工具: T-COMPUTE-MARKET-SHARE-CAPTURE, T-CROSS-VALIDATE

## 输出格式
```
decayDirection, sevenPowersTrend[], moatErosionSignals[], threatMatrix[], strategicResponseOptions[]
```
