---
name: manage-sentinel-config
version: 1.0.0
description: "哨兵配置管理"
category: self-maintenance
tier: L7
expert: host
complexity: composite
---

# 哨兵配置管理

## 概述
管理哨兵配置状态，查看活跃哨兵、配置状态和执行延迟。

## 何时使用
- S-L7-002 — 哨兵配置管理
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 获取哨兵配置
查询哨兵注册表获取所有哨兵状态
  - 工具: T-QUERY-GRAPH

### Step 2: 延迟评估
分析近期执行延迟，输出配置建议

## 输出格式
```
activeSentinels, configStatus, recentExecutionLatencies, recommendations[]
```
