---
north-star:
  服务用户: 创始人（每次 push 前机器确认"上次修好的能力没被改坏"）+ FDE/实现线（改 compute 阈值/契约时立即被门禁拦截，不用等下次 K3 审计才发现断裂）
  服务场景: D355-D360 修好了 L4 契约/哨兵阈值/filter bug，但这些"一次性转绿"没有重跑门禁——任何人下次改坏一个 compute 阈值，要等 K3 审计才暴露。本模块把每个修复固化为"冻结快照 + 每次 push 重跑"的机器断言
  模块终态: golden-case 门禁从"自洽的 F1 评分"升级为"真跑 compute/哨兵/专家报告、diff 冻结快照"的三层回归——故意改坏任一 compute 阈值 → 门禁红 → 修复 → 绿（红-绿演练机器可复现）
  对齐北星: PRODUCT-BRIEF.md §八「Loop Engineering 需要成为什么」——当前门禁只查语法/安全/接线/架构，不查产品对齐；本模块补上"产品对齐的机器验证"（黄金案例 = 修复断裂场景的最小数据副本）
  完成标准: 入口 `npx tsx scripts/ci/golden-case-checker.ts`（pre-push 已接线）→ 处理 F1 门禁（不变）+ compute 快照 diff + findings 快照 diff + 专家报告结构断言 → 结果：改坏 compute 阈值 → exit 1 红，恢复 → exit 0 绿
  当前进度: golden-case-checker.ts（D51/D300）已接线 pre-push + CI，但 `deriveActual`（L160-193）从 fixture 的 INPUT 反推"实际"，从不调用真实 compute/诊断代码 → 门禁自洽、永远绿、抓不住任何 compute 回归（K3 咨询 §4.3 判定：必须"真跑"才能防"下次又改坏"）
---

<!--
  SYNOVA-IMPL-DSH-D396: golden 用例固化回归门禁（D355-D360 修复固化 + 快照分层）
  状态: dev doc | 2026-08-16 | 优先级 P0 同批（K3 战略咨询 §4.3 提前）
  权威文档: K3 战略咨询 2026-08-16-D394-D398-strategy-consult.md §4.3（神/形似神不似/验收锚点，锚点已落 task-state/D396.json + 台账 §五 2026-08-16 行）+ AGENTS.md 铁律 35/36/47/48 + FOUNDER-OPERATING-MODE.md §二 组件1
  依赖: D355-D360 修复为黄金用例的"冻结对象"（本任务只加测试+CI 数据+扩展 checker，不碰 src/ 业务逻辑）
  并行: 无（独占 scripts/ci/golden-case-checker.ts + tests/fixtures/golden-cases/ 写集；与 D394/D395/D402 写集零重叠，见 §3.3）
-->

# SYNOVA-IMPL-DSH-D396: golden 用例固化回归门禁（D355-D360 修复固化 + 快照分层）

> 一句话问题: 现有 golden-case 门禁是**自洽的假门禁**——`deriveActual()` 从 fixture 的 `input.sentinelFindings` 反推"实际诊断结果"，再和同 fixture 的 `expected` 比 F1，**从不调用真实的 compute 函数/哨兵聚合/专家报告**。结果是：任何 compute 阈值改坏、L4 契约断裂、哨兵误报，门禁照样绿（因为 fixture 的 input 和 expected 都是同一个人写的静态数据）。K3 咨询 §4.3 判定：D355-D360 修好的一旦再被改坏，要等下次审计才暴露——必须把"一次性转绿"固化为"每次 push 真跑 compute 的机器门禁"。

## 1. 权威文档引用

**来源**: [K3 战略咨询](docs/synova/audit-reports/2026-08-16-D394-D398-strategy-consult.md)（§4.3，锚点已落 [task-state/D396.json](task-state/D396.json)）

> 提前到 P0 同批（2-3 天）——每个 D355-D360 修复带一条黄金用例，扩展既有 golden-case-checker（**不做新体系**）；防"下次又改坏"。**神（invariant）= 可复现**：同一份企业数据副本 + 同一版本代码 → 诊断输出（findings 集合 + 报告结构）逐字节一致；模型非确定性部分用结构化断言（finding 的 id/severity/标题模式），不对 LLM 原文做全文 diff。**红-绿演练必须跑一次证明门禁真能红**。快照分层：compute 全 diff / findings 全 diff / 专家报告结构化断言。扩用例不碰 src/ 业务逻辑；golden-case-checker.ts 变更当次需人工确认门禁行为无变化（只扩用例不改判定）。

**来源**: [FOUNDER-OPERATING-MODE.md](docs/synova/coordination/FOUNDER-OPERATING-MODE.md)（§二 组件1 + §二 组件4）

> 黄金场景集（GSS）：把"用户能看见的完整旅程"固化为**可运行、可断言、可出证据**的脚本……场景断言必须是机器判定（exit 0/1），禁止"人工看看差不多"。K3 审计升级为"真值复核"。

**来源**: [AGENTS.md 铁律](AGENTS.md)（35 自动化优先 / 36 vitest 全量 / 47 契约优先 / 48 测试非空壳）

> 铁律 35: 能变 tsc/oxlint/规则的不靠文档，能写 check-*.sh 的不靠 review。铁律 48: 测试必须有 expect() 断言；空壳测试 → commit 阻断。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 缺陷 A（P0）: `deriveActual` 从 fixture INPUT 反推，不调用真实 compute

[golden-case-checker.ts L160-193](scripts/ci/golden-case-checker.ts:160) — `deriveActual(caseData)` 的"实际结果"来自 `caseData.input.sentinelFindings` 的聚合，**从不 import/调用任何 compute 函数**：

```ts
export function deriveActual(caseData: GoldenCase): { rootCauseEdgeIds: string[]; severity: string; matchedEdgeIds: string[] } {
  const findings = caseData.input.sentinelFindings;
  const allMatchedEdges = [...new Set(findings.flatMap((f) => f.matchedEdgeIds))];
  // ... severity 取 findings 最高级别; rootCause 取 critical findings 的边
  return { rootCauseEdgeIds, severity, matchedEdgeIds: allMatchedEdges };
}
```

主流程 [L230-237](scripts/ci/golden-case-checker.ts:230)：`deriveActual(caseData)` → `computeF1Score(actual, caseData.expected)` → 判定。**整条链路无一处调用真实代码**——fixture 的 `input.sentinelFindings`（期望边/severity）与 `expected`（根因边/节点/severity）是同一静态文件的两半，F1 恒 100% 是设计使然，不是真验证。

### 2.2 缺陷 B（P0）: 门禁抓不住"改坏 compute 阈值"（红-绿演练不可行）

验收锚点要求"故意改坏一个 compute 阈值 → 门禁红"。实测：compute 阈值在 [extensions/sentinels/financing-constraint/computes/cash-runway.ts L51-57](extensions/sentinels/financing-constraint/computes/cash-runway.ts:51)（`runwayMonths < 6 → critical`），golden-case-checker.ts 从不 import 该函数 → 改坏阈值（如 `< 6` 改成 `< 60`）门禁**仍绿**。这是 K3 咨询 §4.3 点名的"形似神不似"——门禁看起来在跑，实际测的是静态 JSON 自洽性。

### 2.3 现状接线（真实调用方，grep 实测）

| 调用方 | 位置 | 说明 |
|--------|------|------|
| pre-push-check.sh | L221 | `npx tsx scripts/ci/golden-case-checker.ts` → 非零即阻断 |
| .github/workflows/ci.yml | L120-130 | CI job `golden-case` 同命令 |

fixtures 现状（10 条，[tests/fixtures/golden-cases/](tests/fixtures/golden-cases/)）：`golden-case-01`~`golden-case-10`，格式 = `{input: {sentinelFindings, graphEdges}, expected: {rootCauseEdgeIds, rootCauseNodeTypes, severity, matchedEdgeIds}}`，**均无 compute 快照字段**。

## 3. 实现方案

### 3.1 写集 (1 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/ci/golden-case-checker.ts](scripts/ci/golden-case-checker.ts) | 修改 | 新增**快照层**（不改 `computeF1Score`/`deriveActual` 判定逻辑）：① `computeFnRegistry`（compute 函数名 → 真实函数映射）；② `runComputeSnapshot(caseData)` 导出函数；③ `runAllChecks()` 追加 compute/findings/专家报告三层 diff 阶段 |
| [scripts/ci/golden-snapshot-runner.ts](scripts/ci/golden-snapshot-runner.ts) | 新建 | 快照执行器：import 真实 compute/哨兵 aggregate 函数，按 fixture `compute` 段执行 + 结构化 diff（纯函数，可单测） |
| [tests/fixtures/golden-cases/golden-case-11-cash-runway-threshold.json](tests/fixtures/golden-cases/golden-case-11-cash-runway-threshold.json) | 新建 | 示范黄金用例（D356 修复对象 cash-runway 阈值的最小数据副本 + 冻结 compute 快照） |
| [tests/ci/golden-case-checker.test.ts](tests/ci/golden-case-checker.test.ts) | 新建 | 快照层测试（≥10 用例，含"故意改坏 → 红 → 恢复 → 绿"红-绿演练用例，见 §4） |

> 说明：黄金用例 fixtures 随每个 D355-D360 修复同 PR **增量添加**（每修复一条）；本 spec 固化契约 + 示范 1 条（cash-runway 阈值，D356 对象）。写集表列示范条目，其余按同契约新增。

### 3.2 修复模式

**compute 快照契约（fixture 新增 `compute` 段，向后兼容——无 `compute` 段的旧 10 条只跑 F1 门禁）**:

```jsonc
{
  "id": "golden-case-11-cash-runway-threshold",
  "title": "现金流阈值告警（D356 修复对象）",
  "frozenAt": "2026-08-16T00:00:00Z",
  "compute": {
    "function": "computeCashRunway",
    "input": [{ "cash": 100000, "operatingExpense": 30000 }],
    "snapshot": { "runwayMonths": 3.3, "monthlyBurn": 30000, "signal": "critical", "degraded": false, "warnings": [] }
  }
}
```

**computeFnRegistry（函数名 → 真实函数，`golden-snapshot-runner.ts` 内）**:

```ts
// 契约: registry 只映射"纯 compute 函数"，输入/输出由 fixture compute.input/snapshot 定义
export const computeFnRegistry: Record<string, (input: unknown) => unknown> = {
  computeCashRunway: (input) => {
    const { computeCashRunway } = require('../../extensions/sentinels/financing-constraint/computes/cash-runway');
    return computeCashRunway(input as Array<{ cash: number; operatingExpense: number }>);
  },
  // D355-D360 其余修复对象（cash-runway aggregate / capital-* fail-closed / L4 契约）按同契约增量登记
};
```

**三层 diff 判定（`runAllChecks()` 追加阶段，F1 门禁保持原逻辑不变）**:

```
对每个 fixture:
  1. F1 门禁（原逻辑，不变）: deriveActual + computeF1Score
  2. compute 全 diff（新增）: 若 fixture.compute 存在 → runComputeSnapshot → 输出 vs 冻结 snapshot 逐字段 deep-equal；不匹配 → ❌ 打印 diff
  3. findings 全 diff（新增）: 若 fixture.findings 存在 → 跑对应哨兵 aggregate → findings 列表 vs 冻结快照（id/severity/title 集合 diff）
  4. 专家报告结构断言（新增）: 若 fixture.expertReport 存在 → 断言结构（expert 非空 / summary 非空 / confidence ∈ [0,1] / checkedAt 合法），不做全量内容 diff
```

### 3.3 不做的事

| 不做 | 文件 | 归属 |
|------|------|------|
| 改 F1 判定逻辑（`computeF1Score`/`deriveActual`） | `scripts/ci/golden-case-checker.ts` | K3 明令"只扩用例不改判定" |
| 新建独立门禁体系（另起 runner/CI job） | — | K3"不做新体系"，扩既有 checker |
| 改 src/ 业务逻辑（compute 阈值/契约/filter） | `src/**`、`extensions/sentinels/**` | 归 D355-D360 实现线（Win Claude） |
| 全诊断管线端到端跑（起服务/喂真实数据） | `scripts/golden-scenarios/GS-*` | 归 GSS 场景脚本（D361+），本任务只测 compute 纯函数快照 |
| 改 manifest.json 阈值契约 | `extensions/sentinels/*/manifest.json` | 冻结（D356 已定） |
| 改 pre-push-check.sh / ci.yml 接线 | `scripts/pre-push-check.sh`、`.github/workflows/ci.yml` | 接线已存在（L221 / L120-130），无需改 |

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/ci/golden-case-checker.test.ts`，用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| `runComputeSnapshot` 对合法 compute fixture → 返回 `{passed:true}` | 函数不存在 | passed:true |
| **红-绿演练**：临时改 `cash-runway.ts` 阈值 `<6`→`<60` → `runComputeSnapshot` 返回 `{passed:false}` + diff 点名 `signal` | 改坏后门禁仍绿（deriveActual 不碰 compute） | passed:false + diff |
| **红-绿演练恢复**：阈值改回 `<6` → `passed:true` | — | passed:true |
| compute 快照字段缺失（fixture.compute 无 snapshot）→ degraded 显式（不静默 pass） | 无实现 | `{passed:false, degraded:true}` + stderr |
| `computeFnRegistry` 未登记的 function 名 → 显式失败（不静默 skip） | 无实现 | `{passed:false}` + "未登记" |
| findings 快照：改坏哨兵 aggregate → findings 集合 diff 命中 | 无实现 | diff 命中 missing/extra finding |
| 专家报告结构断言：`confidence` 越界（>1）→ 断言失败 | 无实现 | 断言失败 |
| 旧 10 条 fixture（无 compute 段）→ 只跑 F1 门禁不报错（向后兼容） | — | 全绿 |
| 回归：`computeF1Score`/`deriveActual` 输出与现状一致（判定逻辑未变） | — | 全绿 |
| 回归：pre-push 调 `npx tsx scripts/ci/golden-case-checker.ts` 在"改坏阈值"下 exit 1、恢复下 exit 0 | — | exit 1 / exit 0 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥10 | 上述 10 用例（正常/降级/边界/红-绿/回归） |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 快照层实现位置 | A 塞进 golden-case-checker.ts / B 独立 golden-snapshot-runner.ts + checker 调用 | Anthropic（隔离：执行器纯函数可单测）+ DeepSeek（最少机制：checker 只编排不改判定） | **B**——执行器独立，checker 追加阶段不改 F1 判定 |
| 快照对象 | A 全诊断管线端到端（起服务喂真实数据）/ B 直接 import compute 纯函数 + fixture 数据 | 第一性原理（D355-D360 修的是 compute 纯函数/aggregate，不是整条 HTTP 管线）+ 铁律 12（集成测试 cover 真实路由，但 compute 是纯函数不涉路由） | **B**——compute 纯函数直接测，端到端归 GSS 场景脚本（D361+） |
| 红-绿演练形态 | A 人工演练记录 / B 测试文件内置"改坏→红→恢复→绿"用例 | 铁律 35（机器可验，不靠 review）+ K3 验收锚点"红-绿演练必须跑一次" | **B**——测试用例机器复现，K3 可独立重跑 |
| 专家报告断言 | A 全内容 diff / B 结构化断言（字段存在性+值域） | K3 验收锚点原文"专家报告**结构化**断言" | **B**——结构断言，不做脆弱的全量 diff |

> 收敛检查：四决策点两参考系均指向同一答案（隔离执行器 + 直接测 compute + 机器红绿 + 结构断言），无分歧。**参考：Anthropic + DeepSeek + 第一性原理**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| `runComputeSnapshot` 被 checker 主流程调用 | `grep -n "runComputeSnapshot" scripts/ci/golden-case-checker.ts` 命中调用点（非仅定义） |
| `computeFnRegistry` 登记 D356 对象 `computeCashRunway` | `grep -n "computeCashRunway" scripts/ci/golden-snapshot-runner.ts` 命中映射 |
| golden-snapshot-runner 被 checker import | `grep -n "golden-snapshot-runner" scripts/ci/golden-case-checker.ts` 命中 import |
| 生产调用点（pre-push/CI） | `grep -rn "golden-case-checker.ts" scripts/pre-push-check.sh .github/workflows/ci.yml` 命中 **2 处**（pre-push-check.sh:221 + ci.yml:130，grep 实测） |
| 新 compute 快照 fixture 被 checker 扫描 | `npx tsx scripts/ci/golden-case-checker.ts` 输出含 `golden-case-11-cash-runway-threshold` 结果行 |
| 红-绿演练物理证明 | 临时改 `extensions/sentinels/financing-constraint/computes/cash-runway.ts` 阈值 → `npx tsx scripts/ci/golden-case-checker.ts` exit 1；恢复 → exit 0（测试用例断言，非人工目测） |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/ci/golden-case-checker.test.ts` 全过（≥10 用例；red 已证——改坏阈值时该测试在修复前红）
2. DS2: `golden-snapshot-runner.ts` 登记 `computeCashRunway` 真实函数映射（import 自 `extensions/sentinels/financing-constraint/computes/cash-runway.ts`，非复制重写）
3. DS3: `runComputeSnapshot` 对合法 compute fixture → `{passed:true}`；改坏阈值 → `{passed:false}` + diff 点名 `signal`（红-绿演练机器复现）
4. DS4: 快照分层三态齐备——compute 全 diff / findings 全 diff / 专家报告结构断言（字段存在性 + confidence ∈ [0,1]）
5. DS5: 向后兼容——旧 10 条 fixture（无 compute 段）只跑 F1 门禁，`npx tsx scripts/ci/golden-case-checker.ts` 全绿不报错
6. DS6: `computeF1Score`/`deriveActual` 判定逻辑不变（K3"只扩用例不改判定"）——回归测试证明输出与现状一致
7. DS7: 生产接线——checker 主流程真实调用 `runComputeSnapshot`（grep 命中，非仅 import）
8. DS8: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
9. DS9: 推送 + CI 验证：`git log origin/<branch>..HEAD` 为空 + CI `golden-case` job 逐 job 绿（预存 npm audit/Architecture 单独标注）
10. DS10: 完成报告须含**决策记录**（§4.5 四决策点的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS10 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10，D331 审计教训）。

## 7. 自检清单

- [x] K3 咨询 §4.3 锚点核实（task-state/D396.json + 台账 §五 行已落；红-绿演练/快照分层/只扩用例不改判定三项锚点写进 §2/§3/§4）
- [x] `deriveActual` 自洽缺陷现场核实（golden-case-checker.ts:160-193 读 input.sentinelFindings，无 compute import）
- [x] 接线现状 grep 实测（pre-push-check.sh:221 + ci.yml:130，2 处）
- [x] compute 函数签名 read 真实定义（cash-runway.ts:18-70 `computeCashRunway(financials: Array<{cash, operatingExpense}>)`）
- [x] 红-绿演练设计为机器用例（非人工演练记录，铁律 35）
- [x] 决策参考已记录（§4.5，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-DS10，S-10）；写集表标题紧跟表头（D381 格式契约）
- [x] 不碰 src/ 业务逻辑、不改 F1 判定（K3 两条"注意"全部遵守，§3.3 显式排除）
- [x] 不是凭记忆
- [x] 不用 --no-verify
