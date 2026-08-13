---
name: check-data-source-health
version: 1.0.0
description: "数据源健康检查"
category: self-maintenance
tier: L7
expert: host
complexity: atomic
---

# 数据源健康检查

## 概述
检查所有数据源的健康状态，包括连接状态、数据新鲜度、延迟和错误率。

## 何时使用
- S-L7-001 — 数据源健康检查
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 查询数据源状态
沿 E-1.5(采集内部信息)、E-0.1(扫描外部)、E-0.2(信号上传) 获取数据源状态
  - 工具: T-ACQUIRE-EDGE-DATA

### Step 2: 评估健康度
调用 QUERY-GRAPH 整合健康状态评分
  - 工具: T-QUERY-GRAPH

## 输出格式
```
dataSourceHealth[{source,status,lastUpdate,latency,errorRate}], overallHealth
```
