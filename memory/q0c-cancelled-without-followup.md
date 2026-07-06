---
name: q0c-cancelled-without-followup
class: cancelled-module-without-replacement
constraint: "python3 -c 'import json; p=json.load(open(\".claude/plan.json\",encoding=\"utf-8\")); phs=[ph for ph in p.get(\"phases\",[]) if ph.get(\"action\") in (\"cancel\",\"cancelled\") and not ph.get(\"follow_up\")]; print(len(phs))' 2>/dev/null || echo 0"
expected: "0"
severity: block
occurrences: 490
first_seen: 2026-06-23
upgraded_to_block: 2026-06-24
remediation: |
  1. Q0c 冲突=取消→但必须在 plan.json 中写 follow_up 字段
  2. follow_up 必须指向一个后续的 phase 或 task brief
  3. 取消的能力必须有文件驱动替代方案
description: Q0c 冲突→取消后没有补完任务。12 次历史——Q0c 审计删除 12 项但无替代。升级为 block：取消后不补就不准提交。
