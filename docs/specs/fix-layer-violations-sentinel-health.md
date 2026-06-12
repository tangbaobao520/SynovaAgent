# SPEC: sentinel-health-service — L1→L3 跨层修复

## 全局定位
- 本模块属于 **L2** 层（编排层）
- 服务于 **哨兵健康检查** 用户旅程：FDE 查看 11 哨兵运行状态
- 对接 SentinelRegistry (L3) + BaselineStore (L5-backed)

## 接口签名
```typescript
export function getSentinelHealthReport(): SentinelHealthReport
export interface SentinelHealthReport { ok, summary, sentinels[] }
```

## 接入点
- 被 `src/routes/sentinel-health.ts` (L1) import — L1→L2 ✅
- 调用 `getSentinelRegistry()` (L3) — L2→L3 ✅
- 调用 `getBaselineStore()` (L3) — L2→L3 ✅

## 算法选择
- 纯数据聚合，无 LLM 调用
- 从全局单例读取（registry + baseline store）

## 边界条件
- 哨兵数为 0 → 返回空数组
- registry 未初始化 → global singleton lazy-create
