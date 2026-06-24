---
name: q0c-cancelled-without-followup
class: cancelled-module-without-replacement
constraint: "python3 -c \"import json; p=json.load(open('.claude/plan.json')); untracked=[ph.get('task','') for ph in p['phases'] if ph.get('action') in ('cancel','cancelled') and not ph.get('follow_up')]; print(len(untracked))\" 2>/dev/null || echo 0"
expected: 0
severity: warn
occurrences: 62
first_seen: 2026-06-23
description: Q0c 冲突→取消后没有补完任务。12 次历史——Q0c 审计删除 12 项但无替代。约束: plan.json 中所有 cancel 任务必须有非空 follow_up。
---
