---
name: knowledge-base-maintenance
version: 1.0.0
description: "知识库维护"
category: learning
tier: L6
expert: knowledge
complexity: expert
---

# 知识库维护

## 概述
维护知识库健康，检测过时知识、冲突条目和校准状态。

## 何时使用
- S-WB-002 — 知识库维护
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 扫描知识库
调用 QUERY-KNOWLEDGE 检测过时知识和冲突条目
  - 工具: T-QUERY-KNOWLEDGE

### Step 2: Grap分析
调用 QUERY-GRAPH 交叉验证知识关联
  - 工具: T-QUERY-GRAPH

### Step 3: 维护建议
生成更新建议和校准状态报告

## 输出格式
```
staleKnowledge[], conflictingEntries[], updateSuggestions[], calibrationStatus
```
