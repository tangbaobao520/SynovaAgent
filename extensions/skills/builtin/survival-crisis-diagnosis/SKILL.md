---
name: survival-crisis-diagnosis
version: 1.0.0
description: "生存危机应急诊断"
category: diagnosis
tier: L3
expert: multi
complexity: expert
---

# 生存危机应急诊断

## 概述
当企业触及生存危机边界时紧急启动的诊断：评估现金流 runway、识别紧急威胁、输出0-3个关键修复方案。

## 何时使用
- S-CROSS-002 — 生存危机应急诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 警报确认
确认多个哨兵同时critical — survival-margin + capital + margin
  - 工具: T-QUERY-GRAPH

### Step 2: 现金流紧急评估
沿 E-1.1(获取资本)、E-5.1(利润再投资) 计算现金跑道天数
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 3: 威胁排序
识别紧急威胁，输出0-3个关键修复方案
  - 工具: T-CROSS-VALIDATE

### Step 4: 利益相关方沟通
生成利益相关方沟通计划

## 输出格式
```
crisisLevel, immediateThreats[], cashRunwayDays, criticalFixes, stakeholderCommunicationPlan
```
