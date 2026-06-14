# SPEC: API 可访问性哨兵 (D5)

## 全局定位
- 层: L3 (洞察层)
- 维度: D5 软件-Agent适配
- 对接: 无专家 (deterministic 检查)

## 接口签名
- `apiAccessibilitySentinel: Sentinel`
- `check(context: SentinelContext) → Promise<SentinelCheckResult>`
- 数据源: SOG 图 TOOL 节点 (含 url/endpoint 属性)

## 接入点
- `src/sentinel/builtins.ts` 注册
- Cron: 每日 9:00

## 边界条件
- TOOL 节点为零 → degraded=true
- HTTP HEAD 超时 5s → 标记为不可达
- 可达率 <60% → critical, <80% → warning
