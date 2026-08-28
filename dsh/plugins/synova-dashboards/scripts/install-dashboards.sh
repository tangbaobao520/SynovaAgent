#!/usr/bin/env bash
# install-dashboards.sh — 把 synova-dashboards 插件装入 **synova-cto 预设**（CTO 模式）
# 幂等：重复执行安全。步骤：
#   ① 放置包到 web profile 的 node_modules（loader 解析基准，预设行从这里解析包名）
#   ② 在 ~/.dsh/.agent-presets/synova-cto/agent.cordis.yml 追加 loader 行（CTO 预设专属）
#   ③ 清理旧的"全局 web profile"条目（若存在，迁移到预设专属）
# 生效：重启 dsh web → 打开/恢复 CTO 会话（预设挂载）→ 刷新浏览器。
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/web"
DEST="$PROFILE_DIR/node_modules/@synova/dsh-dashboards"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
PRESET_FILE="${DSH_HOME:-$HOME/.dsh}/.agent-presets/synova-cto/agent.cordis.yml"
ENTRY_ID="synova-dashboards"
# 仓库根 = <repo>/dsh/plugins/synova-dashboards 上溯三级
REPO_ROOT_DEFAULT="$(cd "$PLUGIN_DIR/../../.." && pwd)"
MARKER="Synova 全局跟踪三仪表盘"

echo "==> ① 放置插件包: $PLUGIN_DIR → $DEST"
mkdir -p "$PROFILE_DIR/node_modules/@synova"
rm -rf "$DEST"
cp -R "$PLUGIN_DIR" "$DEST"
rm -f "$DEST"/.DS_Store

echo "==> ② 追加 loader 行到 CTO 预设: ${PRESET_FILE}"
if [ ! -f "$PRESET_FILE" ]; then
  echo "    ❌ 预设文件不存在: ${PRESET_FILE}（先运行 install-dsh-preset.sh --install）"
  exit 1
fi
if grep -qF "$MARKER" "$PRESET_FILE"; then
  echo "    行已存在，跳过"
else
  {
    echo ""
    echo "# ── ${MARKER}（右侧栏实时可视化）"
    echo "# 由 dsh/plugins/synova-dashboards/scripts/install-dashboards.sh 追加；幂等。"
    echo "# 卸载：删除本行块 + rm -rf ${DEST}，然后重启 dsh web。"
    echo "- id: $ENTRY_ID"
    echo "  name: '@synova/dsh-dashboards'"
    echo "  inject: [webServer]"
    echo "  config:"
    echo "    repoRoot: $REPO_ROOT_DEFAULT"
  } >> "$PRESET_FILE"
  echo "    已追加（repoRoot=${REPO_ROOT_DEFAULT}）"
fi

echo "==> ③ 清理全局 web profile 条目（迁移到预设专属）: $PATCH_FILE"
if grep -qF "$MARKER" "$PATCH_FILE" 2>/dev/null; then
  python3 - "$PATCH_FILE" <<'EOF'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
marker = "# ── Synova 全局跟踪三仪表盘"
if marker not in s:
    print("    未找到 marker，跳过")
    sys.exit(0)
idx = s.index(marker)
body = s[idx:].split("\n")
# 块 = 从 marker 行起到下一个顶层内容（非缩进、非注释、非空行）之前
end = 1
saw_blank = False
for i in range(1, len(body)):
    ln = body[i]
    if ln.strip() == "":
        saw_blank = True
        continue
    if not ln.startswith((" ", "#", "\t")):
        if saw_blank:
            end = i
            break
    else:
        saw_blank = False
cleaned = s[:idx] + "\n".join(body[end:])
io.open(p, "w", encoding="utf-8").write(cleaned)
print("    已清理全局条目（迁移到 CTO 预设）")
EOF
else
  echo "    无全局条目，跳过"
fi

echo ""
echo "✅ 完成。生效步骤："
echo "   1) 重启 dsh web（停掉当前进程 → dsh web）"
echo "   2) 打开/恢复 CTO 会话（synova-cto 预设挂载后）"
echo "   3) 刷新浏览器 → 右侧出现 📊 窄栏，点击展开三仪表盘"
echo ""
echo "验证数据路由: curl -s http://127.0.0.1:3080/synova/dashboards/data | head -c 300"
