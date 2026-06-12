# SPEC: Sentinel 适配器 — 7 个内置哨兵

> Iron Law 0-2 Step 1: spec → test → impl → wire → review

## 接口契约

```
Sentinel.check(context: { db: unknown, now: Date, registry?: SentinelRegistry })
  → Promise<SentinelCheckResult>
```

**永不抛异常**。错误通过 `{ ok: false, error, findings: [] }` 返回。
数据不足通过 `{ ok: true, degraded: true, findings: [] }` 返回。

## 接入点

`src/agent/synova-agent.ts:52` (L2 编排层) — `registerBuiltinSentinels()` 在 `new SentinelRunner` 之前调用。

## 7 哨兵配置

| # | ID | 名称 | 包装 | Cron | 类别 | 优先级 | 置信度 |
|---|----|------|------|------|------|--------|--------|
| 1 | `sentinel-htm` | 混合信任模型 | `computeHTM` | `0 9 * * *` (日) | collaboration | P1 | statistical |
| 2 | `sentinel-hacd` | 人机协作深度 | `computeHACD` | `0 9 * * *` (日) | collaboration | P1 | deterministic |
| 3 | `sentinel-self-awareness` | 自知偏差 | `computeSelfAwareness` | `0 9 * * 1` (周一) | collaboration | P2 | statistical |
| 4 | `sentinel-gap-dynamics` | 缝隙动力学 | `computeDynamics` | `0 9 * * 1` (周一) | capability | P1 | deterministic |
| 5 | `sentinel-cpc` | 协作协议完备性 | `computeCPC` | `0 9 * * 1` (周一) | capability | P2 | deterministic |
| 6 | `sentinel-path-dependency` | 路径依赖检测 | `detectPathDependency` | `0 9 * * 1` (周一) | capability | P2 | statistical |
| 7 | `sentinel-seven-powers` | 7Powers竞争壁垒 | `computeSevenPowers` | `0 9 1 * *` (月首) | strategy | P1 | statistical |

## 报告→Finding 转换 (≥2 条/哨兵)

| 哨兵 | 触发条件 | 严重度 |
|------|---------|--------|
| HTM | `trustHealthScore < 0.4` | warning |
| HTM | `decayEvents` 非空 | critical |
| HACD | `hitlRatio > 0.5` | warning |
| HACD | `trend === 'declining'` | warning |
| GapDynamics | `stickyDimensions` 有 >3月不变的 | warning |
| GapDynamics | `velocity < 0` (恶化) | critical |
| CPC | `completenessLevel < 'basic'` | warning |
| CPC | 单个 gap 得分为 0 | critical |
| PathDependency | `isAnomaly === true` | critical |
| PathDependency | Z-score > 2.0 | warning |
| SelfAwareness | `significantDiscrepancies` 非空 | warning |
| SevenPowers | `overallMoatStrength < 0.3` | warning |
| SevenPowers | 最强力量的 `score < 0.5` | warning |

## DB 上下文

适配器在 `check()` 入口调用 `swapDbForContext(ctx)` — 保存 `getEngineContext().database.getDb` → 设为 `ctx.db` → finally 恢复。测试时注入 mock DB。

## 团队发现

`discoverTeams(ctx)` — 查 `diagnosis_snapshots` 表 `DISTINCT team_id`。空结果 fallback `['default']`。

## 边界条件

- 引擎模块返回 null → `{ ok: true, degraded: true, findings: [] }`
- 引擎模块 throw → log.error + `{ ok: false, error }` (不冒泡)
- 零团队 → 同 degraded
- DB 不可用 → `discoverTeams` 返回 `['default']`
