---
name: grep-semantic-overreach
class: bash-doing-semantic-judgment
constraint: "grep -rn 'as any\b' src/ --include='*.ts' 2>/dev/null | grep -v 'node_modules\|\.test\.\|\.d\.ts' | grep -vE '^\s*[^:]+:\d+:\s*(//|/\*|\*| \*)' | wc -l"
expected: 0
severity: block
occurrences: 337
first_seen: 2026-06-22
upgraded_to_block: 2026-06-22
description: bash grep 做语义判断产生内耗。V3.6 17 次提交尝试。约束: as any 在代码行（非注释行）中必须为 0。pre-commit 第 1 组已有此检查，此为 PreToolUse 二次验证。
---
remediation: |
  1. 跳过注释行: grep -vE '^\s*\*|^\s*//'
