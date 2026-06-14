# SPEC: 协议覆盖哨兵 (D5)

## 全局定位
- 层: L3 (洞察层)
- 维度: D5 软件-Agent适配
- 对接: 无专家 (deterministic 检查)

## 接口签名
- `protocolCoverageSentinel: Sentinel`
- `check(context: SentinelContext) → Promise<SentinelCheckResult>`
- 数据源: SOG 图 TOOL 节点 (含 protocol 属性)

## 接入点
- `src/sentinel/builtins.ts` 注册
- Cron: 每周一 9:00

## 边界条件
- TOOL 节点为零 → degraded=true
- 覆盖率 <30% → critical (Agent 集成效率低)
- 覆盖率 <60% → warning
