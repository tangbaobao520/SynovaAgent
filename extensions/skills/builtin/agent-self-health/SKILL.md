---
name: agent-self-health
version: 1.0.0
description: "Agent自我健康监控"
category: self-maintenance
tier: L7
expert: host
complexity: composite
---

# Agent自我健康监控

## 概述
综合监控Agent系统健康状态，包括看门狗状态、哨兵心跳、数据库和LLM端点健康。

## 何时使用
- S-WB-001 — Agent自我健康监控
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 收集健康指标
获取看门狗状态、哨兵心跳、数据库健康、LLM端点健康
  - 工具: T-QUERY-GRAPH

### Step 2: 日志检查
获取近期错误日志

## 输出格式
```
watchdogStatus, sentinelHeartbeat, databaseHealth, llmEndpointHealth, recentErrorLog
```
