# D858：canary 覆盖语义改为「可执行结构 + 物理展开」，注释降级为声明

- 状态: proposed（闭环落地后 git mv 到 implemented/）
- 日期: 2026-09-21
- 任务: D858 ｜ 工作树 `.synova-wt-d858` ｜ 分支 `gate/d858-canary-glob`
- 触发: K3 审计 `docs/synova/audit-reports/2026-09-20-K3-D854.md` §6/P1 + §5/P2 + L4 缺口收割 1/2/3

## 决策

`scripts/control-tower/check-canary-drift.sh` 的"已覆盖"语义，从**注释文本也不加区分地 grep** 改为：

1. **覆盖来源只认可执行结构**：非注释行的字面路径 + glob 模式按**文件系统物理展开**（`nullglob`，零命中不得当已覆盖）。
2. **注释降级为"声明"**：注释中声明的测试路径/glob 与物理覆盖比对，声明未被覆盖 → **假覆盖 → exit 1**（fail-closed，新增）+ `::error title=canary-fake-coverage`。
3. **告警独立通道**：漂移/幽灵/假覆盖摘要写 `$GITHUB_STEP_SUMMARY`（`::warning` 保留），使告警在 stdout 被重定向的绿腿上仍可见。

## 为什么（第一性原理）

"CI 绿" 之所以可信，前提是覆盖结论来自**可执行事实**。注释是给人读的声明，把声明当事实源 = 覆盖真相可被一行注释伪造（glob 删了注释还在 → 静默假绿），与 D526 "红态无防线感知"同类，属"防线自己不可信"。

## 边界（不做什么）

- 不改漂移告警的**不阻断**语义（存量 71 条不误伤）；只对"假覆盖"新增 fail-closed。
- 不碰 `.github/workflows/ci.yml`（CT-70/PR #682 独占）：`|| true` 吞退出码、成功路径不回捞 ⚠ → 另卡排期。
- 不碰 `tests/project/**`（#682 写集）、不碰 `scripts/audit/**`（审计红线）。

## 验证（物理可复现）

- 夹具：glob 接入被回退（注释仍在）→ exit 1；恢复 → exit 0（先红后绿两次原始输出）。
- 回归：main 真实 ci.yml → 清单 41 项 / 漂移 71 条 / exit 0（与基线逐字一致）。
- 预演：#682 的 ci.yml → 清单 43（41 字面 + 2 物理展开）/ 0 假覆盖 / exit 0。
- 独立通道：`GITHUB_STEP_SUMMARY=<file>` + `> /dev/null` → 摘要文件仍含告警文本。

## 影响面

治理层（`scripts/control-tower/`）单文件 + 其配对测试；无产品代码、无依赖变更、无 DSH 代码依赖（施工图 §100：scripts/ 属 🟡 层移植落点，Stage 3 才逐组改写）。
