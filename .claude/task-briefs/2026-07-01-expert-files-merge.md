# Task Brief: 专家文件合并重构 — 10 文件合并为 5 文件

> 生成: 2026-07-01 | 分支: feat/prompt-architecture

## Q0: 定位
- 扩展解耦：expert/ 目录文件合并
- 性质：重构（不改行为，只合并文件）

## Q1: 调研
- 按 docs/research/growth-diagnostics/expert-files-merge-task.md 规范执行
- 约束：不改变内容，只做合并，保持标题层级

## Q2: 范围
做什么：8 位专家 (strategy/org/finance/tech/marketing/action/business_model/knowledge) 文件合并
不做什么：不改 IDENTITY.md/TOOLS.md/CROSS_EXPERT.md，不改 TS 代码

## Q3: 验收
- 每专家目录保留 5 个 .md 文件
- tsc --noEmit 零错误
- 内容无改动

## 本任务在哪一层
扩展层（expert/）

## Done 标准
- [ ] verify: 每专家目录 ls *.md | wc -l = 5
- [ ] verify: npx tsc --noEmit exit 0
