# D362 文档拉平

## Q0: 定位
把本地全部未提交文档（审计报告/coordination/权威文档/dev doc/html/仪表盘）与品牌替换改动锁进 git，拉平到 main，开分支合流走 PR。

## Q1: 调研
Mac 已用 PR 工作流（MULTI-MACHINE-PR-WORKFLOW.md）把 D334/D335 合并进 main；本地 feat/prompt-architecture 落后 main 8 提交。文档归档按 GIT-SYNC-PLAN.md（html 是交付物、企业数据不进 git）。

## Q2: 范围
- 提交：.gitignore 修正 + docs/ 全部文档（含 html）+ 根目录审计报告 html + .claude/skills/workflows/task-briefs + 品牌替换代码（src/scripts/tests）
- 排除：.env、data/、*.log、会话状态、企业事实数据

## Q3: 验收
git status 干净（仅剩被忽略的运行时产物）→ 拉平 main → feat/docs-sync 分支 cherry-pick + 文档索引 + HARNESS-ONBOARDING.md → push + PR 链接。

## 本任务在哪一层
L0 工程/文档（不涉及五层架构代码变更，纯归档与合并）。

## Done 标准
- [x] 862 个文件已提交（无 .env/data/日志/会话状态混入）
- [x] main 已拉平（pull --ff-only 成功）
- [x] feat/docs-sync 分支已 push 且生成 PR 链接
