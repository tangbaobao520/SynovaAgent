#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-claims-table.sh — U4 交付方"声称↔证据"自证表校验（格式版，不预跑命令）
#
# 背景 (M2, K3 降本前提): 交付方声称没有绑定可执行证据，K3 只能当侦探重新查。
#   本门禁强制 dev doc「交付声明」节含"声称↔证据对照表"（三列: 声称|证据命令|预期），
#   机器校验格式 + 证据命令白名单（只读）+ 拒绝 shell 元字符。
#
# 安全边界（最高风险点）: 本版**不执行**证据命令，只做静态格式校验——
#   - 白名单首 token（grep/git/vitest/ls 等只读命令）
#   - 拒绝 shell 元字符 ( ; & $ ` > < )，管道 | 允许（markdown 内转义 \|）
#   命令预跑留到第二版（需严格沙箱 + 超时 + 白名单增强）。
#
# 用法: verify-claims-table.sh <dev-doc> [<dev-doc2> ...]
# 退出码: 0 = 无交付声明节(跳过)/对照表格式完整; 1 = 有声称无证据/命令非白名单/含危险字符;
#         2 = 检查执行失败/降级（doc 不存在/python 不可用）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

DOCS=("$@")
if [ "${#DOCS[@]}" -eq 0 ]; then
  echo "用法: verify-claims-table.sh <dev-doc> [<dev-doc2> ...]" >&2
  exit 2
fi

BLOCKED=0
DEGRADED=0

for doc in "${DOCS[@]}"; do
  [ -z "$doc" ] && continue
  if [ ! -f "$doc" ]; then
    echo "  ⚠️  交付报告不存在: $doc — 降级 (exit 2)" >&2
    DEGRADED=1
    continue
  fi
  python3 - "$doc" <<'PYEOF'
import re, sys

WHITELIST = set("grep git vitest ls wc cat head tail find test diff stat file du sed awk sort uniq python3 node".split())
# 危险 shell 元字符 (注入向量): ; & $ < > `（管道 | 允许, markdown 表内转义 \| 的反斜杠不算危险）
FORBIDDEN = set(";&$<>`")

path = sys.argv[1]
try:
    text = open(path, encoding="utf-8", errors="replace").read()
except OSError:
    sys.exit(2)
lines = text.splitlines()

# 1. 找「交付声明」节 (## / ### / #### 标题)
decl_idx = None
for i, ln in enumerate(lines):
    if re.match(r"^#{2,4}\s*交付声明", ln):
        decl_idx = i
        break
if decl_idx is None:
    # 无交付声明节 → 跳过（无需对照表，纯文档/纯实现不需要）
    sys.exit(0)

# 2. 在该节内找含「声称」+「证据」列的表头
header = None
table_start = None
for i in range(decl_idx + 1, len(lines)):
    ln = lines[i]
    if re.match(r"^#{2,4}\s", ln):
        break  # 下一个标题 → 节结束
    if ln.strip().startswith("|") and "声称" in ln and "证据" in ln:
        header = ln
        table_start = i
        break
if header is None:
    print(f"  ❌ {path}: 有「交付声明」节但无「声称↔证据」对照表（表头需含 声称/证据 列）")
    sys.exit(1)

# 3. 解析数据行（三列: 声称 | 证据命令 | 预期）
def split_row(ln):
    s = ln.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    # 按未转义 | 拆分（\| 视为命令内管道，不拆）
    return [c.strip() for c in re.split(r"(?<!\\)\|", s)]

errors = []
n_claims = 0
for i in range(table_start + 1, len(lines)):
    ln = lines[i]
    if re.match(r"^#{2,4}\s", ln):
        break
    if not ln.strip().startswith("|"):
        if not ln.strip():
            continue
        break  # 表格结束
    if re.match(r"^\s*\|[-:\s|]+\|\s*$", ln):
        continue  # 分隔行
    cells = split_row(ln)
    if not cells or all(not c for c in cells):
        continue
    if cells and (cells[0] in ("声称", "claim", "Claim") or "声称" in cells[0]):
        continue  # 表头重复
    n_claims += 1
    if len(cells) < 3:
        errors.append(f"    列数不足 3（需 声称|证据命令|预期）: {ln.strip()[:60]}")
        continue
    claim, cmd, expected = cells[0], cells[1], cells[2]
    if not claim:
        errors.append(f"    声称列为空: {ln.strip()[:60]}")
    if not cmd:
        errors.append(f"    声称「{claim[:30]}」缺证据命令")
    else:
        first = cmd.split()[0] if cmd.split() else ""
        if first not in WHITELIST:
            errors.append(f"    声称「{claim[:30]}」证据命令非白名单: {first}（只读命令: grep/git/vitest/ls/...）")
        bad = [ch for ch in FORBIDDEN if ch in cmd]
        if bad:
            errors.append(f"    声称「{claim[:30]}」证据命令含危险字符 {''.join(bad)}: {cmd[:60]}")
    if not expected:
        errors.append(f"    声称「{claim[:30]}」缺预期列")

if errors:
    print(f"  ❌ {path}: 声称↔证据对照表不完整（{n_claims} 条声称）:")
    for e in errors:
        print(e)
    sys.exit(1)
print(f"  ✅ {path}: 声称↔证据对照表格式完整（{n_claims} 条声称，命令白名单校验通过，未执行）")
sys.exit(0)
PYEOF
  rc=$?
  case "$rc" in
    1) BLOCKED=1 ;;
    2) DEGRADED=1 ;;
  esac
done

if [ "$BLOCKED" -eq 1 ]; then exit 1; fi
if [ "$DEGRADED" -eq 1 ]; then exit 2; fi
exit 0
