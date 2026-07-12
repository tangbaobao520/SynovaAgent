---
name: acquire-org-health-data
version: 1.0.0
description: "获取组织健康数据"
category: perception
tier: L1
expert: org
complexity: atomic
---

# 获取组织健康数据

## 概述
从本体层获取组织结构、信息流、激励一致性、信任摩擦和惯例刚性等数据。

## 何时使用
- S-L1-004 — 获取组织健康数据
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取结构与权力
沿 E-2.2(权力分配) 和 E-2.6(规则约束) 查询组织架构
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取软性指标
沿 E-2.4(信息流)、E-2.5(激励一致)、E-2.9(信任摩擦)、E-2.10(惯例刚性) 获取组织健康指标
  - 工具: T-ACQUIRE-EDGE-DATA

## 输出格式
```
orgStructure, informationFlowDensity, incentiveAlignment, trustLevel, routineRigidity
```
