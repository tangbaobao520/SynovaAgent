---
north-star:
  服务用户: 企业主（哨兵发现现金流/营收越阈异常时收到告警）+ FDE（部署后企业主自主看信号）
  服务场景: 哨兵定时巡检跑通后，现金流/营收指标越过 manifest 阈值时真正触发告警工单；数据不完整时诚实降级、不误报"现金流危急"
  模块终态: 哨兵阈值告警端到端可用——loader 挂 manifest → aggregate 阈值判断 → degraded 拦截 → 有数据正确告警、无数据不误报（产品线 07 持续监测 + 08 告警推送验收点 7-2/7-4 转绿）
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检：发现异常→对比基线→信号路由给专家→严重信号自动建工单」+ §六 P0「哨兵真实数据流」
  完成标准: 入口 registerLoadedSentinels() 注册 → 处理 loader 挂 manifest + aggregate 拦截 degraded → 结果（a）挂 manifest 后 this.manifest 非空、（b）degraded value=0 不产生 critical、（c）capital-health 缺字段不产出误报
  当前进度: 阈值告警生产死代码（manifest 从不挂载）+ degraded 穿过阈值误报 + capital 缺字段默认为 0 误报——三者均已 K3 全链路审计物理证明（报告 AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md L61/L64/L160-162）
---

<!--
  SYNOVA-IMPL-DSH-D356: P0 哨兵阈值告警接线 + 降级误报修复（P0-1 + P1-1 + P1-3）
  状态: dev doc | 2026-08-16 | 优先级 P0（K3 全链路审计「资本循环三个循环缺陷最深」）
  权威文档: K3 审计报告 AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md + AUDIT-FINDINGS-LEDGER（M1/M3）+ AGENTS.md 铁律 0-2/11/24/31/47/48
  依赖: 无（D355 属性契约/filter bug 为后续任务，本任务不依赖其落地）
  并行: 无（独占哨兵切片 cash-runway/capital-*/loader；与 D355/D358 写集不重叠，见 §3.3）
-->

# SYNOVA-IMPL-DSH-D356: P0 哨兵阈值告警接线 + 降级误报修复

> 一句话问题: 哨兵阈值告警**两种形态都不可用**——`sentinel-loader.ts` 注册时从不给 aggregate 挂 manifest → `if (this.manifest)` 恒 false → 阈值 finding 永不触发（死代码）；若挂上 manifest，无数据时 compute 返回 `degraded:true, value:0`，`0 <= critical 6` 穿过阈值门控 → **误报 critical「现金流危急—跑道0.0个月」**；同时 `capital-health` 桥接的 `_extinct/` 子哨兵对缺失字段 `|| 0` 静默默认 → 部分数据误报 critical（利息覆盖 0.0x）。三处均为 K3 全链路审计物理证明。

## 1. 权威文档引用

**来源**: [K3 全链路审计报告](docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)（P0-1 / P1-1 / P1-3）

> L61: cash-runway（P0）**FAIL**——三重缺陷（全部物理证明）：③阈值告警死代码——`aggregate.ts:14` `manifest: null` + `:28` `if (this.manifest)` 门控，而 `sentinel-loader.ts:170-210` 注册包装器**从不给 sentinelObj 挂 manifest**（全仓 grep 无 `.manifest =` 赋值）→ 生产形态 findings 恒空（活运行证明 [A] 组）；若挂上 manifest，无数据时 compute degraded value=0 ≤ critical 6 → **误报 critical"现金流危急—跑道0.0个月"**（活运行证明 [B] 组）

> L160: P1-1 降级语义→误报：manifest 若挂上，无数据时 cash-runway 报 critical"现金流危急"（degraded value=0 穿过阈值门控，aggregate 未拦截 degraded）

> L162: P1-3 capital-health 对缺失字段默认为 0 产出 critical（部分数据→误报）

**来源**: [AUDIT-FINDINGS-LEDGER.md](docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md)（M1 / M3 模式）

> M1 fail-open 静默失效（检查未执行==检查通过）；M3 机制建成未接线（WIRE CHECK 失败）。本任务正是 M1+M3 复合实例：manifest 挂了却没接线（M3），degraded 穿过门控（M1）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（0-2 接线验收 / 11 静默降级禁止 / 24 异常处理 / 31 降级信号传播 / 47 契约优先 / 48 测试非空壳）

> 铁律 24/31: 数据不足 ≠ 数值为 0；degraded 信号必须传播，不得穿过阈值门控误报。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 缺陷 A（P0-1）: loader 从不挂 manifest → 阈值告警死代码

[sentinel-loader.ts L170-210](src/sentinel/sentinel-loader.ts:170) — `registry.register()` 的 check 闭包调 `sentinelObj.check(store, teamId, traversal)`，但**从不给 sentinelObj 挂 manifest**：

```ts
registry.register({
  config: { id: `sentinel-${manifest.name}`, ... },
  async check(context) {
    // ...
    const raw = await sentinelObj.check(store, teamId, traversal);  // L205: this.manifest 恒 null
    // ...
  },
});
```

而 aggregate 依赖 `this.manifest` 读阈值（[cash-runway/aggregate.ts:14](extensions/sentinels/cash-runway/aggregate.ts:14) `manifest: null as SentinelManifest | null` + [:28](extensions/sentinels/cash-runway/aggregate.ts:28) `if (this.manifest)`）→ 全仓 grep 无 `.manifest =` 赋值 → **阈值 finding 死代码**。

### 2.2 缺陷 B（P1-1）: degraded value=0 穿过阈值门控误报

[cash-runway/aggregate.ts L28-54](extensions/sentinels/cash-runway/aggregate.ts:28) — 阈值判断**缺 `!degraded` 守卫**：

```ts
if (this.manifest) {
  const t = this.manifest.thresholds;
  if (runwayMonths <= t.cash_runway_months.critical) {   // L30: 缺 !runwayResult.degraded
    findings.push({ severity: 'critical', title: `现金流危急—跑道${runwayMonths.toFixed(1)}个月` });
  } else if (runwayMonths <= t.cash_runway_months.warning) {  // L38: 同缺
    // ...
  }
  if (overdueRate >= t.receivable_overdue.critical) {  // L45: 缺 !overdueResult.degraded
    // ...
  }
}
```

而 [compute-cash-runway-months.ts:68-78](extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts:68) 无数据时返回 `{ value: 0, degraded: true }` → `0 <= 6` 穿过门控 → 误报。对照好样本 [revenue-health/aggregate.ts:59](extensions/sentinels/revenue-health/aggregate.ts:59) 已有 `!growthResult.degraded` 守卫，cash-runway 漏了。

### 2.3 缺陷 C（P1-3）: capital 子哨兵缺字段 `|| 0` 静默默认 → 误报

[capital-structure/aggregate.ts L23-30](extensions/sentinels/_extinct/capital-structure/aggregate.ts:23) — 字段映射 `|| 0` 把缺失字段当 0：

```ts
const financials = finNodes.map(n => ({
  totalDebt: Number(n.props.totalDebt) || 0,            // 缺 totalDebt → 0
  equity: Number(n.props.equity) || 0,
  operatingIncome: Number(n.props.operatingIncome) || 0, // 缺 → 0 → icr=0
  interestExpense: Number(n.props.interestExpense) || 0,
}));
```

且 compute 的 degraded 判定**只查空 financials**（[interest-coverage.ts:15-21](extensions/sentinels/_extinct/capital-structure/computes/interest-coverage.ts:15) 与 [debt-equity-ratio.ts:17-25](extensions/sentinels/_extinct/capital-structure/computes/debt-equity-ratio.ts:17) 仅 `if (financials.length === 0) return degraded:true`）→ 缺字段被 `|| 0` 后 `degraded` 恒 false → 缺 `operatingIncome` 时 `icr=0` 穿过 `icr<1.5` 门控误报 critical（K3 L64「利息覆盖 0.0x」）。同型：`capital-turnover/aggregate.ts:18`、`capital-efficiency/aggregate.ts:40-45`。

### 2.4 接线现状（真实调用方，grep 实测）

`registerLoadedSentinels()` 全仓调用方（grep 实测，**非推断**）：

| 调用方 | 位置 | 说明 |
|--------|------|------|
| file-driven-loaders.ts | L73 | 文件驱动加载入口 |
| deploy/bootstrap.ts | L376 | 部署引导入口 |

> ⚠️ 此前初稿误写为 `src/agent/synova-agent.ts`——实测该文件**无此调用**，已改正。

## 3. 实现方案

### 3.1 写集 (5 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/sentinel/sentinel-loader.ts](src/sentinel/sentinel-loader.ts) | 修改 | P0-1：注册前注入 `sentinelObj.manifest = manifest` |
| [extensions/sentinels/cash-runway/aggregate.ts](extensions/sentinels/cash-runway/aggregate.ts) | 修改 | P1-1：`:30/:38/:45` 阈值判断加 `!degraded` 守卫 |
| [extensions/sentinels/_extinct/capital-structure/aggregate.ts](extensions/sentinels/_extinct/capital-structure/aggregate.ts) | 修改 | P1-3：字段映射前加完整性检查 |
| [extensions/sentinels/_extinct/capital-turnover/aggregate.ts](extensions/sentinels/_extinct/capital-turnover/aggregate.ts) | 修改 | P1-3：同上 |
| [extensions/sentinels/_extinct/capital-efficiency/aggregate.ts](extensions/sentinels/_extinct/capital-efficiency/aggregate.ts) | 修改 | P1-3：同上 |
| [tests/sentinel/sentinel-threshold-alert.test.ts](tests/sentinel/sentinel-threshold-alert.test.ts) | 新建 | 三路径测试（≥8 用例，见 §4） |

### 3.2 修复模式

**缺陷 A（loader 注入 manifest，类型安全非 `as any`）**:

```ts
// sentinel-loader.ts — registerLoadedSentinels() 内，sentinelObj 通过 check 校验后、registry.register() 前
if (typeof sentinelObj === 'object' && sentinelObj !== null) {
  (sentinelObj as { manifest?: SentinelManifest }).manifest = manifest;  // 铁律 38: 内联类型，非 as any
}
```

**缺陷 B（cash-runway 加 !degraded 守卫，对齐 revenue-health:59 好样本）**:

```ts
if (this.manifest) {
  const t = this.manifest.thresholds;
  if (!runwayResult.degraded && runwayMonths <= t.cash_runway_months.critical) { /* critical */ }
  else if (!runwayResult.degraded && runwayMonths <= t.cash_runway_months.warning) { /* warning */ }
  if (!overdueResult.degraded && overdueRate >= t.receivable_overdue.critical) { /* ar critical */ }
}
```

**缺陷 C（capital 子哨兵字段完整性检查，区分「字段缺失」vs「值=0」）**:

```ts
// capital-structure/aggregate.ts — 字段映射前
const missing = finNodes.some(n =>
  n.props.totalDebt === undefined || n.props.equity === undefined ||
  n.props.operatingIncome === undefined || n.props.interestExpense === undefined);
if (missing) {
  log.warn({ teamId }, '[capital-structure] 关键字段缺失 — degraded，不产出 finding');
  return [];  // 缺字段 ≠ 0：不静默默认，不产出误报
}
// capital-turnover: revenue/totalAssets/accountsReceivable；capital-efficiency: revenue/totalDebt/equity
```

### 3.3 不做的事

| 不做 | 文件 | 归属 |
|------|------|------|
| compute filter bug（`{ [teamId]: teamId }` 永不匹配） | `cash-runway/computes/compute-cash-runway-months.ts:60` | **D355** |
| 属性名 snake/camel 对齐（`cashBalance`≠`cash`） | 同上 + `_extinct/` | **D355** |
| 去 `_extinct/` 桥接（重写真实 compute） | `capital-health/aggregate.ts:27-29` | **D358** |
| revenue-health degraded 守卫（已正确，`:59` 已含） | `revenue-health/aggregate.ts` | 无需改 |
| manifest 阈值契约 | 所有 `manifest.json` | 冻结 |
| 改 registry 核心 / types 类型定义 | `src/sentinel/registry.ts`、`types.ts` | 无需改 |

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/sentinel/sentinel-threshold-alert.test.ts`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| loader 注入：`sentinelObj` 为 object → `.manifest === manifest` | `.manifest` 为 null（无注入） | 注入后非 null |
| loader 注入：`sentinelObj` 非 object（function）→ 跳过且不抛 | — | 跳过不抛 |
| cash-runway：`runwayResult.degraded=true, value=0` → 不产出 critical | 误报 critical「现金流危急」 | 返回 `[]` |
| cash-runway：`runwayResult.degraded=false, value=3`（< critical 6）→ critical | 死代码无 finding | 产出 critical |
| cash-runway：`overdueResult.degraded=true` → 不产出 ar critical | 误报 | 不产出 |
| capital-structure：`totalDebt` 缺失 → 返回 `[]` | 误报（`|| 0` 后 icr=0） | 返回 `[]` |
| capital-structure：`totalDebt=0`（字段存在且值为 0）→ 正常参与计算 | — | 正常（不误判缺失） |
| 边界：空 `financials`（无 Financial 节点）→ 返回 `[]` 不抛 | — | 返回 `[]` |
| 回归：revenue-health 现有 degraded 守卫不回归 | — | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥9 | 上述 9 用例（正常/降级/边界/回归） |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| manifest 注入方式 | A 改 check 签名传 manifest / B loader 注入 `sentinelObj.manifest` | Anthropic（配置注入不破坏既有签名，最小机制）+ 第一性原理（aggregate 已声明 `manifest: null` 待注入） | **B**——一行注入，不改 45 个哨兵的 check 签名 |
| P1-3 修复层次 | A 改 compute 的 degraded 判定 / B aggregate 字段映射前检查 | Anthropic（fail-closed：缺字段在入口拦截，不进 compute）+ 第一性原理（`|| 0` 在 aggregate 层，根因在此） | **B**——aggregate 字段映射前检查，compute 不动 |
| degraded 守卫范围 | A 只改 cash-runway / B 连带 revenue-health | grep 实测：revenue-health:59 已含 `!degraded` | **A**——只改 cash-runway，revenue-health 无需改 |

> 收敛检查：三决策点双参考系指向同一答案，无分歧。**参考：Anthropic + 第一性原理**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| loader 注入 manifest | `grep -n "\.manifest = manifest" src/sentinel/sentinel-loader.ts` 命中注入行 |
| cash-runway !degraded 守卫 | `grep -n "!runwayResult.degraded\|!overdueResult.degraded" extensions/sentinels/cash-runway/aggregate.ts` 命中 3 处 |
| capital-* 完整性检查 | `grep -n "missing\|=== undefined" extensions/sentinels/_extinct/capital-structure/aggregate.ts` 命中 |
| 生产调用点 | `grep -rn "registerLoadedSentinels" src/ --include="*.ts" | grep -v "\.test\."` 命中 **2 处**（file-driven-loaders.ts:73 + bootstrap.ts:376） |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/sentinel/sentinel-threshold-alert.test.ts` 全过（≥9 用例；red 已证）
2. DS2: loader 注入生效——`sentinelObj.manifest === manifest`（grep `.manifest = manifest` 命中）
3. DS3: cash-runway `:30/:38/:45` 三处 `!degraded` 守卫齐全（grep 命中 3 处）
4. DS4: capital-structure 缺字段检查——`totalDebt` 缺失 → 返回 `[]`（grep `=== undefined` 命中）
5. DS5: capital-turnover 缺字段检查——`revenue`/`totalAssets` 缺失 → 返回 `[]`
6. DS6: capital-efficiency 缺字段检查——`revenue`/`totalDebt`/`equity` 缺失 → 返回 `[]`
7. DS7: 接线——`registerLoadedSentinels` 真实调用方 2 处（file-driven-loaders.ts:73 + bootstrap.ts:376）grep 命中，非测试调用
8. DS8: `as any` = 0（铁律 38）+ `tsc --noEmit` 零新增错误
9. DS9: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
10. DS10: 推送 + CI 验证——`git log origin/<branch>..HEAD` 为空 + CI 任务相关 job 逐 job 绿（预存 npm audit/Architecture 单独标注）
11. DS11: 完成报告含**决策记录**（§4.5 三个决策点参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10）。

## 7. 自检清单

- [x] K3 全链路审计 P0-1/P1-1/P1-3 现场核实（sentinel-loader 无 `.manifest =` 赋值、cash-runway 缺 !degraded、capital-* `|| 0`）
- [x] compute 数据接口核实（computeInterestCoverage/computeDebtEquityRatio 的 degraded 判定只查空 financials）
- [x] **真实调用方枚举**（2 处：file-driven-loaders.ts:73 + bootstrap.ts:376）——初稿误写 synova-agent.ts，已改正
- [x] 测试优先：9 用例 red 设计（§4 表，含 K3 复现指纹 degraded value=0 误报）
- [x] 决策参考已记录（§4.5，S-12）：三决策点双参考系收敛
- [x] DS 与 dev doc 一一对应（DS1-DS11，S-10）；无 phantom 声称（S-11）
- [x] 写集表 `### 3.1 写集 (5 修改 + 1 新建)` 格式符合 devdoc_writeset.py 契约
- [x] 不是凭记忆（grep/read 实测）；不用 --no-verify
