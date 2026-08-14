<!--
  SYNOVA-IMPL-D268: product-health.py CLI — 5维度产品健康度检测
  状态: dev doc | 2026-07-30
  权威文档: 权威17-工程规格-v1-0-20260729.md §三
  依赖: D262 D263 D264 D265 D266 — ALL DONE
  并行: D269, D270 — 零共享文件
-->

# D268: product-health.py — 产品模式五维检测 CLI

> Phase 1 of Authority 17 Self-Diagnosis System. Reads 5 dimensions, produces health signal.

---

## 1. 权威文档引用

**来源**: 权威文档17-工程规格 §三

> 3.2 五个检测维度: 数据管道 | 哨兵准确度 | 诊断质量 | 循环运行 | 资源使用
> 3.3 输出: .codex/signals/product-health.json
> 3.4 诊断报告可信度标记规则: 0退化→healthy, 1-2→degraded, 3+→critical

## 2. 代码审计——现状

### 2.1 Phase 0 依赖状态（全部就绪）

| 依赖 | 文件 | 状态 |
|------|------|:---:|
| D262 GA反馈接线 | middle-evolution-engine.ts:133 getFeedbackCollector() | OK |
| D263 GraphStore增量查询 | diagnosis-graph-query.ts:219 queryNodesCreatedAfter() | OK |
| D264 诊断质量评分 | knowledge-feedback.ts diagnosisQualityScore | OK |
| D265 资源监控 | resource-monitor.ts getResourceSnapshot() | OK |
| D266 管道监控 | data-pipeline-monitor.ts getPipelineHealth() | OK |

### 2.2 现有信号文件

.codex/signals/gate-status.json — 17门禁状态
.codex/signals/external-auditor.json — 审计器信号
.codex/signals/loop-scheduler.json — 循环调度器状态(yellow: 1 unknown)

Sentinel信号文件不存在，需从gate-status.json Gate 4-7读取哨兵状态。

## 3. 实现方案

### 3.1 文件
scripts/control-tower/product-health.py — 新建，约200行Python

### 3.2 五个维度

| 维度 | 数据源 | 判定 |
|------|--------|------|
| pipeline | gate-status.json Gate 3 + D266 | healthy/degraded |
| sentinel | gate-status.json Gate 4-7 | healthy/degraded/critical |
| quality | gate-status.json + D264 score | healthy/degraded/critical |
| loop | gate-status.json Gate 12/13 + loop-scheduler.json | healthy/degraded |
| resource | Python psutil直接调用 | healthy/degraded/critical |

### 3.3 输出

```json
{
  "component": "product-health",
  "status": "degraded",
  "timestamp": "...",
  "dimensions": {"pipeline":"healthy","sentinel":"healthy","quality":"degraded","loop":"healthy","resource":"healthy"},
  "degradedCount": 1,
  "reportTrust": "degraded",
  "degradedReasons": ["诊断质量评分 0.42 < 0.7"]
}
```

### 3.4 CLI

python scripts/control-tower/product-health.py [--check all|pipeline|sentinel|quality|loop|resource]

## 4. 测试要求

L1: 3 Python assert — 全healthy/1degraded/psutil降级
L2a: 1 集成 — gate-status.json解析聚合

## 5. 接线要求

product-health.py CLI → generate-dashboard.py View 6消费 product-health.json
product-health.json → .codex/signals/ → Electron轮询

## 6. 完成标准

1. 5维度全部可判定，输出JSON
2. 报告可信度三级标记
3. psutil不可用→降级不崩溃
4. gate-status.json缺失→unknown
5. 产物 product-health.json 存在
6. emit signal对接控制塔
7. 零新增CI错误（纯Python，tsc不涉及）

## 7. 自检清单

- [x] 已读权威文档原文(Get-Content §三)
- [x] 已引用测试权威规范(L1/L2a)
- [x] 已写接线要求(generate-dashboard.py + Electron)
- [x] 已验证5个依赖文件路径在代码库中存在
- [x] 不是凭记忆
- [x] 不用 --no-verify
