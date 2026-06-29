---
name: dual-source-fraud
class: created-module-without-checking-old-system
constraint: "grep -rn 'SOGNodeType\.\|ProviderType\|SEED_FRAMEWORKS\|DEFAULT_POLICIES\|DEFAULT_EXPERTS\|SIGNAL_TO_EXPERT\|BUILTIN_RULES' src/ --include='*.ts' 2>/dev/null | grep -v 'extensions/\|import type\|\.test\.\|memory/\|\.d\.ts' | wc -l"
expected: 0
severity: block
occurrences: 493
first_seen: 2026-06-22
upgraded_to_block: 2026-06-23
description: 新建文件驱动模块前必须确认旧硬编码系统是否仍在 src/ 中活跃。15 次历史——Batch 1-4 系统性双数据源。约束: grep 旧 enum/union/array 在 src/ 中的直接引用数必须为 0。
---
remediation: |
  1. 新建文件驱动模块前运行: grep -rn "旧枚举/union/array" src/ --include='*.ts'
  2. 确认旧系统不活跃→新建 | 旧系统活跃→复用
