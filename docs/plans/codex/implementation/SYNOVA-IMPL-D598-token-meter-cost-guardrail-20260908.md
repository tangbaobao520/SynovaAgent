<!--
  SYNOVA-IMPL-D598: token 四桶计量 + 成本护栏（DSH 借鉴卡 B-03）
  状态: dev doc | 2026-09-08 | 优先级 P1（模型底座/成本治理）
  权威文档: docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §B-03；docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章-专家架构权威定义与路线图-20260905.md §6.1/§6.2
  借鉴: DSH token-meter（读源码自研，零代码依赖，G1/G4）——packages/llm/token-meter/src/{estimate,usage-projection,surface-projection}.ts
  依赖: 无（复用 D586 错误码 / D593 重试与超时 / D588 会话投影，均为已交付设施，非前置依赖）
  并行: 无（写集 src/llm/ + src/providers/ + src/routes/diagnosis.ts；与在途 B-09~B-20 / S1-5 / S1-6 零交集；与 Mac DSH 的 src/sentinel/ 零改动，仅复用 injectManualSignal 不改其实现）
-->

# SYNOVA-IMPL-D598：token 四桶计量 + 成本护栏（DSH 借鉴卡 B-03）

> 状态：dev doc | 2026-09-08 | 优先级 P1（模型底座/成本治理）
> 归属：Claude 线（src/llm/ + src/providers/ + src/routes/diagnosis.ts）
> 借鉴：DSH token-meter（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`D:\deepseek-harness\packages\llm\token-meter\src\{estimate.ts, usage-projection.ts, surface-projection.ts, projection.ts}`

## 1. 权威文档引用

- **DSH 借鉴指引 v2 §B-03（token 计量四桶 + 成本护栏）**：DSH 锚点 `dsh-token-meter lib/types/estimate.js`（`CHARS_PER_TOKEN=4` + block overhead 4）+ `usage-projection.js`/`surface-projection.js`（四桶 `uncachedInput/output/cacheRead/cacheWrite`、`projectedTokens` 外推、plan/commit 两段式）。Synova 落点 = 诊断管线计量 + 预算护栏（超限 → Sentinel 告警）；验收 = 诊断报告带 token 四桶报表 + 注入超预算用例触发告警。
- **专家架构权威（20260905 第六章）**：§6.1 三层分层（计算/推理/主持）+ 问题域专家；§6.2 host **按需激活**问题域专家（不是全部始终激活，省 token）。成本治理对象 = **推理层（问题域专家 LLM）+ 主持层（host LLM）**；计算层（资源循环/哨兵 compute）不跑 LLM，不计入本卡 token 四桶。
- **铁律 32**（`.code + .phase + .retryable` 错误分类）；**铁律 24/31**（降级必须 `log.warn` + `degraded: true` 显式传播）；**铁律 47/48**（契约优先 + 测试非空壳）。

## 2. 代码审计——现状（file:line，实测）

### 2.1 DSH 范式（DeepSeek 特别优化，已读源码）

- `estimate.ts`：`CHARS_PER_TOKEN = 4`、`BLOCK_OVERHEAD = 4`、`ROLE_OVERHEAD = 4`；`estimateContent/estimateMessage/estimateHeader` 固定密度启发式定价（同一内容同一定价，meter 与投影共用）。
- `projection.ts`：`TokenUsageProjection` 四桶 **disjoint**（`uncachedInputTokens/outputTokens/cacheReadTokens/cacheWriteTokens`；reasoning 已含在 output 不重复计）。
- `usage-projection.ts`：`bucketsFrom(usage)` 四桶归一；`tokenUsageProjectionDefinition`（key=`tokenUsage`，stateVersion=1，`addReplacing` 同 turn/step 替换防双计）；`contextPressureProjectionDefinition` 的 `projectedTokens = pressureTokens + surfaceTokens - sampledSurfaceTokens`（plan：下一请求发生前先外推预估）。
- `llm-deepseek/lib/types/translate.js` `mapUsage`：DeepSeek `prompt_tokens` **包含 cache hit**（`prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens`），harness 约定 **disjoint**，故 `inputTokens = prompt_tokens - cacheRead`；`cacheRead = prompt_tokens_details.cached_tokens ?? prompt_cache_hit_tokens`。

### 2.2 Synova 现状（缺陷，grep 实测）

- **缺陷 A（计量口径只有 2 桶）**：`src/providers/types.ts:41` `ChatResult.usage` = `{ promptTokens, completionTokens }`；`src/providers/deepseek.ts:46-49` `afterResponse` 只映射 `prompt_tokens`/`completion_tokens`，**丢弃 cache 字段**（`prompt_cache_hit_tokens` 未读）。
- **缺陷 B（无 token-meter 模块）**：`grep -rn "CHARS_PER_TOKEN\|cacheReadTokens\|cacheWriteTokens\|uncachedInput" src/` 零命中——无四桶聚合、无启发式估算、无 projectedTokens 外推。
- **缺陷 C（预算护栏与告警分离）**：已有 `src/agent/cost-budget.ts`（BudgetTracker，token 级 warnAt 0.8/blockAt 1.0）、`src/services/llm-cost.ts`（LLMCostTracker，¥ 定价，`LLM_BUDGET` 默认 ¥5）、`src/services/context-budget-tracker.ts`（ContextBudgetTracker，2 桶 + `cachedPromptTokens`），但：① 无四桶口径；② 「超限 → Sentinel 告警」零接线（仅 in-process block/warn + TUI 提示）；③ 诊断报告无 token 四桶报表。
- **既有告警 seam（复用，不改）**：`src/agent/sentinel-service.ts:416` `injectManualSignal(input)` → `src/sentinel/runner.ts:844` `injectManualFinding` → `sentinel_events` + 投影 → `GET /api/sentinel/findings` 可见；生产接线先例 `src/routes/ga-calibration.ts:346`。`signalType` 为自由字符串（路由层枚举约束在 ga-calibration，`injectManualFinding` 本体不约束）。

### 2.3 无重复造轮子审计（S-14，DSH 迁移排查）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep 现有实现 | `grep -rn "CHARS_PER_TOKEN\|四桶\|cacheReadTokens\|cacheWriteTokens\|tokenMeter" src/ packages/ synova_worker/` → 零命中；仅 `cost-budget.ts`/`llm-cost.ts`/`context-budget-tracker.ts` 有 2 桶/成本近似 |
| 施工图可借鉴清单对照 | 本卡正属 B-03 借鉴卡，借鉴理念（四桶 disjoint + 固定密度估算 + projectedTokens 外推）自研，不引 `@deepseek-ai` |
| 既有层确认 | `cost-budget.ts`=token 级 warn/block；`llm-cost.ts`=¥ 定价；`context-budget-tracker.ts`=2 桶聚合——**三者均非四桶，本卡不重写、不复用其口径，只在 token-meter 内统一四桶**；`injectManualSignal` 为告警 seam 复用 |
| 结论 | 新建 `src/llm/token-meter.ts`（四桶 + 估算 + 预算判定 + finding 构造），打通 provider 四桶捕获 + 诊断管线聚合 + 复用告警 seam，而非重建预算/成本体系 |

## 3. 实现方案

### 3.1 写集 (3 修改 + 1 新建 + 2 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/llm/token-meter.ts` | 新建 | 四桶类型 `TokenUsageBuckets`（disjoint）+ `CHARS_PER_TOKEN=4`/`BLOCK_OVERHEAD=4`/`ROLE_OVERHEAD=4` + `estimateTextTokens`/`estimateMessageTokens` + `bucketsFrom`/`sumBuckets`/`usageTokens` + `TokenMeter`（record/snapshot，四桶报表 byModel）+ `checkBudget`（warn/exceed 双阈值，projectedTokens 外推）+ `buildCostFinding`（纯函数，内联 `SentinelFinding` 形状，不 import src/sentinel） |
| `src/providers/types.ts` | 修改 | `ChatResult.usage` 增可选 `cacheReadTokens?`/`cacheWriteTokens?`（保持 `promptTokens`=总 prompt 语义不变，既有消费方零行为变化） |
| `src/providers/deepseek.ts` | 修改 | `afterResponse` 映射 `cacheReadTokens = prompt_tokens_details?.cached_tokens ?? prompt_cache_hit_tokens`（`cacheWriteTokens` DeepSeek 无，保持 undefined） |
| `src/routes/diagnosis.ts` | 修改 | consult 流程挂 `TokenMeter`：聚合 provider usage 四桶 → 报告附 `tokenUsage` 四桶报表；`checkBudget` 超限 → `injectManualSignal`（复用 seam，`signalType='成本预算超限'`） |
| `tests/llm/token-meter.test.ts` | 新建 | 单测：四桶归一/disjoint 求和/启发式估算/预算 warn-exceed/投影外推/finding 构造 |
| `tests/routes/diagnosis-token-meter.integration.test.ts` | 新建 | 集成：诊断报告带四桶报表 + 注入超预算触发告警 |

### 3.2 最终实现同 commit 回填（2026-09-08 实现者回填）

> 实现时若偏离本 doc（预算默认值、告警 severity 映射、diagnosis 聚合点、DeepSeek 字段名），必须在此节同 commit 回填最终形态，不留「方案 vs 代码」漂移。

**回填（与 §3.1 的最终形态偏差，全部经组 4 接线门禁 + 15/15 测试 + tsc 基线 28=28 恒等验证）**：

1. **导出面收窄（组 4 接线门禁，D587/D594 先例）**：token-meter 值导出仅保留生产消费入口
   `estimateMessageTokens` / `bucketsFrom` / `TokenMeter` / `checkBudget` / `buildCostFinding`
   （src/routes/diagnosis.ts 逐个真实调用，DS1 ≥1 生产调用点）；§3.1 所列 `estimateTextTokens` /
   `sumBuckets` / `usageTokens` 与 `CHARS_PER_TOKEN=4`/`BLOCK_OVERHEAD=4`/`ROLE_OVERHEAD=4`
   密度常量为模块内部函数/常量，取值经导出函数的精确算术断言锁定，不设测试专用导出。
2. **报告 tokenUsage 字段形态**：`...TokenMeterSnapshot` 全量展开（totals/totalTokens/requestCount/
   missingUsageCount/degraded/byModel）+ 末次请求外推上下文三个扩展字段：`lastRequestBuckets`
   （末次请求四桶）/ `pressureTokens`（末次请求输入侧三桶和）/ `surfaceTokensEstimate`
   （末次消息表面 token 启发式估算，DSH contextPressure 同源口径）。
3. **severity 映射公式**（§4.5 决策点 2 的具体化）：`min(10, max(4, ceil((totalTokens/budgetTokens) × 5)))`，
   label 映射 ≥9 emergency / ≥7 critical / 其余 warning；confidence 100（实报超限）/ 90（projected=true 含外推成分）。
4. **DS6 存量豁免**：src/providers/deepseek.ts:28 `sanitizeMessages(...) as unknown as LLMMessage[]`
   为存量行（不在本卡 diff），DS6 只查新增行——新增行零命中。

> 实现时若偏离本 doc（预算默认值、告警 severity 映射、diagnosis 聚合点、DeepSeek 字段名），必须在此节同 commit 回填最终形态，不留「方案 vs 代码」漂移。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不新建 Sentinel / 不改 `src/sentinel/`、`src/agent/sentinel-service.ts` | DSH 线地盘（TASK-ROUTING.md）；仅复用 `injectManualSignal`，不改其实现 |
| 不改 `cost-budget.ts`/`llm-cost.ts`/`context-budget-tracker.ts` | 三者非四桶口径，且属既有交付；本卡只在 token-meter 内统一四桶 |
| 不做流式逐 chunk 的四桶投影（D500 事件流 `tokenUsage` 投影 stateVersion 化） | 属 B-07/D588 会话投影的后续消费方迁移（D588 phase 4 deferred），本卡做同步聚合报表即可 |
| 不引 `@deepseek-ai`、不 copy DSH 代码 | G1/G4 红线 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（实现前模块不存在 → 文件 fail），第二步实现跑绿。每用例 ≥3 expect，覆盖正常/降级/边界。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/llm/token-meter.test.ts` | 单测 | ≥8 | 四桶归一（DeepSeek cache 字段 → cacheRead）、disjoint 求和不双计、`estimateTextTokens` 码点计数（中文/emoji 不拆代理对）、`checkBudget` warn(0.8)/exceed(1.0)/正常、`buildCostFinding` severity 映射 + evidence、非法入参 degraded 不抛 |
| `tests/routes/diagnosis-token-meter.integration.test.ts` | 集成 | ≥4 | 诊断完成报告带 `tokenUsage` 四桶字段、注入超预算 usage → `injectManualSignal` 被调（告警触发）、预算未超不告警、meter 未初始化降级不阻断诊断 |

RED 必须覆盖失败模式（S-5）：`bucketsFrom` 对含 `prompt_cache_hit_tokens` 的 DeepSeek usage 正确拆出 `cacheReadTokens`（修复前 cache 字段被丢弃 → 四桶缺 cacheRead 桶 → red）；`checkBudget` 超预算返回 `exceeded: true`（修复前无此函数 → red）。

### 4.5 决策参考（S-12）

- **决策点 1（四桶口径 disjoint vs 求和）**：参考系 = DSH `projection.ts`「四桶 disjoint，reasoning 已含 output 不重复」+ `translate.js` mapUsage「prompt_tokens 含 cache hit，须减出」——采纳 **disjoint**。
- **决策点 2（告警 seam：复用 injectManualSignal vs 新建 sentinel）**：参考系 = 第一性原理（最小耦合）+ TASK-ROUTING（src/sentinel 归 DSH）——采纳 **复用 injectManualSignal**，`signalType='成本预算超限'`，severity 按 overage 映射（≥9 emergency / ≥7 critical / ≥4 warning / 其余 warning）。
- **决策点 3（预算默认值）**：参考系 = `cost-budget.ts` `cumulativeBudget=500_000`、`warnAt=0.8`、`blockAt=1.0`——采纳 token-meter 默认 `budgetTokens=500_000`、`warnRatio=0.8`、`exceedRatio=1.0`，可经配置覆盖。

## 5. 接线要求（生产调用点，S-3）

| 新 export/函数 | 调用方 | 确认方式 |
|---|---|---|
| `TokenMeter`/`bucketsFrom`/`checkBudget`/`buildCostFinding` | `src/routes/diagnosis.ts`（consult 生产路径） | `grep -rn "TokenMeter\|checkBudget\|buildCostFinding" src/routes/diagnosis.ts` 命中 ≥1 生产调用点（测试调用不计） |
| `usage.cacheReadTokens/cacheWriteTokens` | `src/providers/deepseek.ts` afterResponse → `src/providers/base.ts` chat/stream 透传 | `grep -rn "cacheReadTokens" src/providers/` 命中 deepseek.ts + base.ts 消费 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 接线**：`grep -rn "TokenMeter\|bucketsFrom\|checkBudget\|buildCostFinding" src/routes/diagnosis.ts` 命中 ≥1 生产调用点。
- **DS2 四桶捕获**：`grep -rn "cacheReadTokens" src/providers/deepseek.ts src/providers/types.ts` 命中（四桶 seam 存在）。
- **DS3 零依赖**：`grep -rn "@deepseek-ai" src/` 零结果。
- **DS4 测试 red→green**：`npx vitest run tests/llm/token-meter.test.ts tests/routes/diagnosis-token-meter.integration.test.ts` 先 red（模块不存在）→ green（≥12 用例全 pass，非空壳）。
- **DS5 零回归**：`npx vitest run tests/llm/ tests/providers/ tests/routes/diagnosis*` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/llm/token-meter.ts src/providers/deepseek.ts src/routes/diagnosis.ts` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集文件（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] DSH token-meter estimate/usage-projection/surface-projection/projection + llm-deepseek translate 源码已读（file:line 已列）
- [ ] Synova providers/types + deepseek + diagnosis + cost-budget/llm-cost/context-budget-tracker 现状 grep 实证
- [ ] 遵循新专家规范（成本治理对象 = 推理层问题域专家 + 主持层 host，非固定 7 专家）
- [ ] 四桶 disjoint 口径 + DeepSeek cache 字段映射 + projectedTokens 外推已纳入
- [ ] 告警 seam 复用 injectManualSignal（不改 src/sentinel）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| TokenMeter/checkBudget/buildCostFinding 已接生产路径 | `grep -rn "TokenMeter\|checkBudget\|buildCostFinding" src/routes/diagnosis.ts` | 命中 ≥1 生产调用点 |
| 四桶捕获 seam 存在 | `grep -rn "cacheReadTokens" src/providers/deepseek.ts src/providers/types.ts` | 命中 |
| 零 DSH 依赖 | `grep -rn "@deepseek-ai" src/` | 0 命中 |
| 测试 red→green 全绿 | `npx vitest run tests/llm/token-meter.test.ts tests/routes/diagnosis-token-meter.integration.test.ts` | 全 pass（≥12 用例） |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/llm/token-meter.ts src/providers/deepseek.ts src/routes/diagnosis.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
