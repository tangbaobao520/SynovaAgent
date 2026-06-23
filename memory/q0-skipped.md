---
name: q0-skipped
class: skipped-pre-task-audit
constraint: "python3 -c \"import sys; content=open('.claude/task-briefs/' + __import__('os').listdir('.claude/task-briefs/')[-1]).read(); print('1' if 'grep-output' in content else '0')\" 2>/dev/null || echo 0"
expected: 1
severity: block
occurrences: 4
first_seen: 2026-06-22
upgraded_to_block: 2026-06-23
description: Q0b 文件审计在写代码前被跳过。3 次历史——Batch 1-3。约束: task brief 必须包含 grep-output 代码块。V3.8 已通过 PreToolUse 强制，此约束为二次验证。
---
