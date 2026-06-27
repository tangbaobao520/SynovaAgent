---
name: lessons-file-lost
class: knowledge-asset-not-backed-up
constraint: "test -f docs/07-Lessons-踩坑录/LESSONS-全量经验教训库-20260523.md && echo 1 || echo 0"
expected: 1
severity: warn
occurrences: 263
first_seen: 2026-06-23
description: 原始踩坑录文件丢失。约束: 踩坑录文件必须存在。此约束为 warn 因为文件已不可恢复——仅用于防止再次丢失。
---
remediation: |
  1. 从 CLAUDE.md 铁律注释反向恢复
  2. 新错误直接写入 memory/
