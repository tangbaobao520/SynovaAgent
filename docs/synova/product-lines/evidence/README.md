# evidence/README — D589 stale 重验批留证说明（2026-09-08）

> 依据: 派单-D589-stale重验批-20260907.md 执行规则 3（测试红/无法推进 → 留 stale 不动 + 本 README 登记，铁律 24 不静默）
> 运行环境注记（K3 D316 先例——环境先行）: 全量 vitest 于 worktree .synova-wt-d589 @ c1119d23 单次权威跑，
> **Node v22.23.2**（better-sqlite3 编译于 NODE_MODULE_VERSION 127 = Node 22；Node 24 跑同树出 350 假败，
> 换 v22 后 26——ABI 假失败复现实证）。json 快照: /tmp/d589-vitest-full.json（4009+4 总 / 3974 过 / 26 败 / 13 skip）。

## 一、本批产出（9 份 per-line evidence，全部 record_type=test、带 at）

stale-reverify-D589-line{1,2,7,9,10,11,18,20,24}.json — 对应线绑定套件全绿
（tests/electron 106/109+3skip、conversation 三套件 29/29、sentinel+cron 229/229、sentinels+compute 626/626、
connectors 13/13、evidence 6/6、security 103/103、providers 29/29）。

**calc 重算结果（2026-09-08）**: stale 17→10；pending_k3 36→**44**（+8: 1-1/1-3/1-4/1-5/1-6/1-7/7-3 机器治理点推进待裁判）；
**verified 维持 8**——机制上限（详见 §四），非本批证据不足。

## 二、留 stale 10 点原因清单

### A. k3 治理点（8 点）——test 证据不参与状态判定（calc 状态机: k3 pass 优先，机器证据仅留证）

| 点 | 治理裁决 | 留 stale 原因 | 恢复路径 |
|---|---|---|---|
| 7-1 | k3-full-chain-20260813 | TTL 过期（26 天>14） | 需 K3 新裁决（at 补齐不适用——裁决本体过期） |
| 9-2 | k3-full-chain-20260813 | 同上 | 同上 |
| 11-1 | k3-full-chain-20260813 | 同上（另: key-person-risk 无独立计算套件，CT-52 名义绑定同型） | 同上 + FIX: 补哨兵计算套件 |
| 11-2 | k3-full-chain-20260813 | 同上 | 同上 |
| 18-1 | k3-AUTHORITY-DEVICTION-REGISTRY | TTL 过期 | 同上 |
| 10-4 | k3-2026-09-02-productlines | TTL 内，但线 modules 被 09-07 合并（D586-D588）触碰——**变化真实晚于裁决** | 需 K3 对变更后代码复审（at 补齐=不诚实，禁用） |
| 20-5 | k3-2026-09-02-productlines | 同上 | 同上 |
| 24-4 | k3-2026-09-02-productlines | 同上 | 同上 |

### B. 环境豁免（1 点，派单明示除外）

| 点 | 原因 | 恢复路径 |
|---|---|---|
| 1-2 | Win 双击安装四断言需 Windows 目标机（D578 真机后 1-2 兑换等 Win 复跑——脚本已被 D581 修复为 UTF-8 BOM + evidence 落 git 跟踪路径） | Win 侧复跑 powershell -File scripts/desktop/win-install-verify.ps1 → evidence 入 git → CTO redeem |

### C. 机制缺口（1 点）——CT-62 粒度只接了 k3 路径，machine 路径不对称

| 点 | 原因 | 恢复路径 |
|---|---|---|
| 2-5 | 本批证据 at=2026-09-08T02:15:37+08:00 **晚于** D587 提交（00:53:58，触碰 src/agent/tool-loop-executor.ts ∈ 线2 modules）——真实新鲜；但 calc-progress.py machine 分支用 date-only（2026-09-08T00:00:00）判 touched → 误判 stale。**CT-62 的 at 粒度只接线到 freshness_gate（k3 路径），machine 分支未同步** | **FIX 建议（转控制塔派单，本单 scripts/ 不碰）**: status_for_point machine 分支 `git_touched_after(line_modules, latest["date"], …)` → `latest.get("at") or latest["date"]`（一行，与 k3 路径对齐）；修后本批 line2 evidence 即自动生效 |

## 三、全量 vitest 基线失败集（与 main 基线 diff=空——本单零代码变更，tests/ 无扫描 evidence 的测试）

26 失败 / 13 文件（存量，非本单引入；归属 FIX 派单建议）:
l4/edges/* 4（depends_on_platform/metric_binds/replenishes/substitutes 端点校验断言）、
l3 e2e-autonomy.integration 2 + graphbridge-wiring 1、expert-file-loader.integration 5 + analytical-lens 7
（专家 v2.0 七专家 vs 测试 8/9 专家时代——D490 遗留债②同族）、acceptance/zero-code-industry 2、
env/env-completion 2、deploy/data-directory 1、orchestrator l3-wiring 1 + phase1-diagnosis-wiring 1。

## 四、verified 为什么是 8（机制说明，对派单验收 1 的如实回答）

calc 六态状态机（scripts/product-lines/calc-progress.py §3.4，D572/CT-53/D576 反假绿设计）:
**test 类证据绿+新鲜 → pending_k3（待裁判，不计分）→ K3 出 pass 裁决才翻 verified**；
k3 治理点 test 证据不参与判定。故「测试绿 → verified」在当前机制下不可达；
本批把 8 个机器治理点推进到 pending_k3 待裁判队列 + 9 个 k3 治理点出全新机器证据，
**K3 下批审计（对 44 个 pending_k3 点）才是 verified ≥18 的合法路径**。
