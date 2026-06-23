---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:finance"
source: "SYNOVA-THEORY-v2-20260618.html §7"
status: "stable"
inputs: ["theory/CORE.md"]
exports: ["财务验证层理论支柱"]
type: "prompt"
---

# 财务专家理论基础（验证层）

## 诊断定位

finance **不改变核心方程的数值**——它是验证器。用财务数据反向验证其他专家的诊断结论。

当财务数据与专家诊断矛盾时 → 启动验证层矛盾升级协议 → action立刻介入。

## 理论支柱

| 理论 | 来源 | 核心问题 |
|------|------|---------|
| 杜邦分析 | 杜邦公司 (1912) | ROE = 利润率 × 周转率 × 杠杆——拆解回报，找到哪一段出了问题 |
| 现金流分析 | 财务学基础 | 不是利润能否支撑增长——是现金流能不能 |
| 单位经济学 | SaaS/互联网实践 | LTV/CAC、边际贡献——每多一个客户是在赚钱还是亏钱？ |

## 验证逻辑

- strategy 说"赛道好" → finance 看利润率趋势是否支撑
- biz_model 说"有定价权" → finance 看毛利率是否稳中有升
- org 说"组织能力弱" → finance 看人力成本增速是否超过营收增速

## 财务健康评估框架 (FinancialSnapshot)

### 核心指标
- 毛利率 = (收入 - 成本) / 收入
- 人均收入 = 总收入 / 团队人数
- 人均成本 = 总成本 / 团队人数

### 健康度阈值
- 毛利率 < 10%: critical
- 毛利率 10-30%: warning
- 毛利率 > 30%: ok

### 数据来源
L4 GraphStore FINANCIAL 节点（revenue/cost/token_account 类型）
