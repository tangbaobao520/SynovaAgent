# Task Brief: D356 哨兵阈值告警接线 + 降级误报修复（P0-1 + P1-1 + P1-3）

> 生成: 2026-08-16 | 分支: feat/d356-sentinel-threshold-alert | 角色: DeepSeek Harness
> 依据: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D356-sentinel-threshold-alert-20260816.md
> 权威: K3 全链路审计 AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md L61/L160-162（P0-1/P1-1/P1-3）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
哨兵阈值告警端到端接线（L3 洞察层）。修复 K3 证明的三处缺陷：manifest 从不挂载（阈值 finding 死代码）、degraded value=0 穿过阈值门控误报 critical、capital-* 缺字段 `|| 0` 静默默认误报。产品线 07 持续监测 + 08 告警推送验收点 7-2/7-4 转绿。

### b) 文件审计（grep/read 实测）
- 死代码根因: src/sentinel/sentinel-loader.ts:205 check 调用前从不给 sentinelObj 挂 manifest；extensions/sentinels/cash-runway/aggregate.ts:14 manifest:null + :28 if(this.manifest)
- 误报根因: cash-runway/aggregate.ts:30/38/45 阈值判断缺 !degraded 守卫；compute 无数据返回 degraded:true value:0
- capital 误报: _extinct/capital-structure/aggregate.ts:23-30 `|| 0`；capital-turnover/aggregate.ts:18；capital-efficiency/aggregate.ts:39-47
- 接线调用方（grep 实测 2 处）: registerLoadedSentinels 被 file-driven-loaders.ts:73 + deploy/bootstrap.ts:376 调用

### c) 决策（D333，K3 可核）
- manifest 注入方式: B loader 注入 sentinelObj.manifest（不改 45 哨兵 check 签名）
- P1-3 修复层次: B aggregate 字段映射前检查（fail-closed，compute 不动）
- degraded 守卫范围: A 只改 cash-runway（revenue-health:59 已含）
- 参考: Anthropic + 第一性原理

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC（dev doc §4 测试表 9 用例）→ ② 测试（red）→ ③ 实现（5 改 1 新）→ ④ 接线（grep 命中）→ ⑤ 验证。
引用: 铁律 0-2/11/24/31/47/48；K3 M1 fail-open + M3 未接线复合实例。

### b) 本任务执行约束
- rule: "degraded 信号必须拦截，不得穿过阈值门控（铁律 24/31）"
  verify: "grep -c '!runwayResult.degraded' extensions/sentinels/cash-runway/aggregate.ts 输出 >= 3"
- rule: "缺字段 ≠ 值 0，字段缺失须 fail-closed 返回 []（铁律 11）"
  verify: "grep -c '=== undefined' extensions/sentinels/_extinct/capital-structure/aggregate.ts 输出 >= 1"
- rule: "manifest 注入类型安全，禁 as any（铁律 38）"
  verify: "grep -c 'as any' src/sentinel/sentinel-loader.ts 输出 == 0"

### c) 决策参考系
参考: Anthropic/第一性原理 + 结论（见 Q0c）。

## Q2: 范围 — 正确的最简方案

做什么：
- src/sentinel/sentinel-loader.ts
- extensions/sentinels/cash-runway/aggregate.ts
- extensions/sentinels/_extinct/capital-structure/aggregate.ts
- extensions/sentinels/_extinct/capital-turnover/aggregate.ts
- extensions/sentinels/_extinct/capital-efficiency/aggregate.ts
- tests/sentinel/sentinel-threshold-alert.test.ts

不做什么：
- 不改 extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts  (filter bug 归 D355)
- 不改 extensions/sentinels/revenue-health/aggregate.ts  (degraded 守卫已正确)
- 不改 extensions/sentinels/cash-runway/manifest.json  (阈值契约冻结)
- 不改 src/sentinel/registry.ts  (registry 核心不动)
- 不改 src/sentinel/types.ts  (类型定义不动)
- 不改 extensions/sentinels/_extinct/capital-health/aggregate.ts  (去桥接归 D358)

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：Cron Sentinel.check() 或 FDE runModules() → registerLoadedSentinels() 注册哨兵
处理（中间经过哪些步骤）：loader 挂 manifest → aggregate 阈值判断（!degraded 守卫）→ capital 缺字段 fail-closed 拦截
结果（最终展示在哪）：SentinelFinding[]（有数据正确告警、无数据不误报）；tests/sentinel/sentinel-threshold-alert.test.ts 全绿

## 架构层: L3 洞察（哨兵阈值告警）
#CRITERIA: A

## Done 标准
- [ ] 测试全绿: npx vitest run tests/sentinel/sentinel-threshold-alert.test.ts 零失败（≥9 用例）
- [ ] 接线 1: grep -c "\.manifest = manifest" src/sentinel/sentinel-loader.ts 输出 >= 1
- [ ] 接线 2: grep -c "!runwayResult.degraded" extensions/sentinels/cash-runway/aggregate.ts 输出 >= 3
- [ ] 接线 3: grep -c "=== undefined" extensions/sentinels/_extinct/capital-structure/aggregate.ts 输出 >= 1
- [ ] 类型: grep -c "as any" src/sentinel/sentinel-loader.ts 输出 == 0 + tsc --noEmit 零新增错误
- [ ] 门禁: bash scripts/pre-commit-check.sh 全绿
