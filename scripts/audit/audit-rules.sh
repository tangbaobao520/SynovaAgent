#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# audit-rules.sh — 审计规则引擎 (D216)
#
# 从 known-error-patterns.json 读取 23 项模式 → 对 git diff 变更文件逐行 grep
# → 生成 audit-result.json。
#
# 权威文档 #17 第五章 Ch5 §2.2 + §9
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATTERNS_FILE="$PROJECT_ROOT/scripts/control-tower/known-error-patterns.json"
AUDIT_DIR="$PROJECT_ROOT/.codex/audit"
TASK_ID="${TASK_ID:-audit}"
DIFF_RANGE="${1:-HEAD~1..HEAD}"

mkdir -p "$AUDIT_DIR"

# 降级: patterns 文件缺失
if [[ ! -f "$PATTERNS_FILE" ]]; then
  echo '{"taskId":"'$TASK_ID'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","findings":[],"summary":{"total":0,"high":0,"medium":0,"low":0},"degraded":true,"reason":"known-error-patterns.json missing"}'
  exit 0
fi

# 降级: grep 不可用
if ! command -v grep &>/dev/null; then
  echo '{"taskId":"'$TASK_ID'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","findings":[],"summary":{"total":0,"high":0,"medium":0,"low":0},"degraded":true,"reason":"grep not available"}'
  exit 0
fi

# 获取变更文件列表
CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only "$DIFF_RANGE" -- '*.ts' '*.tsx' '*.js' 2>/dev/null || echo "")

# 使用 node 解析 patterns → 逐文件 grep
node -e "
const fs = require('fs');
const patterns = JSON.parse(fs.readFileSync('$PATTERNS_FILE','utf-8'));
const changedFiles = '$CHANGED_FILES'.split('\n').filter(Boolean);
const findings = [];
const autoPatterns = patterns.filter(p => p.auto_detectable);

for (const file of changedFiles) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (const pat of autoPatterns) {
    const regex = new RegExp(pat.pattern);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        findings.push({
          ruleId: pat.id,
          file: file + ':' + (i + 1),
          pattern: pat.description,
          severity: pat.severity,
          line: lines[i].trim().substring(0, 120)
        });
      }
    }
  }
}

const high = findings.filter(f => f.severity === 'high').length;
const medium = findings.filter(f => f.severity === 'medium').length;
const low = findings.filter(f => f.severity === 'low').length;

const result = {
  taskId: '$TASK_ID',
  timestamp: new Date().toISOString(),
  findings,
  summary: { total: findings.length, high, medium, low }
};

fs.writeFileSync('$AUDIT_DIR/audit-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
" 2>/dev/null || echo '{"taskId":"'$TASK_ID'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","findings":[],"summary":{"total":0,"high":0,"medium":0,"low":0},"degraded":true,"reason":"audit-rules error"}'
