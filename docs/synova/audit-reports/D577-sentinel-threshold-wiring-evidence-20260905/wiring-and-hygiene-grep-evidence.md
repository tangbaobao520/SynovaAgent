# D577 — 接线验证（spec §8）+ 阈值卫生（DS9）+ 写集对账（S-2）evidence

> 任务: D577 | 日期: 2026-09-05 | 分支: feat/d577-sentinel-threshold-wiring
> 全部命令可在 worktree 根目录独立重跑，测试调用不计（S-3）。

## 1. §8 接线判据: resolveThresholds 生产调用点 ≥ 2

```
$ grep -rn "resolveThresholds" src/sentinel/
src/sentinel/sentinel-loader.ts:117:  * resolveThresholds — 哨兵阈值解析（manifest 基线 + L0 memStore 覆写合并，单一解析点）  ← 契约 JSDoc
src/sentinel/sentinel-loader.ts:130:export async function resolveThresholds(                              ← 定义
src/sentinel/sentinel-loader.ts:259:  const { thresholds } = await resolveThresholds(manifest.name, teamId);  ← 生产调用点①（check wrapper）
src/sentinel/runner.ts:1022:        // D577 DS7: 委托 resolveThresholds（...）                                ← 生产调用点②说明
src/sentinel/runner.ts:1026:          const { resolveThresholds } = await import('./sentinel-loader');      ← 生产调用点②（L3WriteAPI.getThreshold）
src/sentinel/runner.ts:1028:          const { thresholds, overrideMetric } = await resolveThresholds(bareId, orgId);
```

= **2 处生产调用点**（wrapper + runner），零"仅测试调用"。

## 2. §8 SentinelContext.thresholds 消费面

```
$ grep -rln "thresholds?: Record" extensions/sentinels/*/aggregate.ts | sort
api-coverage / customer-demand-shift / data-health / environment-rent-dependency /
financing-constraint / growth-quality / key-person-risk / network-power / niche-breadth /
opportunity-window / resource-misallocation / software-health / strategy-capability-fit   （13 文件第 4 可选参）
```

margin-health 不收第 4 参 = **设计内**（spec §6: 存量 4 消费者通道不动；B1 走其既有
`this.manifest?.thresholds?.[key] ?? DEFAULT_THRESHOLDS[key]` 通道（D356 交付），loader 同样把
manifest 挂给它 → 阈值可达）。写入方 = loader wrapper（`context.thresholds = thresholds`）；
消费方 = 14 aggregate（13 个第 4 参 + margin-health manifest 通道）。

## 3. SentinelAggregateResult / degraded 传播（DS3/DS6）

```
$ grep -n "degraded: true" extensions/sentinels/customer-demand-shift/aggregate.ts
（1 处: DEPLOYS 无边 → return { findings: [], degraded: true }，log.warn 前置）
$ grep -cn "r.nodes\[0\]}) return \[\]" extensions/sentinels/customer-demand-shift/aggregate.ts
0   ← 旧静默形态（spec §4.2 L29）零命中
$ grep -n "if (degraded) result.degraded = true" src/sentinel/sentinel-loader.ts
（wrapper 消费对象形态 → SentinelCheckResult.degraded）
```

## 4. DS9 阈值卫生双证

### 4.1 T8 常驻断言（tests/sentinel/threshold-injection.test.ts 内，常驻回归）

14 aggregate 源码（剥离注释/字符串后）零裸阈值比较；ALLOWLIST 17 条豁免（存在性守卫 13、
正向 info 1、结构下限 1、日志守卫 2）逐条注释理由且自检命中。实现前 44 条违规 → 实现后 0。

### 4.2 grep 双证（spec §7 verify 命令）

```
$ grep -n "0\.4\b" extensions/sentinels/customer-demand-shift/aggregate.ts
21:  top_customer_concentration: { warning: 0.3, critical: 0.4 },
```
仅 1 处命中 = **DEFAULT_THRESHOLDS fallback 数据表**（契约 §3-Q4 要求"文件内默认值 = 现硬编码值"，
蓝绿基准所在；是数据字面量非判定比较，T8 剥离扫描正确不计）。判定位置的裸比较 0.4/0.3/0.2/0.1 已全量替换为
`th('top_customer_concentration')` / `th('churn_rate')`。

```
$ grep -rln "this\.manifest" extensions/sentinels/*/aggregate.ts
capital-health / cash-runway / margin-health / revenue-health   ← 恰好 4 个（存量通道未破坏，spec §7 期望一致）
```

## 5. tsc 基线对账（DS10, 28=28）

实现后 `npx tsc --noEmit` = 28 错误，全部位于 pre-existing 文件（与本任务写集零交集）:

```
extensions/sentinels/_extinct/{adaptation-velocity,capital-efficiency,capital-structure,
  capital-turnover,competitive-dynamics,competitive-moat-perceptual,competitive-moat-structural,
  connector-coverage,market-lifecycle,structural-change}/aggregate.ts
src/connectors/ima.ts
src/server.ts
```

## 6. 写集对账（S-2 声称=实现）

```
$ git diff --name-only          # 21 tracked（与 spec §5.1 "21 修改"一致，extensions 18 + src 3）
extensions/sentinels/api-coverage/aggregate.ts
extensions/sentinels/customer-demand-shift/aggregate.ts
extensions/sentinels/data-health/aggregate.ts
extensions/sentinels/environment-rent-dependency/aggregate.ts
extensions/sentinels/financing-constraint/aggregate.ts
extensions/sentinels/growth-quality/aggregate.ts
extensions/sentinels/key-person-risk/aggregate.ts
extensions/sentinels/key-person-risk/manifest.json
extensions/sentinels/margin-health/aggregate.ts
extensions/sentinels/margin-health/manifest.json
extensions/sentinels/network-power/aggregate.ts
extensions/sentinels/niche-breadth/aggregate.ts
extensions/sentinels/opportunity-window/aggregate.ts
extensions/sentinels/resource-misallocation/aggregate.ts
extensions/sentinels/resource-misallocation/manifest.json
extensions/sentinels/software-health/aggregate.ts
extensions/sentinels/strategy-capability-fit/aggregate.ts
extensions/sentinels/strategy-capability-fit/manifest.json
src/sentinel/runner.ts
src/sentinel/sentinel-loader.ts
src/sentinel/types.ts
# + 2 新建: tests/sentinel/threshold-injection.test.ts, tests/sentinel/threshold-manifest-flip.test.ts
```

**manifest 值对账（DS5，B 组 diff 全量）**:

- margin-health/manifest.json: +8 行 = 新增 `incentive_bind {warning:0.4, critical:0.4}`、
  `metric_bind_divergence {warning:0.3, critical:0.5}`（现值新增，非调参）
- key-person-risk/manifest.json: +5/-1 = 新增 `decision_concentration {0.6, 0.8}`；bus_factor {2,1} 留置
- resource-misallocation/manifest.json: score {0.4,0.2}→{0.2,0.5}（回填现值）
- strategy-capability-fit/manifest.json: score {0.4,0.2}→{0.6,0.3}（回填现值）
- 其余 41 个 manifest: 零字节改动（`git diff --name-only` 无第 5 个 manifest）

## 7. 新增代码类型安全（铁律 38）

```
$ git diff | grep -c "^+.*as any\|^+.*as never\|^+.*as unknown as"
0
```

（loader 内既有 1 处 `store as unknown as GraphStoreReader` 为存量代码，本任务未触碰；新增 82 行 + aggregate 改动行均用内联类型 narrow。）
