# SPEC: 数据孤岛哨兵 (D4)

## 全局定位
- 层: L3 | 维度: D4 软件生态 | 对接: 技术专家

## 接口签名
- `Sentinel.check(context) → SentinelCheckResult`
- 数据源: SOG图 TOOL节点 + 跨系统引用分析
- 不需要外部连接器

## 接入点
- `src/sentinel/builtins.ts` | Cron: 每月1日9:00

## 边界条件
- 零TOOL → degraded=true
- 孤立率>50% → critical | >25% → warning
