# 编码指令 — 哨兵阈值配置真实挂载（D577）

> 本指令随 dev doc 交付给编码 session（synova-dsh 预设，分支 `feat/d577-sentinel-threshold-wiring`）。**认真阅读任务文档，然后执行任务。**
> 派单: docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md（CTO 派单）
> 审计: Kimi K3 会盯着你的任务，D577 完成后做最终审计（覆盖本任务全部写集 + DS1-DS11 + 7-2/8-1/10-3 验收点级证据）

---

## 一、任务文档（必读，先读后动，读不完不动手）

| 文档 | 路径 | 作用 |
|---|---|---|
| D577 spec | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D577-sentinel-threshold-wiring-20260905.md | 哨兵阈值配置真实挂载——**编码唯一契约** |
| 派单 | docs/synova/coordination/派单-D577-sentinel-threshold-wiring-20260905.md | 断裂链路画像/5 必答/7 验收锚点/禁碰区 |
| 北星 | .claude/PRODUCT-BRIEF.md §三"哨兵定时巡检" + §四"文件优先：改文件就改行为" | 产品方向锚点（阈值可配置是 W2 已承诺能力） |
| 前车之鉴 | docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md（K3 P0-1）+ docs/plans/codex/implementation/SYNOVA-IMPL-D356-sentinel-threshold-alert-20260816.md（D356 先例与边界） | 教训清单：注释声称≠实现、测试绿但接线断、degraded 丢弃 |

## 二、执行要求（做到你的最高代码水平）

1. **认真阅读** spec 的 §1（Authority）/ §4（Current State 三方对照表，实测行号）/ §5（写集 + 修复模式骨架 + 决策参考）/ §7（测试 red→green）/ §8（Wiring Verification）/ §10（DS1-DS11）——spec 是唯一契约，声称即引用。
2. **任务复杂 → 先 plan mode 再做**：按 spec §5.1 写集表（21 修改 + 2 新建）列出改动清单 → 确认基线（见 §三-1）→ 按 §4.2 对照表逐文件动手（A 组 10 文件、B 组 4 文件 + 4 manifest、核心 3 文件）。**禁止没想清楚就改代码。**
3. **最高代码水平**：类型安全（`as any`/`as never`/`as unknown as` = 0，铁律 38；动态导入对象用内联类型 narrow，见 spec §5.2 骨架）、契约优先（resolveThresholds 与 types.ts 新类型先 JSDoc @input/@output/@degraded，铁律 47，spec §3-Q4 已给全文）、降级诚实（每个 catch 有 log + 降级返回，铁律 24/31；DEPLOYS 静默 return [] 是本任务要消灭的形态，禁止再造）、测试非空壳（expect 断言 + 正常/降级/边界三路径，铁律 48，red→green 已证）。

## 三、D577 专属硬约束（比通用铁律更具体，违反 = 审计 FAIL）

1. **依赖前置 + 基线核验（防 M7 漂移）**：
   - 基线 = origin/main（436e216d，2026-09-05 spec 实测基线）。开工前置（铁律 0-3）：`git fetch --all && git pull --ff-only`；在 `feat/d577-sentinel-threshold-wiring` 分支工作。
   - 合入后/开工时**重新核验 spec §4.2 对照表行号**（aggregate 文件可能被其他任务触碰）——照旧行号改会红（D524 教训）。核验方法：每个判定点用 spec 给的语义描述（如 `rate < 0.6`(crit)）grep 定位，行号漂移则更新后继续。
   - **D575（LLM 配置）与本任务写集零重叠可并行**；若 D575 先合 main，rebase 后重跑 `npx vitest run tests/sentinel/` 确认基线仍绿。前置异常 → waiting 如实标注，不伪造实测。
2. **写集精确性（S-2 声称=实现）**：只改 spec §5.1 写集表 23 个文件；`git diff --name-only` 与实际改动完全一致。**manifest 只允许 §4.2 B 组 4 个文件的指定 key 新增/回填（现值），其余 41 个 manifest 一个字节不动**；src/ 只动 types.ts / sentinel-loader.ts / runner.ts 三个文件。禁"树终验声称不符"。
3. **蓝绿纪律（本任务的正确性根基）**：severity 标签一律保持代码现状，只换比较基准（字面量 → th() 取值）；A 组 10 哨兵注入 manifest 现值后的 findings 必须与改造前逐一相同（T2 蓝绿用例是硬门禁）；manifest 回填值必须等于 aggregate 现硬编码值（B3: 0.5/0.2；B4: 0.3/0.6；B1/B2 新增 key 用现值）——填错 = 静默改变告警行为 = 审计 FAIL。
4. **诚实 RED / 缺口标注**：org_adapter 真实 orgId 覆写对 cron 链路（teamId='default'）不生效是预存在语义缺口（spec §6）——DS7 闭环以 orgKey='default' 证明机制，完成报告中如实标注缺口，禁止声称"全 orgId 闭环"。
5. **evidence 落盘规范（K3 独立重跑可复现）**：DS8 flip 物理验证的命令+输出+时间戳落盘 `.codex/control-tower/evidence/`（或 docs/synova/audit-reports/evidence/）；T1-T10 的 vitest 输出摘要同落盘。禁止只在 task-state 存单一副本。
6. **红线（违反 = 事故）**：不碰 scripts/audit/（K3 专属）；不碰 src/server.ts、src/config.ts（D575 领地）、electron/、packages/evolution/src/evolution-types.ts（L3WriteAPI 签名冻结）；不改 41 个未列名 manifest 的值；不改 4 个存量 this.manifest 消费者的通道语义（cash-runway/revenue-health/capital-health 全不动，margin-health 仅补 2 key）。
7. **环境坑（实测注记）**：macOS 下 `sed -i` 需 `sed -i ''` 语法；flip 测试必须独占运行（`D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts`），禁止混入全量并行（fs 改 manifest 会污染并发读 manifest 的测试）；flip 测试 fs 改动必须 try/finally 恢复并 `clearSentinelCache()`。

## 四、做完之后的复核清单（逐项自查，K3 会盯着你，也会做最后的审计）

1. **与 dev doc 一致**：DS1-DS11 逐项对照（S-2 声称 = 实现 + 验收，禁 overclaim、禁重编号/跳号/静默缺项 S-10）；§4.2 对照表 39 判定点逐项勾选状态。
2. **不违反铁律**：接线完整（resolveThresholds 生产调用点 ≥2 处 grep 实证，测试调用不计 S-3；spec §8 逐条复核）、降级诚实（铁律 24/31，degraded 传播链完整到 SentinelCheckResult）、类型安全（as any=0，铁律 38）、契约优先（铁律 47）、测试非空壳（铁律 48）、架构边界（L3 范围内，铁律 39/46）。
3. **无 bug**：spec §7 verify 命令逐条跑通 + `npx vitest run tests/sentinel/` 全绿（D356 既有测试不破）+ tsc 零错 + pre-commit 13 组全过（**禁 --no-verify**）+ 提交走 synova-commit（**禁 git stash**，铁律 0-3）。
4. **接线完整**：spec §8 每条 grep 出真实生产调用点（resolveThresholds → sentinel-loader wrapper + runner.getThreshold；SentinelContext.thresholds → 14 aggregate 第 4 参）。
5. **测试到位**：red→green 已证（T1/T5/T7/T8 改造前先红）、三路径覆盖、expect 断言非空壳；flip 测试含恢复后断言（critical 回归）。
6. **其他你认为需要复核的点**：残留清理（grep 确认 14 个 aggregate 无死 DEFAULT 常量/无残留字面量）、文件驱动（4 个 manifest JSON 语法合法 + schema 兼容）、产物可复现性（flip 测试幂等：重复运行结果一致）。

## 五、K3 审计提示（收尾要求）

- D577 完成后**一次提审**（K3 审 D577，报告覆盖哨兵阈值链路全写集 + 对照表抽核 + flip 复跑）。
- 审计验收 = 验证点 7-2（哨兵全量注册 manifest 挂载无死代码）/ 8-1（阈值真实触发读 manifest）/ 10-3（P0 哨兵 manifest 挂载阈值真实触发）各产出验收点级 evidence（DS8/DS9 + §10.2 映射），**CT-53 口径：验收点级，非任务级兑换**；product-lines 状态兑换由 CTO/K3 走 redeem 流程。
- 完成后回填 `task-state/D577.json` 的 **impl 段**（commit + by + files[]，files = 23 文件实测清单）+ DS1-DS11 状态表。
- 审计员会**独立重跑你的验证脚本**——flip 测试必须幂等、可复现、无本机假设（macOS sed 语法、独占运行、try/finally 恢复都在 spec §7/本指令 §三-7 标注）。

**开始吧。**
