---
name: info-injection-ignored
class: soft-mechanism-treated-as-noise
constraint: "python3 -c \"import json; matches=json.load(open('.claude/memory-match.json')); print(len(matches['matches'])) if matches.get('matches') else print(0)\" 2>/dev/null || echo 0"
expected: 0
severity: warn
occurrences: 1362
first_seen: 2026-06-15
description: 信息注入型检查被 agent 系统性无视。hook-check-memory 每次运行都注入教训但从未被吸收。约束: 如果 memory-match.json 有匹配但 Q1c 未引用 → warn。升级为 block 条件: 同一条 memory 被 warn 3 次且 Q1c 仍不引用。
---
remediation: |
  1. Q1c 中引用 memory/ 文件
  2. 在 plan.json memory_refs 中列出引用
