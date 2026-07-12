---
name: retrieve-industry-benchmark
version: 1.0.0
description: "行业基准检索"
category: learning
tier: L6
expert: knowledge
complexity: composite
---

# 行业基准检索

## 概述
从外部数据源检索行业基准数据，评估数据新鲜度和来源可靠性。

## 何时使用
- S-L6-001 — 行业基准检索
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取外部数据
沿 E-0.1(主动扫描外部环境) 和 E-0.3(外部回响) 获取行业基准数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 质量评估
调用 QUERY-KNOWLEDGE 评估数据新鲜度和来源可靠性
  - 工具: T-QUERY-KNOWLEDGE

## 输出格式
```
benchmarks[], dataFreshness, sourceReliability
```
