---
name: match-best-practice
version: 1.0.0
description: "最佳实践匹配"
category: learning
tier: L6
expert: knowledge
complexity: expert
---

# 最佳实践匹配

## 概述
将当前企业状况与行业最佳实践进行匹配分析，识别知识缺口和可复用模式。

## 何时使用
- S-L6-002 — 最佳实践匹配
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取企业数据
沿 E-2.7(经验积累)、E-2.8(知识共享)、E-5.3(知识复用) 获取企业当前状态
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 知识库匹配
调用 QUERY-KNOWLEDGE 匹配最佳实践
  - 工具: T-QUERY-KNOWLEDGE

### Step 3: 缺口分析
识别未被覆盖的知识领域，生成知识缺口报告

## 输出格式
```
matchedPractices[], knowledgeGaps[]
```
