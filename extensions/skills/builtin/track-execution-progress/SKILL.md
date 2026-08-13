---
name: track-execution-progress
version: 1.0.0
description: "执行进度追踪"
category: feedback
tier: L5
expert: action
complexity: composite
---

# 执行进度追踪

## 概述
追踪诊断方案的执行进度，检测停滞项和偏差，生成偏差警报。

## 何时使用
- S-L5-001 — 执行进度追踪
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取执行数据
沿 E-2.1(资源分配执行)、E-3.1(产出)、E-5.1(再投资)、E-5.4(声誉飞轮) 获取执行数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 比对计划
将实际执行进度与计划对比，识别停滞项和偏差
  - 工具: T-QUERY-GRAPH

### Step 3: 输出状态
生成执行进度状态报告，包含偏差警报

## 输出格式
```
actionItems[{id,status,progress,deviation}], overallProgress, stalledItems[], deviationAlerts[]
```
