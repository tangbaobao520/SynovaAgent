---
name: conflict-resolution
version: 1.0.0
description: "诊断冲突仲裁"
category: diagnosis
tier: L3
expert: host
complexity: expert
---

# 诊断冲突仲裁

## 概述
当多位专家结论矛盾时，基于证据强度而非投票进行仲裁，给出最终裁决。

## 何时使用
- S-CO-002 — 诊断冲突仲裁
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 收集冲突
接收专家间的矛盾结论

### Step 2: 证据对比
调用 QUERY-GRAPH 和 CROSS-VALIDATE 逐一比对证据强度
  - 工具: T-QUERY-GRAPH, T-CROSS-VALIDATE

### Step 3: 仲裁决策
基于证据强度（非投票次数）做出最终裁决

## 输出格式
```
conflictedFindings[], evidenceComparison, arbitratorDecision, resolutionConfidence
```
