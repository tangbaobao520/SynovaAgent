---
name: prescribe-budget-allocation
version: 1.0.0
description: "预算分配建议"
category: prescription
tier: L4
expert: finance
complexity: expert
---

# 预算分配建议

## 概述
基于资本配置效率、净现值和内部收益率给出最优预算分配方案，包含情景分析和风险调整回报。

## 何时使用
- S-L4-002 — 预算分配建议
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取资本数据
沿 E-2.1(资金分配)、E-5.1(利润再投资)、E-X.1(假设→重配)、E-1.8(效率→资本) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算当前配置
调用 COMPUTE-CAPITAL-ALLOCATION 计算当前配置效率
  - 工具: T-COMPUTE-CAPITAL-ALLOCATION

### Step 3: 项目评估
调用 COMPUTE-NPV 和 COMPUTE-IRR 评估各项目回报
  - 工具: T-COMPUTE-NPV, T-COMPUTE-IRR

### Step 4: 风险调整与建议
调用 COMPUTE-DOL 和 COMPUTE-BREAK-EVEN 进行风险调整，输出配置建议
  - 工具: T-COMPUTE-DOL, T-COMPUTE-BREAK-EVEN

## 输出格式
```
allocationRecommendations[], overallBudgetConstraint, scenarioAnalysis[], riskAdjustedReturns
```
