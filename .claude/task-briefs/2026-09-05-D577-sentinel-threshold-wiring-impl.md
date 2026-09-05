# Task Brief — D577 哨兵阈值配置真实挂载（编码实现）

> 任务: D577 编码实现（synova-dsh 预设） | 2026-09-05 | 认领: synova-dsh（Claude/DSH 编码 session）
> 派单: docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md
> spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D577-sentinel-threshold-wiring-20260905.md
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L3 洞察层哨兵体系。45 个文件驱动哨兵的 manifest.json thresholds 字段从不流入 finding 判定
（aggregate 硬编码 39 判定点）+ memStore 覆写（updateThreshold）无消费方（getThreshold 生产调用=0）。
本任务把判定源换成 loader 注入的 thresholds（manifest 基线 + memStore 覆写），实现"改配置即改行为"。

### b) 文件审计（2026-09-05 本分支实测，与 spec §4.2 对照表零漂移）
- src/sentinel/sentinel-loader.ts: L146 manifest 挂载（D356）、L195-217 check wrapper、L27 SentinelManifest.thresholds 类型。
- src/sentinel/runner.ts: L1021-1052 getThreshold / L1054-1083 updateThreshold（L3WriteAPI，签名冻结）。
- src/sentinel/types.ts: SentinelContext L143-154、SentinelCheckResult.degraded L81。
- 14 aggregate 39 判定点 + 4 manifest（A 组 10 文件值一致 / B 组 4 文件补 key·回填现值）——逐文件 grep/read 核对。

### c) 决策
采纳 spec §5.3 D-1~D-5: loader 一处注入（SentinelContext.thresholds + 第 4 可选参）、B3/B4 回填现值（蓝绿可证）、
B1/B2 manifest 新增 key、DEPLOYS 静默改 log.warn + degraded（派单裁决）、resolver 落 sentinel-loader.ts。
margin-health 走既有 this.manifest 通道不动（§6），B1 仅补 2 key。

## Q1: 调研 — 业界 / Anthropic / memory

- 业界: Prometheus alerting rules 外置规则文件 + Grafana 阈值面板——配置单源 + 改配置即改行为。
- Anthropic 基线: single source of truth（一个解析点防两套逻辑漂移）；fail-closed 降级显式；机器可验契约（red→green）。
- memory: M3"机制建成未接线"（本缺陷即复发）；D356 K3 PASS 先例（this.manifest 通道 + degraded 拦截三路径测试）；
  CT-53（验收点级证据）；S-3（生产调用点才算接线）。

## Q2: 范围 — 正确的最简方案

做什么（= spec §5.1 写集 21 修改 + 2 新建，git diff --name-only 对账一致）:
- src/sentinel/types.ts
- src/sentinel/sentinel-loader.ts
- src/sentinel/runner.ts
- extensions/sentinels/api-coverage/aggregate.ts
- extensions/sentinels/customer-demand-shift/aggregate.ts
- extensions/sentinels/data-health/aggregate.ts
- extensions/sentinels/environment-rent-dependency/aggregate.ts
- extensions/sentinels/financing-constraint/aggregate.ts
- extensions/sentinels/growth-quality/aggregate.ts
- extensions/sentinels/network-power/aggregate.ts
- extensions/sentinels/niche-breadth/aggregate.ts
- extensions/sentinels/opportunity-window/aggregate.ts
- extensions/sentinels/software-health/aggregate.ts
- extensions/sentinels/margin-health/aggregate.ts
- extensions/sentinels/key-person-risk/aggregate.ts
- extensions/sentinels/resource-misallocation/aggregate.ts
- extensions/sentinels/strategy-capability-fit/aggregate.ts
- extensions/sentinels/margin-health/manifest.json
- extensions/sentinels/key-person-risk/manifest.json
- extensions/sentinels/resource-misallocation/manifest.json
- extensions/sentinels/strategy-capability-fit/manifest.json
- tests/sentinel/threshold-injection.test.ts
- tests/sentinel/threshold-manifest-flip.test.ts
- docs/synova/audit-reports/D577-sentinel-threshold-wiring-evidence-20260905/DS8-flip-physical-verification.md
- docs/synova/audit-reports/D577-sentinel-threshold-wiring-evidence-20260905/T1-T10-red-green-evidence.md
- docs/synova/audit-reports/D577-sentinel-threshold-wiring-evidence-20260905/wiring-and-hygiene-grep-evidence.md
- .claude/task-briefs/2026-09-05-D577-sentinel-threshold-wiring-impl.md
- task-state/D577.json

不做什么（spec §6）:
- 不改其余 11 处 DEPLOYS 静默（后续任务清单）；不接 D 组 15 哨兵（无判定点）
- 不改存量 4 消费者通道（cash-runway/revenue-health/capital-health 主体、margin-health 通道）
- 不改 L3WriteAPI 签名（packages/evolution/src/evolution-types.ts）、不碰 scripts/audit/、src/server.ts、src/config.ts、electron/
- 不改其余 41 个 manifest 的任何字节；不做 manifest 调参（改值=产品调参另事）

## Q3: 验收 — 入口 → 交互 → 结果

- 入口: 改 extensions/sentinels/customer-demand-shift/manifest.json churn_rate.critical 0.2→0.9（或 L0 org_adapter 覆写）。
- 处理: cron/手动 check → loader wrapper resolveThresholds（基线+覆写）→ aggregate 第 4 参判定。
- 结果: findings 变化（flip 测试 3 次幂等通过）；阈值字面量零残留（T8）；7-2/8-1/10-3 验收点级 evidence 落盘；
  vitest tests/sentinel/ 全绿（FAIL 集合与 pristine main 基线逐行相同）+ tsc 28=28 + as any 新增=0。

## 架构层: L3（sentinel/ + extensions/sentinels/；L3→L4 动态 import 为既有先例同款）

## Done 标准

- [x] red→green: T1/T4/T5/T6/T7/T8/T9 + flip 实现前红（输出在 evidence）；实现后全绿。
- [x] spec §8 判据: grep resolveThresholds src/sentinel/ = 2 生产调用点（wrapper L259 + runner L1028）。
- [x] DS9: T8 零违规 + grep 双证（0.4 仅剩 DEFAULT_THRESHOLDS 数据表 1 处，判定比较零残留）。
- [x] DS8 flip ×3 幂等 + 盘面字节级恢复。
- [x] 回归: tests/sentinel/ + tests/sentinels/ FAIL 集合与 pristine origin/main 基线 diff=空（39 个 pre-existing）。
- [x] tsc 28=28（写集文件零命中）+ as any/as never/as unknown as 新增行 = 0。
- [x] 写集对账: git diff --name-only = 21 tracked，与 spec §5.1 逐文件一致；41 个未列名 manifest 零改动。
