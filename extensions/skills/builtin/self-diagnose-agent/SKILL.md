---
name: self-diagnose-agent
version: 1.0.0
description: "Agent自诊断"
category: self-maintenance
tier: L7
expert: host
complexity: composite
---

# Agent自诊断

## 概述
检查Agent系统自身的运行状态，包括运行时间、内存使用、错误率和API延迟。

## 何时使用
- S-L7-003 — Agent自诊断
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 收集系统指标
获取Agent进程的运行时间、内存使用、错误率、API延迟
  - 工具: T-QUERY-GRAPH

### Step 2: 子系统检查
检查各子系统状态，生成健康报告和建议

## 输出格式
```
agentHealth, subsystemStatus[], recommendations[]
```
