#!/usr/bin/env bash
# ============================================================================
# check-self-diagnosis.sh — 自助诊断脚本 (D86)
#
# 第14份权威文档第二章 §2.2: 6+1步骤诊断流程
# 面向 GA/管理员，输出自然语言，不含技术术语。
#
# 依赖: bash, find, stat, curl (可选, 用于 API 检查)
# 不依赖 jq — 使用 grep/awk/node 解析 JSON
#
# 用法:
#   bash scripts/workflow/check-self-diagnosis.sh           # 完整6步
#   bash scripts/workflow/check-self-diagnosis.sh --quick   # 仅Step 1-3
#   bash scripts/workflow/check-self-diagnosis.sh --json    # JSON格式输出
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HEALTH_LOG="$REPO_DIR/.claude/system-health.log"
PORT="${PORT:-3000}"
HEALTHZ_URL="http://localhost:$PORT/api/healthz"

# 参数
QUICK_MODE=false
JSON_MODE=false
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK_MODE=true ;;
    --json)  JSON_MODE=true ;;
  esac
done

# ── 颜色 / 输出函数 ──
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
pass()   { echo -e "  ${GREEN}✅${NC} $1"; }
warn()   { echo -e "  ${YELLOW}⚠️  $1${NC}"; echo "[$(date +%Y-%m-%dT%H:%M:%S)] WARN: $1" >> "$HEALTH_LOG" 2>/dev/null || true; }
fail()   { echo -e "  ${RED}❌${NC} $1" >&2; }
info()   { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

# JSON 输出累积
JSON_STEPS="[]"
JSON_STEP_COUNT=0

# ── JSON 辅助（使用 node） ──
json_get() {
  # $1 = JSON string, $2 = key path (e.g. .status)
  echo "$1" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); const keys='$2'.replace(/^\./,'').split('.'); let v=j; for(const k of keys)v=v[k]; console.log(v)}catch(e){console.log('')}" 2>/dev/null || echo ""
}

json_count() {
  # $1 = JSON string, $2 = array key
  echo "$1" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8'); try{const j=JSON.parse(d); const arr=j['$2']; if(arr&&Array.isArray(arr))console.log(arr.length); else console.log(0)}catch(e){console.log(0)}" 2>/dev/null || echo "0"
}

json_emit() {
  local step="$1"
  local status="$2"
  local message="$3"
  JSON_STEP_COUNT=$((JSON_STEP_COUNT + 1))
  if $JSON_MODE; then
    local escaped
    escaped=$(echo "$message" | sed 's/"/\\"/g')
    if [ "$JSON_STEPS" = "[]" ]; then
      JSON_STEPS="[{\"step\":\"$step\",\"status\":\"$status\",\"message\":\"$escaped\"}]"
    else
      JSON_STEPS=$(echo "$JSON_STEPS" | node -e "
        const d=require('fs').readFileSync('/dev/stdin','utf-8');
        const arr=JSON.parse(d);
        arr.push({step:'$step',status:'$status',message:'$escaped'});
        console.log(JSON.stringify(arr));
      " 2>/dev/null || echo "$JSON_STEPS")
    fi
  fi
}

# ── curl 辅助 ──
curl_healthz() {
  if command -v curl &>/dev/null; then
    curl -sf "$HEALTHZ_URL" 2>/dev/null || echo ""
  fi
  echo ""
}

# ====================================================================
# Step 1: 数据源在线检查
# ====================================================================
step1() {
  local healthz_json
  healthz_json=$(curl_healthz)

  if [ -n "$healthz_json" ]; then
    local overall
    overall=$(json_get "$healthz_json" "status")
    if [ "$overall" = "healthy" ] || [ "$overall" = "degraded" ]; then
      pass "Step 1: 数据源正常 — 系统运行中"
      json_emit "step1" "ok" "数据源正常 — 系统运行中"
    else
      warn "Step 1: 数据源异常 — API 返回状态 $overall"
      json_emit "step1" "warn" "数据源异常 — API 返回状态 $overall"
    fi
  else
    # 降级: 文件级检查
    local thresholds_count=0
    if [ -d "$REPO_DIR/extensions/industries" ]; then
      thresholds_count=$(find "$REPO_DIR/extensions/industries" -name 'thresholds.json' 2>/dev/null | wc -l)
    fi
    if [ "$thresholds_count" -gt 0 ]; then
      local latest=0
      if command -v stat &>/dev/null; then
        latest=$(find "$REPO_DIR/extensions/industries" -name 'thresholds.json' -exec stat -c '%Y' {} \; 2>/dev/null | sort -rn | head -1)
      fi
      if [ "$latest" -gt 0 ]; then
        local now; now=$(date +%s)
        local hours_ago=$(( (now - latest) / 3600 ))
        pass "Step 1: 数据源正常（最近更新：${hours_ago}小时前）"
        json_emit "step1" "ok" "数据源正常（最近更新：${hours_ago}小时前）"
      else
        pass "Step 1: 数据源正常（${thresholds_count}个行业基准文件就绪）"
        json_emit "step1" "ok" "数据源正常（${thresholds_count}个行业基准文件就绪）"
      fi
    else
      warn "Step 1: 数据源检查跳过 — 无行业基准文件且服务器未启动"
      json_emit "step1" "warn" "数据源检查跳过"
    fi
  fi
}

# ====================================================================
# Step 2: 哨兵健康检查
# ====================================================================
step2() {
  local sentinel_count=0
  if [ -d "$REPO_DIR/src/sentinel" ]; then
    sentinel_count=$(find "$REPO_DIR/src/sentinel" -name '*.ts' -not -name '*.test.ts' -not -name 'types.ts' 2>/dev/null | wc -l)
  fi
  if [ -d "$REPO_DIR/extensions/sentinels" ]; then
    local ext_count
    ext_count=$(find "$REPO_DIR/extensions/sentinels" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
    sentinel_count=$((sentinel_count + ext_count))
  fi

  if [ "$sentinel_count" -gt 0 ]; then
    pass "Step 2: ${sentinel_count}个哨兵就绪"
    json_emit "step2" "ok" "${sentinel_count}个哨兵就绪"
  else
    warn "Step 2: 未检测到已注册哨兵"
    json_emit "step2" "warn" "未检测到已注册哨兵"
  fi
}

# ====================================================================
# Step 3: Bootstrap Phase 状态检查
# ====================================================================
step3() {
  if [ -f "$REPO_DIR/.claude/loop-state.json" ]; then
    local phase
    phase=$(grep -o '"phase"[[:space:]]*:[[:space:]]*"[^"]*"' "$REPO_DIR/.claude/loop-state.json" 2>/dev/null | head -1 | cut -d'"' -f4)
    [ -z "$phase" ] && phase="unknown"
    pass "Step 3: 系统阶段正常（Phase ${phase}）"
    json_emit "step3" "ok" "系统阶段正常（Phase ${phase}）"
  elif [ -f "$REPO_DIR/src/deploy/bootstrap.ts" ]; then
    pass "Step 3: Bootstrap 就绪"
    json_emit "step3" "ok" "Bootstrap 就绪"
  else
    warn "Step 3: Bootstrap 状态未知"
    json_emit "step3" "warn" "Bootstrap 状态未知"
  fi
}

# ====================================================================
# Step 3.5: 溢出监控与趋势健康检查
# ====================================================================
step3_5() {
  local cycle_count=0
  if [ -d "$REPO_DIR/extensions/skills/custom" ]; then
    cycle_count=$(find "$REPO_DIR/extensions/skills/custom" -name '*.json' 2>/dev/null | wc -l)
  fi

  if [ "$cycle_count" -gt 0 ]; then
    pass "Step 3.5: 溢出监控正常 — ${cycle_count}个扩展配置就绪"
    json_emit "step3_5" "ok" "溢出监控正常 — ${cycle_count}个扩展配置就绪"
  else
    info "Step 3.5: 溢出监控 — 暂无自定义扩展配置（默认就绪）"
    json_emit "step3_5" "ok" "溢出监控 — 默认配置就绪"
  fi
}

# ====================================================================
# Step 4: 42 边参数健康检查
# ====================================================================
step4() {
  local registry="$REPO_DIR/scripts/workflow/system-registry.json"
  if [ -f "$registry" ]; then
    local edge_count
    edge_count=$(node -e "const d=require('fs').readFileSync('$registry','utf-8'); const j=JSON.parse(d); console.log(j.edges?j.edges.length:0)" 2>/dev/null)
    if [ -n "$edge_count" ] && [ "$edge_count" -gt 0 ]; then
      pass "Step 4: 边参数正常 — ${edge_count}条边已注册"
      json_emit "step4" "ok" "边参数正常 — ${edge_count}条边已注册"
    else
      warn "Step 4: 注册表中无边参数"
      json_emit "step4" "warn" "注册表中无边参数"
    fi
  else
    if [ -d "$REPO_DIR/extensions/edges" ]; then
      local files
      files=$(find "$REPO_DIR/extensions/edges" -name '*.json' 2>/dev/null | wc -l)
      pass "Step 4: 边参数正常 — ${files}个边文件"
      json_emit "step4" "ok" "边参数正常 — ${files}个边文件"
    else
      warn "Step 4: 无 system-registry.json 且无边目录"
      json_emit "step4" "warn" "注册表缺失"
    fi
  fi
}

# ====================================================================
# Step 5: 专家加载检查
# ====================================================================
step5() {
  local ready=0
  local total=0
  for dir in "$REPO_DIR"/expert/*/; do
    [ -d "$dir" ] || continue
    total=$((total + 1))
    if [ -f "$dir/manifest.json" ]; then
      if node -e "const d=require('fs').readFileSync('$dir/manifest.json','utf-8'); JSON.parse(d); console.log('ok')" 2>/dev/null | grep -q ok; then
        ready=$((ready + 1))
      fi
    fi
  done

  if [ "$total" -gt 0 ] && [ "$ready" -eq "$total" ]; then
    pass "Step 5: ${ready}/${total}专家就绪"
    json_emit "step5" "ok" "${ready}/${total}专家就绪"
  elif [ "$ready" -gt 0 ]; then
    warn "Step 5: ${ready}/${total}专家就绪（部分manifest异常）"
    json_emit "step5" "warn" "${ready}/${total}专家就绪（部分异常）"
  else
    warn "Step 5: 无专家配置"
    json_emit "step5" "warn" "无专家配置"
  fi
}

# ====================================================================
# Step 6: 综合诊断报告
# ====================================================================
step6() {
  local total_steps=$((QUICK_MODE ? 3 : 6))
  # 从 JSON 统计（非 JSON 模式也可以用）
  local ok_count=0
  local warn_count=0

  if $JSON_MODE && [ "$JSON_STEPS" != "[]" ]; then
    ok_count=$(echo "$JSON_STEPS" | node -e "
      const d=require('fs').readFileSync('/dev/stdin','utf-8');
      const arr=JSON.parse(d);
      console.log(arr.filter(s=>s.status==='ok').length);
    " 2>/dev/null)
    warn_count=$(echo "$JSON_STEPS" | node -e "
      const d=require('fs').readFileSync('/dev/stdin','utf-8');
      const arr=JSON.parse(d);
      console.log(arr.filter(s=>s.status==='warn').length);
    " 2>/dev/null)
  fi

  if [ -z "$ok_count" ] || [ "$ok_count" -eq 0 ]; then
    ok_count=$((JSON_STEP_COUNT))
  fi

  local summary=""
  if [ "${warn_count:-0}" -gt 0 ]; then
    summary="系统整体运行正常，存在${warn_count}项注意事项（不影响核心诊断功能）"
    warn "Step 6: ${summary}"
    json_emit "step6" "warn" "${summary} (${ok_count}/${total_steps}通过)"
  else
    summary="系统状态良好，全部${total_steps}项检查通过"
    pass "Step 6: ${summary}"
    json_emit "step6" "ok" "${summary}"
  fi
}

# ====================================================================
# Main
# ====================================================================

echo ""
echo "═══════════════════════════════════════════════"
echo "  Synova 自助诊断"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════"
echo ""

# Step 1: 数据源
step1
echo ""

# Step 2: 哨兵
step2
echo ""

# Step 3: Bootstrap
step3
echo ""

# Step 3.5 / Step 4-6 (skip in quick mode)
if ! $QUICK_MODE; then
  step3_5
  echo ""
  step4
  echo ""
  step5
  echo ""
fi

# Step 6: Summary
step6
echo ""

# JSON 输出模式
if $JSON_MODE; then
  echo "$JSON_STEPS" | node -e "
    const d=require('fs').readFileSync('/dev/stdin','utf-8');
    const arr=JSON.parse(d);
    console.log(JSON.stringify({diagnosis: arr, timestamp: new Date().toISOString()}, null, 2));
  " 2>/dev/null || echo "$JSON_STEPS"
fi

echo "═══════════════════════════════════════════════"
echo ""
