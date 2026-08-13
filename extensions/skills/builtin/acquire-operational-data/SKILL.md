---
name: acquire-operational-data
version: 1.0.0
description: "获取运营数据"
category: perception
tier: L1
expert: tech
complexity: atomic
---

# 获取运营数据

## 概述
获取运营效率数据，包括产能利用率、缺陷率、技术栈健康和IT基础设施评分。

## 何时使用
- S-L1-005 — 获取运营数据
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取运营效率
沿 E-3.1(资源→产出) 和 E-3.6(协同) 获取产能与协同数据
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 获取技术与设备
沿 E-3.7(IT系统)、E-1.6(设备获取) 和 E-1.8(效率→资本) 获取技术栈与设备数据
  - 工具: T-ACQUIRE-EDGE-DATA

## 输出格式
```
capacityUtilization, defectRates, techStackHealth, itInfrastructureScore
```
