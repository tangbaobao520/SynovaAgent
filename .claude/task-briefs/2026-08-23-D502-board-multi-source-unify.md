# Task Brief: D502 任务看板多源统一（Win+Mac+26线+待规划全量上板）

> 生成: 2026-08-23 | 任务: D502 | 认领: DeepSeek Harness（CTO）
> 创始人裁决: D502 由 CTO 实现；待规划 90 条全量上板（实际盘点 T-* 为 48 条 P0×19+P1×29）
> 性质: 仪表盘/数据聚合（scripts/product-lines + 双仪表盘 + dsh 插件均为 Mac DSH 领地，TASK-ROUTING §一）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属控制塔仪表盘层：dsh 任务看板当前只镜像 task-state（Mac 任务），创始人要求"一定能读到 Win 和 Mac 两边的进展 + 待规划补上 + 26 线产品完成度集成"。
### b) 文件审计
- dsh/plugins/task-board-adapter/lib/sync.js（334 行）— 现有：readTaskState（读工作区 task-state/）+ readBacklog（board-backlog.json）+ mapToBoardTask + syncOnce（import + 僵尸 delete）
- dsh/plugins/task-board-adapter/lib/index.js — setInterval 5min 调 syncOnce
- docs/synova/product-lines/product-progress.json — 26 线 × N 验证点 × status（CI product-progress.yml 自动刷新，push main 触发）
- docs/synova/product-lines/todos.yaml — 48 条 T-*-##（AUTO 区机器聚合，priority/owner/acceptance 齐全）
- git log 全历史 D# 提交 — Win 任务唯一真相（作者 Synova-Win/ClawOrg-Win/ClawOrg）；DASHBOARD-CN 生成器已证明可派生
- docs/synova/audit-reports/（32 份）— done 判定依据（内容 grep \bD#\b）
- 数据盘点：git 派生 D# 共 307；不在 task-state 的 235，其中 Win 作者 194（D1-D471）；近期活跃窗口（≥D328 多机 PR 工作流起点）48 个
### c) 决策
四源聚合：①task-state（既有）②git 派生 Win D#（≥D328 窗口，task-state 优先去重；有审计报告→done、有提交无审计→running）③product-progress.json 26 线（每线一卡 L01-L26 + L00 总览卡；0%→todo/部分→running/全绿→done）④todos.yaml 48 条 T-*（恒 todo，标题带优先级+线号）。数据源统一改为 origin/main（git fetch 只动 remote-tracking ref 不碰工作区），根治工作区滞后（D501 已踩）。

## Q1: 调研 — 业界最佳实践 / 历史教训
- Anthropic 基线: 数据管道 single source of truth + 派生视图幂等可重算；snapshot 失败绝不写空数据（fail-safe）。
- 本仓先例: gen-task-board.py（D320）已证明 Win 任务从 git 全历史派生可行；adapter import+delete 机制（5min 收敛）已验证。
- 历史教训: D501 工作区落后 main → 看板滞后（读工作区文件不可靠）；M1 fail-open（derive 硬失败时保留旧快照、跳过本次同步，绝不 import 空）；M10 范围扩大同步排除非目标（Win D# 窗口 ≥D328 防止 194 张远古卡淹没看板）；PyYAML 不可用（Python 3.9 系统）→ todos.yaml 用自写轻量解析器（仅支持本仓已知 schema）。
- 参考：第一性原理（看板=多源事实的只读投影，真相在 git/CI）+ Anthropic（派生幂等+降级诚实）+ 本仓 D320/D467 先例。

## Q2: 范围 — 正确的最简方案
做什么：
- dsh/plugins/task-board-adapter/scripts/derive-board-sources.py — 新派生脚本（fetch origin/main → 读 4 源 → 写 snapshot）
- dsh/plugins/task-board-adapter/lib/sync.js — 加 readSnapshot/mapWin/mapLine/mapTodo + syncOnce 四源聚合去重 + 僵尸删除覆盖全 id 集
- dsh/plugins/task-board-adapter/lib/index.js — 同步前 spawn derive 脚本（python3，超时+失败降级）
- dsh/plugins/task-board-adapter/test/sync.test.js — 新 mapper 单测 + snapshot 驱动 syncOnce 测试
- dsh/plugins/task-board-adapter/test/derive.test.sh — derive 脚本集成测试（临时 git 仓库沙箱）
- dsh/plugins/task-board-adapter/package.json — test script 纳入 derive.test.sh
- task-state/D502.json — 任务状态回填
不做什么：
- 不改 scripts/audit/ 目录任何 .py 脚本（K3 红线）
- 不改 .github/workflows/product-progress.yml（进度 CI 链路）
- 不改 scripts/product-lines/ 目录任何 .py 脚本（进度计算，只消费产物）
- 不改 dsh/plugins/task-board-adapter/cordis.patch.yml（插件接线不变）
- 不改看板 UI（5 列结构不变）

## Q3: 验收 — 入口 → 交互 → 结果
入口: dsh web 任务看板（adapter 5 分钟同步）
处理: derive 脚本 fetch origin/main → 读 task-state/product-progress/todos/git log → snapshot；syncOnce 聚合四源 → import + 僵尸删除
结果: 看板出现 ①Win D# 任务卡（≥D328，含 D338/D357/D470/D471 等）②26 张产品线卡（L01-L26，标题带 verified/total/%）+ L00 总览卡 ③48 张 T-* 待规划卡（带优先级）④既有 Mac D# 卡不变；Win 合并 PR 后 ≤5min 看板自动跟上（不依赖工作区 pull）

## 架构层:
控制塔仪表盘层（scripts + dsh 插件，非产品五层 L1-L5）

## Done 标准
- [x] verify: node --test dsh/plugins/task-board-adapter/test/sync.test.js 全绿（含新增用例）
- [x] verify: bash dsh/plugins/task-board-adapter/test/derive.test.sh 全绿（临时 git 仓库沙箱，python3 缺失时显式 skip 并计数）
- [x] verify: derive-board-sources.py --help 正常 + 对真实仓库跑一次产出 snapshot，26 线卡=26+1、Win 卡=git 派生数、T-*=48
- [x] verify: derive 硬失败（无 origin/main）exit 2 且不覆盖旧 snapshot；snapshot 缺失时 syncOnce 跳过 import（不写空）
