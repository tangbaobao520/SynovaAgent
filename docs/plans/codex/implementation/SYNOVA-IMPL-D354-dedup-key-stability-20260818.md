<!--
  SYNOVA-IMPL-D354: 去重键稳定化（finding/signal/notification id 去时间戳）
  状态: dev doc | 2026-08-18 | 优先级 P1
  权威文档: docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md（K3 权威偏差 v2 N14）; AGENTS.md 铁律 47/48; 任务地图 v2（N14 裁决 A：去重窗口 5 分钟已落实）
  依赖: 无
  并行: 与 D333（src/agent/loop-handlers+main-agent）零交集、与 D358（extensions/sentinels/margin-health+capital-health）零交集——三任务可并行，但**必须各开 git worktree 隔离**（D307），禁止共用同一 worktree 暂存区
-->

# SYNOVA-IMPL-D354 去重键稳定化（id 去时间戳）

## 1. 权威文档引用

* **K3 权威偏差 v2** `docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md` N14：「N14 真问题是去重键不稳定——runner.ts:274,742、signal-aggregator.ts:144 的 id 生成器含时间戳，同问题每轮新 id，5/30 分钟窗口都不生效」。
* **任务地图 v2**：N14 裁决 A（去重窗口 5 分钟）已落实；本任务只修「去重键稳定性」，窗口不变。
* **AGENTS.md 铁律 47/48**：契约优先；测试非空壳。

## 2. 代码审计——现状

### 缺陷 A：notification id 含时间戳

* `src/sentinel/runner.ts:274`：`id: \`notif-${signal.id}-${Date.now()}\``——每次推送通知 id 都带当前毫秒时间戳，同一条 signal 每轮产生新 id。

### 缺陷 B：conflict finding id 含时间戳

* `src/sentinel/runner.ts:742`：`id: \`conflict-${finding.relatedNodeId}-${Date.now()}\``——同一节点的数据冲突每轮生成新 id。

### 缺陷 C：signal id 含时间戳

* `src/sentinel/signal-aggregator.ts:144`：`id: \`sig_${entity}_${now.getTime()}\``——同一 entity 的聚合 signal 每轮新 id。

### 后果（N14 根因）

* `src/agent/proactive-push.ts:114` 的 `DEDUP_WINDOW_MS = 300_000`（5 分钟，已对齐裁决）按 dedupKey 去重；但 dedupKey 派生自上述含时间戳的 id → 同问题每轮新 key，5 分钟窗口形同虚设。

## 3. 实现方案

核心：3 处 id 去掉时间戳，改为由稳定字段（signal.id / relatedNodeId / entity）派生的稳定 id；去重窗口不动。

### 3.1 写集（补录 commit：dev doc + 审计报告入库；实现已随 dc4f4232 交付）
| 文件 | 操作 | 说明 |
|------|------|------|
| docs/plans/codex/implementation/SYNOVA-IMPL-D354-dedup-key-stability-20260818.md | 新建 | 补录：dev doc 首次入库（CT-40，K3 D354 审计 P1-2 缺口） |
| docs/synova/audit-reports/2026-08-20-D354.md | 新建 | 补录：K3 审计报告入库（CT-40） |

> 实现写集（`src/sentinel/runner.ts`、`src/sentinel/signal-aggregator.ts`、`tests/sentinel/dedup-key-stability.test.ts`）已随 dc4f4232（PR #59）交付入库，不在本补录 commit 内。

> 共享资源标注（S-8）：本写集不含 VERSION.md（纯产品代码 bug 修复，非门禁/工具行为变化）；`src/sentinel/runner.ts` + `signal-aggregator.ts` 与 D333（`src/agent/`）/D358（`extensions/sentinels/`）零文件交集，但同属哨兵域，并行必须 worktree 隔离（D307）。

### 3.2 最终实现同 commit 回填

若实现偏离方案（如最终改为显式 `dedupKey` 字段替代 id 派生、或 signal.id 还需附加维度区分同 entity 多信号），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事

* 不改 `DEDUP_WINDOW_MS`（5 分钟已按裁决对齐）。
* 不改 `isNotificationDuplicate` / `notificationSentTimestamps` 的时间窗口去重机制（那是另一层，本任务只修 id 稳定性）。
* 不碰 D333（loops）/D358（margin/capital 合并哨兵）的文件。

## 4. 测试要求（测试优先）

第一步写测试（red），第二步实现（green）。red 必须覆盖失败模式（S-5）：

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| 单元 | dedup-key-stability.test.ts | ≥3 断言 | ① 同一 signal.id 两次生成 notif id 相同（修复前不同 → red）；② 同一 relatedNodeId 两次 conflict id 相同；③ 同一 entity 两次 sig id 相同（去重键稳定，5 分钟窗口可命中） |

* red 基准：修复前 `id` 含 `Date.now()`/`getTime()` → 两次调用 id 不同（red）；修复后两次调用 id 相同（green）。
* 测试非空壳：正常（稳定键）/边界（同键不同轮次仍相同）/回归（id 仍唯一区分不同 signal/entity）。

## 4.5 决策参考

* 决策点：id 去时间戳后，同 entity 多信号是否需额外维度区分（避免同轮碰撞）？
* 参考系：第一性原理——signal 每轮对同一 entity 只聚合成 1 条，`sig_${entity}` 在单轮内天然唯一；Anthropic——稳定键是可验证契约（同输入同 id），grep 可核；收敛——直接去时间戳，不加额外维度。
* 结论：去时间戳，`sig_${entity}` / `notif-${signal.id}` / `conflict-${relatedNodeId}` 即稳定键。完成报告必含决策记录（K3 可核）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| 稳定 id 生成 | runner.ts 通知/冲突 + signal-aggregator 聚合生产路径 | `grep -rn "Date.now()\|getTime()" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts` 在 id 生成处零命中 |
| dedupKey 消费 | `src/agent/proactive-push.ts` 去重缓存 | `grep -rn "dedupKey\|dedupCache" src/agent/proactive-push.ts` 命中消费点（已存在，仅验证 id 稳定性传导） |

* 生产调用点必须（S-3）：稳定 id 必须被真实生产路径消费（proactive-push 的 dedupCache），测试调用不计；DS 里 grep 验证。

## 6. 完成标准

* DS1 测试绿：`npx vitest run tests/sentinel/dedup-key-stability.test.ts` 全绿；red 先行已证（含时间戳 id 两次不同 → 去时间戳后相同）。
* DS2 去时间戳：`grep -n "Date.now()\|getTime()" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts` 在 274/742/144 三处 id 生成零命中。
* DS3 稳定键 grep：`grep -n "notif-\|conflict-\|sig_" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts` 命中稳定 id（无 `${Date.now()}`/`${now.getTime()}` 后缀）。
* DS4 零回归：`bash scripts/control-tower/baseline-check.sh` tsc/测试/审计三基线无新增。
* DS5 范围一致：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界文件（尤其不碰 D333/D358 的文件）。
* DS6 无绕过：pre-commit 12 组全过，bypass.log 无 `--no-verify`；提交走 synova-commit。
* DS7 推送 + CI：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（job 级；npm audit/Architecture 预存失败单独标注）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格、格式符合 verify-parallel 契约
* [ ] 测试 red→green 覆盖失败模式（含时间戳 id 两次不同）
* [ ] 接线要求 ≥1 生产消费点（proactive-push dedupCache，测试调用不计）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：纯产品 bug 修复，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| 3 处 id 已去时间戳 | grep -rn "Date.now()\|getTime()" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts | id 生成处零命中 |
| 稳定键已生效 | grep -n "notif-\|conflict-\|sig_" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts | 命中稳定 id 模板 |
| 测试全绿 | vitest run tests/sentinel/dedup-key-stability.test.ts | 全 pass |
| as any = 0 | grep -rn "as any" src/sentinel/runner.ts src/sentinel/signal-aggregator.ts | 0 命中 |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应，缺项显式 descope（S-10）；**并行派发必须各开 worktree 隔离（D307）**，与 D333/D358 三任务同机跑时不得共用暂存区（S-7/S-8）；§3.2 最终实现同 commit 回填（S-6）。
