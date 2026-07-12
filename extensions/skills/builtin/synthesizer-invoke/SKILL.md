---
name: synthesizer-invoke
version: 1.0.0
description: "综合诊断合成"
category: diagnosis
tier: L3
expert: host
complexity: expert
---

# 综合诊断合成

## 概述
将多位专家的诊断结论合成为统一报告，解决冲突、生成统一行动方案。

## 何时使用
- S-CO-003 — 综合诊断合成
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 收集专家贡献
收集所有参与专家的诊断结论
  - 工具: T-QUERY-GRAPH

### Step 2: 解决冲突
调用 CROSS-VALIDATE 解决专家间的冲突
  - 工具: T-CROSS-VALIDATE

### Step 3: 合成报告
调用 QUERY-KNOWLEDGE 参考历史案例，生成统一诊断报告和行动方案
  - 工具: T-QUERY-KNOWLEDGE

## 输出格式
```
comprehensiveDiagnosis, expertContributions[], conflictsResolved[], unifiedActionPlan
```
