# Task Brief: D718 cto-parallel-ctl-minor-fixes

> 生成: 2026-09-13 | 任务: D718 | 认领: 🧭 并行 CTO session
> 参考: 派单文档 docs/synova/coordination/派单-下一批四线并行-20260913.md §D718
> 必加载技能: `ctrl-tower-change`（控制塔变更模式库）+ `windows-compat`（跨平台模式库）

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔基础设施修复（非五层）。三项均为**存量小缺陷**，共同特征：门禁/工具链「看起来正常，实际静默失真」——
① 测试把骨架 brief 泄漏进真仓（污染主树）② brief 认领窗口 ±1 天 → 跨日任务永远认领不了自己的提交（D328 硬阻断）③ 脚本首行 BOM → 直接执行失败
### b) 文件审计
- `tests/control-tower/alloc-task-id-lock.test.sh:42` — 只设 `SYNO_TASK_STATE_DIR`，未设 `SYNO_BRIEF_DIR` → 每次运行写 20 份骨架 brief 进真仓（实测泄漏 56 份，主树亦见 5 份残留，CTO 2026-09-13 亲历）
- `scripts/workflow/resolve-commit-brief.sh:79-90` — ±1 天窗口；任务在 brief 创建日 >1 天后执行时永远认领不了自己的提交（D664 被拦 2 次，真痛点）
- `scripts/**/pre-doc-audit.sh` — 首行 BOM → `#!/usr/bin/env: No such file or directory`
- 附带：证据 `.log` 被 `.gitignore` 静默忽略（`PLAN-evidence-log-gitignored`）
### c) 决策
逐项复现 → 最小修 → 反向验证；不重构、不扩面。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- `ctrl-tower-change` 技能：门禁脚本是最高风险变更，改错 = 全线误拦/漏拦；历史 P0 事故一半出在控制塔（D328-D335 台账）
- `windows-compat` 技能：subprocess 调 bash 的自包含环境、PATH 差异、UTF-8、静默吞错 → 修 `.sh` 必须过跨平台视角
- 铁律 35：能写成 `check-*.sh` 的不靠 review；铁律 0-2：先复现再修
- 历史教训：控制塔「红了没人知」（未接线门禁）与「静默失真」是同族病 → 每项修完必须有反向验证
### 参考：ctrl-tower-change + windows-compat + 铁律 35 → 复现为先、最小修、反向验证必红

## Q2: 范围 — 正确的最简方案
做什么：
- tests/control-tower/alloc-task-id-lock.test.sh — 补 SYNO_BRIEF_DIR 注入缝，测试不再写真实仓库
- scripts/control-tower/alloc-task-id.sh — 机制级防线：task-state 注入态禁止写真实 brief 目录（同类第 2 次复发 → 源头 fail-closed，非逐测试打补丁）
- scripts/workflow/resolve-commit-brief.sh — 认领窗口改为「任务身份（D#）锚点 ∪ 日期窗口」而非纯 ±1 天
- scripts/pre-doc-audit.sh — 去首行 BOM（+ 同族 BOM 全仓扫描结论入台账）
- tests/control-tower/grep-oP-regression.test.sh — 并入首行 BOM 扫描（sealed，无需改 ci.yml；含存量待清清单 ratchet）
- tests/control-tower/resolve-commit-brief.test.sh — 跨日/tie-break 用例（G12 需显式路径：不展开 glob）
- docs/synova/coordination/审计发现台账-DSH-CTO.md — 本批发现登记（BOM 存量 14 个按域 / golden-case 环境误报 / G12-G22 匹配器不一致）
- memory/notes/implemented/2026-09-13-D718-ctl-minor-fixes.md — 本单决策 Note（D534 note 门禁）
- .claude/task-briefs/2026-09-13-D718-cto-parallel-ctl-minor-fixes.md — 本 brief
- task-state/D718.json — 本单登记
（第 4 项 .gitignore 证据日志白名单 = 派单"附带"项，创始人本批指令为三项 → 不并入，登记台账待派）
不做什么：
- 不改 `scripts/audit/` 任何文件（审计红线：CTO 亦不得碰）
- 不改 `scripts/pre-commit-check.sh` 的组数与判据（本批只修存量小缺陷，不动门禁语义）
- 不改 `src/**`（产品代码非本单范围）
- 不批量合并：**每项独立 PR**（控制塔变更最小爆炸半径原则）

## Q3: 验收 — 入口 → 交互 → 结果
入口：直接运行控制塔脚本 / 测试
处理：先复现缺陷 → 最小修 → 反向验证（移除修复必红）
结果：三项缺陷各带复现证据 + 反向验证记录 + 独立 PR

## 架构层: 基础设施（控制塔门禁，非五层）
变更面限 `scripts/control-tower/`、`scripts/workflow/`、`tests/control-tower/`、`.gitignore`

## Done 标准:
- [ ] alloc 测试不再污染真仓：修后连续跑 2 次 `bash tests/control-tower/alloc-task-id-lock.test.sh`，`git status --porcelain .claude/task-briefs/` 零新增
- [ ] 认领窗口修复可证：跨日场景（brief 创建日 +2 天）能认领成功，且反向验证（还原旧逻辑 → 必红）
- [ ] BOM 修复可证：`head -c 3 <script> | xxd` 无 `efbbbf`；直接执行不再报 env not found
- [ ] 每项独立 PR + 各自反向验证记录贴进 PR 描述
