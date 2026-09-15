# 验收证据目录纳入域判定豁免（D758）

> 状态: implemented | 日期: 2026-09-15 | 决策: `docs/synova/product-lines/evidence/**` 加入 ownership.yaml 的 `domain_neutral` | 理由: D734 单域判定把「Win 的代码 + Win 自己的验收证据」误判为跨域，卡死 line-1 的 1-5 双引导 PR #538

## 一、触发（实测假阳性，非推测）

清 25 个 open PR 积压时，PR #538（`feat(D716): 1-5 双引导收敛`）同步 main 后 CI 变红：

```
❌ D734 PR 预算超限: 10 处  [CI strict]
   ✅ ① 变更文件数 9 ≤ 上限 12
   ❌ ② 变更跨域 —— 一个 PR 只许一个域（D733 ownership.yaml）
   mac  docs/synova/product-lines/evidence/D716-win-20260913/1-5-dual-guide-win-evidence.txt
   win  docs/synova/runbooks/desktop-dev-prod.md
   win  src/server.ts
   win  tests/electron/dual-guide-packaging-guard.test.ts
   win  tests/routes/setup-guide-retired.test.ts
```

9 个文件里唯一被判 mac 的，是 **Win 这条线自己的验收证据**（目录名自带域：`D716-win-*`）。
文件数没问题、代码域没问题 —— 唯一卡点是证据落点的归属。

## 二、判定：假阳性，不是真跨域

- `docs/synova/product-lines/**` 归 mac 的来由是 TASK-ROUTING L32「产品线工具链（进度计算/页面）是 Mac 的」。
  **证据不是工具链** —— 证据是「谁干的活、谁留的证」，跟着干活的线走。
- 已有先例：`.claude/task-briefs/**`、`task-state/**`、`memory/notes/**`、`.codex/**` 同样「各线都写自己那一份」→ 早已在 `domain_neutral`。
- 后果（不修的代价）：每条 Win 线交证据的 PR 都被判跨域 → 要么拆 PR 把证据与代码割开（证据与实现脱节），
  要么放弃把证据落 git（违反主线计划「②报告可溯源」）。同族：PR #511、#534。

## 三、改了什么

`docs/synova/coordination/ownership.yaml` 的 `domain_neutral` 增加 `docs/synova/product-lines/evidence/**`，
并把实测依据写进注释（不改 rules —— 该路径仍归 mac 供 CODEOWNERS 用；只在单域判定中不计域）。

## 四、验证（红→绿→反向必红）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 绿 | `check-pr-budget.sh --files "<#538 四个文件>"` | ✅ ② 变更单域: win（域判定豁免 1） |
| 反向必红 | 临时移除 `domain_neutral` 中的证据项 → 同命令 | ❌ ② 变更跨域 |
| 恢复 | 还原 yaml → 同命令 | ✅ 单域 win |
| 回归 | `tests/control-tower/check-ownership.test.sh` | 51 项全过 |
| 回归 | `tests/control-tower/check-pr-budget.test.sh` | 24 项全过 |

新增断言（防回归）：证据 + Win 代码 → 单域；证据 + Win 代码 + Mac 脚本 → 仍跨域（豁免不掩盖真跨域）；
豁免路径不参与 `--owner` 断言（两种模式都不判域）。

## 五、边界（没有放松什么）

- 真跨域仍拦：Win 代码 + Mac 控制塔脚本/工具链 → exit 1（有断言）。
- 文件数上限 12 未动（`--max-files` 默认值不变）；D734「禁调高上限」不变。
- `--owner` 断言模式下豁免路径不参与（与既有 `domain_neutral` 语义一致）。
