#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-subprocess-protocol.test.sh — D924 检查器夹具（三路径 + 变异体判别）
#
# 契约:
#   @input   — 无（密封：mktemp -d 沙箱，零网络、零真实仓库写入）
#   @output  — 逐条 PASS/FAIL + 末行 "D924-FIXTURE: PASS(n)/TOTAL(m)"
#   @exit    — 0 = 全部断言通过；1 = 有断言失败
#   @degraded— 无（夹具自身不降级；被测检查器的降级路径在用例 5 断言）
#
# 覆盖矩阵:
#   1 正常路径   — 合规样例目录（curl -o 分流）→ 检查器 exit 0
#   2 违规 R1    — 哨兵混流样例 → exit 1 + 点中文件:行
#   3 违规 R2    — 哨兵分割解析样例 → exit 1
#   4 排除面 EX1 — here-string 行（匹配 R1 但属输入重定向）→ exit 0
#   5 排除面 EX2 — 已用 -o 分流但 -w 仍含哨兵（合规形态）→ exit 0
#   6 降级路径   — grep 注入缝指向不可用 → exit 2 + stderr "degraded:"
#   7 变异体判别 — 把 EX2 判据改坏 → 同一豁免样例必须被判违规（证明排除面是承重的）
#   8 变异体判别 — 把 R1 判据改坏 → 同一违规样例必须漏判（证明红样只由真判据捕获）
#   9 存量闸门   — 真仓库全扫 → exit 0（存量 0）
#  10 源码护栏   — assert.ts 保留 D924 字节级兼容标记（防"顺手清理"；弱判据，非行为判据）
#
# 说明: 用例 10 是**源码护栏**（grep 型），刻意标注为弱判据——D924 的**行为证明**（响应体含哨兵
#       不再解析错乱 + body 末尾字节语义）在字节级实跑中取证，见
#       docs/synova/product-lines/evidence/D924-*（原始输出）。二者不可互相冒充。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECKER="$REPO_ROOT/scripts/control-tower/check-subprocess-protocol.sh"

PASS=0
FAIL=0
TOTAL=0

check() { # <描述> <期望> <实际>
  local desc="$1" want="$2" got="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$want" = "$got" ]; then
    echo "  PASS  $desc (=$got)"; PASS=$((PASS + 1))
  else
    echo "  FAIL  $desc: 期望 $want 实际 $got"; FAIL=$((FAIL + 1))
  fi
}

check_grep() { # <描述> <文件> <正则> <期望: yes|no>
  local desc="$1" f="$2" pat="$3" want="$4" got
  TOTAL=$((TOTAL + 1))
  if grep -qE "$pat" "$f" 2>/dev/null; then got=yes; else got=no; fi
  if [ "$want" = "$got" ]; then
    echo "  PASS  $desc (hit=$got)"; PASS=$((PASS + 1))
  else
    echo "  FAIL  $desc: 期望 $want 实际 $got"; FAIL=$((FAIL + 1))
  fi
}

SB="$(mktemp -d)"
trap 'rm -rf "$SB"' EXIT

# 哨兵用拼接构造，避免本夹具源码出现字面哨兵（保证用例 9 自扫零命中）
SENT='__'"STATUS__"
# 变异体专用"永不匹配"串（同理拼接）
NEVER='__'"NEVER_MATCHES"'__'

mkdir -p "$SB/compliant" "$SB/violation-r1" "$SB/violation-r2" \
         "$SB/exempt-herestring" "$SB/exempt-separated" "$SB/mutant"

# ── 样例构造 ──────────────────────────────────────────────────────────────
cat > "$SB/compliant/sample.sh" <<'EOF'
#!/bin/bash
BODY="$(mktemp)"
CODE="$(curl -sS -o "$BODY" -w '%{http_code}' "$URL")"
echo "$CODE"
EOF

cat > "$SB/violation-r1/sample.sh" <<EOF
#!/bin/bash
URL="http://example.invalid"
curl -sS -w '\n${SENT}:%{http_code}' "\$URL"
EOF

cat > "$SB/violation-r2/sample.ts" <<EOF
const parts = r.stdout.split('${SENT}:');
EOF

cat > "$SB/exempt-herestring/sample.sh" <<EOF
#!/bin/bash
curl -sS -w '\n${SENT}:%{http_code}' "\$URL" <<< "\$INPUT"
EOF

cat > "$SB/exempt-separated/sample.sh" <<EOF
#!/bin/bash
BODY="\$(mktemp)"
curl -sS -o "\$BODY" -w '\n${SENT}:%{http_code}' "\$URL"
EOF

# ── 用例 1: 正常路径 ──────────────────────────────────────────────────────
echo "[1] 正常路径: 合规样例（负载已分流）→ 期望 exit 0"
bash "$CHECKER" --dir "$SB/compliant" > "$SB/o1" 2> "$SB/e1"; check "合规样例 exit" 0 "$?"
check_grep "输出 OK 标记" "$SB/o1" 'SUBPROCESS-PROTOCOL: OK' yes

# ── 用例 2: 违规 R1 ───────────────────────────────────────────────────────
echo "[2] 违规 R1: 哨兵混流 → 期望 exit 1 + 点中文件:行"
bash "$CHECKER" --dir "$SB/violation-r1" > "$SB/o2" 2> "$SB/e2"; check "R1 样例 exit" 1 "$?"
check_grep "点中 sample.sh:3" "$SB/o2" 'VIOLATION +sample\.sh:3 +R1' yes

# ── 用例 3: 违规 R2 ───────────────────────────────────────────────────────
echo "[3] 违规 R2: 哨兵分割解析 → 期望 exit 1"
bash "$CHECKER" --dir "$SB/violation-r2" > "$SB/o3" 2> "$SB/e3"; check "R2 样例 exit" 1 "$?"
check_grep "点中 sample.ts:1 R2" "$SB/o3" 'VIOLATION +sample\.ts:1 +R2' yes

# ── 用例 4: 排除面 EX1（here-string） ─────────────────────────────────────
echo "[4] 排除面 EX1: here-string 行（匹配 R1 但属输入重定向）→ 期望 exit 0"
bash "$CHECKER" --dir "$SB/exempt-herestring" > "$SB/o4" 2> "$SB/e4"; check "EX1 样例 exit" 0 "$?"
check_grep "示例确含 here-string 记号" "$SB/exempt-herestring/sample.sh" '<<<' yes

# ── 用例 5: 排除面 EX2（已分流） ──────────────────────────────────────────
echo "[5] 排除面 EX2: -o 已分流但 -w 仍含哨兵（合规形态）→ 期望 exit 0"
bash "$CHECKER" --dir "$SB/exempt-separated" > "$SB/o5" 2> "$SB/e5"; check "EX2 样例 exit" 0 "$?"
check_grep "示例确含 -o 旗标" "$SB/exempt-separated/sample.sh" '(^|[^[:alnum:]_])-o[[:space:]]' yes

# ── 用例 6: 降级路径 ──────────────────────────────────────────────────────
echo "[6] 降级路径: grep 注入缝不可用 → 期望 exit 2 + degraded 显式声明"
SYNO_SUBPROC_GREP="$SB/does-not-exist-grep" bash "$CHECKER" --dir "$SB/compliant" > "$SB/o6" 2> "$SB/e6"
check "扫描器不可用 exit" 2 "$?"
check_grep "stderr 显式 degraded" "$SB/e6" 'degraded: ' yes
check_grep "降级码 SUBPROCESS_SCAN_UNAVAILABLE" "$SB/e6" 'SUBPROCESS_SCAN_UNAVAILABLE' yes

# ── 用例 7: 变异体判别（排除面失效） ──────────────────────────────────────
echo "[7] 变异体判别: 把 EX2 排除面改坏 → 同一豁免样例必须被判违规"
sed 's|^PAT_EX2=.*|PAT_EX2="'"$NEVER"'"|' "$CHECKER" > "$SB/mutant/checker-noex2.sh"
bash "$SB/mutant/checker-noex2.sh" --dir "$SB/exempt-separated" > "$SB/o7" 2> "$SB/e7"
check "坏判别体必须报红（证明排除面承重）" 1 "$?"

# ── 用例 8: 变异体判别（主判据失效） ──────────────────────────────────────
echo "[8] 变异体判别: 把 R1 主判据改坏 → 同一违规样例必须漏判"
sed 's|^PAT_R1=.*|PAT_R1="'"$NEVER"'"|' "$CHECKER" > "$SB/mutant/checker-nor1.sh"
bash "$SB/mutant/checker-nor1.sh" --dir "$SB/violation-r1" > "$SB/o8" 2> "$SB/e8"
check "坏判据体必须漏判（证明红样只由真判据捕获）" 0 "$?"

# ── 用例 9: 存量闸门（真仓库全扫） ────────────────────────────────────────
echo "[9] 存量闸门: 真仓库全扫 → 期望 exit 0（存量 0，新增即拦）"
bash "$CHECKER" --dir "$REPO_ROOT" > "$SB/o9" 2> "$SB/e9"; check "真仓库 exit" 0 "$?"
check_grep "输出 violations=0" "$SB/o9" 'violations=0' yes

# ── 用例 10: 源码护栏（弱判据，防误删） ───────────────────────────────────
echo "[10] 源码护栏: assert.ts 保留 D924 字节级兼容标记（弱判据，非行为判据）"
check_grep "assert.ts 含 D924 字节级兼容标记" "$REPO_ROOT/scripts/golden-scenarios/common/assert.ts" 'D924 字节级兼容' yes
check_grep "assert.ts 含 os.tmpdir（Windows 兼容）" "$REPO_ROOT/scripts/golden-scenarios/common/assert.ts" 'os\.tmpdir\(\)' yes
check_grep "assert.ts 不再含旧哨兵形态" "$REPO_ROOT/scripts/golden-scenarios/common/assert.ts" "$SENT" no

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "D924-FIXTURE: FAIL ($PASS/$TOTAL 通过)"
  exit 1
fi
echo "D924-FIXTURE: PASS($PASS/$TOTAL)"
exit 0
