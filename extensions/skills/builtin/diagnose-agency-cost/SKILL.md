---
name: diagnose-agency-cost
version: 1.0.0
description: "委托-代理成本诊断"
category: diagnosis
tier: L3
expert: org
complexity: expert
---

# 委托-代理成本诊断

## 概述
诊断组织中的委托-代理问题，评估代理成本水平、道德风险信号和KPI扭曲程度。

## 何时使用
- S-L3-006 — 委托-代理成本诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取组织数据
沿 E-2.2(权力分配)、E-2.4(信息流)、E-2.5(激励一致)、E-2.6(规则约束) 获取数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算代理成本
调用 COMPUTE-AGENCY-COST 计算代理成本水平和KPI扭曲得分
  - 工具: T-COMPUTE-AGENCY-COST

### Step 3: 激励与权力分析
调用 COMPUTE-INCENTIVE-ALIGNMENT 和 COMPUTE-DECISION-AUTHORITY
  - 工具: T-COMPUTE-INCENTIVE-ALIGNMENT, T-COMPUTE-DECISION-AUTHORITY

### Step 4: 输出缓解建议
整合道德风险信号，生成缓解措施建议
  - 工具: T-COMPUTE-INFORMATION-FLOW, T-QUERY-GRAPH

## 输出格式
```
agencyCostLevel, moralHazardSignals, kpiDistortionScore, mitigationSuggestions[]
```
