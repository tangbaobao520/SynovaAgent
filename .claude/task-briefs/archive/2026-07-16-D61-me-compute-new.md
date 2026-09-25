## Q0: 定位
D61 = 3个新的ME compute函数。L4(packages/engine-core/src/compute/ 或 extensions/sentinels/shared/computes/)。
### 文件审计
grep "computePriceElasticity\|computeMarginTrend\|computeWorkingCapital" → 代码库中不存在
### 决策
新建到 extensions/sentinels/shared/computes/l2-value/ 和 l1-input/ + 注册到index.ts

## Q1: 调研
遵循现有compute模式: JSDoc @input/@output/@degraded + 接口+函数 + 降级路径 + economic_interpretation ≥3子字段

## Q2: 范围
- compute-price-elasticity.ts: elasticity+r_squared+residual_analysis+multicollinearity_warning+confidence_interval
- compute-margin-trend.ts: decomposition+breakeven_cross_ref+trend_direction
- compute-working-capital.ts: cash_conversion_cycle+liquidity_risk_tier+working_capital_ratio
- index.ts注册 + ≥9测试

## Q3: 验收
入口: vitest run tests/compute/...
处理: 3个compute函数正常/降级/边界
结果: ≥9测试通过

## 架构层: L4
