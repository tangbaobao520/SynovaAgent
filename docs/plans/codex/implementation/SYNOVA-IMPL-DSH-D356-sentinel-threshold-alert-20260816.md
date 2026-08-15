---
north-star:
  服务用户: 企业主（哨兵发现现金流/营收等越阈异常时收到告警）+ FDE（部署后企业主自主看信号）
  服务场景: 哨兵定时巡检跑通后，现金流/营收指标越过 manifest 阈值时，真正触发告警工单；数据不完整时诚实降级、不误报"现金流危急"
  模块终态: 哨兵阈值告警端到端可用——loader 挂 manifest → aggregate 阈值判断 → degraded 拦截 → 有数据正确告警、无数据不误报（产品线 07 持续监测 + 08 告警推送验收点 7-2/7-4 转绿）
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检：发现异常→对比基线→信号路由给专家→严重信号自动建工单」+ §六 P0「哨兵真实数据流」
  完成标准: 入口 registerLoadedSentinels() 注册 → 处理 loader 挂 manifest + aggregate 拦截 degraded → 结果（a）挂 manifest 后 this.manifest 非空、（b）degraded value=0 不产生 critical finding、（c）capital-health 缺字段不产出误报
  当前进度: 阈值告警生产死代码（manifest 从不挂载），degraded 穿过阈值门控误报 critical，capital-health 缺字段默认为 0 误报——三者均已 K3 全链路审计物理证明（报告 AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md L61/L64/L160-162）
---

# SYNOVA-IMPL-DSH-D356 — P0 哨兵阈值告警接线 + 降级误报修复

> DSH 线 dev doc（📋 synova-devdoc 产出）| 哨兵切片（DSH 编码线领地）| 2026-08-16
> 实现角色：🛠 synova-dsh | 审计：K3（红线无豁免）

## 1. Authority Doc Verification

| 依据 | 出处 |
|------|------|
| 铁律 0-2 接线验收（WIRE CHECK 硬门禁） | CLAUDE.md / AGENTS.md |
| 铁律 11/24/31 降级信号（静默降级禁止 + degraded 传播） | CLAUDE.md §三 |
| 铁律 47/48 契约优先 + 测试非空壳 | CLAUDE.md §七 |
| K3 全链路审计 P0-1 / P1-1 / P1-3 | `docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md` L61/L64/L160-162/L181 |
| 派活登记（dev-doc 线认领） | `docs/synova/DASHBOARD-CN.md` L332；`docs/synova/coordination/TASK-ROUTING.md` §四 |
| 分工 v4（哨兵切片归 DSH） | `docs/synova/coordination/dsh-division-draft/DIVISION-CHARTER-v4.md` §1.1 |

## 2. Problem Statement

K3 全链路审计（2026-08-13）物理证明：资本循环三个循环中缺陷最深，哨兵阈值告警在生产形态下**恒空转**——`sentinel-loader.ts` 注册时从不给 aggregate 挂 manifest，导致 `cash-runway`/`revenue-health` 的 `if (this.manifest)` 恒 false，阈值 finding 永不触发（死代码）。假设挂上 manifest，无数据时 compute 返回 `degraded: true, value: 0`，`0 <= critical 6` 穿过阈值门控 → **误报 critical「现金流危急—跑道0.0个月」**。同时 `capital-health` 桥接的 `_extinct/` 子哨兵对缺失字段 `|| 0` 静默默认 → 部分数据产出误报 critical（利息覆盖 0.0x）。

一句话：**哨兵阈值告警两种形态（不挂 manifest = 死代码；挂了 = 误报）都不可用**，需同时修复三处，使告警既真实接线、又诚实降级。

## 3. Q0-Q4

### Q0 — 项目拼图 + 文件审计

**a) 项目拼图**：本任务在 L3 洞察层（哨兵体系），属 DSH 编码线领地（`src/sentinel/` + `extensions/sentinels/`）。是 K3 全链路审计 P0 缺陷的直接修复，服务产品线 07 持续监测（验收点 7-2「哨兵全量注册无死代码」、7-4「异常自动告警」）。

**b) 文件审计**（grep/read 验证，非凭记忆）：
- `src/sentinel/sentinel-loader.ts:170-210` — `registry.register()` 从不给 `sentinelObj` 挂 manifest（全仓 grep 无 `.manifest =` 赋值）
- `extensions/sentinels/cash-runway/aggregate.ts:14` `manifest: null` + `:28` `if (this.manifest)` + `:30/38/45` 阈值判断缺 `!degraded` 守卫
- `extensions/sentinels/revenue-health/aggregate.ts:11` `manifest: null` + `:50` `if (this.manifest)`（`:59/61` 已含 `!growthResult.degraded`，是好样本）
- `extensions/sentinels/_extinct/capital-structure/aggregate.ts:24-29`、`capital-turnover/aggregate.ts:18`、`capital-efficiency/aggregate.ts:40-45` — 字段映射 `|| 0` 静默默认缺失字段
- `extensions/sentinels/capital-health/aggregate.ts:27-29` — 动态 import 上述三 `_extinct/` 子哨兵

**c) 决策**：已有 coverage 无复用可能（这是缺陷修复，非新增能力）。三处修复均在本模块内，无需新建目录。收敛。

### Q1 — 调研 / 决策链

**a) 业界最佳实践**：哨兵/监控系统对"阈值告警"的标准做法是**配置注入 + 三态降级**——配置（manifest）由加载器注入运行时对象，检查结果区分 pass / degraded / fail（对应 M1 fail-open 教训：`检查未执行 ≠ 检查通过`，`数据不足 ≠ 数值为 0`）。

**b) 顶级团队怎么做（Anthropic 基线）**：`this.manifest` 由注册侧注入，aggregate 不自行构造 manifest（避免配置源分裂）；degraded 结果不得穿过阈值门控（`!result.degraded` 守卫在阈值判断前），与 `revenue-health/aggregate.ts:59` 现有写法一致——本仓库内已有正确样本可对齐。

**c) memory/ 教训**：M1 fail-open（D328 P1-1）、M3 机制建成未接线（D329 P2-2）、铁律 11 静默降级禁止、铁律 31 降级信号传播。**本任务正是 M1+M3 的复合实例**：manifest 挂了却没接线（M3），degraded 穿过门控（M1）。

**决策参考系**：参考 Anthropic（配置注入 + 三态降级）+ 第一性原理（缺失字段 ≠ 0，数据不足 ≠ 危险）。结论：loader 注入 manifest；aggregate 阈值判断前加 `!degraded` 守卫；capital-health 字段缺失标记 degraded 而非默认 0。收敛，直接执行。

### Q2 — 范围（正确的最简方案）

**做什么**（每文件一行）：
- `src/sentinel/sentinel-loader.ts` — 注册前给 `sentinelObj` 注入 `manifest`（P0-1）
- `extensions/sentinels/cash-runway/aggregate.ts` — 阈值判断前加 `!degraded` 守卫（P1-1）
- `extensions/sentinels/_extinct/capital-structure/aggregate.ts` — 缺字段不默认为 0（P1-3）
- `extensions/sentinels/_extinct/capital-turnover/aggregate.ts` — 缺字段不默认为 0（P1-3）
- `extensions/sentinels/_extinct/capital-efficiency/aggregate.ts` — 缺字段不默认为 0（P1-3）
- `tests/sentinel/sentinel-threshold-alert.test.ts` — 三路径测试（新建）

**不做什么**（含文件路径，均属其他 D#）：
- 不改 `extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts` 的 filter bug（`{ [input.teamId]: input.teamId }`）—— 归 D355
- 不改 `cashBalance`↔`cash` 属性名对齐 —— 归 D355
- 不改 `revenue-health/aggregate.ts` 的 degraded 守卫（已正确）—— 仅 loader 挂 manifest 使其生效
- 不改 `extensions/sentinels/capital-health/aggregate.ts` 的 `_extinct/` 动态 import 桥接 —— 归 D358
- 不改任何 manifest.json（阈值契约冻结）
- 不改 `src/sentinel/registry.ts`、`src/sentinel/types.ts`

### Q3 — 验收（入口 → 交互 → 结果）

- **入口**：`registerLoadedSentinels()` 被调用（`src/agent/synova-agent.ts` 启动链）
- **处理**：loader 给每个 aggregate 注入 manifest；aggregate 阈值判断前拦截 degraded；capital-health 子哨兵缺字段标记 degraded
- **结果**：①挂 manifest 后 `cashRunwaySentinel.manifest` 非 null；②degraded value=0 不产生 critical finding；③capital-health 缺字段时返回空/degraded，不产出误报 critical

### Q4 — 契约与测试

**契约**（铁律 47，写代码前定义）：
```
@loader 注入契约
  @input  — sentinelObj（已通过 check 方法校验的对象）+ manifest（SentinelManifest）
  @output — sentinelObj.manifest = manifest（类型安全注入，非 as any）
  @degraded — sentinelObj 非 object/null 时跳过注入并 log.warn（不阻断注册）

@cash-runway 阈值契约
  @input  — runwayResult.degraded / overdueResult.degraded
  @output — degraded=true 时【不】产生任何阈值 finding；degraded=false 时正常判阈
  @error  — catch 已有 log.error + degraded finding（铁律 24）

@capital-* 字段契约
  @input  — Financial 节点 props
  @output — 关键字段缺失（undefined/null）→ 标记 degraded，返回 []（不产出 finding）
  @error  — 区分「字段缺失」（degraded，不告警）与「字段值为 0」（合法值，参与计算）
```

**测试三路径**（铁律 48，red→green）：
1. 正常路径：挂 manifest 后，越阈数据（runwayMonths=3 < critical 6）→ 产出 critical finding
2. 降级路径：degraded value=0 → 不产出 critical finding（这是本任务 P1-1 的核心 red 用例）
3. 边界条件：capital-health 缺字段 → 返回 []；字段值=0（合法）→ 正常参与计算

## 4. Current State（grep/read 验证）

| 文件:行 | 现状 | 问题 |
|---------|------|------|
| `sentinel-loader.ts:170-210` | `registry.register({config: {...}, async check() {...}})` | check 闭包调 `sentinelObj.check(store, teamId, traversal)`，从不给 sentinelObj 挂 manifest |
| `cash-runway/aggregate.ts:14` | `manifest: null as SentinelManifest \| null` | 靠外部注入，但无注入方 |
| `cash-runway/aggregate.ts:28` | `if (this.manifest)` | 恒 false → 阈值 finding 死代码 |
| `cash-runway/aggregate.ts:30` | `if (runwayMonths <= t.cash_runway_months.critical)` | 缺 `!runwayResult.degraded`，degraded value=0 误报 |
| `revenue-health/aggregate.ts:11,50` | 同 cash-runway 的 manifest 死代码 | 同 P0-1（`:59` degraded 守卫已正确） |
| `_extinct/capital-structure/aggregate.ts:24-29` | `Number(n.props.totalDebt) \|\| 0` 等 | 缺字段静默默认 0 → 误报 |
| `_extinct/capital-turnover/aggregate.ts:18` | `Number(n.props.revenue) \|\| 0` 等 | 同上 |
| `_extinct/capital-efficiency/aggregate.ts:40-45` | `Number(n.props.revenue) \|\| ... \|\| 0` 等 | 同上（`:51` 已有 revenue===0 守卫，但非 revenue 字段仍漏） |

## 5. What We Build（产出物 + 路径）

1. **`src/sentinel/sentinel-loader.ts`**（改）：`registerLoadedSentinels()` 中，`sentinelObj` 通过 check 校验后、`registry.register()` 前，注入 `manifest`：
   ```ts
   // P0-1：注入 manifest 供 aggregate 阈值判断（M3 接线修复）
   if (typeof sentinelObj === 'object' && sentinelObj !== null) {
     (sentinelObj as { manifest?: SentinelManifest }).manifest = manifest;
   }
   ```
   类型安全（内联类型，非 `as any`，铁律 38）。

2. **`extensions/sentinels/cash-runway/aggregate.ts`**（改）：`:30`、`:38`、`:45` 三处阈值判断加 `!degraded` 守卫（对齐 `revenue-health:59` 已有写法）。

3. **`extensions/sentinels/_extinct/capital-structure/aggregate.ts`**（改）：字段映射后加关键字段完整性检查，缺失 → `log.warn` + `return []`。

4. **`extensions/sentinels/_extinct/capital-turnover/aggregate.ts`**（改）：同上。

5. **`extensions/sentinels/_extinct/capital-efficiency/aggregate.ts`**（改）：同上。

6. **`tests/sentinel/sentinel-threshold-alert.test.ts`**（新建）：三路径测试（正常越阈告警 / degraded 不误报 / 缺字段不产出）。

## 6. What We Don't Do（明确排除 + 文件路径）

| 排除项 | 文件 | 归属 |
|--------|------|------|
| compute filter bug（`{ [teamId]: teamId }` 永不匹配） | `extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts:60` | **D355** |
| 属性名 snake/camel 对齐（`cashBalance`≠`cash`） | 同上 + `_extinct/` | **D355** |
| 去 `_extinct/` 桥接（重写真实 compute） | `extensions/sentinels/capital-health/aggregate.ts:27-29` | **D358** |
| revenue-health degraded 守卫（已正确） | `extensions/sentinels/revenue-health/aggregate.ts:59` | 无需改 |
| manifest 阈值契约 | 所有 `manifest.json` | 冻结 |

## 7. Test Requirements

### L1 单元契约
- loader 注入：`sentinelObj` 为 object 时 `.manifest === manifest`；非 object 时跳过且不抛。
- cash-runway：`runwayResult.degraded=true, value=0` → 返回 `[]`（无 critical）；`degraded=false, value=3` → 产出 critical。
- capital-*：缺 `totalDebt` → 返回 `[]`；`totalDebt=0`（字段存在且值为 0）→ 正常参与计算。

### L2a 接线
- `registerLoadedSentinels()` 生产调用点真实传递（`src/agent/synova-agent.ts` 启动链），非测试调用。

### L2b 降级
- 每个 catch 有 `log.warn/error` + degraded 信号（铁律 24/31）；缺字段走 degraded 而非静默默认 0。

### L2c 边界
- `sentinelObj` 为 function/class 实例（非 plain object）→ 注入仍安全。
- 空 `financials`（无 Financial 节点）→ 返回 `[]`，不抛。

## 8. Wiring Verification

- **新 export**：本任务不新增 export，只改现有 `cashRunwaySentinel`/`capitalStructureSentinel`/`capitalTurnoverSentinel`/`capitalEfficiencySentinel` 的内部逻辑 + loader 注入。
- **生产调用点**：`registerLoadedSentinels()` 的调用链 = `src/agent/synova-agent.ts` 启动时 → `SentinelRunner`（grep `registerLoadedSentinels` 确认非测试调用方）。
- **验收 grep**：`grep -rn "registerLoadedSentinels" src/` 必须命中 `src/agent/` 下生产调用方（测试调用不计）。

## 9. Architecture Layer

**L3 洞察层**（哨兵体系）。`sentinel-loader.ts` 与 `extensions/sentinels/` 均在 L3，消费 L4 本体数据（GraphStoreReader），产出 Signal/Finding 给 L2。本任务不跨层、不引入新层。

## 10. Completion Standard（可验证）

```bash
# DS1: manifest 注入生效（P0-1）
grep -n "\.manifest = manifest" src/sentinel/sentinel-loader.ts          # 命中注入行
# DS2: cash-runway degraded 守卫齐全（P1-1）
grep -n "!runwayResult.degraded\|!overdueResult.degraded" extensions/sentinels/cash-runway/aggregate.ts  # 命中 3 处
# DS3: capital-* 缺字段不默认 0（P1-3）
grep -n "missing\|degraded" extensions/sentinels/_extinct/capital-structure/aggregate.ts  # 命中完整性检查
# DS4: 三路径测试全绿（vitest）
npx vitest run tests/sentinel/sentinel-threshold-alert.test.ts          # exit 0
# DS5: 接线（生产调用点真实传递）
grep -rn "registerLoadedSentinels" src/ | grep -v "\.test\."           # 命中生产调用方
```

## 11. Auth Doc References

- `docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md`（L37/L61/L64/L140-142/L160-162/L181/L207）
- `docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md`（M1/M3 模式、D356 派活）
- `docs/synova/coordination/TASK-ROUTING.md` §一（哨兵切片 = DSH）
- `docs/synova/coordination/dsh-division-draft/DIVISION-CHARTER-v4.md` §1.1
- `.claude/PRODUCT-BRIEF.md` §三.2 / §六 P0
- `docs/synova/DASHBOARD-CN.md` L332/L365（D356 派活 + 产品线映射）
- `src/sentinel/sentinel-loader.ts` / `extensions/sentinels/cash-runway/aggregate.ts` / `_extinct/capital-*/aggregate.ts`（现状实证）
