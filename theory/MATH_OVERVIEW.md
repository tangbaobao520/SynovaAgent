---
version: "1.0.0"
updated: "2026-06-19"
scope: "global"
source: "SYNOVA-THEORY-v2-20260618.html §1.4"
status: "stable"
inputs: []
exports: ["数学公式总览", "各公式工程化状态"]
type: "documentation"
---

# 数学表达式总览

以下公式是 Synova 诊断体系中具备严格数学推导或清晰量化表达的部分。这些公式是测量器（measurer）的计算逻辑，是专家诊断的量化输入。

## 已工程化公式

| 公式 | 负责专家 | 工程化文件 |
|------|---------|----------|
| 7 Powers 综合护城河强度 = Σ(S_i × W_i) / Σ(W_i) | strategy | packages/engine-core/src/pipeline/diagnosis/seven-powers.ts |
| ROE = 利润率 × 周转率 × 杠杆乘数（杜邦分析） | finance | 财务学标准公式 |
| CCC = DIO + DSO - DPO（现金流转换周期） | finance / biz_model | 财务学标准公式 |
| LTV/CAC ≥ 3（单位经济学） | finance | 标准公式 |
| 关键人才风险评分 R_person | org | packages/engine-core/src/pipeline/diagnosis/key-person-risk.ts |
| HTM 混合信任评分 | org (D3硅基侧) | packages/engine-core/src/pipeline/diagnosis/htm.ts |

## 已设计但未工程化公式

| 公式 | 负责专家 | 状态 |
|------|---------|------|
| 企业健康度 H = Sq × Oc × Mm × SOfit | 合成层 | ⏳ 设计阶段 |
| 战略组织咬合度 = 1 - |S_req - O_actual| / max(两者) | strategy × org | ⏳ 依赖两端结构化输出 |
| 约束识别 Bottleneck = argmin(Sq, Oc, Mm, SOfit) | action | ✅ 逻辑框架已建立 |
| D5 认知多样性指数 | org (D5) | 🔬 研究阶段 |
| D5 建设性冲突频率 | org (D5) | 🔬 研究阶段 |
| D6 进化适应性比率 | org (D6) | 🔬 研究阶段 |
| 创始人决策带宽饱和度 | org (Stage 0-1) | 🔬 未工程化 |

## 没有公式的理论（诚实列表）

以下理论目前是**定性框架**，不可被公式化：
- 段永平六问（体质判断）
- 曾明 S2B2C（价值网络分析）
- Osterwalder 画布（描述工具）
- 波特五力交互（单力有量化，交互无闭合公式）
- 柯林斯飞轮（概念框架）
- 克里斯坦森颠覆（预测框架）
