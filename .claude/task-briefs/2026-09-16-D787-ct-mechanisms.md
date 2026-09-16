# Task Brief: D787 CT 三机制 + D595 载体修复 + D593 裁定订正（派单）

> 生成: 2026-09-16 | 分支: docs/d787-ct-mechanisms | as any: 0
> 域: mac（协调文档 + task-state；单域）
> 主线贡献: infra:审计结论可信度 + 控制塔三机制（M2 第三次 / 三连夹带实证）
> 触发: K3「D593-FIX 复审 + D595 首审」交付 → CTO 独立复核

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
治理层：把审计发现（K3 报的 3 个机制缺口）变成防线 + 订正一处**已过时的审计裁定**（防止看板长期显示不存在的红）。

### b) 文件审计（全部实测）
- `git show --stat 9c3f1672` → 12 文件，**无 src/routes/diagnosis.ts**（K3 取证成立）
- `git log -1 --date=short origin/main -- src/routes/diagnosis.ts` → **e53b5984 2026-09-10 fix(D593): FIX2 …(#476)**（K3 终局判定已过时）
- `git show origin/main:src/routes/diagnosis.ts` → L596 saveDiagnosisCheckpoint / L678·741·794 冷读 / L104-106·155 FIFO / **L808 router.get('/api/diagnosis/reports')**
- CTO 独立实跑 `npx vitest run tests/routes/diagnosis-report-persistence.test.ts tests/electron/right-panel-report-sentinel.test.ts` → **2 passed / 21 tests passed / EXIT=0**
- D595 spec：`git cat-file -e origin/main:…D595-mcp-auth-20260908.md` → 缺失；删除者 `f5f9c462 (#457)`；brief 在 main 为骨架
- gitlink：`git ls-tree origin/main | grep -c '^160000'` → **0**（已清零）
- D595 测试：`npx vitest run tests/mcp/` → bridge(4|3 skipped)/skill-audit-gate(7)/tool-definitions(38) 全绿，0 failed

### c) 决策
- 机制三条全部采纳（K3 提议），按「一类一机制」落到 pre-commit/PR 门禁；**不新增 M 类**
- D593 FAIL 不推翻 K3 的取证，但**要求 K3 复验 FIX2 并订正裁定**（审计裁定必须与当前事实一致）

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = 三机制各自有「正向 + 反向 + 接线」三类证据；D595 载体三件补齐；D593 裁定与 main 事实一致。
② 测试先行：机制 A/B/C 均要求反向用例先红后绿（贴两次原始输出）。
③ 实现 = 派单 + 三个机制的编码指令（执行方 = 并行 CTO）。
④ 接线 = 三机制都必须在 `scripts/pre-commit-check.sh`（或 PR 门禁）被真实调用，并 grep 证明。
⑤ 验证 = 本单以 `pre-dispatch-check` + 后续 PR 的机制测试为验收。

引用依据：M2（声称 vs 事实）第三次 · M3（机制建成未接线） · 铁律 35（能变 check 的不靠 review） · D571（裁定与事实一致性：stale verdict 必须订正）

### b) 本任务执行约束
- rule: "派单可过机械复核" verify: "bash scripts/control-tower/pre-dispatch-check.sh <派单文档> → 全部通过"
- rule: "不碰审计领地" verify: "git diff --name-only origin/main...HEAD | grep -c 'scripts/audit/' → 0"

### c) 决策参考系
参考：第一性原理（报告的价值 = 与当前事实一致；防线只认物理拦得住）+ Anthropic 基线（一类一机制、可测可回退）→ 采纳三机制 + 订正裁定。

### d) 相关 Note 引用
无（协调文档 + task-state；后续机制实现由执行方按 D534 写 Note）。

## Q2: 范围 — 正确的最简方案

做什么：
- docs/synova/coordination/派单-D787-CT三机制与D595载体修复-20260916.md — 派单（复核结果 + 三任务 + 硬约束 + 验收 + 自检）
- task-state/D787.json — 本派单台账

不做什么：
- 不改 src/routes/diagnosis.ts（FIX2 已修，本单不重做手术）
- 不改 scripts/audit/**（K3 红线）
- 不改 scripts/pre-commit-check.sh（三机制由执行方实现，本单只派）
- 不改 docs/plans/**（D595 spec 恢复由任务 2 执行方做）

## Q3: 验收 — 入口 → 交互 → 结果

入口：并行 CTO 按派单取单；K3 按任务 1 复验
处理：三机制落地并接线 → 反向用例红→绿；D595 载体补齐；D593 裁定订正
结果：控制塔三类真实缺陷被拦；审计裁定与事实一致；看板不再显示过期红

## 架构层: scripts（治理层：协调文档 + task-state）；不触 L1-L5
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: `bash scripts/control-tower/pre-dispatch-check.sh docs/synova/coordination/派单-D787-CT三机制与D595载体修复-20260916.md` → 末行「✅ 机械项全通过」
- [ ] 链路走通: verify: `grep -c "e53b5984" docs/synova/coordination/派单-D787-CT三机制与D595载体修复-20260916.md` → ≥1（D593 订正依据具名）
- [ ] 结果可见: verify: `grep -c "机制 A\|机制 B\|机制 C" docs/synova/coordination/派单-D787-CT三机制与D595载体修复-20260916.md` → ≥3
- [ ] 红线未越: verify: `git -c core.quotepath=false diff --name-only origin/main...HEAD | grep -c "scripts/audit/"` → 0

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/task-briefs/2026-09-16-D787-ct-mechanisms.md | task |
| docs/synova/coordination/派单-D787-CT三机制与D595载体修复-20260916.md | task |
| task-state/D787.json | task |

