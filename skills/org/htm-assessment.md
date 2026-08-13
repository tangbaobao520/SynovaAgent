---
name: htm-assessment
version: "1.0.0"
description: >-
  混合信任模型评估——人对Agent的信任曲线、自动接受率、Agent间错误传播率、
  信任衰减事件。D3 协作动力学的硅基侧核心测量器。
triggers:
  - "Agent"
  - "AI 信任"
  - "自动化"
  - "人机协作"
  - "HITL"
required_tools:
  - query_graph
depends_on: []
output_format: "structured_report"
confidence: "low"
---

# 混合信任模型 (HTM) 评估

## 触发条件
- org 专家在 D3（协作动力学）硅基侧诊断时自动触发
- 组织中已部署 Agent 且有可观测的交互数据
- 如果没有 Agent 部署 → 此 skill 不触发，D3 硅基侧得分为 N/A

## 前置依赖
- `collaboration_events` 表中的 HITL 修正记录
- `routing_events` 表中的 Agent→Agent 调用日志
- `agent_metrics` 表中的自动接受率统计
- 数据不足时 → 标注"当前无法评估 HTM，数据源不可用"，不强行评分

## 执行流程

1. **信任曲线分析**: 计算 HITL 修正频率的时间序列斜率
   - 调用: `query_graph` 读取 collaboration_events
   - 计算: `trustCurve_slope = Δ(correctionRate) / Δt`
   - 判断: 斜率↑ → 信任在建立（修正频率下降 = 人在逐渐信任 Agent）
   - 判断: 斜率↓ → 信任在流失（修正频率上升 = 人在撤回信任）
   - 判据: 斜率连续 3 个月 < 0 → 🔴 信任流失

2. **自动接受率**: Agent 输出被人直接接受的比例
   - 计算: `autoAcceptRate = 未经修改直接使用的 Agent 输出数 / 总 Agent 输出数`
   - 判断: 过高（> 0.9）→ 可能过度信任（人不再审查 Agent 输出）
   - 判断: 过低（< 0.3）→ 可能信任不足（Agent 能力被浪费）
   - 判据: 0.4-0.8 → 🟢 健康范围

3. **错误传播率**: Agent→Agent 调用的错误传播
   - 检查: 当 Agent A 调用 Agent B，B 的出错率是否因 A 的错误输入而上升
   - 计算: `errorPropagationRate = 级联错误数 / Agent→Agent 总调用数`
   - 判据: > 0.1 → 🔴 Agent 之间的错误在传播

4. **信任衰减事件**: 重大错误后的信任突变
   - 检测: 重大错误（severity = critical）发生后 7 天内，HITL 修正频率是否突变
   - 判断: 突变 ↑ 50%+ → 🔴 发生了信任衰减事件
   - 每个衰减事件记录为 `TrustDecayEvent`

5. **综合评分**:
   - `HTM_score = α·trustCurve_slope + β·(1−autoAcceptRate) + γ·errorPropagationRate + δ·decayEventPenalty`
   - α+β+γ+δ=1，默认均权
   - 判据: < 0.4 → warning; 存在 decayEvents → critical

## 输出规范
- 格式: 结构化 Markdown
- 必须包含:
  - 信任曲线方向（建立中/稳定/流失中）
  - 自动接受率 + 判据
  - 错误传播率（如果没有 Agent→Agent 调用则标注 N/A）
  - 信任衰减事件列表（如果有）
  - 综合 HTM 评分 + 判据
- 质量标准:
  - 数据不足时必须明确标注，不强行评分
  - 置信度标注为 low（HTM 是量化信任的尝试——本质上很难精确）

## 反面案例

### 案例 1: 把高自动接受率等同于高信任
- **错误**: autoAcceptRate = 0.95 → 判断为"信任建立良好"
- **遗漏**: 可能是人不再审查 Agent 输出——不是信任，是"懒得看"。真正的信任包含持续的、选择性的质疑
- **正确做法**: 高自动接受率 + 低修正频率 + 零质疑记录 → 可能是集体盲区，不是高信任

### 案例 2: 在没有 Agent 部署的组织中强行评估 HTM
- **错误**: 给一家只用钉钉+Excel 的公司评估了 HTM
- **后果**: 基于不存在的数据源做了推断，诊断结论不可信
- **正确做法**: 确认 collaboration_events 表中有数据后才启动此 skill

## 边界
- **适用**: 已部署 Agent、有 collaboration_events 数据的组织
- **不适用**: 纯人组织、没有 Agent 交互数据的组织 → D3 硅基侧标注为 N/A
- **工程化**: `packages/engine-core/src/pipeline/diagnosis/htm.ts`
- **置信度**: low——信任的量化本质上困难，此评分是参考信号而非确定结论
