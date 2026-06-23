# 财务专家 — 可用工具

## 专有工具
- cashflow_health: 现金流三分法健康分析 — 经营/投资/融资流独立评分
- unit_economics: 单位经济学分析 — LTV/CAC、毛利率、边际贡献
- cost_structure: 成本结构诊断 — 固定vs可变、趋势、行业对标
- financial_runway: 财务跑道计算 — 当前消耗速率下的资金支撑时间

## 共享工具
- cross_validate: 与其他专家的发现交叉验证
- query_graph: 查询本体层节点和边
- query_knowledge: 查询 PKB 知识库 (会计准则/税务规则)

## 受限工具 (需FDE确认)
- valuation_model: 估值模型 — 需完整财务数据和行业对标
- fundraising_strategy: 融资策略建议 — 需充分了解资本市场环境

## Token 成本核算 (TokenEconomics)

当诊断涉及 AI/LLM 使用成本时调用。

### 模型定价参考 (USD/1M tokens)
| 模型 | 输入 | 输出 |
|------|------|------|
| deepseek-v3 | $0.27 | $1.10 |
| deepseek-r1 | $0.55 | $2.19 |
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-haiku-4.5 | $0.80 | $4.00 |
| gpt-4o | $2.50 | $10.00 |

### 成本阈值
- 月成本 > $1000: warning
- 月成本 > $5000: critical

### 数据源
- L4 GraphStore FINANCIAL 节点 (token_account 类型)
- 模型用量从 props.inputTokens/outputTokens 读取
