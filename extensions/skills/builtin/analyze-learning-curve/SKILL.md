---
name: analyze-learning-curve
version: 1.0.0
description: "学习曲线评估"
category: analysis
tier: L2
expert: org
complexity: composite
---

# 学习曲线评估

## 概述
评估组织学习速率和知识复用效率，对比行业基准判断学习曲线位置。

## 何时使用
- S-L2-007 — 学习曲线评估
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取学习数据
沿 E-2.7(经验积累) 和 E-2.8(个体→团队) 获取学习数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算学习速率
调用 COMPUTE-LEARNING-RATE 计算单个学习速率
  - 工具: T-COMPUTE-LEARNING-RATE

### Step 3: 计算组织学习
调用 COMPUTE-ORG-LEARNING 计算组织层面学习得分
  - 工具: T-COMPUTE-ORG-LEARNING

## 输出格式
```
learningRate, learningCurveIndex, orgLearningScore, knowledgeReuseRate, industryBenchmarkComparison
```
