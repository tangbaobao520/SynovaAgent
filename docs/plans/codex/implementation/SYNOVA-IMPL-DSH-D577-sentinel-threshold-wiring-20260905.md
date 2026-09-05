---
north-star:
  服务用户: FDE/GA（部署 Synova 的增长顾问）与企业主——告警灵敏度当前写死在代码里，按行业/客户调整阈值必须改代码发版
  服务场景: FDE 为不同行业客户部署哨兵后，改 manifest.json 阈值（或 L0 自适应调参）→ 哨兵 findings 判定随之变化，零代码改动
  模块终态: 45 哨兵阈值单源于 manifest.json（基线）+ L0 memStore 动态覆写（自适应），aggregate 零硬编码阈值字面量，改配置即改行为
  对齐北星: .claude/PRODUCT-BRIEF.md §三"哨兵定时巡检：阈值真实触发" + §四"文件优先：改文件就改行为" + W2"阈值可配置"承诺
  完成标准: 改 manifest 阈值 → 重跑哨兵 → findings 变化（物理可复现，DS8）；阈值字面量全量清除（DS9）
  当前进度: 机制存在但断链两处——aggregate 硬编码不读配置（40 哨兵）+ memStore 覆写从不进 check；D356 已接 4 哨兵 this.manifest 通道（K3 PASS）
---

<!--
  SYNOVA-IMPL-DSH-D577: 哨兵阈值配置真实挂载——死代码转活（7-2/8-1/10-3 转绿路径）
  状态: dev doc | 2026-09-05 | 优先级 P0（K3 全链路审计严重问题-1 + 产品进度 7-2/8-1 rejected、10-3 uncommitted）
  权威文档: docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md（断裂链路画像 CTO 已物理核实）; docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（P0-1）; AGENTS.md 铁律 9/24/31/47/48; memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md（CT-53）
  依赖: D356（已交付 audited PASS——this.manifest 通道 4 消费者，本任务不动其通道）
  并行: D575（LLM 配置，写集 src/services+routes+config.ts+renderer）零重叠可并行；本 spec 交付与编码实现写集零交叠
  DSH 借鉴: 无（派单 〇b 已核——Synova 自研哨兵体系内部缺陷修复，DSH 无对应机制）
-->

# SYNOVA-IMPL-DSH-D577 哨兵阈值配置真实挂载

> 一句话问题: 45 个哨兵的 manifest.json thresholds 字段全部存在，但 **thresholds 从不流入 finding 判定**——aggregate 内部硬编码字面量判定（customer-demand-shift L50 `> 0.4`、L77 `> 0.2` 等），用户改配置 = 改死代码；同时 runner.ts L1054 updateThreshold 已有按 orgId 存 memStore 的动态调参机制，但**没有任何 check 路径消费它**（getThreshold 生产调用方为零，grep 实测）。机制建成、接线缺失——M3"机制建成未接线"模式的复发。

## 1. Authority Doc Verification

**来源 1**: [派单-D577-sentinel-threshold-wiring-20260905.md](../../synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md)（CTO 派单，断裂链路画像 CTO 已物理核实 2026-09-05）

> manifest.json thresholds ✅ 存在（45 哨兵全有）… aggregate 内部**硬编码字面量**判定：customer-demand-shift/aggregate.ts L50 `> 0.4`、L55/L77 `> 0.3/0.2/0.1`… 用户改 manifest.json 阈值 → **findings 判定完全不变**（死代码语义）… sentinel/runner.ts L1028-1063 已有 updateThreshold 按 orgId 存 memStore 的机制——但 aggregate 不消费它。

**来源 2**: [AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md](../../../synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)（K3 全链路审计，P0-1 原文）

> P0 哨兵阈值告警生产死代码：sentinel-loader.ts 注册时从不挂 manifest，cash-runway/revenue-health 的全部阈值 finding 永不触发。

（D356 修复了 loader→`this.manifest` 挂载的半段；本任务修剩下的大半段：判定源仍是硬编码 + 覆写通道无消费。）

**来源 3**: AGENTS.md 铁律 9（阈值是关键定义，改完全仓 grep 传播）/ 24+31（禁静默降级，degraded 信号传播）/ 47（契约优先）/ 48（测试非空壳，red→green）。

**来源 4**: [memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md](../../../memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md)（CT-53）——声称验证过的必须是**验收点级**证据；产品线兑换诚实化。

## 2. Problem Statement

### 2.1 北星对齐

PRODUCT-BRIEF §三承诺哨兵"对比基线 → 异常检测"；§四承诺"文件优先：改文件就改行为"；W2 已交付"阈值可配置"。本缺陷 = 该承诺在哨兵域**未兑现**：配置文件存在但行为不变。修完它，7-2（manifest 挂载无死代码）/ 8-1（阈值读 manifest）/ 10-3（P0 哨兵阈值真实触发）三点同时获得转绿路径（§10.2）。

### 2.2 断裂链路（三段两断点，2026-09-05 实测）

```
manifest.json thresholds（45/45 哨兵全有，grep -l '"thresholds"' 实测 45）
    ↓ ❌ 断点1：aggregate 不读配置
aggregate.ts 硬编码字面量判定（精确普查 14 个哨兵 / 39 处阈值判定，§4.2 对照表）
    ↓ ❌ 断点2：动态覆写不进 check
runner.ts L1054 updateThreshold → memStore `threshold_${sentinelId}`
（唯一生产写入方 org-adapter.ts L360；读取方 getThreshold 生产调用方 = 0）
    ↓ 结果
改配置（文件或 L0 自适应）→ findings 判定完全不变 → 死代码语义
```

附加缺陷（K3 同报，派单一并修）：customer-demand-shift/aggregate.ts L29 `@deprecated` DEPLOYS traverse 门控——无 DEPLOYS 边时**静默 `return []`**（铁律 24/31 违规；loader L215-216 硬编码 `ok: true` 且丢弃 degraded，降级信号无法传播）。

## 3. Q0-Q4

### Q0 项目拼图
L3 洞察层哨兵体系。文件驱动哨兵 = extensions/sentinels/{name}/（manifest.json + aggregate.ts + computes/），由 src/sentinel/sentinel-loader.ts `registerLoadedSentinels()` 动态 import 并注册到 SentinelRegistry；cron 链路 = runner.executeSentinel（L1171）构建 ctx → registry sentinel.check(ctx) → loader wrapper → aggregate.check(store, teamId, traversal)。阈值应在 wrapper 一处注入（所有 aggregate 受益），而非 45 个 aggregate 各自取。

### Q1 调研
- **业界**: Prometheus alerting rules（告警规则文件外置，改规则即改行为，`kubectl apply` 级生效）；Grafana 阈值面板（阈值存 dashboards JSON）。共识 = **配置单源 + 改配置即改行为**，本任务把哨兵阈值对齐到该形态。
- **Anthropic 工程基线**: single source of truth（一个解析点，禁两套逻辑漂移）；fail-closed（配置缺失显式降级 + log，不静默吞）；机器可验契约（"改配置 → 行为变化"必须可用断言证明，见 §7 red→green）。
- **memory 历史教训**: M3"机制建成未接线"（本缺陷即复发）；D356 K3 PASS 先例（manifest 挂载 + degraded 拦截测试三路径）；CT-53（验收点级证据）；S-3（接线 = 生产调用点，测试调用不计）。

### Q2 范围
- **做**: 阈值注入机制（loader wrapper 一处 resolve → SentinelContext.thresholds + aggregate 第 4 可选参）；14 个有阈值判定的 aggregate 换判定源；4 个 manifest 补 key/回填现值；DEPLOYS 静默降级修复（customer-demand-shift）；memStore 覆写进 check（动态调参闭环）；测试三路径。
- **不做**: 见 §6（manifest 值调参、其余 11 处同款 DEPLOYS 静默、D 组 15 个无判定点哨兵、存量 4 消费者改造、L3WriteAPI 签名变更、orgId 透传）。

### Q3 验收
- 入口: 改 extensions/sentinels/customer-demand-shift/manifest.json 的 churn_rate.critical（0.2→0.9）或 L0 org_adapter 阈值自适应。
- 处理: cron/手动触发哨兵 check → loader wrapper resolveThresholds（manifest 基线 + memStore 覆写）→ aggregate 用注入阈值判定。
- 结果: findings 变化（critical 消失/恢复，物理可复现 DS8）；阈值字面量零残留（DS9）；7-2/8-1/10-3 三点验收点级 evidence（§10.2）。

### Q4 契约与测试（铁律 47/48，写代码前定义）

**契约 1 — SentinelThresholdPair + SentinelContext.thresholds**（src/sentinel/types.ts 新增）:

```typescript
/** 哨兵阈值对（manifest.json thresholds 字段值形态）。warning/critical 数值语义随指标方向而定（高于/低于触发），由各 aggregate 判定式决定。 */
export interface SentinelThresholdPair { warning: number; critical: number }

export interface SentinelContext {
  // ...既有字段不动...
  /**
   * D577: 哨兵阈值表（注入契约）。
   * 来源 = manifest.thresholds 全量（基线）+ AgentMemoryStore 覆写（orgKey = check 时 teamId || 'default'，
   * 覆写应用于 manifest.thresholds 首个 key 即主指标——与 runner.getThreshold L1043 语义一致）。
   * 缺省 undefined = 未注入（直调/内置适配器场景），aggregate 走自有 fallback。
   * 由 sentinel-loader.ts registerLoadedSentinels 的 check wrapper 注入（唯一生产注入点）。
   */
  thresholds?: Record<string, SentinelThresholdPair>;
}
```

**契约 2 — resolveThresholds**（src/sentinel/sentinel-loader.ts 新增 export）:

```typescript
/**
 * resolveThresholds — 哨兵阈值解析（manifest 基线 + L0 memStore 覆写合并，单一解析点）
 * 契约:
 *   @input  — sentinelName: manifest.name（memStore 键兼容双形态: threshold_${name} 与 threshold_sentinel-${name}，
 *             后者兼容 org-adapter 传 config.id 的存量写入）；orgKey: 检查时 teamId || 'default'；
 *             deps?: 测试注入缝 { memoryStore?: { recall(orgId, key): { value: string } | null } }——缺省动态 import
 *             AgentMemoryStore + getDatabase（生产路径）。
 *   @output — { thresholds: Record<string, SentinelThresholdPair>, overrideApplied: boolean, overrideMetric?: string }
 *             基线 = loadSentinels() 中该哨兵 manifest.thresholds 全量；覆写 = memStore recall 命中的
 *             newThreshold，应用于 manifest.thresholds 的首个 key（主指标）。
 *   @degraded — memStore 值 JSON.parse 失败或数值非法 → log.warn + 忽略覆写（基线可用，不 throw，铁律 24）；
 *             loadSentinels 失败/找不到哨兵 → { thresholds: {}, overrideApplied: false }（空表，aggregate 走自有 fallback）。
 *   @error  — 不抛异常（所有失败路径降级返回，铁律 24/31）。
 */
```

**契约 3 — aggregate 可选第 4 参 + 降级返回形态**（types.ts 新增 SentinelAggregateResult）:

```typescript
/** aggregate.check 可选返回形态（D577）：返回数组 = 纯 findings（兼容存量）；返回对象可携带 degraded（铁律 31 传播）。 */
export interface SentinelAggregateResult { findings: SentinelFinding[]; degraded?: boolean }
```

aggregate 侧阈值消费模式（以 customer-demand-shift 为例）:

```typescript
// 文件内默认值 = 现硬编码值（蓝绿基准：注入与默认行为完全一致）
const DEFAULT_THRESHOLDS = {
  churn_rate: { warning: 0.1, critical: 0.2 },
  top_customer_concentration: { warning: 0.3, critical: 0.4 },
} as const;
const th = (key: keyof typeof DEFAULT_THRESHOLDS): SentinelThresholdPair => {
  if (thresholds && thresholds[key]) return thresholds[key];
  if (thresholds) log.warn({ sentinel: 'customer-demand-shift', key }, 'thresholds 注入缺 key — fallback 内置默认（manifest 配置缺口）');
  return DEFAULT_THRESHOLDS[key];
};
// 判定源替换：> 0.4 → > th('top_customer_concentration').critical（severity 标签保持代码现状）
```

fallback 噪音分级契约：`thresholds` 参数整体缺省（直调/单测）→ log.debug；参数存在但缺 key（真配置缺口）→ log.warn（派单 Q3"不静默"要求的正是后者）。

## 4. Current State（2026-09-05 grep/read 实测，非记忆）

### 4.1 缺陷分节

**缺陷 A（P0，断点 1）: 40/45 哨兵阈值判定硬编码。** 真实消费阈值的仅 4 个（grep `this\.manifest` 全仓实测）：capital-health、cash-runway、margin-health（部分，见 B 组）、revenue-health（D356 通道，`'manifest' in sentinelObj` 守卫 + loader L146 挂载）。其余 aggregate 用字面量比较；其中 api-coverage/data-health/software-health/customer-demand-shift 四个文件的**头部注释声称"比较 manifest.json 阈值"与实现不符**（注释欺诈，K3 指认同款）。

**缺陷 B（P0，断点 2）: 动态调参环死在存储端。** runner.ts L1021-1052 getThreshold / L1054-1083 updateThreshold 实现完整；全仓 grep 生产调用方：updateThreshold 仅 packages/evolution/src/org-adapter.ts:360（L0 阈值自适应，写 memStore `threshold_${sentinelId}`）；**getThreshold 生产调用方 = 0**（仅 packages/evolution/src/evolution-types.ts L171 接口声明）。memStore 值从不进入 check 链路。

**缺陷 C（P1）: loader wrapper 丢弃 degraded。** sentinel-loader.ts L214-216 `const raw = await sentinelObj.check(...); const findings = Array.isArray(raw) ? raw : raw.findings; return { sentinelId, ok: true, findings, ... }`——`ok: true` 硬编码，`degraded` 永不传播（SentinelCheckResult.degraded 字段存在但恒空）。

**缺陷 D（P1，K3 同报）: DEPLOYS 静默空返。** customer-demand-shift/aggregate.ts L29 `if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (!r.nodes[0]) return []; }`——无 DEPLOYS 边时静默 `return []`。同款模式存在 11 个文件（§6 列名单，本任务只修派单指认的 1 个）。

**次要事实**: runner.executeSentinel（L1187-1191）构建的 ctx 无 teamId → loader wrapper teamId 恒 'default'（cron 链路）；memStore 覆写的 orgId 命名空间缺口见 §6。

### 4.2 三方对照表（哨兵 → manifest.thresholds key → aggregate 判定位置；全部 grep/read 逐文件核对）

**A 组 — 值一致，直接换判定源（10 哨兵 / 30 判定点，蓝绿零行为变化）**:

| # | 哨兵 | manifest key {warning, critical} | 硬编码判定位置（实测行号） | 接线映射 |
|---|------|----------------------------------|---------------------------|----------|
| A1 | api-coverage | api_availability {0.8, 0.6} | aggregate.ts L47 `rate < 0.6`(crit)、L56 `< 0.8`(warn) | `< t.api_availability.critical / .warning` |
| A2 | api-coverage | protocol_coverage {0.6, 0.3} | L74 `coverage < 0.3`(crit)、L83 `< 0.6`(warn) | 同上 |
| A3 | customer-demand-shift | churn_rate {0.1, 0.2} | aggregate.ts L77 `> 0.2 \|\| revenueChurnRate > 0.2`(crit)、L86 `> 0.1`(warn) | `> t.churn_rate.critical / .warning` |
| A4 | customer-demand-shift | top_customer_concentration {0.3, 0.4} | L50 `> 0.4`(crit)、L59 `> 0.3`(warn) | 同上 |
| A5 | data-health | data_readiness {0.6, 0.3} | aggregate.ts L41 `readiness < 0.3`(crit)、L50 `< 0.6`(warn) | `< t.data_readiness.critical / .warning` |
| A6 | data-health | silo_rate {0.3, 0.5} | L89 `siloRate > 0.5`(crit)、L98 `> 0.3`(warn) | 同上 |
| A7 | environment-rent-dependency | rent_dependency {0.3, 0.5} | aggregate.ts L26 `index > 0.5`(crit)、L28 `> 0.3`(warn) | `> t.rent_dependency.critical / .warning` |
| A8 | financing-constraint | kz_index {1.0, 2.0} | aggregate.ts L34 `kzIndex > 2.0`(crit)、L36 `> 1.0`(warn) | `> t.kz_index.critical / .warning` |
| A9 | growth-quality | cash_conversion {0.7, 0.5} | aggregate.ts L34 `rate < 0.5`(crit)、L36 `< 0.7`(warn) | `< t.cash_conversion.critical / .warning` |
| A10 | growth-quality | organic_growth {0.5, 0.3} | L40 `organicPct < 0.3`(crit)、L42 `< 0.5`(warn) | 同上 |
| A11 | network-power | power_index {0.6, 0.8} | aggregate.ts L21 `powerIndex > 0.8`(crit)、L22 `> 0.6`(warn) | `> t.power_index.critical / .warning` |
| A12 | niche-breadth | niche_breadth {1.5, 1.0} | aggregate.ts L24 `breadth < 1.0`(crit)、L26 `< 1.5`(warn) | `< t.niche_breadth.critical / .warning` |
| A13 | niche-breadth | niche_depth {0.3, 0.5} | L29 `depth > 0.5`（单档，finding severity='warning'） | `> t.niche_depth.critical`（severity 保持现状；.warning 0.3 档无判定点，不新增 finding） |
| A14 | opportunity-window | opportunity_score {0.4, 0.2} | aggregate.ts L40 `score < 0.2`（单档，severity='warning'） | `< t.opportunity_score.critical`（同上原则）；L49 `score > 0.7` 为**正向 info 发现**非告警阈值，不接线（记录于 §6） |
| A15 | software-health | usage_rate {0.4, 0.2} | aggregate.ts L75 `usageRate < 0.2`(crit)、L84 `< 0.4`(warn) | `< t.usage_rate.critical / .warning` |
| A16 | software-health | unauthorized_rate {0.3, 0.5} | L119 `unauthorizedRate > 0.5`(crit)、L128 `> 0.3`(warn) | 同上 |

**B 组 — key 缺失/值漂移，manifest 补 key 或回填现值（4 哨兵 / 9 判定点，回填后蓝绿零变化）**:

| # | 哨兵 | 现状与缺陷 | manifest 修改（现值回填/新增 key） | 判定接线 |
|---|------|-----------|-----------------------------------|----------|
| B1 | margin-health | th() 机制已接 5 个 key（`this.manifest?.thresholds?.[key] ?? DEFAULT_THRESHOLDS[key]`，L98）；但 ib/mbd 两个判定硬编码：L247 `ib.value > 0.4`(warning)、L259 `mbd.value > 0.5`(critical)、L268 `> 0.3`(warning)——manifest 无对应 key | 新增 `incentive_bind: {warning: 0.4, critical: 0.4}`（单档，critical 占位）、`metric_bind_divergence: {warning: 0.3, critical: 0.5}`；DEFAULT_THRESHOLDS 同步加两 key | ib → `> th('incentive_bind').warning`；mbd → `.critical` / `.warning`（走其既有 th() 机制） |
| B2 | key-person-risk | L31 `ci > 0.8`(critical)、L41 `ci > 0.6`(warning)（DECISION_CONCENTRATES 边 props.concentration_index）；manifest 仅有 bus_factor {2, 1}——**key 与判定语义完全错位**（bus_factor 无 aggregate 判定点，属占位） | 新增 `decision_concentration: {warning: 0.6, critical: 0.8}`；bus_factor key 留置不动（记录于 §6） | `ci > t.decision_concentration.critical / .warning` |
| B3 | resource-misallocation | L52 `index > 0.5`(critical)、L63 `> 0.2`(warning)；manifest score 为模板值 {0.4, 0.2}——**与现行为不符** | score 回填为 `{warning: 0.2, critical: 0.5}`（现值，非调参） | `> t.score.critical / .warning` |
| B4 | strategy-capability-fit | L51 `score < 0.3`(critical)、L65 `< 0.6`(warning)；manifest score 模板值 {0.4, 0.2} 不符 | score 回填为 `{warning: 0.6, critical: 0.3}` | `< t.score.critical / .warning` |

> B3/B4 的"manifest 值回填"偏离派单 §三"manifest.json 不改"字面——派单写集预估明示"spec 修正后定稿"，且派单 Q3 的蓝绿约束（"替换后行为不变"）只有在值一致时才成立；值漂移场景按 manifest 原值生效会**静默改变告警行为**（如 resource-misallocation critical 从 0.5 降到 0.2 = 误报风暴）。两害相权：回填现值 = 蓝绿可证 + 配置变真话 + 后续调参走 manifest。已列入 §5.3 决策 2。

## 5. What We Build

### 5.1 写集 (21 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| src/sentinel/types.ts | 修改 | 新增 SentinelThresholdPair、SentinelContext.thresholds（契约 1）、SentinelAggregateResult（契约 3），JSDoc 三要素齐全 |
| src/sentinel/sentinel-loader.ts | 修改 | ①新增 export resolveThresholds（契约 2：manifest 基线 + memStore 覆写主指标 + deps 注入缝 + 降级容错）；②check wrapper（L195-217 区域）每 check 调 resolveThresholds → `context.thresholds = thresholds` + 作为第 4 参传 aggregate；③degraded 传播：raw 非数组形态时读 `degraded` 写入 SentinelCheckResult（缺陷 C） |
| src/sentinel/runner.ts | 修改 | getThreshold（L1021-1052）委托 resolveThresholds 取主指标对（消重单一解析点，行为等价：memStore → manifest 首个 key → {0.5, 1.0}）；updateThreshold 不动 |
| extensions/sentinels/api-coverage/aggregate.ts | 修改 | A1/A2：4 处判定换 th() 判定源 + 文件内 DEFAULT_THRESHOLDS（现值）+ 头部注释改为与实现一致 |
| extensions/sentinels/customer-demand-shift/aggregate.ts | 修改 | A3/A4：4 处换判定源 + **DS6** L29 DEPLOYS 静默 `return []` → `log.warn + return { findings: [], degraded: true }`（铁律 24/31） |
| extensions/sentinels/data-health/aggregate.ts | 修改 | A5/A6：4 处换判定源 + 注释校正 |
| extensions/sentinels/environment-rent-dependency/aggregate.ts | 修改 | A7：2 处换判定源 |
| extensions/sentinels/financing-constraint/aggregate.ts | 修改 | A8：2 处换判定源 |
| extensions/sentinels/growth-quality/aggregate.ts | 修改 | A9/A10：4 处换判定源 |
| extensions/sentinels/network-power/aggregate.ts | 修改 | A11：2 处换判定源 |
| extensions/sentinels/niche-breadth/aggregate.ts | 修改 | A12/A13：3 处换判定源（niche_depth 单档接 .critical） |
| extensions/sentinels/opportunity-window/aggregate.ts | 修改 | A14：1 处换判定源（L49 正向 info 发现不动） |
| extensions/sentinels/software-health/aggregate.ts | 修改 | A15/A16：4 处换判定源 + 注释校正 |
| extensions/sentinels/margin-health/aggregate.ts | 修改 | B1：ib/mbd 3 处接入其既有 th() 机制 + DEFAULT_THRESHOLDS 加两 key |
| extensions/sentinels/key-person-risk/aggregate.ts | 修改 | B2：ci 2 处换判定源（traversal 可选缺省时 fallback 内置默认） |
| extensions/sentinels/resource-misallocation/aggregate.ts | 修改 | B3：2 处换判定源 |
| extensions/sentinels/strategy-capability-fit/aggregate.ts | 修改 | B4：2 处换判定源 |
| extensions/sentinels/margin-health/manifest.json | 修改 | B1：thresholds 新增 incentive_bind {0.4, 0.4}、metric_bind_divergence {0.3, 0.5}（现值新增，非调参） |
| extensions/sentinels/key-person-risk/manifest.json | 修改 | B2：thresholds 新增 decision_concentration {0.6, 0.8} |
| extensions/sentinels/resource-misallocation/manifest.json | 修改 | B3：score 值回填 {0.2, 0.5}（现值，消除模板漂移） |
| extensions/sentinels/strategy-capability-fit/manifest.json | 修改 | B4：score 值回填 {0.6, 0.3} |
| tests/sentinel/threshold-injection.test.ts | 新建 | 注入生效/蓝绿/fallback/memStore 覆写闭环/degraded 传播/阈值卫生扫描（§7 red→green 全表） |
| tests/sentinel/threshold-manifest-flip.test.ts | 新建 | DS8 物理验证：改盘 churn_rate.critical 0.2→0.9 → critical 消失 → 恢复 → 恢复（仅 `D577_FLIP_TEST=1` 时运行，防并行 vitest 污染；fs 改动 try/finally 必恢复） |

> **提交策略预登记（spec-only 提交的预期漂移，D556 先例）**: 上表 21 修改文件在 spec 阶段零 diff、2 新建文件不存在——check-dev-doc-write-set.sh 对 spec-only 提交将报 23 条预期漂移（文件级语义的已知代价）。消解方式 = spec 文件随编码首个 commit 同批提交（届时全部命中零漂移）。gatekeeper C6 只验写集表可提取（已验 PASS），不受影响。

### 5.2 修复模式（核心机制骨架）

**loader wrapper 注入（sentinel-loader.ts，替换 L195-217 内部）**:

```typescript
async check(context) {
  const ctx = context as unknown as Record<string, unknown>;
  const store = (context.db ?? {}) as Record<string, unknown>;
  const teamId = (ctx.teamId as string) || 'default';

  // D577: 阈值注入（唯一生产解析点）—— manifest 基线 + memStore 覆写
  const { thresholds } = await resolveThresholds(manifest.name, teamId);
  (context as { thresholds?: Record<string, SentinelThresholdPair> }).thresholds = thresholds;

  // ...既有 traversal 构建不动...

  const checkFn = sentinelObj as { check: (store: unknown, teamId: string, traversal?: unknown,
    thresholds?: Record<string, SentinelThresholdPair>) => unknown };
  const raw = await checkFn.check(store, teamId, traversal, thresholds);
  const findings: SentinelFinding[] = Array.isArray(raw) ? raw
    : ((raw as Record<string, unknown>)?.findings as SentinelFinding[]) || [];
  // D577 缺陷 C: degraded 传播（aggregate 对象形态返回时），不再硬编码丢失
  const degraded = !Array.isArray(raw) && (raw as Record<string, unknown>)?.degraded === true;
  return { sentinelId: `sentinel-${manifest.name}`, ok: true, findings,
    ...(degraded ? { degraded: true } : {}), durationMs: 0, checkedAt: new Date().toISOString() };
}
```

**resolveThresholds 骨架**（同文件，export）:

```typescript
export async function resolveThresholds(
  sentinelName: string, orgKey: string,
  deps?: { memoryStore?: { recall(orgId: string, key: string): { value: string } | null } },
): Promise<{ thresholds: Record<string, SentinelThresholdPair>; overrideApplied: boolean; overrideMetric?: string }> {
  const { sentinels } = loadSentinels();
  const found = sentinels.find(s => s.manifest.name === sentinelName);
  const thresholds: Record<string, SentinelThresholdPair> = {};
  for (const [k, v] of Object.entries(found?.manifest.thresholds ?? {})) thresholds[k] = { ...v };
  if (Object.keys(thresholds).length === 0) return { thresholds, overrideApplied: false };
  try {
    const memoryStore = deps?.memoryStore ?? await (async () => {
      const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
      const { getDatabase } = await import('../init/engine-context');
      return getAgentMemoryStore(getDatabase());
    })();
    const primary = Object.keys(thresholds)[0];
    const stored = memoryStore.recall(orgKey, `threshold_${sentinelName}`)
      ?? memoryStore.recall(orgKey, `threshold_sentinel-${sentinelName}`);
    if (stored) {
      const parsed = JSON.parse(stored.value) as { newThreshold?: { warning?: number; critical?: number } };
      if (parsed.newThreshold && Number.isFinite(parsed.newThreshold.warning) && Number.isFinite(parsed.newThreshold.critical)) {
        thresholds[primary] = { warning: parsed.newThreshold.warning!, critical: parsed.newThreshold.critical! };
        log.info({ sentinel: sentinelName, orgKey, metric: primary }, 'D577 阈值覆写生效（memStore → check）');
        return { thresholds, overrideApplied: true, overrideMetric: primary };
      }
      log.warn({ sentinel: sentinelName }, 'memStore 阈值非法 — 忽略覆写，使用 manifest 基线');
    }
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err), sentinel: sentinelName }, 'memStore 阈值读取失败 — 使用 manifest 基线（degraded）');
  }
  return { thresholds, overrideApplied: false };
}
```

**aggregate 判定源替换范式**（14 个文件统一，见 §3-Q4 契约 3 示例；severity 标签一律保持代码现状，只换比较基准）。

### 5.3 决策参考（S-12，D333 四步：第一性原理 → Anthropic 基线 → 开源实证 → 收敛）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| D-1 阈值进入 aggregate 的通道 | A. loader 注入 SentinelContext.thresholds + 第 4 可选参 / B. 普及 this.manifest（45 哨兵加 manifest 字段自读）/ C. 各 aggregate 自读 manifest 文件 | CTO 派单建议 A；第一性原理（最少机制：一处解析全部受益）；Anthropic（单一解析点防两套逻辑漂移）；B 的 `this` 绑定脆弱性正是 D356 死代码根因；B/C 无法合并 memStore 覆写（manifest 是静态文件） | **A**——消费 aggregate 加可选参（不改者零影响），memStore 覆写天然可合并 |
| D-2 manifest 值与代码行为不符（B3/B4） | A. manifest 回填现值 / B. 按 manifest 现值生效（行为变） | 派单蓝绿约束（行为不变可证）+ CT-53（证据可复现）；B = 静默改变告警灵敏度（误报风暴），违北星"改配置即改行为"的本意（那应是显式调参动作） | **A**——回填后 manifest 即权威，此后调参走配置 |
| D-3 key 缺失（B1/B2） | A. manifest 新增 key（现值）/ B. aggregate fallback 常量 + log.warn | 派单目标"一处配置"；A 让 ib/mbd/决策集中度也可配置；fallback 机制仍保留为契约兜底（§3-Q4） | **A**——manifest 新增行非"改值"；两机制并存职责清晰 |
| D-4 DEPLOYS 静默修复方式 | A. log.warn + return {findings: [], degraded: true} / B. fall-through 到旧 queryNodes 路径 | 派单裁决 A（"返回 degraded 标记 + log.warn，不静默"）；B 改变行为面（旧路径数据语义未验证，蓝绿不可证） | **A**（派单明确） |
| D-5 resolver 落位 | A. sentinel-loader.ts 内新增 export / B. src/sentinel/ 下独立新文件 | 第一性原理（最少文件；逻辑 ~40 行）；runner.getThreshold 已动态 import loader（L1039 先例）无循环风险；gatekeeper C2 对 spec 阶段不存在的新 src 路径会 FAIL | **A** |

> 收敛检查：五项决策两参考系（Anthropic 基线 + 第一性原理/派单约束）均指向同解，无分歧。**参考：Anthropic/DeepSeek/第一性原理 + 结论**。

## 6. What We Don't Do

| 不做 | 理由（含文件路径） |
|------|------|
| **manifest 阈值调参**（除 B1-B4 回填/新增 key 外，45 个 manifest 零值变更） | 派单："本任务只让值生效，不改值——改值是产品调参另事" |
| **其余 11 处 DEPLOYS 静默 return 的修复** | 派单写集仅指认 customer-demand-shift 一处；同款待修清单（后续任务建议）：extensions/sentinels/agent-deployment-maturity/aggregate.ts L12、ai-ecosystem-fit/aggregate.ts L12、ai-investment-return/aggregate.ts L12、api-coverage/aggregate.ts L29、data-health/aggregate.ts L30、explore-exploit-balance/aggregate.ts L13、human-agent-boundary/aggregate.ts L12、make-or-buy/aggregate.ts L12、moat-dependency/aggregate.ts L12、niche-breadth/aggregate.ts L12、niche-squeeze/aggregate.ts L12、opportunity-window/aggregate.ts L25 |
| **D 组 15 哨兵接线**（thresholds 为占位、aggregate 无阈值判定点） | 无判定点 = 无可挂载面。stub/mock input：sentinel-forecast-accuracy/aggregate.ts（L23 input 硬编码 mock）、sentinel-pricing-strategy/aggregate.ts（input mock）；无数字阈值判定：network-power 之外的 niche-squeeze、moat-dependency、make-or-buy、explore-exploit-balance、human-agent-boundary、agent-deployment-maturity、internal-transaction-cost、channel-capacity、info-distortion、knowledge-accessibility、power-rigidity、routine-mutation、unit-economics、ai-investment-return（逐一 grep `[<>]=? ?[0-9]` 核实） |
| **存量 4 消费者改造**（cash-runway/revenue-health/margin-health 主体/capital-health 的 this.manifest 通道） | D356 交付、K3 audited PASS；margin-health 仅按其自有 th() 机制补 2 key（B1），通道不动 |
| **L3WriteAPI 签名变更**（packages/evolution/src/evolution-types.ts L171-172） | getThreshold/updateThreshold 签名不动，避免波及 @synova/evolution 包；派单未要求 |
| **orgId 透传/团队级阈值隔离** | 已知限制：cron 链路 teamId 恒 'default'（runner.executeSentinel L1187-1191 ctx 无 teamId），org_adapter 写入真实 orgId 的覆写对 'default' 检查不生效——预存在语义缺口，修复需 orgId 全链透传设计，超出本任务（后续任务建议）；DS7 闭环以 orgKey='default' 证明机制 |
| **opportunity-window L49 `score > 0.7` 正向 info 发现接线** | 非告警阈值（机会窗口打开的正面信号），manifest 无对应 key；保持现状 |
| **scripts/audit/（K3 专属）、src/server.ts、src/config.ts（D575 领地）、electron/、4 个内置哨兵适配器** | 派单禁碰 + 认领制 + 零重叠并行 |

## 7. Test Requirements（测试优先，铁律 0-2/48；red→green 三路径）

**第一步（red）**: 新建 tests/sentinel/threshold-injection.test.ts，以下用例在实现前必须失败（P0-1 同款红法：先写测试证死代码）：

| # | 层 | 用例 | red（实现前） | green（实现后） |
|---|----|------|---------------|-----------------|
| T1 | L1 | customer-demand-shift 直调 `check(store, 't1', undefined, {churn_rate: {warning: 0.1, critical: 0.9}, top_customer_concentration: {0.3, 0.4}})`，fixture churnRate=0.25（旧 critical 0.2 与新 0.9 之间） | 硬编码 → 仍产 e4-churn-crit（参数被忽略） | 参数生效 → 无 e4-churn-crit |
| T2 | L1 | 同哨兵注入 = manifest 现值（churn_rate {0.1, 0.2}）+ fixture churnRate=0.25 | —（同 T1 red） | 产 e4-churn-crit，与无注入旧行为**逐一相同**（蓝绿可证） |
| T3 | L1 | fallback：注入 `{}`（参数在、key 缺）→ 判定回落内置默认且行为 = T2；直调不传第 4 参 → 行为 = T2（debug 不 warn） | red 同源 | fallback 生效 |
| T4 | L2a | registry 全链路：registerLoadedSentinels() → registry.get('sentinel-customer-demand-shift').check({db, now, teamId:'t1'}) → 注入路径生效（ctx.thresholds 非空 + 判定用 manifest 值） | wrapper 不注入 → 无法经配置改变判定（red 以 T1 等价断言经 registry 复现） | 全链路生效 |
| T5 | L2b | resolveThresholds + deps.memoryStore（recall 返回 newThreshold {0.9, 0.9}）→ thresholds.churn_rate = {0.9, 0.9} + overrideApplied=true + overrideMetric='churn_rate'（首 key） | 函数不存在 → red | 覆写合并生效 |
| T6 | L2b | memStore 值非法（JSON.parse 失败 / 数值 NaN）→ 基线不变 + overrideApplied=false（降级不 throw，铁律 24） | red | 降级路径绿 |
| T7 | L2b | DEPLOYS 无边（traversal.traverse 返回空 nodes）经 registry check → result.degraded === true（customer-demand-shift） | 静默 [] 且 degraded undefined → red | degraded 传播（DS6 + 缺陷 C 双修） |
| T8 | L2c | 阈值卫生扫描：§4.2 A/B 组 14 个 aggregate.ts 源码零裸阈值比较（显式 ALLOWLIST 豁免单：opportunity-window `> 0.7` 正向 info、data-health `piiHitCount > 0` 守卫等，逐条注释理由） | 39 处硬编码命中 → red | 零命中（DS9 的常驻断言形态） |
| T9 | L2c | resolveThresholds 双键兼容：recall 第一键 `threshold_${name}` null、第二键 `threshold_sentinel-${name}` 命中 → 覆写生效（org-adapter config.id 形态兼容） | red | 双形态兼容 |
| T10 | 回归 | 既有 tests/sentinel/sentinel-threshold-wiring.test.ts（D356）+ l3-write-api.test.ts + sentinel-loader.test.ts 全绿 | 非红 | 回归确认 |

**第二步（green）**: 实现后 tests/sentinel/ 全量绿。flip 测试（threshold-manifest-flip.test.ts）red 证明 = 当前代码下改盘后 critical 不消失。

**verify 命令映射（声称项 ↔ 用例，禁 echo 0，S-4）**:

```bash
# T1-T10 常驻回归
npx vitest run tests/sentinel/threshold-injection.test.ts
# DS8 物理验证（ flip 场景，独占运行防 fs 竞争）
D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts
# DS9 硬编码清除双证（对照表 A3/A4 为例，14 文件逐一同标准）
grep -rn "0\.4\b" extensions/sentinels/customer-demand-shift/aggregate.ts   # 期望零命中
grep -rln "this\.manifest" extensions/sentinels/*/aggregate.ts              # 期望仍为 4（存量通道未破坏）
```

## 8. Wiring Verification

新 export 的**生产**调用点（测试调用不计，S-3；编码完成后逐条 grep 复核）：

| 新符号 | 生产调用点（现状 grep 实证） |
|--------|------------------------------|
| resolveThresholds（sentinel-loader.ts export） | ① 同文件 registerLoadedSentinels check wrapper（L195-217 区域）——45 个文件驱动哨兵每次 check 的生产路径；② src/sentinel/runner.ts getThreshold（L1021-1052 区域，L3WriteAPI 读取侧，供 L0 进化层 evolution-types.ts L171 契约消费） |
| SentinelContext.thresholds（types.ts） | 写入方 = sentinel-loader.ts check wrapper；消费方 = 14 个 aggregate 第 4 参（§4.2 对照表 A/B 组全列，逐文件行号可核） |
| SentinelAggregateResult（types.ts） | 生产消费者 = sentinel-loader.ts wrapper（degraded 传播）；生产产出方 = customer-demand-shift/aggregate.ts DEPLOYS 降级路径 |
| memStore 覆写闭环（既有 updateThreshold → 新 resolveThresholds） | packages/evolution/src/org-adapter.ts L360 `this.l3.updateThreshold(...)` → runner.getL0API()（runner.ts L978）→ memStore `threshold_*` → resolveThresholds recall → 下一次 check 生效（T5 单测 + DS7） |

接线完成判据（编码交验硬门禁，铁律 0-2）：`grep -n "resolveThresholds" src/sentinel/` ≥ 2 处生产调用（wrapper + runner）；`grep -rn "thresholds" extensions/sentinels/{14 目录}/aggregate.ts` 每文件含消费代码；零"仅测试调用"的新符号。

## 9. Architecture Layer

**L3 洞察层**（sentinel/ + extensions/sentinels/ 文件驱动扩展）。依赖合规：loader/runner 动态 import src/l4/agent-memory-store.ts 与 src/init/engine-context.ts——L3→L4 相邻层合法（文件内既有先例 L1024-1027、loader L153）；types.ts 为 L3 接口契约文件（既有 44 个 extensions 类型反查 import 同源）；不新增跨层依赖、不触碰 L1/L2。文件驱动原则：阈值消费仍是"加文件即扩展"（新哨兵 manifest 配 thresholds + aggregate 第 4 参即自动享受注入，零核心改动）。

## 10. Completion Standard（DS 与派单 7 验收锚点一一对应，禁重编号/跳号/静默缺项——S-10）

| DS | 内容 | 对应派单锚点 | verify |
|----|------|--------------|--------|
| DS1 | 契约类型落位：SentinelThresholdPair + SentinelContext.thresholds + SentinelAggregateResult（JSDoc 三要素） | §二.1 契约 | tsc 零错 + grep JSDoc |
| DS2 | resolveThresholds 实现 + loader wrapper 注入（ctx.thresholds + 第 4 参），唯一生产解析点 | §二.1 | T4/T5 + §8 grep |
| DS3 | degraded 传播：loader wrapper 消费对象形态返回 → SentinelCheckResult.degraded | §二.4 前半 | T7 |
| DS4 | A 组 10 哨兵 30 判定点换判定源（§4.2 A 组逐行） | §五.3 | T8 + grep 逐文件 |
| DS5 | B 组 4 哨兵 9 判定点 + 4 个 manifest（新增 key/回填现值） | §二.2 | T8 + manifest diff 对账 §4.2 B 组 |
| DS6 | customer-demand-shift L29 DEPLOYS 静默 → log.warn + degraded | §二.4 | T7 + grep `return \[\]` 零命中该文件 L29 形态 |
| DS7 | 动态调参闭环：runner.getThreshold 委托（行为等价）+ updateThreshold → memStore → 下一次 check 生效 | §五.4 | T5/T9 + §8 闭环链 grep |
| DS8 | 物理验收：flip 测试改 churn_rate.critical 0.2→0.9 → e4-churn-crit 消失 → 改回 → 恢复；evidence（命令+输出+时间戳）落盘 docs/synova/audit-reports/evidence/ 或 .codex/control-tower/evidence/ | §五.1/§五.2 | `D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts` |
| DS9 | 阈值卫生：14 个 aggregate 裸阈值字面量零残留（T8 常驻断言 + grep 双证） | §五.3 | T8 + §7 grep 命令 |
| DS10 | 回归：npx vitest run tests/sentinel/ 全绿（D356 三文件不破）+ tsc 零错 + as any=0 + pre-commit 全过无 --no-verify | §五.6 | vitest + tsc |
| DS11 | 完成报告含决策记录（§5.3 五项参考系与结论复述）+ §4.2 对照表逐项勾选状态 | CT-53/S-12 | 报告文本可核 |

### 10.1 交付声明纪律
覆盖 DS1-DS11 全部并标注 ✅/⏸/❌+理由；禁止重编号/跳号/静默缺项（S-10）；声称 = 实现 + 验收（S-2）。

### 10.2 产品线验收点映射（转绿由 CTO/K3 在 product-lines 流程兑换，本任务供给验收点级 evidence）

| 点 | 定义（product-lines.yaml 原文） | 本任务供给的 verify 命令 |
|----|--------------------------------|--------------------------|
| 7-2 | 哨兵全量注册（manifest 挂载无死代码） | DS4+DS9（30+9 判定点全挂载 + 卫生零残留）+ T4 registry 全链路 |
| 8-1 | 阈值真实触发（读 manifest 配置，不硬编码） | DS8 flip 物理验证（改 manifest → findings 变化 → 恢复）+ DS9 |
| 10-3 | P0 哨兵 manifest 挂载，阈值真实触发（资本循环线） | DS8 + DS7（4 个 P0 哨兵：cash-runway/revenue-health 已 D356 接；customer-demand-shift/key-person-risk 本任务接） |

## 11. Auth Doc References

- docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md（缺陷画像/5 必答/7 锚点/禁碰区）
- docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（K3 P0-1）
- docs/synova/product-lines/product-lines.yaml（7-2/8-1/10-3 点定义，L338/L385/L474）
- docs/plans/codex/implementation/SYNOVA-IMPL-D356-sentinel-threshold-alert-20260816.md（前序任务边界：this.manifest 通道 + degraded 拦截先例）
- docs/plans/codex/implementation/SYNOVA-IMPL-D352-resolver硬化-20260813.md（D381 结构范例）
- memory/notes/implemented/2026-09-04-d576-redeem-honesty-ct53-ct54.md（CT-53 验收点级证据）
- docs/synova/coordination/DECISION-REFERENCE.md（D333 四步框架）
- AGENTS.md 铁律 0-2/9/24/31/38/47/48

## 12. 自检清单

- [x] 派单 5 必答逐项落位（§3-Q4 契约、§4.2 对照表、§3-Q4 fallback 语义、DS6、§10.2 映射）
- [x] 三方对照表 39 判定点全部 read/grep 逐文件核对（非粗筛转抄；派单粗筛 26 → 实测 14 文件 39 处，差异原因：粗筛含 D 组无判定点文件与整数阈值噪音）
- [x] updateThreshold/getThreshold 生产调用面 grep 实测（org_adapter L360 唯一写方；getThreshold 零读方）
- [x] loader wrapper degraded 丢弃缺陷（L215-216）识别——派单未显式列出，spec 补全（缺陷 C）
- [x] 测试 red→green 对照表（§7）+ verify 命令非 trivial（S-4）
- [x] 决策参考 5 项带参考系与收敛检查（S-12）
- [x] DS 与派单 7 锚点一一对应（§10 表，S-10）
- [x] 写集表格式契约（D381）：标题行+表头紧邻、4 形态可解析、提交策略预登记（D556 先例）
- [x] 禁碰区零触碰（§6）；工作区外零写入
- [x] 不凭记忆——所有行号/签名/调用方为本轮 grep/read 实测
