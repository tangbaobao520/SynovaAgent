# Task Brief: Loop Engineering v3.2→v3.3 升级

> 生成: 2026-06-20 15:43 | 分支: feat/prompt-architecture | as any: 0

## 项目身份
SynovaAgent。v3.2有5大痛点：语义门禁缺失、无轻量通道、brief不分级、门禁重复、命名混乱。

## Q1: 调研
- a) Anthropic: grade-and-revise loop → LLM-judge评审质量（P1）
- b) bash能做4项语义检查（来源引用/排除项/用户旅程/敷衍词）
- c) memory/loop-engineering-v3.0.md: 门禁多→绕过→全失效

## Q2: 范围
P0做: hook-block-write语义升级 + 轻量通道 + hook-enforce重命名 + verify-incremental去重
P1不做: LLM brief质量评审（后续）、task brief三分级（后续）

## Q3: 验收
task-start → 填敷衍brief → hook-block-write 拒绝 → 补充实质内容 → 通过
轻量通道: 只改md文件 → 跳过tsc+vitest → 只跑oxlint+secrets

## Done
- [x] hook-block-write.sh: Q1来源检查 + Q2排除项 + Q3用户旅程 + 反敷衍词
- [x] hook-enforce-v25.sh → hook-enforce-loop.sh 重命名
- [x] 轻量变更判定逻辑（verify-incremental.sh入口）
- [x] verify-incremental.sh 与 pre-commit-check.sh 接线审计去重
- [x] CLAUDE.md 版本号同步 v3.2→v3.3
