# Task Brief: D403: 派活文件落库（4 任务 brief + dev-doc 启动指引 + 认领表）

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D403)
> 决策参考：Docs as Code（文档进 git 单源真相）+ 本次会话 4 次「未提交=可丢/失真」实证——收敛：现在提交

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D402/D396/D394片1/D395-a 四个派活 brief + dev-doc 启动指引 + TASK-ROUTING 认领表更新——落库为 main 可核真相（dev-doc/Win/K3 都能读，不依赖工作区可见）。

### b) 文件审计
- .claude/task-briefs/D396-snapshot-golden.md（新）
- .claude/task-briefs/D394-sentinel-events.md（新）
- .claude/task-briefs/D395a-notes-four-state.md（新）
- .claude/task-briefs/D402-audit-fix-p1.md（新）
- docs/synova/coordination/DEV-DOC-DISPATCH-20260816.md（新，启动指引）
- docs/synova/coordination/TASK-ROUTING.md（认领表更新）
- .claude/task-briefs/2026-08-16-D403-dispatch-commit.md
- task-state/D403.json

### c) 决策
Docs as Code：派活文档进 git，与代码同生命周期。参考：第一性原理（契约放共享真相）+ Anthropic（单源可核）+ 开源实证（RDK/Grab/Holdex 全部进 git）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 4 brief + 指引起草 → ② 认领表更新 → ③ 提交落库 → ④ dev-doc 读 main 启动。
引用 D379 汇聚断裂教训、D393 P1-1 未入库失真。

### b) 执行约束
- rule: "派活文件在 git（dev-doc/Win/K3 可读）"
  verify: "提交后 git show 含 4 brief + 指引"

### c) 决策参考系
参考：DeepSeek/第一性原理 + Anthropic + Docs-as-Code 实证。收敛。

## Q2: 范围 — 正确的最简方案

做什么（8 文件）：
- .claude/task-briefs/D396-snapshot-golden.md
- .claude/task-briefs/D394-sentinel-events.md
- .claude/task-briefs/D395a-notes-four-state.md
- .claude/task-briefs/D402-audit-fix-p1.md
- docs/synova/coordination/DEV-DOC-DISPATCH-20260816.md
- docs/synova/coordination/TASK-ROUTING.md
- .claude/task-briefs/2026-08-16-D403-dispatch-commit.md
- task-state/D403.json

不做什么：
- 不改 src/ 业务代码
- 不改 K3 咨询报告（审计工作区产物）

## Q3: 验收 — 入口 → 交互 → 结果

入口：git log
处理：派活文件落库
结果：dev-doc 读 main 即可启动（D402/D396/D394片1/D395-a）

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] 4 派活 brief + 启动指引 + 认领表在 main
- [ ] dev-doc 启动指引可读（含任务清单/纪律/产出物）
