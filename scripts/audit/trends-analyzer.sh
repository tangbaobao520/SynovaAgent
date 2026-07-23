#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# trends-analyzer.sh — 趋势分析器 (D216)
#
# 扫描 .codex/audit/ 历史审计结果(按创建时间排序) → 检测同一 ruleId
# 在连续 3+ 次审计中重复出现 → 输出 trends-report.json。
#
# 权威文档 #17 第五章 Ch5 §2.2 + §9
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_DIR="$PROJECT_ROOT/.codex/audit"
MIN_REPEAT="${MIN_REPEAT:-3}"

# 降级: 目录不存在或无 audit-result 文件
if [[ ! -d "$AUDIT_DIR" ]]; then
  echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","trends":[],"summary":{"repeatingPatterns":0},"degraded":true,"reason":"audit directory not found"}'
  exit 0
fi

node -e "
const fs = require('fs');
const path = require('path');

// 收集所有 audit-result.json 文件（按文件名排序 = 时间序）
const files = fs.readdirSync('$AUDIT_DIR')
  .filter(f => f.startsWith('audit-result') && f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  const r = { timestamp: new Date().toISOString(), trends: [], summary: { repeatingPatterns: 0 } };
  fs.writeFileSync('$AUDIT_DIR/trends-report.json', JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r));
  process.exit(0);
}

// 累加每个 ruleId 的出现次数
const ruleCount = {};
for (const file of files) {
  try {
    const content = JSON.parse(fs.readFileSync(path.join('$AUDIT_DIR', file), 'utf-8'));
    if (!content.findings) continue;
    const seen = new Set();
    for (const f of content.findings) {
      if (f.ruleId && !seen.has(f.ruleId)) {
        ruleCount[f.ruleId] = (ruleCount[f.ruleId] || 0) + 1;
        seen.add(f.ruleId);
      }
    }
  } catch(e) { /* skip corrupt files */ }
}

const trends = Object.entries(ruleCount)
  .filter(([_, count]) => count >= $MIN_REPEAT)
  .map(([ruleId, count]) => ({
    ruleId,
    occurrenceCount: count,
    pattern: 'repeating',
    suggestion: 'Investigate root cause — same issue recurring in ' + count + ' audits'
  }));

const result = {
  timestamp: new Date().toISOString(),
  trends,
  summary: { repeatingPatterns: trends.length }
};

fs.writeFileSync('$AUDIT_DIR/trends-report.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
"
