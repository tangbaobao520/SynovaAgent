# PR #803 正文（六项模板）— D962 α 单 PR

> 产出：d962-coder-b（task-23）。gh CLI 不可用——本文件为待粘贴正文（CTO/队长执行 `gh pr edit 803 --body-file`）。
> 刷新：已 re-sync 至 main@ef299746（机制 a 合并，未重写 hash，未 force）。

## ① 卡号 + 分支 + sha
- 卡：D962（阶段 2a①②③⑥ + 合并候选 + 声明源补齐 + 刷新）
- 分支：`feat/d962-2a-merge` @ **9aa0f13e**（base=merge-base origin/main@ef299746）
- 关联：chore/d962-2a-scripts（已并入）/ feat/d962-2a-precommit-b（已并入）/ chore/d964-linter-wiring（**不在本 PR**，入 main 后 rebase 重验）

## ② 写集声明
75 文件逐条（18A+26D+31M）＝ `task-state/D962.json` write_set ＝ brief Q2 双源一致；merge_writeset_gate 夹带=0，双向差实测=0。

## ③ 逐条判据（本次 re-sync 后新跑，非旧绿）
- `merge_writeset_gate`：✅ pass — 夹带=0，变更集 75（merge-base ef299746）
- `grep-oP-regression.test.sh`：24 通过 / 0 失败
- pre-commit 自过：rc=0；**399 行** / 断面 `grep -c check-dsh-anchor` = **3**
- 电池抽 8（上一轮 task-21 已贴）：hard-gate-convergence/g10/ct-health/gen-cto-health/brief-parseable/utf8/verify-incremental/ci-strict-visible 全 PASS
- 权威口径 `find scripts -type f -name 'check-*' ! -path 'scripts/audit/*' | wc -l`：main **48** → 本 PR 合并后 **24**（口径对齐注：CTO 51/25 系旧 base；队长 22 系 re-sync 前值；本值 = main@ef299746 同步后实测）

## ④ 改坏即红原始输出（代表三则）
1. as any 探针（CI strict）：`❌ as any / as never / as unknown as 零容忍（铁律38）: 1 处 [CI strict——软提示转硬]` → exit 1
2. G10 越界（死分支修活后首次真判定）：`❌ G10: 条件区域不匹配: 1 处 [CI strict]` + 越界文件点名
3. D547 骨架 brief（早退路径并入后）：`❌ 骨架 brief 占位符未填（D547）: <path> [硬阻断]` → exit 1
（完整回归集 R1-R8 见 D962-2a-selfverify 与交付报告）

## ⑤ 红线段
未碰 `scripts/audit/**`、`docs/synova/audit-reports/**`、`src/**`；未改 `.github/workflows/ci.yml`（canary→2b，#804 后）；未用 force push / `--no-verify`（GATEKEEPER ACK 降级均有 degraded-events 登记）。

## ⑥ 未清项登记
1. 权威口径 24 → ≤20 需再退役 ≥4（canary-drift 2b −1 + 可退役清单 ≥3，task-24 产出供 CTO 批）
2. pre-commit 4 处关键路径 `|| true`（DOC_ONLY/git 采集族/G10/G12 python 静默跳过）——task-24 清零
3. D964 rebase（等本 PR 合入）
4. 2b iron-laws 挂载（等 #804 合入；窗口期判定面清单在 D962-phase2-plan §九）
5. check-bypass-log.test.sh 环境依赖（分支态 FAIL/main 态 PASS，合入自动回绿）
