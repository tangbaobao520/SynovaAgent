---
name: diagnose-org-health
version: 1.0.0
description: "组织健康扫描"
category: diagnosis
tier: L3
expert: org
complexity: expert
---

# 组织健康扫描

## 概述
从信息流密度、激励一致性、信任摩擦、惯例刚性等多维扫描组织健康状况。

## 何时使用
- S-L3-003 — 组织健康扫描
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取组织数据
沿 E-2.2~E-2.6、E-2.9、E-2.10 获取多维度组织数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 计算各维度指标
分别计算信息流、激励、信任、惯例、权力分配各指标
  - 工具: T-COMPUTE-INFORMATION-FLOW, T-COMPUTE-INCENTIVE-ALIGNMENT, T-COMPUTE-TRUST-FRICTION, T-COMPUTE-ROUTINE-RIGIDITY

### Step 3: 交叉验证
调用 CROSS-VALIDATE 交叉验证各维度结论
  - 工具: T-CROSS-VALIDATE

### Step 4: 综合评分
整合为组织健康总分，识别瓶颈部门，分类健康等级
  - 工具: T-COMPUTE-DECISION-AUTHORITY, T-COMPUTE-KNOWLEDGE-SHARING

## 输出格式
```
orgHealthScore, collaborationDensity, trustFrictionIndex, routineRigidityScore, keyPersonRiskLevel, bottleneckDepartments[], orgHealthClassification
```
