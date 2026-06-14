# SPEC: 数据就绪哨兵 (D5)

## 全局定位
- 层: L3 (洞察层)
- 维度: D5 软件-Agent适配
- 对接: 无专家 (deterministic 检查)

## 接口签名
- `dataReadinessSentinel: Sentinel`
- `check(context: SentinelContext) → Promise<SentinelCheckResult>`
- 数据源: graph_nodes 表 (type + props)

## 接入点
- `src/sentinel/builtins.ts` 注册
- Cron: 每周一 9:00

## 边界条件
- 表不存在或无数据 → degraded=true
- 缺失率 >50% → critical (数据质量不够)
- 结构化率 <30% → warning (缺少计算数据)
- PII 命中 >0 → warning (隐私风险)
