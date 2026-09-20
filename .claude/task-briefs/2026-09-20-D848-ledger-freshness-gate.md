# Task Brief — D848 账本漂移门禁（证据合入未重算 ledger 必须报红 + CI 旁路接线）

> 卡源：K3 D815 报告 P1 ｜ 分支 `gate/ledger-fresh-b` ｜ worktree `.synova-wt-gates-b2` ｜ 基线 `1d8dcab6`（含 D811）
> 状态：D811 已合入 main → 本卡解封（创始人原裁决「串行等 D811」的前提消失）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
治理层「看板真相链」的下半段：`docs/synova/project/ledger.json` 由 `scripts/project/gen-project-board.py`
从 git 真相（task-state 卡片 + product-lines.yaml + V1 断言表 + 两处证据目录）**派生**。
问题不是派生错，而是**派生没发生也没人知道**——K3 D815 P1 实证：证据 09-17 已合入，main 的账本
仍停在「线10 = 1/6」，CTO 独立复算为 6/6、全局 `v1_passed` 25→27。派单/汇报因此引用过期数字。

### b) 文件审计
- 派生器：`scripts/project/gen-project-board.py`（734 行；CLI 只有只读参数，**无 `--check`**）
- 派生物：`docs/synova/project/ledger.json`（文件头明示「禁手工编辑」）
- 配对夹具：`tests/project/gen-project-board.test.sh`（546 行，9 组密封夹具 + 真实仓库冒烟；**未接入 CI**）
- 同域先例（D811）：`scripts/project/pr-queue-scan.py` + 其旁路段（本卡不动）
- 现有防线缺口：`grep -rn "gen-project-board" scripts/pre-commit-check.sh scripts/pre-push-check.sh
  scripts/hooks/ .git/hooks/` → **零命中**（派生器从未被任何门禁调用；这正是 P1 的成因）

### c) 决策
新增 `--check`（只读对账）+ 旁路触发族判定（`--changed-files`），CI 新开独立 job（append-only）。
理由：**不压主路径**——证据/标准类变更才触发；普通 PR 与本地提交零新增检查（遵守红线）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- **第一性原理**：账本已经在契约里声明了「同输入两次运行除 `generated_at`/`git_head` 外逐键相等」
  （`:64 @determinism`）——**漂移判据直接复用这条既有不变量**，不自创第二套口径。
- **memory 教训（V4.5.1）**：门禁太激进 → 被 `--no-verify` 绕过 → 整条链失效（122s 超时史）。
  故必须把「时间相对字段」显式豁免：否则任何隔夜账本都会把**无证据变更**的 PR 判红，
  门禁变噪音 → 下一次就没人当它事。实测证据：`--today` 差 8 天时 309 处差异**全部**出自
  `tasks[].stale_days`（组 ⑩-8 把它钉死）。
- **Anthropic 决策链**：先证现状（干净仓库 check=0；篡改盘上账本 → 复现 K3 数字 1→6 / 25→27）
  → 最小改法（复用确定性不变量）→ 复跑对照 → CI 权威验收。
- **决策参考系（D333）**：DSH 决策镜头原则⑤「诊断不污染主路径」——门禁做成**旁路 job**，
  不进 pre-commit/pre-push/hooks；误伤成本 > 漏检成本的场景（隔夜）宁可豁免并写进契约。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/project/gen-project-board.py — 新增 `--check`（只读对账，漂移 exit 1 / 无法对账 exit 2）
  与 `--changed-files`（旁路触发族判定）；契约、漂移定义、豁免清单全部写进文件头
- tests/project/gen-project-board.test.sh — 新增组 ⑩（14 断言：先红/后绿/旁路不误伤/触发/缺账本/只读/隔夜豁免）
- .github/workflows/ci.yml — **末尾追加**一个独立 job（Ledger Freshness Gate），不动既有清单
- task-state/D848.json — 卡务登记
- .claude/task-briefs/2026-09-20-D848-ledger-freshness-gate.md — 本 brief
- memory/notes/proposed/2026-09-20-D848-ledger-freshness-gate.md — 决策沉淀

不做什么（含文件路径）：
- 不改 docs/synova/project/ledger.json 的**手写**内容（派生物，只由派生器重算产生；`--check` 只读不写）
- 不改 scripts/control-tower/pre-commit-check.sh、scripts/pre-push-check.sh（红线：主路径零新增检查）
- 不改 scripts/hooks/**、.git/hooks/**（同上）
- 不改 scripts/audit/**（审计红线）、不写审计标准
- 不改 scripts/project/pr-queue-scan.py（D811 写集）、不改 scripts/control-tower/**

## Q3: 验收 — 入口 → 交互 → 结果
入口：CI job `Ledger Freshness Gate`（`.github/workflows/ci.yml` 末尾）；
本地等价入口 `python3 scripts/project/gen-project-board.py --check [--changed-files ...]`。
处理：重算账本 → 与 `<--out>`（默认 `docs/synova/project/ledger.json`）对账 → 只比判定相关字段
（豁免 `generated_at`/`git_head`/`pr_queue`/`*/freshness`/`*/age_days`/`blocked[].days`/`tasks[].stale_days`）。
结果：一致 → exit 0 + 一行「✅ 账本与重算一致」；漂移 → exit 1 + 差异清单（定位到断言级）+ 一行重算命令；
变更集不含证据/标准类路径 → 一行 `skip:` + exit 0；账本缺失/损坏 → exit 2 显式点名。

## 架构层
治理层（scripts/project 派生器 + CI 旁路），不触 L1–L5。

## Done 标准
- [ ] ① 夹具先红后绿：`mk_evidence` 点亮断言但不重算 → `--check` exit 1（差异定位 `lines/1/assertions/1/status`）
      → 重算后 exit 0（组 ⑩-2/⑩-3）
- [ ] ② 重算一步可执行：`--check` 输出直接给 `gen-project-board.py --out docs/synova/project/ledger.json`（组 ⑩-2）
- [ ] ③ CI 旁路接线：新增独立 job；变更集无证据/标准类路径 → `skip` + exit 0（组 ⑩-4）；
      证据类路径 → 接管对账（组 ⑩-5）；主提交路径零新增检查（grep 零命中 + diff 只碰写集）
- [ ] ④ 反向夹具防误伤：组 ⑩-4 + 组 ⑩-8（隔夜 8 天仍一致，时间相对字段已豁免）
- [ ] ⑤ 只读保证：组 ⑩-7（`--check` 前后盘上账本指纹不变）
- [ ] ⑥ 边界 fail-closed：组 ⑩-6（账本缺失 → exit 2 显式点名，绝不静默当"一致"）
- [ ] ⑦ 真实仓库复现 K3 数字：篡改盘上账本 → 差异清单出现 `lines/9/v1_passed 1 → 6` 与
      `totals/v1_passed 25 → 27`（与 CTO 独立复算一致）
- [ ] ⑧ 主路径零回归：基线派生器与改版派生器同位置同参数输出**逐键相等**（除 `generated_at`/`git_head`）
- [ ] ⑨ 夹具全绿 `PASS=108 FAIL=0`（原 94/2 → 修掉 2 条过期真实仓库期望值 + 新增 14 条）
