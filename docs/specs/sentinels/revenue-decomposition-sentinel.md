# SPEC: 营收分解哨兵 (D1)

## 全局定位
- 层: L3 | 维度: D1 增长动力 | 对接: 财务专家

## 接口签名
- `Sentinel.check(context) → SentinelCheckResult`
- 数据源: SOG图 FINANCIAL + DOCUMENT(提取:finance) + diagnosis_snapshots
- 人工汇报可行: 无需连接器

## 接入点
- `src/sentinel/builtins.ts` | Cron: 每月1日9:00

## 边界条件
- 零营收数据 → degraded=true
- 单一产品线>50% → warning(集中度风险)
