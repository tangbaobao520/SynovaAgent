---
状态: implemented
日期: 2026-09-12
决策: scripts/ 全目录 27 处 `grep -P`（PCRE）逐处转译为 POSIX ERE（`-oE`），三处 `\K` 改「grep -oE 取全匹配 + sed -E 剥前缀」；回归网从 2 个目录扩到 scripts/ 全目录并接入 CI 密封清单
理由: BSD grep（macOS）无 `-P` → 含该 flag 的门禁检查在本机**静默失效或报错**（V3.9：静默失效的门禁 = 没有门禁）。D661 只清了 workflow/ + control-tower/ 两目录，剩余 27 处分布在 hooks/、checks/、根级 check-*.sh —— 恰好是 D661 回归网**扫不到**的目录。D661 同时建了 `grep-oP-regression.test.sh` 却没把它加进 ci.yml 密封清单 → 该网从未在 CI 跑过（M3 机制建成未接线）。
---

## 决策

1. **逐处转译而非整段重写**：能直译的（`\d`→`[0-9]`、简单字符类）只换 flag；不能直译的分类处理。
2. **三处 `\K` 的等价路径**：`\K`（"丢弃此前匹配"）在 ERE 无对应物。改 `grep -oE` 取全匹配 + `sed -E` 剥已知前缀：
   - `export (function|class|const) \K\w+` → `grep -oE 'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' | sed -E 's/^export (function|class|const) //'`
   - `#CRITERIA\s*[:=]\s*\K[A-D]` → `grep -oE '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' | sed -E 's/.*[=:][[:space:]]*//'`
   - `\.claude/task-briefs/\K[^.]+` → `grep -oE '\.claude/task-briefs/[^.]+' | sed -E 's|^\.claude/task-briefs/||'`
3. **回归网扩容到 scripts/ 全目录**，并加**语义金值断言**（每个转译后的模式配 fixture + 期望输出）。
4. **回归网接入 CI**（ci.yml 密封清单末尾 +1 行）。

## 为什么「只换 flag」不够：一个实测的转译陷阱

首版把 `pre-doc-audit.sh:198` 的 `[^\s\)\]"']` 直译成 `[^[:space:]\)\]"']`。**这是错的**：
PCRE 里 `\]` 是转义的 `]`；而 POSIX ERE 的**方括号表达式内反斜杠不是转义符** → `\]` 中的 `]`
会**提前闭合字符类**，剩下 `"'》；,;]+` 变成类外的字面量 → 整个模式匹配不到任何东西。

正确写法是把 `]` 放在类首（POSIX 规定 `]` 紧跟 `^` 时为字面量）：`[^][:space:])"'；,;]+`。

**这个陷阱是被本任务新加的语义金值断言当场抓到的** —— 只做 `grep -P` 残留扫描（零命中）
会让它静默通过。这是「回归网要断言语义，不能只断言 flag 消失」的实证。

## 为什么回归网必须先接入 CI 才算交付

D661 建了网却漏了接线（不在 ci.yml 密封清单）→ 网只在开发者本机跑过。
按 M3 模式，**未接线的机制 = 不存在的机制**。本任务把 `grep-oP-regression.test.sh`
加入密封清单末尾（+1 行；与 Win 线 D703/D704 预期一次 merge 冲突，按 union 手工解）。

## 排除项（不是漏修）

- `scripts/hooks/post-commit.sh:122` —— 描述该问题的**注释**，不执行
- `scripts/pre-commit-check.sh:1367` —— 同上
- `scripts/pre-commit-check.sh:1374` —— 便携性**检测器自身**的模式字面量（须保留才能检测别人）→ 加 `grep-P-scan-ok` 哨兵供回归网排除
- `PLATFORM-CHECKLIST.md` —— 文档

## 参考系

- 第一性原理：门禁脚本必须在自己执法的所有平台上可运行
- GNU grep 手册：`-P` 明示为实验特性；POSIX ERE 无 `\d \s \S \K`
- 铁律 11（静默降级禁止）、铁律 35（自动化优先）、V3.9、M3、M5
- D661（PR #481，首次清理范式）、D421（post-commit.sh 同族首次暴露）

## 留痕

- 回归网: `tests/control-tower/grep-oP-regression.test.sh` 33/33 绿（含语义金值 + 反向哨兵）
- 门禁: macOS 本机 `bash scripts/pre-commit-check.sh` rc=0（13 组）
- 基线对照: `check-integrity-startup.sh` rc=1 与 origin/main 一致（存量，非本次回归）；
  `pre-doc-audit.sh` 首行 BOM 亦在 origin/main 存在（存量，已登记）
