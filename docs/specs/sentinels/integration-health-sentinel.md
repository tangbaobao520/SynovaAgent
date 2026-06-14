# SPEC: 集成健康哨兵 (D4)

## 全局定位
- 层: L3 | 维度: D4 软件生态 | 对接: 技术专家

## 接口签名
- `Sentinel.check(context) → SentinelCheckResult`
- 数据源: SOG图 TOOL节点 + 集成边(INTEGRATES类型)
- 不需要外部连接器

## 接入点
- `src/sentinel/builtins.ts` | Cron: 每日9:00

## 边界条件
- 零TOOL → degraded=true
- 健康率<50% → critical | <80% → warning
- 工具>3但集成<工具数/2 → 集成债务warning
