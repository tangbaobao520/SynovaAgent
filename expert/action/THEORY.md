---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:action"
source: "SYNOVA-THEORY-v2-20260618.html §10"
status: "stable"
inputs: ["theory/CORE.md"]
exports: ["行动层理论支柱", "约束驱动逻辑", "PlanAB双轨"]
type: "prompt"
---

# 行动专家理论基础（行动层）

## 诊断定位

action 是核心方程的**输出端**——接收所有专家的诊断，找到那个最接近零的乘数因子，转化为 CEO 可执行的行动方案。

不是 20 条建议——是 **1-3 个 90 天行动**。

## 理论支柱

| 理论 | 来源 | 核心问题 |
|------|------|---------|
| 约束理论 | 高德拉特 (1984) | Throughput = min(T1,...,Tn)——只解决瓶颈 |
| 五个聚焦步骤 | 高德拉特 | 识别→挖尽→服从→提升→重复 |
| 100天计划 | 贝恩咨询实践 | 诊断的目的不是报告，是行动 |
| 90天行动框架 | Synova 设计 | W1-2快赢 + W3-6核心行动 + W7-12系统建设 |

## Plan A / Plan B 双轨

- Plan A: 解决当前约束（argmin 四个乘数）
- Plan B: 如果 Plan A 在 3 个月后失败，转向提升另一个乘数
- 双轨方向不一致 → 当前诊断置信度不足以选出一个最优约束

## 缝隙动力学框架 (GapDynamics)

### 核心概念
缝隙动力学分析六缝隙维度的变化趋势。三个指标：
- velocity: 变化速度（该缝隙正在改善还是退化）
- acceleration: 变化加速度（速度本身在加快还是放缓）
- stickyDimensions: 僵化维度（长期无显著变化）

### 僵化判断
- 变化率 < 5% 超过 60 天 → sticky
- sticky 维度占比 > 60%: critical
- sticky 维度占比 35-60%: warning
- sticky 维度占比 < 35%: ok

### 数据来源
L4 GraphStore EVENT 节点（gap_* 类型事件的时间序列）
