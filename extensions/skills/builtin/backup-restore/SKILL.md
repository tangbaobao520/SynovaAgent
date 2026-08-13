---
name: backup-restore
version: 1.0.0
description: "备份恢复"
category: self-maintenance
tier: L7
expert: host
complexity: atomic
---

# 备份恢复

## 概述
管理Agent系统的数据备份与恢复操作，查看最近备份状态和计划。

## 何时使用
- S-L7-004 — 备份恢复
- 适用场景见各 Step 描述

## 步骤流程

### Step 1: 查询备份状态
获取最近备份时间、大小和恢复状态
  - 工具: T-QUERY-GRAPH

### Step 2: 检查备份计划
查看备份调度状态

## 输出格式
```
lastBackup, backupSize, restoreStatus, backupSchedule
```
