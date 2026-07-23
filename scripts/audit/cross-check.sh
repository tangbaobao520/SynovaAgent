#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# cross-check.sh — 交叉对比引擎 (D216)
#
# 加载 Agent 自检 5 问结果 (.codex/self-reports/{taskId}.json) → 对比
# audit-result.json → 输出一致性矩阵。
#
# 权威文档 #17 第五章 Ch5 §2.2 + §9
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_DIR="$PROJECT_ROOT/.codex/audit"
SELF_REPORT_DIR="$PROJECT_ROOT/.codex/self-reports"
TASK_ID="${TASK_ID:-unknown}"

AUDIT_RESULT="$AUDIT_DIR/audit-result.json"
SELF_REPORT="$SELF_REPORT_DIR/${TASK_ID}.json"

# 降级: audit-result 缺失
if [[ ! -f "$AUDIT_RESULT" ]]; then
  echo '{"taskId":"'$TASK_ID'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","matrix":[],"summary":{"total":0,"consistent":0,"contradict":0,"skipped":0},"degraded":true,"reason":"audit-result.json missing"}'
  exit 0
fi

# 降级: self-report 缺失
if [[ ! -f "$SELF_REPORT" ]]; then
  echo '{"taskId":"'$TASK_ID'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","matrix":[],"summary":{"total":0,"consistent":0,"contradict":0,"skipped":0},"degraded":true,"reason":"self-report.json missing"}'
  exit 0
fi

node -e "
const fs = require('fs');
const audit = JSON.parse(fs.readFileSync('$AUDIT_RESULT','utf-8'));
const selfReport = JSON.parse(fs.readFileSync('$SELF_REPORT','utf-8'));

// 自评检查项（5 问）
const checks = [
  { id: 'as_any', label: 'as any = 0', selfKey: 'as_any' },
  { id: 'empty_catch', label: 'empty catch with log', selfKey: 'exception_handling' },
  { id: 'wiring', label: 'wiring check', selfKey: 'wiring' },
  { id: 'tests', label: 'test coverage', selfKey: 'tests' },
  { id: 'dead_code', label: 'dead code', selfKey: 'dead_code' }
];

const matrix = [];
let consistent = 0, contradict = 0, skipped = 0;

for (const check of checks) {
  const selfPass = selfReport[check.selfKey] === true || selfReport[check.selfKey] === 'PASS';
  // 审计判定: audit-result 中是否有对应 ruleId 的 high severity 命中
  const auditFail = audit.findings && audit.findings.some(f => f.severity === 'high');

  // 简单映射: as_any → P02, empty_catch → P04, wiring → L8-style
  const auditMapping = { as_any: 'P02', empty_catch: 'P04' };
  const ruleId = auditMapping[check.id] || '';
  const auditHit = ruleId && audit.findings ? audit.findings.some(f => f.ruleId === ruleId) : false;

  let status;
  if (selfPass && !auditHit) { status = 'consistent'; consistent++; }
  else if (!selfPass && auditHit) { status = 'consistent'; consistent++; }
  else if (selfPass && auditHit) { status = 'contradict'; contradict++; }
  else { status = 'skipped'; skipped++; }

  matrix.push({
    checkId: check.id,
    label: check.label,
    selfAssessment: selfPass ? 'PASS' : 'FAIL',
    auditResult: auditHit ? 'FAIL' : 'PASS',
    consistency: status
  });
}

const result = {
  taskId: '$TASK_ID',
  timestamp: new Date().toISOString(),
  matrix,
  summary: { total: matrix.length, consistent, contradict, skipped }
};

fs.writeFileSync('$AUDIT_DIR/cross-check-report.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
"
