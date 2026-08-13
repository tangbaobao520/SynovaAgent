---
name: diagnosis-calibration
version: 1.0.0
description: "诊断校准"
category: learning
tier: L6
expert: host
complexity: expert
---

# 诊断校准

## 概述
基于GA反馈回调和历史数据校准诊断准确率，包括假阳性率、假阴性率和校准调整。

## 何时使用
- S-WB-003 — 诊断校准
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 收集反馈
获取GA反馈数据和历史诊断结果
  - 工具: T-QUERY-GRAPH

### Step 2: 计算准确率
调用 QUERY-KNOWLEDGE 计算假阳性率和假阴性率
  - 工具: T-QUERY-KNOWLEDGE

### Step 3: 校准调整
根据校准事件生成校准调整建议

## 输出格式
```
calibrationEvents[], falsePositiveRate, falseNegativeRate, gaFeedbackSummary, calibrationAdjustments[]
```
