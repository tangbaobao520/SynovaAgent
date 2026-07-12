---
name: prescribe-synergy-value
version: 1.0.0
description: "协同价值评估"
category: prescription
tier: L4
expert: business_model
complexity: expert
---

# 协同价值评估

## 概述
评估企业内部跨部门协同价值，量化知识溢出效应和交叉功能协同，推荐整合方案。

## 何时使用
- S-L4-004 — 协同价值评估
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取协同数据
沿 E-3.6(协同二阶阀)、E-2.8(知识共享)、E-5.3(知识复用) 获取协同数据
  - 工具: T-QUERY-GRAPH

### Step 2: 计算协同价值
调用 COMPUTE-SYNERGY 计算协同总分
  - 工具: T-COMPUTE-SYNERGY

### Step 3: 计算交叉功能协同
调用 COMPUTE-CROSS-FUNCTIONAL-SYNERGY 和 COMPUTE-KNOWLEDGE-SHARING
  - 工具: T-COMPUTE-CROSS-FUNCTIONAL-SYNERGY, T-COMPUTE-KNOWLEDGE-SHARING

### Step 4: 输出方案
整合知识溢出价值和实施成本，推荐最优集成方案
  - 工具: T-QUERY-GRAPH

## 输出格式
```
synergyScore, crossFunctionalSynergies[], knowledgeSpilloverValue, recommendedIntegrations[], implementationCost
```
