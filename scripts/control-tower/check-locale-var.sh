#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-locale-var.sh — `$VAR` 紧贴非 ASCII 常驻扫描（D738）
#
# 背景（红线条目：同类第二次）:
#   D370 记载：`LC_ALL=C.UTF-8` 下 bash 会把紧跟 `$VAR` 的全角标点并入**变量名**
#   （实测 `SENT_LINE（` → `bash: SENT_LINE�: unbound variable`）。变量**即使已赋值**
#   也照样 unbound —— 因为解析出的是另一个名字。
#   批 A 修了 4 处（check-pr-budget.sh×3 + check-ownership.test.sh×1），D735 开测**又踩 1 处**。
#   阴险之处：**只在失败路径触发** —— 正常路径全绿，一到要报错就崩，门禁最需要说话时哑掉。
#   本条属「同类错误第二次 = 防线系统性失效」，故必须机器化（铁律 35：能变 check-*.sh 的不靠 review）。
#
# 契约（铁律 47）:
#   @input  — 位置参数 FILE...（相对或绝对路径）
#             **空参数 = 全仓模式**：扫 scripts/ 与 tests/ 下的 bash 文件
#             （判定 bash = 扩展名 .sh，或首行 shebang 含 bash）
#   @output — stdout 逐行 `file:line  $VAR`（命中清单）+ 末行汇总；全仓模式额外报扫描文件数
#   @exit   — 0 = 无命中；1 = 有命中（业务阻断）；2 = 检查执行失败（python 不可用等，fail-closed）
#   @degraded — 无静默降级：python 不可用 → 显式 exit 2，不与「通过」混同
#   @error  — 不抛；全部经退出码表达（ctrl-tower 模式 1）
#
# 约定（判据可核）:
#   · **跳过全行注释**（首个非空白字符为 `#`）—— 与 pre-commit「as any 跳过注释行」同惯例：
#     注释不参与执行，误报会制造噪音，噪音导致整条门禁链被绕过（V3.9 教训）。
#   · 只认「未加花括号」形态：`${VAR}` 是正解，`$VAR` 紧跟非 ASCII 才是缺陷。
#   · **保守取向（有意）**：不做引号解析 —— `'...'` 单引号内的字面量也会被报（实测: 测试 fixture 即命中）。
#     取舍理由: 漏报（真缺陷溜过）比误报贵得多；引用解析一旦 desync 会造成静默漏报。
#     规避法: 在脚本里用 `printf '...%s...' '$N'` 之类传参构造字面量，而不是直接写死在源码里。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 注意: 不可写 `A || B && C` —— 左结合会变成 (A||B)&&C，git 成功时仍会执行后面的 pwd，
# 把两行都塞进 ROOT（相对路径解析随即全失效；D738 验收跑实测踩到）。分开写。
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3 —— Win 部分机器无 python3.exe）
PYBIN=""
for _c in python3 python py; do  # PYBIN 三级探测（PLATFORM-CHECKLIST #1 / D520 平台敏感命令扫描标记）
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo "❌ check-locale-var: python 不可用 — 扫描无法执行（fail-closed，不当作通过）" >&2
  exit 2
fi

OUT="$("$PYBIN" - "$ROOT" "$@" <<'PYEOF'
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
argv = [a for a in sys.argv[2:] if a.strip()]

# $NAME 紧跟一个非 ASCII 字节（且未加花括号 —— 花括号形态 \$ 后直接是 '{'，本正则不匹配）
PAT = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)(?=[^\x00-\x7F])")


def is_bash(p: pathlib.Path) -> bool:
    if p.suffix == ".sh":
        return True
    try:
        first = p.read_text(encoding="utf-8", errors="replace").split("\n", 1)[0]
    except OSError:
        return False
    return "bash" in first and first.startswith("#!")


files = []
if argv:
    for a in argv:
        p = pathlib.Path(a)
        if not p.is_absolute():
            p = root / p
        if p.is_file():
            files.append(p)
else:
    for base in ("scripts", "tests"):
        d = root / base
        if d.is_dir():
            files.extend(sorted(f for f in d.rglob("*") if f.is_file() and is_bash(f)))

hits = 0
scanned = 0
for p in files:
    try:
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        continue
    scanned += 1
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("#"):
            continue                      # 全行注释不参与执行 —— 跳过（判据见脚本头「约定」）
        for m in PAT.finditer(line):
            hits += 1
            try:
                rel = p.relative_to(root)
            except ValueError:
                rel = p
            print("%s:%d  $%s" % (rel, i, m.group(1)))

if not argv:
    print("--")
    print("扫描 bash 文件: %d 个（scripts/ + tests/）" % scanned)
sys.exit(1 if hits else 0)
PYEOF
)"
RC=$?

printf '%s\n' "$OUT" | grep -v '^--$' | grep -v '^扫描 bash 文件' || true
if [ "$RC" -eq 0 ]; then
  echo "✅ check-locale-var: 无命中（\`\$VAR\` 紧贴非 ASCII 且未加花括号）"
  printf '%s\n' "$OUT" | grep '^扫描 bash 文件' || true
  exit 0
elif [ "$RC" -eq 1 ]; then
  N=$(printf '%s\n' "$OUT" | grep -cE '^[^ ].*:[0-9]+  \$' || true)
  N="${N//[^0-9]/}"
  echo ""
  echo "❌ check-locale-var: 命中 ${N} 处 —— \`\$VAR\` 紧跟非 ASCII 未加花括号"
  echo "   修法: 改成 \${VAR}（花括号显式边界）。LC_ALL=C.UTF-8 下 bash 会把紧跟的全角标点"
  echo "         并入变量名 → set -u 时 unbound variable，且**只在失败路径触发**（门禁最需说话时哑掉）"
  printf '%s\n' "$OUT" | grep '^扫描 bash 文件' || true
  exit 1
else
  echo "❌ check-locale-var: 扫描执行失败（exit=${RC}）— fail-closed，不当作通过" >&2
  printf '%s\n' "$OUT" | head -5 >&2
  exit 2
fi
