---
状态: proposed
日期: 2026-09-20
决策: 派生物（ledger.json）的"该不该重算"必须由机器判定——派生器提供只读 --check，判据直接复用其既有 @determinism 不变量，并显式豁免时间相对字段；接线走 CI 独立旁路 job，主提交路径零新增检查
理由: K3 D815 P1 实证：证据 09-17 已合入，main 的账本停留在线10=1/6（重算 6/6、全局 25→27），派单/汇报引用过期数字却无告警——派生物"没重算"本身是静默故障。反例风险同样真实：把时间相对字段纳入判定会让任何隔夜账本在无证据变更的 PR 上误报（实测 --today 差 8 天 = 309 处差异，全部出自 tasks[].stale_days）→ 门禁变噪音 → 被绕过（V4.5.1 教训）
---

## 上下文（D848 / K3 D815 P1）

`docs/synova/project/ledger.json` 是 `scripts/project/gen-project-board.py` 的**派生物**（文件头明示禁手改），
真相在 git（task-state 卡片 + product-lines.yaml + V1 断言表 + 两处证据目录）。
K3 D815 P1 的实证：D803 证据 09-17 已合入，账本仍停在「线10 = 1/6」；CTO 独立复算 = 6/6、全局 25→27。
根因不是派生错，而是**派生没发生、也没机制知道**——`grep -rn "gen-project-board" scripts/pre-commit-check.sh
scripts/pre-push-check.sh scripts/hooks/ .git/hooks/` 零命中，派生器从未被任何门禁调用。

## 定位（现象 → 根因 → 改法 → 依据）

| # | 现象 | 根因 | 改法 | 依据（file:line） |
|---|---|---|---|---|
| ① | 证据已合、账本没动，无人报警 | 派生器只有"生成"没有"对账"（CLI 无 --check）；派生器未被任何门禁调用 | 新增只读 `--check`：重算并与盘上账本逐键比较，漂移 exit 1 | `scripts/project/gen-project-board.py` CLI（原 :672-686 无 --check）；零引用 grep 见上 |
| ② | 判据会自创第二套口径 | —— | **直接复用文件既有不变量**：`@determinism — 同输入连续两次运行，除 generated_at / git_head 外逐键相等`（`:64`） | 同上 |
| ③ | 若把时间相对字段纳入判定 → 隔夜误报（无证据变更的 PR 也红） | `freshness`/`age_days`/`blocked[].days`/`tasks[].stale_days` 都是相对「今天」的量 | 显式豁免并写进契约；组 ⑩-8 用「生成日 vs 8 天后」断言锁死 | `freshness_bucket` :128；`today - since` :51；实测 8 天差 = 309 处差异全部出自 `tasks[].stale_days` |
| ④ | 门禁压主路径 = 全量检查负担 | 控制塔纪律：pre-commit/pre-push 是唯一物理阻断点，加检查有超时→绕过史（V4.5.1） | 接线走 **CI 独立 job**（append-only），变更集不含证据/标准类路径时直接 skip | `.github/workflows/ci.yml` 末尾新增 `ledger-freshness`；`git diff --numstat` = 19 insertions / 0 deletions |
| ⑤ | 账本缺失/损坏时容易"静默当一致" | 三态语义缺失 | exit 2 = 无法对账，显式点名（D328 三态：0 通过 / 1 业务阻断 / 2 检查执行失败） | 组 ⑩-6 断言；`.dsh/skills/ctrl-tower-change` 模式 1 |
| ⑥ | `--check` 若顺手写盘 = 破坏"只读"承诺 | —— | `--check` 分支在写盘**之前** return；组 ⑩-7 用 sha256 断言盘上账本指纹不变 | main 内 check 分支位置 |

## 触发族（防误伤的另一半）

`--changed-files` 给了就判定：变更集里**是否含**证据/标准类路径——两处证据目录（`DEFAULT_EVIDENCE_RELS` :107）
+ `product-lines.yaml` + V1 断言表（`26线-V1验收标准*.md`）+ `ledger.json` 自身。其余路径（脚本/文档/src/**）不触发。
`ledger.json` 自身入触发族是有意的：手改派生物同样会被抓到。

## 边界与后续

- **不新增主路径检查**：pre-commit / pre-push / hooks 零改动（grep 零命中 + `git status` 只列写集）。
- **残留（建议另开卡）**：
  (a) 真实仓库冒烟的冻结数字（`backlog_points` / `v1_passed`）是"冻结移动目标"——本卡只把过期值
      更新为真值（46 / 27）；根治做法是不变量断言（`v1_passed == Σ lines[].v1_passed`、
      `backlog_points == pl_total_points - v1_total`）。
  (b) `tests/project/*.test.sh` 整体**未接入 CI**（`grep tests/project/ .github/workflows/*.yml` 零命中）：
      本卡只接了自己的旁路 job（`--check` 不跑该夹具），夹具 CI 化建议随 CT-51 队列处理。
- **待验**：本分支 CI（Gate Tests 与新增 Ledger Freshness Gate）——`gate/ledger-fresh-b` 不是 `feat/*`，
  需 PR 或探针枝才能触发；本地已用与 CI 完全相同的命令仿真通过（普通变更 → skip exit 0）。
