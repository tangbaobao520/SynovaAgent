---
状态: implemented
日期: 2026-09-10
决策: grep -P（PCRE）家族在 scripts/workflow/ + scripts/control-tower/ 全清——换 POSIX ERE（\d→[0-9]、\s→[[:space:]]、\w→[a-zA-Z0-9_]、\b→显式边界、\K→sed/awk 捕获）；external-auditor.sh 空 FINDINGS 数组加 :- 防御 + file_line 提取 || true
理由: macOS BSD grep 无 -P → grep -oP 报错 exit 2 → || true 吞掉 → 检查静默失效（D421/D660 已三次复发）。一次全清两目录防第 5 次复发。
---

## 背景

D421 修 post-commit.sh 同款（BSD grep 无 -P → 命令报错 → || true 吞掉 → 检查静默失效）。
D660 实证 resolve-commit-brief.sh:60 失效（陈旧 current-brief 日期提取在 macOS 下 BD 恒空 → 陈旧 brief 被误用）。
D661 全仓盘点 scripts/workflow/ + scripts/control-tower/：
17 处 grep -oP + 2 处 grep -rohP + 1 处 grep -qP（跨 10 文件），
外加 external-auditor.sh 空数组 `${FINDINGS[@]}` 在 bash 3.2 set -u 下 `unbound variable` 崩溃（10 处，本机实测 exit 1）。

## 决策

- 全部换 POSIX ERE，不是简单 -P→-E：`\d`→`[0-9]`、`\s`→`[[:space:]]`、`\w`→`[a-zA-Z0-9_]`、
  `\b`→显式边界 `(^|[^a-zA-Z0-9_])…([^a-zA-Z0-9_]|$)`、`\K`→`grep -oE`+`awk '{print $NF}'`/`sed 捕获`。
- external-auditor.sh：`${FINDINGS[@]}`→`${FINDINGS[@]:-}`（10 处读引用）+ `file_line` 提取加 `|| true`
  （修复检测生效后 set -e 下无匹配 exit 1 的隐藏崩溃——原被 grep -oP 失效掩盖）。
- 回归网：tests/control-tower/grep-oP-regression.test.sh（grep -P 两目录 0 命中）。
- 语义收窄披露：`\b`→显式边界在「as any 紧贴 diff + 标记、无缩进」病理场景下略收窄
  （真实 TS 代码恒缩进，不影响检测；右边界保留 `([^a-zA-Z0-9_]|$)` 不丢行尾匹配）。

## 关联

- 前科：D421（post-commit.sh）、D660（resolve-commit-brief.sh:60）
- U7/CT-40 配对测试：本卡补 6 个脚本配对测试（dev-doc-gatekeeper/external-auditor/check-dataflow-alignment/
  check-test-first/hook-check-task-scope/verify-incremental）
- 顶层 scripts/（pre-commit-check.sh/hooks/checks/check-*.sh）grep -P 残留属独立后续任务（本卡范围限两目录，CTO 拍板）
