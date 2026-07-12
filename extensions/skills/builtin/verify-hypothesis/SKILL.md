---
name: verify-hypothesis
version: 1.0.0
description: "假设验证测试"
category: feedback
tier: L5
expert: action
complexity: expert
---

# 假设验证测试

## 概述
对诊断中的因果假设进行统计验证，通过因果序列分析和干预效应评估确定假设成立与否。

## 何时使用
- S-L5-002 — 假设验证测试
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 定义假设
从诊断中提取可验证的因果假设

### Step 2: 因果序列分析
调用 COMPUTE-CAUSAL-SEQUENCE 验证因果链方向
  - 工具: T-COMPUTE-CAUSAL-SEQUENCE

### Step 3: 干预效应评估
调用 COMPUTE-INTERVENTION-EFFECT 评估干预措施的因果影响
  - 工具: T-COMPUTE-INTERVENTION-EFFECT

### Step 4: Shapley归因
调用 COMPUTE-SHAPLEY-ATTRIBUTION 进行归因分析
  - 工具: T-COMPUTE-SHAPLEY-ATTRIBUTION

## 输出格式
```
hypothesis, verificationMethod, evidenceFor, evidenceAgainst, conclusion
```
