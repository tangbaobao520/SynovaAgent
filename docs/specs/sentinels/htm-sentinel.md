# SPEC: htm-sentinel — 混合信任模型哨兵

## 全局定位
- 本模块属于 **L3** 层（洞察层）
- 服务于 **FDE 每日巡检** 用户旅程：自动检测人+Agent 信任异常
- 对接 组织专家 (org)

## 接口签名
```typescript
export const htmSentinel: Sentinel
// config: daily 9:00, collaboration, P1, statistical
// check(context: SentinelContext) → SentinelCheckResult
```

## 接入点
- `src/sentinel/builtins.ts:24` — `key: 'htmSentinel'`
- `src/agent/synova-agent.ts:54` — `registerBuiltinSentinels()`

## 算法选择
- 包装 `computeHTM(teamId)` (engine-core)
- 阈值: trustHealthScore < 0.4 → warning, decayEvents → critical, singlePointRisks → warning

## 边界条件
- computeHTM 返回 null → degraded=true, 空 findings
- computeHTM throw → ok=false, error 非空
- 无团队数据 → degraded
