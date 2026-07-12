---
name: cross-expert-review
version: 1.0.0
description: "跨专家交叉验证"
category: diagnosis
tier: L3
expert: host
complexity: composite
---

# 跨专家交叉验证

## 概述
让多位专家交叉验证同一发现，评估一致性和冲突程度，提高诊断置信度。

## 何时使用
- S-CO-001 — 跨专家交叉验证
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 接收待验证发现
接收置信度低于阈值的发现或存在专家冲突的结论

### Step 2: 跨专家验证
调用 CROSS-VALIDATE 进行多专家交叉验证
  - 工具: T-CROSS-VALIDATE

### Step 3: 冲突分析
调用 QUERY-GRAPH 分析证据链一致性
  - 工具: T-QUERY-GRAPH

## 输出格式
```
originalFinding, reviewingExpert, corroborationResult, agreementLevel, conflictDetail
```
