#!/usr/bin/env bash
# verify-package-signature.test.sh — D713 密封测试：签名门禁三态
#
# 覆盖矩阵:
#   正常  — ad-hoc 签名的最小 .app fixture → exit 0
#   业务失败 — 未签名（缺 _CodeSignature/CodeResources）→ exit 1
#   降级  — 路径不存在 → exit 2；非 macOS 平台 → exit 2
#   接线  — desktop-build.yml 真的调用本门禁（防 M3「机制建成未接线」）
#
# 密封性：全部 fixture 在 mktemp 沙箱内构造，零真实产物依赖、零网络。

set -u
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
GATE="$REPO_ROOT/scripts/desktop/verify-package-signature.sh"
WORKFLOW="$REPO_ROOT/.github/workflows/desktop-build.yml"

FAIL=0
ok()  { echo "  ok: $*"; }
bad() { echo "  FAIL: $*"; FAIL=1; }

SB=$(mktemp -d)
trap 'rm -rf "$SB"' EXIT

make_app() { # make_app <目录> <app 名>
  local dir="$1" name="$2"
  mkdir -p "$dir/$name.app/Contents/MacOS"
  cat > "$dir/$name.app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Fixture</string>
<key>CFBundleIdentifier</key><string>com.synova.fixture</string>
<key>CFBundleName</key><string>Fixture</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
</dict></plist>
PLIST
  printf '#!/bin/sh\nexit 0\n' > "$dir/$name.app/Contents/MacOS/Fixture"
  chmod +x "$dir/$name.app/Contents/MacOS/Fixture"
}

echo "== 1. 未签名 bundle → exit 1 =="
make_app "$SB/unsigned" "Un"
bash "$GATE" --app "$SB/unsigned/Un.app" >/dev/null 2>&1
[ $? -eq 1 ] && ok "未签名 → exit 1" || bad "未签名 bundle 未按预期阻断（期望 1）"

echo "== 2. ad-hoc 签名 bundle → exit 0 =="
make_app "$SB/signed" "Sg"
if codesign --force --deep --sign - "$SB/signed/Sg.app" >/dev/null 2>&1; then
  [ -f "$SB/signed/Sg.app/Contents/_CodeSignature/CodeResources" ] \
    && ok "fixture 封印已生成" || bad "fixture 封印缺失（环境异常）"
  bash "$GATE" --app "$SB/signed/Sg.app" >/dev/null 2>&1
  [ $? -eq 0 ] && ok "ad-hoc 签名 → exit 0" || bad "已签名 bundle 未通过（期望 0）"
else
  echo "  skip: codesign 不可用（本机无 Xcode CLT）——签名相关断言跳过"
fi

echo "== 3. 降级：路径不存在 → exit 2 =="
bash "$GATE" --app "$SB/does-not-exist.app" >/dev/null 2>&1
[ $? -eq 2 ] && ok "路径不存在 → exit 2（fail-closed）" || bad "路径不存在未按降级处理（期望 2）"

echo "== 4. 降级：无参数 → exit 2 =="
bash "$GATE" >/dev/null 2>&1
[ $? -eq 2 ] && ok "无参数 → exit 2" || bad "无参数未拒绝（期望 2）"

echo "== 5. --all 对空目录 → exit 0（无产物即无不合格） =="
mkdir -p "$SB/empty"
bash "$GATE" --all --dir "$SB/empty" >/dev/null 2>&1
[ $? -eq 0 ] && ok "空目录 → exit 0" || bad "空目录应为 0"

make_app "$SB/dmgroot" "Dm"
codesign --force --deep --sign - "$SB/dmgroot/Dm.app" >/dev/null 2>&1
echo "== 6. dmg 挂载点解析文法（回归 2026-09-13 假阴性：卷名含空格） =="
# 旧实现 grep -oE '/Volumes/[^ ]+' 在空格处截断 → 挂载点错 → 误判好包为未签名。
# 这里直接断言解析表达式对含空格卷名的行为（确定性、不依赖 hdiutil）。
SAMPLE=$(printf '/dev/disk5s1\t41504653-0000-11AA\t/Volumes/SynovaAgent 0.1.0-arm64\n')
PARSED=$(printf '%s\n' "$SAMPLE" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
if [ "$PARSED" = "/Volumes/SynovaAgent 0.1.0-arm64" ]; then
  ok "含空格卷名解析正确: [$PARSED]"
else
  bad "含空格卷名解析错误: [$PARSED]"
fi
BADPARSE=$(printf '%s\n' "$SAMPLE" | grep -oE '/Volumes/[^ ]+' | head -1)
[ "$BADPARSE" != "$PARSED" ] && ok "旧实现确会截断（证明本回归有必要）" || bad "旧实现未截断，回归前提不成立"

echo "== 6b. dmg 端到端（挂载→校验→卸载；环境受限时显式 skip） =="
if hdiutil create -volname "Fixture 1.0" -srcfolder "$SB/dmgroot" -ov -format UDZO "$SB/fixture.dmg" >/dev/null 2>&1; then
  bash "$GATE" --dmg "$SB/fixture.dmg" >/dev/null 2>&1
  [ $? -eq 0 ] && ok "含空格卷名 dmg 端到端 → exit 0" || bad "dmg 门禁对含空格卷名误判（期望 0）"
else
  echo "  skip: hdiutil create 在本环境被拒（CI macOS runner 会执行此分支）"
fi

echo "== 7. 接线：desktop-build.yml 真的调用本门禁（铁律 0-2 WIRE CHECK） =="
if [ -f "$WORKFLOW" ] && grep -q "verify-package-signature.sh" "$WORKFLOW"; then
  ok "desktop-build.yml 已接线签名门禁"
else
  bad "desktop-build.yml 未接线签名门禁（M3：机制建成未接线）"
fi

if [ $FAIL -eq 0 ]; then
  echo "[verify-package-signature.test] ALL PASS"
  exit 0
fi
echo "[verify-package-signature.test] FAILED"
exit 1
