---
状态: proposed
日期: 2026-09-20
决策: 未合 PR 队列按 DSH 决策镜头收口——① 上限=12 做**提示层**（超限出显式告警、退出码仍 0，不拦死）；② 队列健康做成**旁路派生指标**（挂 `ledger.json.pr_queue`，主提交路径零新增检查）；③ 退役按**机器可判理由码**（CONTENT_IN_MAIN / CARD_CLOSED / CI_RED_LONG / ORPHAN_STALE）排序出可签字清单，退役=关 PR 不删分支（内容可重派）。
理由: ① 队列实测 46 个 / 上限 12（开局 42，本任务执行期间增至 46——队列仍在涨）；每合并一次其余 PR 变 dirty → 全队列重跑 CI（派单实测反复 4 次）。② DSH 六原则里两条直接管这里：`dsh-experimental-agent-team/lib/index.js:564`（TEAM_MEMBER_LIMIT throw）与 `:1327`（TEAM_TASK_LIMIT throw）= 上限即纪律、超限第一动作是退役；`dsh-tool-workflow/lib/index.js:106`「the agents do the work, the script only coordinates them」+ `dsh-output-retention`= 诊断旁路、不进主入口。③ 本项目 M3「机制建成未接线」复发多次，故本次指标必须真挂进 ledger.json（派生链）才算交付。④ 上限「只提示不拦死」是派单 §一.3 明令，也是对「再加一道门禁」反模式的执行（DSH 决策镜头 §五）。
---

## 落地件（本 PR）

- `scripts/project/pr-queue-scan.py`（新建：纯读台账扫描器；纯函数核心可离线夹具直测；ADR 级零三方依赖）
- `scripts/project/gen-project-board.py`（既有账本派生器挂旁路段 `pr_queue`；快照缺/坏 → null + skipped_sources，不计 degraded）
- `tests/project/pr-queue-scan.test.sh`（46 项断言：正常/上限红绿/五条理由正负例/降级/幂等/纯读）
- `tests/project/gen-project-board.test.sh` 组⑨（pr_queue 挂链 + 缺失不降级 + 超限只告警）
- `docs/synova/project/pr-queue.json`（快照，机器算；禁手改）
- `docs/synova/coordination/队列收口-D811-20260920.md`（可签字关闭清单 + 全队列处置表）

## 未做（显式边界）

- **不关闭任何 PR**：扫描器源码级无写操作（测试组⑧ 断言），关闭需创始人签字。
- **不碰 D839 地盘**：`scripts/control-tower/{staging_guard.py,synova-commit}`、`scripts/workflow/resolve-commit-brief.sh` 零改动（`claim_release.py` 在 main 不存在，属 PR #657 分支）。
- **不加主路径检查**：`scripts/pre-commit-check.sh` / git hooks 对 `pr-queue-scan` 零引用（见报告驗证段）。

## 相关 D#

- 上游依据：D795（账本派生器）/ D794（项目总览插件，消费 ledger.json）/ D788（PR 预算门禁，上限 12 同源）
- 同域在飞：D839（认领制根治，PR #657 待 K3 审计——本任务硬边界来源）
- 卡：`task-state/D811.json`
