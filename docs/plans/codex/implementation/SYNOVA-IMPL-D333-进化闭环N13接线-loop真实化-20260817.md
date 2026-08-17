<!--
  SYNOVA-IMPL-D333: 进化闭环 N13 接线 + loop-3/5 placeholder 真实化
  状态: dev doc | 2026-08-17 | 优先级 P0
  权威文档: docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md（K3 权威偏差 v2 P0-A1/P1-C2）; AGENTS.md 铁律 0-2/4/11/24/31/37/47/48; 权威文档13（增长导航 N13 反馈→规则闭环）
  依赖: 无（D92 已建 middle-evolution-engine、D93 已建 feedback-collector、D273 已建 GA 纠错回写，本任务只做「接线 + 真实化」）
  并行: 无（写集在 src/agent/ + src/loops/，与 D356 的 src/sentinel/ 零重叠，可 worktree 隔离并行；但与 D354 的 runner/signal-aggregator 不同域，亦无交集）
-->

# SYNOVA-IMPL-D333 进化闭环 N13 接线 + loop-3/5 placeholder 真实化

## 1. 权威文档引用

* **K3 权威偏差 v2** `docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md`：
  * P0-A1「N13 反馈→规则闭环断裂：middle-evolution-engine 零生产调用方、feedback-collector 聚合信号无消费方」
  * P0 加深「loop-3/5 名义进化通道是 placeholder 空壳，每次 cron 触发写入伪造 'completed' 审计记录；6 循环只有 loop-1 有真实执行体」
  * P1-C2「4/4 默认 handler 全是 placeholder」
* **AGENTS.md 铁律 0-2/4**：测试先行 + 接线验收；交付不完整（写了没接线）。
* **AGENTS.md 铁律 11/24/31/37**：禁静默降级；degraded 传播；dead code 入仓库即违规（middle-evolution 存活至今是实证）。

## 2. 代码审计——现状

### 缺陷 A（P0）：middle-evolution-engine 零生产调用方（N13 断裂）

* `src/loops/middle-evolution-engine.ts` 是真实引擎：`processFeedbackSignals(signals)`（5 类进化动作）+ `applyEvolutionActions(actions)`（回写阈值/专家 manifest）+ `computeGAProtection()`。
* 但 `grep -rn "middle-evolution\|middleEvolution\|processFeedbackSignals\|applyEvolutionActions" src/` 只有 `middle-evolution-engine.ts` 自身的 4 处（L2/L17/L137/L142），**零生产调用方**。
* 消费链断裂：feedback-collector（`src/growth/feedback-collector.ts:267 getAggregatedSignals()`）产出聚合信号，但没人调用 `processFeedbackSignals` 去消费它 → N13「反馈→规则」闭环从未闭合。

### 缺陷 B（P0）：loop-3/5 进化通道是 placeholder 假成功

* `src/agent/loop-handlers.ts` 头注释自承「MVP 阶段为 placeholder 实现…D9 5 Built-in Loops 将替换为真实逻辑」（L4-5）。
* `defaultEvolutionHandler`（L65-78）只 `log.info` + `return { success: true, output: '进化循环 [x] 执行完成', degraded: false }`——**无任何真实进化动作，却返回 success**。
* `src/agent/main-agent.ts:277-278`：`if (loopId.includes('evolution') || loopId === 'loop-3' || loopId === 'loop-5') return defaultEvolutionHandler;`——loop-3/5 被路由到这个空壳。
* 后果：main-agent.ts:185 `status: result.success ? 'completed' : 'failed'` 把 placeholder 的 `success: true` 映射成 `completed`，每次 cron 触发都写**伪造审计记录**，仪表盘上进化闭环显示"已完成"，实际零动作。

### 缺陷 C（P1）：其余 3 个默认 handler 也是 placeholder（本任务聚焦 evolution，其余留后续）

* `defaultDiagnosisHandler`/`defaultNavigationHandler`/`defaultOverflowHandler` 同为 placeholder。本任务只真实化 `defaultEvolutionHandler`（N13 核心），其余 descope。

## 3. 实现方案

### 3.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/loop-handlers.ts | 修改 | `defaultEvolutionHandler` 真实化：`getFeedbackCollector().getAggregatedSignals()` → `processFeedbackSignals(signals)` → `applyEvolutionActions(actions)`，返回真实 applied/skipped 计数；collector 不可用/无信号 → 返回 `degraded: true` + 显式输出（禁静默 success） |
| src/agent/main-agent.ts | 修改 | loop-3/5 路由保持指向真实化后的 `defaultEvolutionHandler`；修正伪造 completed——handler 返回 degraded 时 status 记 `degraded`（或 failed），不得无条件 `completed` |
| tests/agent/loop-handlers.test.ts | 新建 | 真实化后的 handler 测试（red→green） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（纯产品代码 bug 修复/接线，非门禁/工具行为变化）；`src/agent/` + `src/loops/` 与 D356（sentinel）零交集，与 D354（runner/signal-aggregator）也零交集。

### 3.2 最终实现同 commit 回填（S-6）

实现按 §3.1 核心链路落地，但代码审计发现 4 处 §3.1 未预见的实现偏离，全部已在同 commit 回填：

**最终写集（5 修改 + 1 新建）**：

| 文件 | 操作 | 说明 |
|------|------|------|
| src/agent/loop-handlers.ts | 修改 | `defaultEvolutionHandler` 真实化（§3.1 一致）：getAggregatedSignals → processFeedbackSignals → applyEvolutionActions。诚实性不变量：**success:true ⟺ applied>0**；无信号/零动作/回写部分失败/全部 pending → `degraded:true` + 显式输出 |
| src/agent/main-agent.ts | 修改 | LoopStatus 增 `'degraded'`；状态映射改为 `result.degraded ? 'degraded' : result.success ? 'completed' : 'failed'`；writeAuditLog action 三态真实映射 `loop.completed/loop.degraded/loop.failed`；降级日志措辞区分 |
| src/loops/middle-evolution-engine.ts | 修改（偏离 ①+②） | `processFeedbackSignals` 纯化：移除内部 `applyEvolutionActions` 调用与 D262 GA 反馈记录块（见下） |
| src/agent/synova-agent.ts | 修改（偏离 ③） | `start()` 接线 `getFeedbackCollector().setDatabase(this.db)`（生产 DB 注入，此前零调用） |
| tests/agent/loop-handlers.test.ts | 新建 | 8 用例（§4 要求 3 态全覆）red→green |
| tests/agent/main-agent.test.ts | 修改（偏离 ④） | 多循环并行测试 loop-3 断言 completed → degraded（原断言即缺陷 B 测试面） |

**偏离决策记录（参考系：第一性原理/Anthropic 基线）**：

* 偏离 ①【双次回写】§3.1 直连链下，`processFeedbackSignals` 内部（原 L152-159）已调 `applyEvolutionActions` → handler 再调一次 = 同周期双次回写，correction 计数 2 倍加速，破坏 `MIN_TRIGGER_COUNT=3` 语义。选项 a) handler 只调 process（拿不到 applied/skipped 计数，违反 §3.1「返回真实计数」）b) 引擎纯化 + handler 直连。收敛选 b——纯化是唯一满足 §5 接线 grep 又不双写的路径。5 类信号处理器逻辑零改动。
* 偏离 ②【D262 死代码移除】原 L131-149 GA 反馈记录块 `decision:'accept'` 违反 `FeedbackDecision` 类型（tsc 存量 TS2322，本次转为「已修复 1」）+ `feedback_log` DDL CHECK 运行时必败 → 从未成功写入 = 死代码（铁律 37）。随纯化移除；D262 语义修复（决策类型扩展）为独立任务。
* 偏离 ③【collector DB 接线】生产环境 `setDatabase` 零调用 → 单例 db 恒 null → 聚合信号恒空 → 闭环「接通但饿死」，违反 P0-A1「端到端跑通」。`synova-agent.ts:start()` 与 `baselineStore.setDatabase` 同点注入（D363 failover 接线同模式先例）。
* 偏离 ④【测试面更新】`tests/agent/main-agent.test.ts` 多循环并行断言 loop-3 `completed` —— 该断言即缺陷 B（placeholder 假成功）的测试面，真实化后必须改为 `degraded`（测试环境无反馈信号）。非回归，是行为修正。

**验证结果（DS 映射见 §6）**：red 9 失败（修复前恒 success/零引擎调用/伪造 completed）→ green 18/18；引擎测试 20/20 无回归；tsc 存量 27 + 新增 0（已修复 1）；全量 3216 过 / 100 存量失败（基线对照 worktree @87743f7 逐项比对：零新增，唯一差异为 `zero-code-industry` 测试依赖 `git diff --name-only` 干净工作树、未提交状态下必然失败，commit 后自消）。

### 3.3 不做的事

* 不真实化 diagnosis/navigation/overflow 三个 handler（各自后续任务）。
* 不重写 middle-evolution-engine 的 5 类处理器逻辑（D92/D273 已实现，本任务只接线）。
* 不接 direction-monitor（那是 D334/P1-A2）。
* 不碰 sentinel（那是 D356 的域）。

## 4. 测试要求（测试优先）

第一步写测试（red），第二步实现（green）。red 必须覆盖失败模式（S-5）：

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | loop-handlers.test.ts | ≥3 断言 | ① `defaultEvolutionHandler` 在有聚合信号时产出 ≥1 真实进化动作（修复前恒 success、无动作 → red）；② 无信号/collector 不可用时返回 `degraded: true`（修复前恒 success → red）；③ 回归：动作回写不抛异常、返回真实 applied 计数 |

* red 基准：修复前 `defaultEvolutionHandler` 恒 `success: true` 且零真实动作（grep 无 processFeedbackSignals 调用）→ red；修复后调 `processFeedbackSignals`/`applyEvolutionActions` → green。
* 测试非空壳：正常（有信号）/降级（无信号/collector 不可用）/边界（空信号数组）三态。

## 4.5 决策参考

* 决策点：loop-3/5 是「真实化 defaultEvolutionHandler 直接调引擎」还是「在 middle-evolution-engine 加统一 runEvolutionCycle 入口」？
* 参考系：第一性原理——N13 断裂根因是"引擎建好了没人调"，最小修复是把调用点接上；Anthropic 基线——接线验收要求生产调用点真实传递；收敛——改 handler 调引擎（写集最小），不新增入口。
* 结论：采用「真实化 handler 直接调 processFeedbackSignals + applyEvolutionActions」，写集最小、接线可 grep 验证。完成报告必含决策记录（K3 可核）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| processFeedbackSignals / applyEvolutionActions | `defaultEvolutionHandler`（loop-3/5 生产执行路径，非测试构造） | `grep -rn "processFeedbackSignals\|applyEvolutionActions" src/agent/loop-handlers.ts` 命中 |
| defaultEvolutionHandler | `main-agent.ts` loop-3/5 路由（生产调度） | `grep -n "defaultEvolutionHandler" src/agent/main-agent.ts` 命中 |

* 生产调用点必须（S-3）：`processFeedbackSignals` 的生产调用方必须 ≥1（loop-handlers 的 defaultEvolutionHandler），测试调用不计；DS 里 grep 生产代码验证。

## 6. 完成标准

* DS1 测试绿：`npx vitest run tests/agent/loop-handlers.test.ts` 全绿；red 先行已证（修复前恒 success → 修复后真实动作/降级）。
* DS2 N13 接线：`grep -n "processFeedbackSignals" src/agent/loop-handlers.ts` 命中 1 处（生产调用，非 import）。
* DS3 degraded 诚实：无信号/collector 不可用时 `defaultEvolutionHandler` 返回 `degraded: true`（测试断言，禁静默 success）。
* DS4 伪造 completed 修正：`grep -n "degraded" src/agent/main-agent.ts` 显示 loop 状态由 handler.degraded 决定，非无条件 completed。
* DS5 零回归：`bash scripts/control-tower/baseline-check.sh` tsc/测试/审计三基线无新增。
* DS6 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界文件（尤其不碰 src/sentinel/）。
* DS7 无绕过：pre-commit 12 组全过，bypass.log 无 `--no-verify`；提交走 synova-commit。
* DS8 推送 + CI：`git push` 后 `git log origin/feat/prompt-architecture..HEAD --oneline` 空 + CI 任务相关 job 绿（job 级；npm audit/Architecture 预存失败单独标注）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格、格式符合 verify-parallel 契约
* [ ] 测试 red→green 覆盖失败模式（placeholder 假成功 / degraded 静默 / 空信号）
* [ ] 接线要求 ≥1 生产调用点（loop-handlers 生产路径，测试调用不计）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：纯产品代码接线，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

---

> 交付声明 DS 须与本文档 DS1-DS8 一一对应，缺项显式 descope（S-10）；依赖非空禁止并行开 session（S-7）；§3.2 最终实现同 commit 回填（S-6）。
