# SynovaAgent -- D8f 收敛机制 实施方案 v1.1

> 2026-07-22 | 权威文档 #4：Agent 工程能力对标 -- Gap #6（§2.7 收敛机制）
> **v1.1 升级：按 V4.5.0 标准补全——新增 Authority Doc Verification、Test Requirements (L1/L2a/L2c)、Wiring Verification。**
> **D8e 仲裁了冲突。D8f 通过 Synthesizer 增强——将 6 份 ExpertReport 收敛为一个连贯的 SynthesisReport。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：packages/engine-core/src/pipeline/diagnosis/synthesizer.ts 存在于磁盘
- [x] Get-Content 读取：权威文档 #4 §2.7 收敛机制 — "当前Synthesizer将6份ExpertReport合成为SynthesisReport，包含crossExpertContradictions、crossDimensionLinks、expertContributions、LLM合成假设。收敛机制在此基础上增强"
- [x] Select-String 验证：Synthesizer 类在 synthesizer.ts 中有 buildSynthesisPrompt、crossExpertContradictions 方法
- [x] 引用 — §2.7 收敛算法四步骤：共识发现(语义相似度>0.7)、差异量化(置信度方差>0.3)、权重合成(基于GA历史准确率)、LLM最终合成(结构化对比矩阵 → 叙述)

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 诊断收敛。D8f 增强 Synthesizer——将 6 份 ExpertReport（从 D8c 专家路由产出）、D8d 交叉验证冲突、D8e 仲裁结果整合，生成一份连贯的 SynthesisReport。收敛引擎处理跨专家矛盾——共识发现、差异量化、加权合成、LLM 最终合成。

### Q1：调研
- 权威文档 #4 §2.7 — 收敛算法四步：共识发现(语义相似度>0.7)、差异量化(方差>0.3)、权重合成(GA准确率)、LLM合成(结构化对比矩阵 → 叙述)
- Synthesizer 已存在于 packages/engine-core/.../synthesizer.ts — D8f 构建于其上，不修改它
- D8e ConflictArbitrator 已就绪 — 提供 autoResolve/escalateToGA 产出供 Synthesizer 消费

### Q2：范围
- 最小：ConvergenceEngine 类，含 synthesize(expertReports, cvResult, arbitrations) → ConvergedSynthesis
- 不做：不修改 synthesizer.ts（构建于其上）、不实现时间衰减权重（MVP：等权）、不修改 D8d/D8e

### Q3：验收
- 入口：MainAgent.executeWithDecomposition 在 D8d 交叉验证后调用 ConvergenceEngine.synthesize
- 交互：Synthesizer 取所有专家响应 → 融合冲突解决 → 生成 ConvergedSynthesis
- 结果：MainAgent 的 LoopExecutionRecord.output 包含完整综合诊断叙述

### Q4：契约与测试
- @input：ExpertResponse[] + CrossValidationResult + ArbitrationResult[]
- @output：ConvergedSynthesis { crossExpertContradictions, crossDimensionLinks, convergentFindings, expertContributions }
- @degraded：无冲突或无仲裁 → 跳过收敛，返回原始报告
- 测试：3 专家一致 → 共识、2 专家矛盾已仲裁 → 单赢家、3 专家全矛盾未解决 → 升级、空输入 → 降级

---

## 当前状态（2026-07-22，grep 验证）

- synthesizer.ts：存在于 packages/engine-core/...，含 buildSynthesisPrompt + crossExpertContradictions
- D8e ConflictArbitrator：已提交（db5251f），已修复（1abe5dc — ConvergenceEngine DI + expertType 传播）
- D8d CrossValidationTrigger：已提交（f7bcbe0）
- D8c ExpertRouter：已提交（152dfb7）
- ConvergenceEngine：零存在——此为新建模块
- 权威文档 #4 §2.7：收敛机制四步完整定义

---

## 构建内容

### 1. src/agent/convergence-engine.ts -- ConvergenceEngine（新建，约 220 行）

```
class ConvergenceEngine {
  synthesize(expertReports, cvResult, arbitrations): ConvergedSynthesis
  findConsensus(reports, threshold=0.7): ConsensusFinding[]
  quantifyDivergence(reports, threshold=0.3): DivergentDimension[]
  weightContributions(reports, gaAccuracy): ExpertContribution[]
  buildSynthesisMatrix(reports, conflicts): SynthesisMatrix
}
```

收敛算法（按 §2.7 四步）：
1. 共识发现：3+ 专家在同一维度上 finding 语义相似度 > 0.7 → 标记为高共识，置信度取中位数
2. 差异量化：每个维度的 finding 置信度方差 > 0.3 → 标记为高分歧维度
3. 权重合成：基于 GA 历史审查准确率动态调整每位专家的 contribution weight
4. LLM 合成：将结构化对比矩阵（非原始报告全文）输入 LLM → 生成综合叙述

### 2. 集成到 MainAgent（修改 src/agent/main-agent.ts）

在 executeWithDecomposition 方法中，D8d 交叉验证后、返回 LoopExecutionRecord 前：
```
const engine = new ConvergenceEngine();
const synthesis = engine.synthesize(expertResponses, cvResult, arbitrations);
record.output = synthesis.narrative;
```

---

## 不做什么

- 不修改 packages/engine-core/.../synthesizer.ts
- 不实现时间衰减权重（MVP：等权，无衰减）
- 不实现 GA 覆盖收敛规则
- 不修改 D8d 冲突检测逻辑

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- synthesize()：@input (3份 ExpertReport + 空冲突 + 空仲裁) / @output (ConvergedSynthesis with consensus=true) / 4组fixture
- findConsensus()：normal(3专家同意 → 高共识) / boundary(语义相似度正好0.7) / error(空报告 → 空结果) / temporal(同样报告 = 同样结果)
- quantifyDivergence()：normal(高方差 → 高分歧) / boundary(方差 = 0.3) / error(空输入) / temporal
- weightContributions()：normal(有权重 → 返回加权) / boundary(无历史数据 → 等权) / error(GA数据缺失 → 等权降级)
- 每个函数 4 组 fixture，每组 3 个 expect()

### L2c：循环基础设施测试
- ConvergenceEngine 在 MainAgent 执行 loop-1 或 loop-3 后被调用：集成测试验证执行链完整

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| ConvergenceEngine.synthesize | MainAgent.executeWithDecomposition | grep "ConvergenceEngine" src/agent/main-agent.ts |
| ConvergenceEngine | ConflictArbitrator（DI 共享，1abe5dc 已修复）| grep "ConvergenceEngine" src/agent/conflict-arbitrator.ts |

---

## 完成标准

```
[ ] ConvergenceEngine 类：synthesize + findConsensus + quantifyDivergence + weightContributions + buildSynthesisMatrix
[ ] ConvergedSynthesis 类型：crossExpertContradictions + crossDimensionLinks + convergentFindings + expertContributions
[ ] 共识发现：3+ 专家语义相似度 > 0.7 → 高共识，置信度 = 中位数
[ ] 差异量化：置信度方差 > 0.3 → 高分歧维度
[ ] 权重合成：基于 D92 GA 历史准确率调整专家权重
[ ] 集成：MainAgent.executeWithDecomposition 在交叉验证后调用 synthesize
[ ] 降级：无冲突/空输入 → 返回原始报告 + degraded:false
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] vitest run --changed 零新增失败
[ ] ≥10 个测试：synthesize(2) + findConsensus(2) + quantifyDivergence(2) + weightContributions(2) + 集成(2)
```

---

## 权威文档引用

- 权威文档 #4：Agent 工程能力对标 -- §2.7 收敛机制
  - 收敛算法四步：共识发现(语义相似度>0.7)、差异量化(方差>0.3)、权重合成(GA准确率)、LLM合成(结构化对比矩阵→叙述)
- D8e：ConflictArbitrator（提供 autoResolve/escalateToGA 产出）
- D8d：CrossValidationTrigger（提供 CrossValidationResult）
- D92：MiddleEvolutionEngine（GA 历史准确率评分模式）
