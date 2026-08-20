#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# install-hooks.sh — D318 双机 Git Hooks 安装脚本
#
# 用法: bash scripts/install-hooks.sh
#
# 作用:
#   将 .git/hooks/ 中的 git hook 设为从仓库内脚本加载，全部 toplevel-relative
#   可移植（Windows + Mac 同一脚本，无绝对路径硬编码）。
#
# install_hook 双模式（按 name 分派）:
#   entry   — scripts/<name>-check.sh 门禁入口（pre-commit / pre-push / commit-msg）
#   tracked — scripts/hooks/<name>.sh 逻辑（post-commit）
#
# 包装器统一 `bash "$(git rev-parse --show-toplevel)/..."` 运行时求值:
#   旧版写死 $ROOT 绝对路径（post-commit 包装器为 Windows 盘符路径残留）→ Mac 必挂。
#   $() 在运行时展开 → 克隆到任何机器路径均可用。
#
# pre-commit 包装器保留"双日志分离 + 成功标记"三段逻辑:
#   失败 → 写 .claude/pre-commit-failures.log；成功 → 写 .claude/last-precommit-success。
#   post-commit.sh 靠 marker 检测 --no-verify 绕过（V4.5.1 核心机制，不可丢）。
#
# synova-commit alias: Windows 用 Git bash.exe 绝对路径；Mac/Linux 用 bash（PATH）。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "=== SynovaAgent D318 Git Hooks 安装（双机可移植）==="
mkdir -p "$ROOT/scripts/hooks"

install_hook() {
  local name="$1"
  local entry="$ROOT/scripts/${name}-check.sh"
  local tracked="$ROOT/scripts/hooks/${name}.sh"
  local target="$ROOT/.git/hooks/$name"
  local body
  if [ "$name" = "pre-commit" ] && [ -f "$entry" ]; then
    # 双日志分离 + 成功标记（V4.5.1 核心，post-commit 检测 --no-verify 依赖 marker）
    body='#!/bin/bash
# v3.7: pre-commit wrapper — 双日志分离 + 成功标记 (D318: toplevel-relative)
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
bash "$ROOT/scripts/pre-commit-check.sh"
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) exit=$EXIT_CODE branch=$(git branch --show-current 2>/dev/null || echo unknown)" >> "$ROOT/.claude/pre-commit-failures.log"
else
  # 写成功标记 — post-commit 用它检测 --no-verify 绕过 (D366: head|时间戳 对账)
  echo "$(git rev-parse HEAD 2>/dev/null || true)|$(date +%s)" > "$ROOT/.claude/last-precommit-success"
fi
exit $EXIT_CODE'
  elif [ -f "$entry" ]; then
    # 门禁入口（commit-msg 需 "$1" 提交信息文件；pre-push 需 "$1" remote 名 "$2" url —
    # D334 多机同步检查要 fetch 目标 remote；hook stdin refs 透传）
    if [ "$name" = "commit-msg" ]; then
      body='#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"'
    elif [ "$name" = "pre-push" ]; then
      body='#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-push-check.sh" "$1" "$2"'
    else
      body='#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/'"$name"'-check.sh"'
    fi
  elif [ -f "$tracked" ]; then
    # hooks/ 逻辑入口（post-commit）
    body='#!/bin/bash
exec bash "$(git rev-parse --show-toplevel)/scripts/hooks/'"$name"'.sh"'
  else
    echo "  !! $name 无入口（$entry / $tracked）— 跳过"
    return
  fi
  printf '%s\n' "$body" > "$target"
  chmod +x "$target"
  echo "  ✅ $name"
}

install_hook "pre-commit"
install_hook "commit-msg"
install_hook "pre-push"
install_hook "post-commit"

# CT-47 / D457: 注册 bypass.log 的 union 合并驱动
# .gitattributes 声明 .claude/bypass.log merge=union，但 git 需知道 union driver 是什么。
# 这里注册一次，让 append-only 证据日志多 PR 合并自动取并集（不再冲突）。
# 幂等: 重复运行 set 覆盖，无害。
git config merge.union.driver "git merge-file --union %A %O %B" 2>/dev/null || true  # swallow-ok: git config 失败=非 git 仓库/只读, 降级不阻断
echo "  ✅ git config merge.union.driver — bypass.log 自动合并"

# D201-FIX: 安装 synova-commit git alias（commit gatekeeper）
SYNOVA_COMMIT="$ROOT/scripts/control-tower/synova-commit"
if [ -f "$SYNOVA_COMMIT" ]; then
  # Windows 需要 bash.exe 绝对路径；Linux/macOS 直接用 bash
  if [ -f "/c/Program Files/Git/bin/bash.exe" ]; then
    BASH_PATH="C:\Program Files\Git\bin\bash.exe"
  elif command -v bash >/dev/null 2>&1; then
    BASH_PATH="bash"
  else
    echo "  ⚠️  bash 未找到 — 跳过 synova-commit 安装"
    exit 0
  fi
  git config alias.synova-commit "!\"$BASH_PATH\" \"$SYNOVA_COMMIT\""
  echo "  ✅ git alias synova-commit — bash=$BASH_PATH"
else
  echo "  ⚠️  synova-commit 不存在: $SYNOVA_COMMIT"
fi

echo ""
echo "✅ 安装完成。当前 hooks:"
ls -la "$ROOT/.git/hooks/" | grep -v ".sample"
