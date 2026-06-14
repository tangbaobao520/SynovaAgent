# SPEC: 现金流哨兵 (D1)

## 全局定位
- 层: L3 | 维度: D1 增长动力 | 对接: 财务专家

## 接口签名
- `Sentinel.check(context) → SentinelCheckResult`
- 数据源: SOG图 FINANCIAL节点(含cash/balance/burn_rate/overdue) + diagnosis_snapshots

## 接入点
- `src/sentinel/builtins.ts` | Cron: 每日9:00

## 边界条件
- 零财务数据 → degraded=true
- 跑道<3月 → critical | <6月 → warning
- 逾期应收>30%现金 → warning
