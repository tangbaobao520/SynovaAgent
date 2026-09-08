<!--
  SYNOVA-IMPL-D650: 专家 registry 改名（cycle → 问题域）——专家架构 P1 第一件
  状态: dev doc | 2026-09-09 | 优先级 P1（权威口径对齐）
  权威文档: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章 §6.6/§6.9 + 第七章 §7.4；docs/authority/AUTHORITY-UPGRADE-NOTICE-20260906.md
  借鉴: 无（纯改名对齐新权威，非 DSH 借鉴卡）
  依赖: P0 文档批（已合并 dff18196）
  并行: 无（写集 expert/ + src/agent/ + src/l3/；与 D600 src/routes/ 零交集；与 DSH 线 src/sentinel/runner.ts 有跨线引用，见 §3.3 不做的事）
-->

# SYNOVA-IMPL-D650：专家 registry 改名（cycle → 问题域）——专家架构 P1 第一件

> 状态：dev doc | 2026-09-09 | 优先级 P1（权威口径对齐）
> 归属：Claude 线（expert/ + src/agent/ + src/l3/）
> 依赖：P0 文档批（ARCHITECTURE.md §4 已对齐三层分层，已合并 dff18196）

## 1. 权威文档引用

- **专家架构权威 第六章 §6.6 术语表**：`问题域专家 = 资金效率/客户增长/组织能力/技术底座/竞争战略`；规则「**专家名禁含 cycle；capital/customer/talent 只作资源维度/资源循环，不作专家名**」。
- **第六章 §6.9.1 迁移映射（原文）**：`capital-cycle→资金效率、customer-cycle→客户增长、talent-cycle→组织能力、tech→技术底座、finance-structure→并入资金效率、competitive-strategy→竞争战略、host→保留`；旧目录归档 `expert/_deprecated/`，新目录 `expert/{问题域}/PROMPT.md` 新建。
- **第七章 §7.4 英文名（代码落地用）**：`fundamental-efficiency（资金效率）/ customer-growth（客户增长）/ organizational-capability（组织能力）/ technology-foundation（技术底座）/ competitive-strategy（竞争战略）`。
- **AUTHORITY-UPGRADE-NOTICE-20260906.md**：专家体系以《专家架构重定义与权威口径审计-20260905》为准。

## 2. 代码审计——现状（file:line，实测）

### 2.1 迁移映射表（权威原文 → 英文目录名）

| 旧专家名 | 新问题域名 | 中文 | 处理 |
|---|---|---|---|
| `capital-cycle` | `fundamental-efficiency` | 资金效率 | 改名 |
| `customer-cycle` | `customer-growth` | 客户增长 | 改名 |
| `talent-cycle` | `organizational-capability` | 组织能力 | 改名 |
| `tech` | `technology-foundation` | 技术底座 | 改名 |
| `finance-structure` | —（并入） | 并入资金效率 | 归档 `_deprecated/` |
| `competitive-strategy` | `competitive-strategy` | 竞争战略 | 保留 |
| `host` | `host` | 主持 | 保留 |

### 2.2 现状（grep 实测，改名波及面）

- **expert 目录**：`expert/{host,capital-cycle,customer-cycle,talent-cycle,tech,finance-structure,competitive-strategy,_deprecated,_template}`（9 目录）。
- **expert-registry.yaml**：7 专家（host + capital-cycle/customer-cycle/talent-cycle/tech/finance-structure/competitive-strategy）。
- **src/agent/expert-router.ts:167-178 `selectExpert`**：`finance/cash/margin/cost/revenue/break/dol/npv → finance-structure`、`capital → capital-cycle`、`market/customer/churn/brand/channel → customer-cycle`、`competition/hhi/position/strategy/governance/risk/seven/power → competitive-strategy`、`talent/hr/people/org/culture → talent-cycle`、`tech/product/innovation/data/system/software/infra → tech`。
- **src/agent/task-decomposer.ts:82-92 `DIMENSION_EXPERT_MAP`**：`financial→finance-structure、market→customer-cycle、organizational→talent-cycle、technology→tech、strategic→competitive-strategy、operational→host、talent→talent-cycle、customer→customer-cycle、product→tech、risk→competitive-strategy`。
- **src/l3/synova-diagnosis-engine-impl.ts:538-553**：D1-D7 + dept + 恒等映射（含 `'capital-cycle': 'capital-cycle'` 等）。
- **src/sentinel/runner.ts:77-97（DSH 线）**：signal dimension → expert 名映射（`capital:['finance-structure']`、`environment:['competitive-strategy']`、`alignment:['talent-cycle']` 等）。
- **资源循环（KEEP，改名不动）**：`src/cycles/cross-scale-validator.ts:53-56` `FAST_CYCLES=['cash-cycle','customer-cycle']`、`SLOW_CYCLES=['talent-cycle','product-cycle']`（`cycleId`，非专家名）。

### 2.3 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `rg "capital-cycle|customer-cycle|talent-cycle|finance-structure|competitive-strategy" src/ tests/ packages/` → 14 文件，其中 `src/cycles/`+`tests/cycles/` 为资源循环（保留），其余为专家名（改名） |
| 施工图可借鉴清单 | 本任务为纯改名对齐权威，非 DSH 借鉴卡，无借鉴项 |
| 既有层确认 | `ExpertRegistry`（src/l3/expert-registry.ts）与 `ExpertRouter`（src/agent/expert-router.ts dispatch）均为目录名驱动、name-agnostic，不硬编码专家名——只需改 yaml + 目录 + 3 处硬编码映射 |
| 结论 | 改名对齐，非重建；关键难点是 cycle 名与专家名同串（customer-cycle/talent-cycle），必须逐处判定语境 |

## 3. 实现方案

### 3.1 写集 (4 修改 + 4 目录改名 + 1 归档 + 6 测试)
| 文件/目录 | 操作 | 说明 |
|---|---|---|
| `expert/expert-registry.yaml` | 修改 | 7 专家 → 6（host + 5 问题域）；finance-structure 条目删除，其 tools 并入 fundamental-efficiency；version 升 v3.0 |
| `expert/capital-cycle/` → `expert/fundamental-efficiency/` | 目录改名 | `git mv`，PROMPT.md/IDENTITY.md/manifest.json 内部 `name` 同步 |
| `expert/customer-cycle/` → `expert/customer-growth/` | 目录改名 | 同上 |
| `expert/talent-cycle/` → `expert/organizational-capability/` | 目录改名 | 同上 |
| `expert/tech/` → `expert/technology-foundation/` | 目录改名 | 同上 |
| `expert/finance-structure/` → `expert/_deprecated/finance-structure/` | 归档 | 内容并入 fundamental-efficiency 后再归档 |
| `src/agent/expert-router.ts` | 修改 | `selectExpert` 6 处 return 值改名（finance-structure/capital-cycle→fundamental-efficiency；customer-cycle→customer-growth；talent-cycle→organizational-capability；tech→technology-foundation；competitive-strategy 保留） |
| `src/agent/task-decomposer.ts` | 修改 | `DIMENSION_EXPERT_MAP` 十值改名 |
| `src/l3/synova-diagnosis-engine-impl.ts` | 修改 | L538-553 映射值 + 恒等映射改名 |
| `tests/agent/expert-router.test.ts` + `tests/agent/task-decomposer.test.ts` + `tests/expert/{manifest-consistency,expert-enum-propagation}.test.ts` + `tests/agent/expert-config-loader.test.ts` + `tests/electron/right-panel-report-sentinel.test.ts` | 修改 | 旧专家名断言 → 新问题域名 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（finance-structure 的 tools 合并细则、manifest 内部 name 字段、测试断言改动点），必须在此节同 commit 回填最终形态。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不改 `src/cycles/cross-scale-validator.ts` + `tests/cycles/` | `cash-cycle/customer-cycle/talent-cycle` 此处是**资源循环 cycleId**，非专家名，改名会破坏 42 边因果骨架 |
| 不改 `src/sentinel/runner.ts:77-97` | DSH 线地盘；signal→expert 映射引用了旧专家名，属**跨线引用**，登记台账交 DSH 同步（或单列跨线任务） |
| 不做「tools 对齐 compute seam」「声明式可配置」 | 属 P1 第二/三件，本卡只改 registry 名 |
| 不引 `@deepseek-ai` | 非借鉴卡，无 DSH 依赖 |

## 4. 测试要求（测试优先，red → green）

第一步改测试断言跑红（旧专家名 → 新名不匹配 → fail），第二步改代码跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/agent/expert-router.test.ts` | 单测 | ≥6 | selectExpert 关键词 → 新问题域名（finance→fundamental-efficiency、market→customer-growth、talent→organizational-capability、tech→technology-foundation、competition→competitive-strategy、fallback→host） |
| `tests/agent/task-decomposer.test.ts` | 单测 | ≥4 | DIMENSION_EXPERT_MAP 十值 → 新名、runHandlerForDimension fallback host |
| `tests/expert/manifest-consistency.test.ts` | 单测 | ≥2 | registry.yaml 专家名与 expert/ 目录一一对应、无 cycle 残留 |
| `tests/agent/expert-config-loader.test.ts` | 单测 | ≥2 | yaml 加载新 6 专家、finance-structure 不再存在 |

RED 必须覆盖失败模式（S-5）：`grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" expert/ src/agent/ src/l3/`（排除 src/cycles/）修复前非零 → 修复后零残留。

### 4.5 决策参考（S-12）

- **决策点 1（英文目录名）**：参考系 = 第七章 §7.4 已定英文名（fundamental-efficiency/customer-growth/organizational-capability/technology-foundation/competitive-strategy）——采纳，不自造。
- **决策点 2（customer-cycle/talent-cycle 歧义）**：参考系 = 第六章 §6.6「capital/customer/talent 只作资源循环」——专家名改名、资源循环 cycleId 保留，逐处判语境，禁止全局 sed。
- **决策点 3（finance-structure 合并）**：参考系 = 第六章 §6.9.1「finance-structure→并入资金效率」——tools 并入 fundamental-efficiency，目录归档 _deprecated。

## 5. 接线要求（生产调用点，S-3）

| 新 export/改名 | 调用方 | 确认方式 |
|---|---|---|
| 新专家名（fundamental-efficiency 等） | `src/l3/expert-dispatcher.ts`（runAllExperts 从 registry 动态读名）+ `src/l3/expert-registry.ts`（目录名驱动） | `grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" src/ expert/` 命中；`grep -rn "capital-cycle\|talent-cycle\|finance-structure" src/agent/ src/l3/` 零残留（src/cycles/ 除外） |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 旧专家名零残留**：`grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" src/agent/ src/l3/ expert/expert-registry.yaml` 零命中（这四个在 src/agent//src/l3//expert/ 全是专家语境；资源循环只在 src/cycles/ 保留，见 DS3）。
- **DS2 新名落地**：`grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" expert/ src/agent/ src/l3/` 命中 ≥6 处。
- **DS3 资源循环未被误改**：`grep -n "cash-cycle\|customer-cycle\|talent-cycle\|product-cycle" src/cycles/cross-scale-validator.ts` 仍命中（cycleId 保留）。
- **DS4 测试 red→green**：`npx vitest run tests/agent/expert-router.test.ts tests/agent/task-decomposer.test.ts tests/expert/manifest-consistency.test.ts tests/agent/expert-config-loader.test.ts` 先 red → green（全 pass，非空壳）。
- **DS5 零回归**：`npx vitest run tests/agent/ tests/expert/ tests/l3/` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" expert/ src/agent/expert-router.ts src/agent/task-decomposer.ts src/l3/synova-diagnosis-engine-impl.ts` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界（src/sentinel/、src/cycles/ 零改动）。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] 第六章 §6.6/§6.9 + 第七章 §7.4 英文名迁移表已读（原文引用，非凭记忆）
- [ ] expert/ 目录 + expert-registry.yaml + 3 处硬编码映射现状 grep 实证（file:line 已列）
- [ ] customer-cycle/talent-cycle 歧义已显式区分（专家名改名 vs 资源循环保留）
- [ ] src/sentinel/runner.ts 跨线引用已登记台账交 DSH（本卡不碰）
- [ ] finance-structure 并入 fundamental-efficiency（tools 合并 + 目录归档）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 旧专家名零残留 | `grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" src/agent/ src/l3/ expert/expert-registry.yaml` | 0 命中 |
| 新名落地 | `grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" expert/ src/agent/ src/l3/` | ≥6 命中 |
| 资源循环未误改 | `grep -n "cash-cycle\|customer-cycle\|talent-cycle" src/cycles/cross-scale-validator.ts` | 仍命中 |
| 测试 red→green 全绿 | `npx vitest run tests/agent/expert-router.test.ts tests/agent/task-decomposer.test.ts tests/expert/manifest-consistency.test.ts tests/agent/expert-config-loader.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/agent/expert-router.ts src/agent/task-decomposer.ts src/l3/synova-diagnosis-engine-impl.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
