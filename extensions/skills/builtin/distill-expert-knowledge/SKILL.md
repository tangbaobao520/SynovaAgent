---
name: distill-expert-knowledge
version: 1.0.0
description: "专家知识蒸馏"
category: learning
tier: L6
expert: knowledge
complexity: expert
---

# 专家知识蒸馏

## 概述
从历史诊断和专家反馈中提取可复用的规则和模式，构建组织知识资产。

## 何时使用
- S-L6-003 — 专家知识蒸馏
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取历史数据
沿 E-2.7(经验积累)、E-2.8(个体→团队)、E-5.3(知识复用) 获取历史知识
  - 工具: T-QUERY-GRAPH

### Step 2: 知识蒸馏
调用 QUERY-KNOWLEDGE 提取可复用规则和模式
  - 工具: T-QUERY-KNOWLEDGE

### Step 3: 冲突检测
检测新规则与现有知识的冲突
  - 工具: T-QUERY-KNOWLEDGE

## 输出格式
```
distilledRules[], confidence, sourceExpert, applicableScenarios[], conflictWithExisting
```
