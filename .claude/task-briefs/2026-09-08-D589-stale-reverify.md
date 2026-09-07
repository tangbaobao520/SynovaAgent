# Task Brief: D589-stale重验批

> 生成: 2026-09-08 01:59:46 | 分支: feat/mac-d589-stale-reverify | as any: 0
> 派单: docs/synova/coordination/派单-D589-stale重验批-20260907.md（认领窗口 ±1 天内，09-08 提交）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
基础设施层（产品进度证据管道）。D579 freshness_gate 首轮执法产 26 stale（11 线），CTO 已恢复 6（7-2/8-1/8-2/8-3/8-4/10-3），本单处理余量。
基线核实（以 calc 实测为准，非派单快照）：origin/main @ c1119d23 实跑 calc → **verified=8 / stale=17 / rejected=2**（派单写 20 stale 是 2c7ace47 快照，main 前进后 7-7/18-2/18-5/25-1/25-2/25-3 已不在 stale——bot 09-06/09-07 test 证据已覆盖其中部分）。
主工作区被另一 session 占用（chore/task-state-cleanup-8 + staged D507.json）——本单走 .synova-wt-d589 worktree（origin/main 开出），零干扰。

### b) 文件审计
- scripts/product-lines/calc-progress.py — 六态状态机权威：machine（test/scenario/ci/task_redeem）绿+新鲜 → **pending_k3（待裁判，不计分）**；k3 pass 治理点优先级最高（k3 存在时 test 证据不参与判定）；freshness_gate = 14 天 TTL + git modules 触碰检测（CT-62: at 优先，date-only 回退 T00:00:00 保守语义）
- scripts/product-lines/run-machine-evidence.sh — docstring 自证「机器绿 → pending_k3 → K3 复核转绿——机器不替代 K3 终审」；CT-52 定性其套件映射为名义绑定
- evidence/test-2026-09-06.json、test-2026-09-07.json — CI bot 产，18 点全 pass 但 **at=None**（CT-62 缺口）→ 2-5 被 09-07 当日 D587 合并判 touched → stale（假性过期，本单以带 at 重跑修复）
- 现有 stale 17 点治理结构（逐点核过）：线1 六点（1-2 除外）+7-3 → task-D5xx.json「自动兑换（redeem-progress.py）」→ CT-53 降级 task_redeem = **机器路径**（test 证据可推进）；2-5 → test-*.json = 机器路径；7-1/9-2/11-1/11-2/18-1 → k3-full-chain-20260813（TTL 过期）= **k3 治理**；10-4/20-5/24-4 → k3-2026-09-02（TTL 内但 modules 被 D586-588 09-07 合并触碰）= **k3 治理**
- 主工作区 .claude/task-briefs/2026-09-07-D587-stale重验批.md 为他人残留草稿，不碰
- expert/ sentinel/ extensions/ 零涉及

### c) 决策
无文件驱动冲突。写集 = evidence JSON + README + task-state + brief + 台账，与在途任务零重叠（D590+ 均代码线）。
**红线自查：本单不写任何 record_type=k3 证据（DSH 无权出 K3 裁决——审计红线）；不碰 yaml/calc 脚本。**

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① Done = 派单验收 2/3/4 全达成 + 验收 1 按机制实测结果如实报告（见 Q1c）
② 测试 = 本单产物即测试证据：Node v22（对齐 better-sqlite3 ABI=127，K3 D316 环境注记先例）全量 vitest 一次跑 → 按线抽取套件结果 → per-line evidence JSON（真实 quote：套件名+通过数，不用名义绑定）
③ 实现 = evidence ×N + README（留 stale 原因两类清单）
④ 接线 = calc-progress.py 消费 evidence → product-progress.json；**G12d（D458）：product-progress.{json,html}/todos.yaml 为 CI 单点生成物 session 禁止提交——本地 calc 只出数验收，merge 后 CI bot 重生成（派单写集与 G12d 冲突，以物理门禁为准）**
⑤ 验证 = calc 实跑前后对比 + 自检 5 问

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: 每份 evidence 必须 schema:1 + record_type:"test" + date + at（ISO datetime）+ verdicts（load_evidence_records 硬校验字段）
  verify: "grep -L '\"at\"' docs/synova/product-lines/evidence/stale-reverify-D589-line1.json"
- rule: 测试红 → 该点留 stale + README 登记，绝不写 pass（铁律 24/诚实规则）
  verify: "test -f docs/synova/product-lines/evidence/README.md"
- rule: evidence 新文件零 record_type:k3（审计红线）
  verify: "grep -c 'record_type.: .k3.' docs/synova/product-lines/evidence/stale-reverify-D589-line1.json"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
参考：第一性原理 + Anthropic(fail-closed/不假绿) + 开源实证（仓内 calc-progress.py 状态机 + run-machine-evidence.sh docstring 自证）+ 结论：
**派单「测试绿 → calc 重算该点 verified」与产品线机制设计冲突。** 状态机权威语义：machine 证据绿+新鲜 → pending_k3（待裁判，不计分）——CT-53/D576 反假绿设计（D572 事故后故意收紧）；k3 治理点（7-1/9-2/10-4/11-1/11-2/18-1/20-5/24-4 共 8 点）的 stale 恢复只能靠新 K3 裁决（或 CTO 合法 CT-62 at 补齐，仅限裁决真实晚于变更者——k3-full-chain-20260813 已 TTL 过期连 at 补齐也不适用）。**本单诚实上限：9 个机器治理点（1-1/1-3~1-7/2-5/7-3）stale → pending_k3 待裁判队列，verified 维持 8；验收 1"verified ≥ 18"机制上不可达，如实上报交 CTO 裁决（后续路径：K3 对 pending_k3 批次出裁决 → verified 翻绿）。** 不伪造、不写 k3 证据、不改机制脚本。

### d) 相关 Note 引用
- 无治理脚本区/规则文档区变更（写集 = docs 证据 + task-state + brief），commit-msg D534 门禁不触发；机制分歧分析沉淀本字段 + 台账（K3 可核）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- docs/synova/product-lines/evidence/stale-reverify-D589-line1.json — 线1 1-1/1-3/1-4/1-5/1-6/1-7（1-2 Win 目标机除外）tests/electron 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line2.json — 2-5 多轮对话上下文套件（conversation-engine/conversation/session-store 真实结果）
- docs/synova/product-lines/evidence/stale-reverify-D589-line7.json — 7-1/7-3 tests/sentinel + tests/cron 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line9.json — 9-2 tests/l4 + tests/connectors 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line10.json — 10-4 compute-cash-runway + l4 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line11.json — 11-1/11-2 l4/l3 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line18.json — 18-1 l4/memory/evidence 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line20.json — 20-5 conversation-engine + providers 重跑证据
- docs/synova/product-lines/evidence/stale-reverify-D589-line24.json — 24-4 tests/security 重跑证据
- docs/synova/product-lines/evidence/README.md — 留 stale 点清单 + 两类原因（k3 治理机制 8 点 / 1-2 Win 目标机）+ 红点失败原因
- task-state/D589.json — impl 回填
- .claude/task-briefs/2026-09-08-D589-stale-reverify.md — 本 brief
- docs/synova/coordination/审计发现台账-DSH-CTO.md — 追加一行

不做什么：
- 不改 docs/synova/product-lines/product-progress.json（G12d/D458 CI 单点生成物——本地 calc 只出数，不入库）
- 不改 docs/synova/product-lines/product-progress.html（同上 G12d）
- 不改 docs/synova/product-lines/todos.yaml（同上 G12d）
- 不改 docs/synova/product-lines/product-lines.yaml（线定义/绑定不改）
- 不改 src/agent/conversation-engine.ts（及 src/ 全目录——本单零代码变更）
- 不改 tests/electron/desktop-build.test.ts（及 tests/ 全目录——只跑不改）
- 不改 scripts/product-lines/calc-progress.py（及 scripts/ 全目录——机制脚本不碰）
- 不改 scripts/audit/AUDIT-PROTOCOL.md（审计红线永不修改）
- 不改 VERSION.md（无产品代码变更，CT-42 不触发）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：calc-progress.py / CI bot（product-progress.yml）消费 evidence/ 目录
处理（中间经过哪些步骤）：Node v22 全量 vitest 单次权威跑 → 按线抽取绑定套件结果 → 写 stale-reverify-D589-line<N>.json（schema1/test/at/真实 quote）→ 红点留 stale + README
结果（最终展示在哪）：机器治理 stale 点进 pending_k3 待裁判队列（K3 下批审计输入）；留 stale 原因清单落盘 README；progress 重算数字如实上报（merge 后 CI bot 重生成 json/html）

物理验收命令（对应派单验收 1-4）：
1. calc 重跑（数字如实记录，机制上限见 Q1c）：python3 scripts/product-lines/calc-progress.py → verified/pending_k3/stale 三数对比
2. 全量 vitest 失败集与 main 基线 diff=空：本单零代码变更 + tests/ 无扫描 evidence 的测试（grep 实证）→ 失败集恒等；JSON 快照 /tmp/d589-vitest-full.json 留档
3. 每份 evidence 有 at：grep -L '"at"' docs/synova/product-lines/evidence/stale-reverify-D589-line*.json 应空
4. 留 stale 清单：README.md 落盘（k3 治理 8 点 + 1-2 Win + 环境注记）

## 架构层: 基础设施
L1-L5 业务代码零触碰；变更面 = docs 证据 + 协调文档
#CRITERIA: A

## Done 标准
- [ ] 9 份 per-line evidence 落盘且全部带 at — verify: grep -L "\"at\"" docs/synova/product-lines/evidence/stale-reverify-D589-line1.json docs/synova/product-lines/evidence/stale-reverify-D589-line2.json docs/synova/product-lines/evidence/stale-reverify-D589-line7.json docs/synova/product-lines/evidence/stale-reverify-D589-line9.json docs/synova/product-lines/evidence/stale-reverify-D589-line10.json docs/synova/product-lines/evidence/stale-reverify-D589-line11.json docs/synova/product-lines/evidence/stale-reverify-D589-line18.json docs/synova/product-lines/evidence/stale-reverify-D589-line20.json docs/synova/product-lines/evidence/stale-reverify-D589-line24.json
- [ ] evidence 全部过 calc 硬校验（无新增"证据记录损坏"降级）— verify: python3 scripts/product-lines/calc-progress.py
- [ ] 留 stale 原因清单落盘 — verify: test -s docs/synova/product-lines/evidence/README.md
- [ ] 新 evidence 零 k3 记录（审计红线）— verify: grep -c "record_type\": \"k3" docs/synova/product-lines/evidence/stale-reverify-D589-line1.json
