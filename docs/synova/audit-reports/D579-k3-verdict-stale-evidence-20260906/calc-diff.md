# D579 evidence — calc-progress 真数据前后对账（calc-diff.md）

> 任务: D579（CT-55 k3 verdict stale/TTL 机制）| 2026-09-06 | 编码: DSH 编码线
> 复现命令见文末；本文件全部数据可由 K3 独立重跑验证。

## 1. 方法与同源保证

- 基线: origin/main @ `7afbb23f`（feat/d579-k3-verdict-stale 分支点）。
- before: 旧代码（修改前）跑 `python3 scripts/product-lines/calc-progress.py --out <tmp>/progress-before.json`。
- after: 新代码跑同命令 `--out <tmp>/progress-after.json`。**两次运行期间 worktree HEAD 均为
  `7afbb23f`（实现改动未提交）** → `git_touched_after` 的 `git log --since` 输入完全同源，
  diff 只反映代码机制变化，不混入提交时点效应。
- 证据目录为运行时状态（evidence/ 在 .gitignore L76）：运行期间测试套件（test_end_to_end →
  refresh-all A2）曾生成 5 份 `test-2026-09-06*.json` 运行时产物，污染过第一轮 after 运行
  （出现 11 点 stale→pending_k3 逆向假象）；已移出并重跑，本文件数据为**干净双轮**。

## 2. 全仓 diff 汇总（干净双轮）

| 指标 | before | after |
|---|---|---|
| 产品总进度 | 8% | 1% |
| verified 总数 | 13 | 2 |
| stale 总数 | 21 | 32 |
| 变化点数 | — | **11（全部 verified→stale，零逆向）** |

保持 verified 的 2 点 = **19-2 / 22-1**（真实数据"不误伤"对照组，见 §3.2）。

## 3. 逐点对照

### 3.1 转 stale 的 11 点（verified → stale）

| 点 | 失效前 k3 证据（governing = 最新 pass） | 失效原因 | git/日期事实 |
|---|---|---|---|
| 7-1 | k3-full-chain-20260813.json @ 2026-08-13 | **TTL 过期**（24 天 > 14） | 08-13+14=08-27 < 09-06 |
| 9-2 | 同上 | **TTL 过期** | 同上 |
| 11-1 | 同上 | **TTL 过期** | 同上 |
| 11-2 | 同上 | **TTL 过期** | 同上 |
| 18-1 | 同上 | **TTL 过期** | 同上 |
| 7-2 | k3-D575-D577-closeout.json @ 2026-09-05 | **modules 变更**（线 7） | ece4e268 09-05 16:18 触及 extensions/sentinels/、src/sentinel/；fdfc0799 09-05 00:53 触及 src/l3/ |
| 8-1 | 同 closeout @ 2026-09-05 | **modules 变更**（线 8 = src/sentinel/, src/l3/, extensions/notifications/） | ece4e268 触及 src/sentinel/runner.ts 等 3 文件；fdfc0799 触及 src/l3/、src/sentinel/ |
| 10-3 | 同 closeout @ 2026-09-05 | **modules 变更**（线 10） | ece4e268 触及 extensions/sentinels/ |
| 10-4 | k3-2026-09-02-productlines.json @ 2026-09-02 | **modules 变更**（线 10） | 7b576c89 (09-02) / ece4e268 / fdfc0799 |
| 20-5 | 同上 @ 2026-09-02 | **modules 变更**（线 20 = src/agent/, src/l2/, src/infra/, providers/） | 7b576c89 / c2762846 (09-04) / fdfc0799 |
| 24-4 | 同上 @ 2026-09-02 | **modules 变更**（线 24 = security/, src/infra/, src/l1/） | fdfc0799 触及 src/infra/、src/l1/ |

> **spec §3.6 必答 4 矩阵对照**: spec 列名的 8 点（7-1/9-2/11-1/11-2/18-1/10-4/20-5/24-4）
> **全部命中** ✅。另 3 点（7-2/8-1/10-3）为 spec 矩阵未列的**机制正确**失效：三点的 governing
> 证据是 D575-D577 closeout 的真 K3 记录（2026-09-05，`K3 independent audit (Mac
> kimi-k3-audit worktree)`），先于 D577 自身代码提交 ece4e268（09-05 16:18）落地——K3 审计通过
> 后该提交才进入 main，按 A1 语义证据失效待重验，**教科书式正确行为**。spec §4.1 基线枚举
> （10 个真 k3 verified 点）遗漏了 closeout 覆盖的 3 点，属 spec 事实清单不全，非实现偏差。

### 3.2 保持 verified 的 2 点（不误伤证明，真实 git）

| 点 | 证据 | 线 modules | 09-02 后提交数 |
|---|---|---|---|
| 19-2 | k3-2026-09-02-productlines.json | src/agent-observer/, observer-adapters/, src/l2/ | **0**（git log --since=2026-09-02T00:00:00 实测空） |
| 22-1 | 同上 | src/infra/, scripts/watchdog.js, src/deploy/, scripts/backup/ | **0**（同上实测空） |

两点均经 freshness_gate（TTL 内 + git_touched_after 零触及）→ verified，即真实数据上的
"机制配对证明"：同一机制对 19-2/22-1 放行、对 20-5/24-4（同日证据、modules 有变更）拦截。

### 3.3 线 1 逐点零变化（本单对线 1 零新增误伤）

| 点 | before | after |
|---|---|---|
| 1-1..1-7 | stale | stale（不变——D576 CT-53 降级后走 machine 路径，已 stale） |
| 1-8 | pending_k3 | pending_k3（不变——k3_only 无 k3 记录） |

线 1 的 8 份 k3 证据 note 均含「自动兑换（redeem-progress.py）」→ 加载时降级 task_redeem →
到不了 k3 分支 → 本单 freshness_gate 对线 1 零触达（与 spec §3.6 必答 4 修正后的前提一致）。

## 4. 合并后自效应评估（结论: 零）

本 PR 提交将触及 memory/notes/proposed/*.md，而线 15/线 18 的 modules 含 `memory/`。评估:

1. 线 15 当前 verified=0（15-1/15-3/15-4 已因 fdfc0799/ece4e268 于 09-04/05 触及 src/l2/ 而
   stale；15-7/18-6 为 pending_k3 无证据点，不走 machine 路径）→ 本提交不产生新增 stale。
2. 线 18 唯一 verified 点 18-1 本单已转 stale（TTL）→ 无新增。
3. 19-2/22-1 的 modules（src/agent-observer/, observer-adapters/, src/l2/, src/infra/,
   scripts/watchdog.js, src/deploy/, scripts/backup/）本 PR 零触及。
4. 其余全部线 modules（src/、electron/、extensions/ 等）与本 PR 写集（scripts/product-lines/、
   scripts/control-tower/、tests/control-tower/、task-state/D579.json、docs/、memory/notes/、
   .claude/task-briefs/、VERSION.md）零交集。

→ **合并后 K3 重跑 calc 预期看到与本文件完全一致的 11 点翻转，无自效应偏移。**

## 5. 同批发现的既有问题（不在本单修，如实登记）

1. **gen-cto-health-repro.test.sh 5 通过 / 2 失败（HEAD 既有）**: 未修改代码（origin/main
   @ 7afbb23f 主工作区）与本 worktree 结果逐字一致（"无 phantom: --strict 应 exit 0, 实际 1"
   + "清理后 --strict 应 exit 0, 实际 1"）。
2. **根因（已定位）**: `_head_tracked_files()` 的 `git ls-tree -r HEAD --name-only` 未处理
   git 默认 `core.quotepath=true` 的八进制转义 → **中文路径的工件永远不匹配 head_files** →
   task-state/D445.json 的中文 spec.path（strategy/SYNOVA-DESIGN-黄金场景与创始人驾驶舱-*.md，
   已提交、`git -c core.quotepath=off ls-tree` 可见）被误判 phantom → --strict exit 1。
   这同时解释了 U3 门禁在 HEAD 上的既有红。D579 变更对 phantom 计数**零贡献**（B 项不触碰
   _head_tracked_files）。**修复建议另立任务**（一行级: ls-tree 加 `-c core.quotepath=off`），
   本单写集纪律禁止顺手扩围（spec §6 对"同款相邻 bug"的先例处置：记入已知局限）。
3. **product-lines.test.py 既有失败 #2 的断言点位移**: test_real_repo_capital_line_zero_of_eight
   修复前失败于 L274 `assertEqual(line10["verified"], 0)`（实际 2）；修复后该断言**首次通过**
   （10-4/10-3 诚实转 stale），失败点移至 L278 `assertEqual(sum(verified), 5)`（实际 2）——
   测试仍 FAIL（不修不藏），其期望值本身是真实数据漂移前的旧基线。

## 6. K3 独立重跑指引

```bash
# 1) before（任一 origin/main checkout）:
python3 scripts/product-lines/calc-progress.py --out /tmp/k3-before.json
# 2) 应用本 PR 后（worktree HEAD 含 impl 提交前提下，git_touched 含 D579 提交——
#    其路径与本 PR 之外任何线 modules 无交集，见 §4）:
python3 scripts/product-lines/calc-progress.py --out /tmp/k3-after.json
# 3) 对账: 变化点 = §3.1 的 11 点，全部 verified→stale；19-2/22-1 verified 保持；线 1 不变。
# 4) 每点失效原因复核（示例）:
git log --since=2026-08-13T00:00:00 --format="%h %cd %s" -- src/sentinel/ src/l3/ extensions/sentinels/ src/cron/
python3 -c "import json;print(json.load(open('docs/synova/product-lines/evidence/k3-D575-D577-closeout.json'))['date'])"
```
