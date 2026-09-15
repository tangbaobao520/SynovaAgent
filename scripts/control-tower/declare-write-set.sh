#!/usr/bin/env bash
# declare-write-set.sh — 写集**生成器**（一次做对的核心：人不手写路径）
#
# 背景（创始人 2026-09-14 指令）: 「固定一个格式/流程，保证开始的时候就一次做对」
#   根因：写集手写在 brief 的散文里 → 漏写（brief 自身/task-state/bypass.log）、格式错（、分隔/反引号/全角）
#        → 4 道门禁 4 套解析口径 → 错误只能在 CI 被抓（15~30 分钟/轮）
#   解法：写集改为**机器块**，由本脚本从真实变更集生成 → 人只审、不写。
#
# 用法:
#   declare-write-set.sh [--brief <path>] [--base <ref>] [--staged]
#     无 --brief 时读 .claude/current-brief 指向的 brief
#     --staged 用暂存区；否则用 <base>...HEAD
# 契约:
#   输入 = brief 路径 + 基准 ref；读取 git 变更集；不联网
#   输出 = 更新 brief 内 <!-- WRITE-SET:BEGIN -->...END 区块（不存在则创建「## 写集（机器生成，禁手改）」段）
#   退出码 = 0 已生成 | 1 写入失败 | 2 契约不满足（brief 缺失 / 变更集为空）
#   降级 = 变更集为空时 exit 2（不静默写空块）
set -uo pipefail
BRIEF=""; BASE="origin/main"; STAGED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --brief) BRIEF="${2:-}"; shift 2 ;;
    --base)  BASE="${2:-}";  shift 2 ;;
    --staged) STAGED=1; shift ;;
    *) echo "❌ 未知参数: $1" >&2; exit 2 ;;
  esac
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "❌ 非 git 仓库"; exit 2; }  # swallow-ok: 失败在下方显式判定（空变更集 → exit 2）
if [ -z "$BRIEF" ] && [ -f "$ROOT/.claude/current-brief" ]; then
  BRIEF="$ROOT/.claude/task-briefs/$(tr -d '[:space:]' < "$ROOT/.claude/current-brief")"
fi
[ -n "$BRIEF" ] && [ -f "$BRIEF" ] || { echo "❌ 找不到 brief（--brief 指定，或写 .claude/current-brief）"; exit 2; }
# D749: PR 级写集 = base..HEAD ∪ 暂存区（两次提交的 PR 也要一次声明全）
_C1="$(git -C "$ROOT" -c core.quotepath=false diff --name-only --diff-filter=ACMR "${BASE}...HEAD" 2>/dev/null | sed '/^$/d')"  # swallow-ok: 失败在下方显式判定（空变更集 → exit 2）
_C2="$(git -C "$ROOT" -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR | sed '/^$/d')"
if [ "$STAGED" = "1" ]; then _C1=""; fi
FILES="$(printf '%s\n%s\n' "$_C1" "$_C2" | sed '/^$/d' | sort -u)"
[ -n "$FILES" ] || { echo "❌ 变更集为空（基准 '$BASE' 是否正确？）"; exit 2; }
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{
  echo "## 写集（机器生成，禁手改）"
  echo ""
  echo "| 文件 | 类型 |"
  echo "|---|---|"
  printf '%s\n' "$FILES" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      .claude/bypass.log) echo "| $f | builtin（hook 运行期产物，自动豁免） |" ;;
      *)                  echo "| $f | task |" ;;
    esac
  done
} > "$TMP"
python3 - "$BRIEF" "$TMP" <<'PY'  # D520: 纯 stdlib，无平台敏感依赖（见 PLATFORM-CHECKLIST.md）
import sys, pathlib, re
brief, block = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
s = brief.read_text(encoding="utf-8")
head = "## 写集（机器生成，禁手改）"
if head in s:
    i = s.index(head)
    m = re.search(r"\n## (?!写集)", s[i + len(head):])
    j = i + len(head) + (m.start() + 1 if m else len(s) - i - len(head))
    s = s[:i] + block.rstrip("\n") + "\n\n" + s[j:].lstrip("\n")
else:
    s = s.rstrip() + "\n\n" + block.rstrip("\n") + "\n"
brief.write_text(s, encoding="utf-8")
print(f"✅ 写集段已生成: {brief}")
PY
rc=$?; [ "$rc" -eq 0 ] || { echo "❌ 写入 brief 失败"; exit 1; }
echo "   条目数: $(printf '%s\n' "$FILES" | wc -l | tr -d ' ')（含 builtin 自动豁免）"
exit 0
