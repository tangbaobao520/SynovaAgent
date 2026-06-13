# SPEC: cpc-sentinel — 协作协议完备性

## 全局定位
- 本模块属于 **L3** 层（洞察层）
- 服务于 **FDE 定时巡检** 用户旅程
- 详见 SENTINEL-PANORAMA.md

## 接口签名
```typescript
export const cpcSentinel: Sentinel
check(context: SentinelContext) → SentinelCheckResult
```

## 接入点
- `src/sentinel/builtins.ts` → `registerBuiltinSentinels()`
- `src/agent/synova-agent.ts:54` → `SentinelRunner.start()`

## 边界条件
- 引擎返回 null → degraded=true
- 引擎 throw → ok=false
- 无团队数据 → degraded
