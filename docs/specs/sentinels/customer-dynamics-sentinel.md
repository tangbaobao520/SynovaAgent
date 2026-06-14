# SPEC: 客户动态哨兵 (D1)

## 全局定位
- 层: L3 | 维度: D1 增长动力 | 对接: 财务专家

## 接口签名
- `Sentinel.check(context) → SentinelCheckResult`
- 数据源: SOG图 CLIENT节点(含revenue/churn/status) + diagnosis_snapshots
- 支持日报/周报人工汇报

## 接入点
- `src/sentinel/builtins.ts` | Cron: 每周一9:00

## 边界条件
- 零客户 → degraded=true
- 流失率>20% → critical | >10% → warning
- 最大客户>40% → warning(集中度)
