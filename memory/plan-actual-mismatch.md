---
name: plan-actual-mismatch
class: claimed-completion-without-verification
constraint: "python3 -c \"import json; p=json.load(open('.claude/plan.json')); files=[f for ph in p['phases'] if ph['step']<=p['current_phase'] for f in ph['files']]; print(len(files))\" 2>/dev/null || echo 0"
expected: 0
severity: warn
occurrences: 148
first_seen: 2026-06-23
description: 声称"全部完成"但 Plan 声明的文件与实际 commit 不符。5 次历史——Batch 1-5 各一次。约束升级为 block 条件: plan-actual-diff.txt 连续 2 次出现 MISSING 行。
---
remediation: |
  1. 提取 plan.json phases[].files 列表
  2. git diff --name-only 对比实际文件
  3. 缺失的逐一创建
