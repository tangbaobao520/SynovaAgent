# Task Brief — D947 Win 侧首模块：src/middleware/** 默认安全姿态

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
Synova = AI 诊断 Agent（L1 交互 → L5 存储五层）。本任务在 **L1 边界（HTTP 中间件 + 路由注册）**。
把**已经写好、却不在执行路径上**的权限判据真正接上；并把「判据写了没接」从「靠人复查」改成「测试层必红」。
派单件：docs/synova/dispatch/D947-win-middleware-default-posture-20260924.md（尚未落 origin/main，按派单 §〇.3 本地优先例外执行）。
卡片：task-state/D947.json。PLAN：docs/synova/product-lines/evidence/D947-20260924/PLAN-REV2.md（R1–R8 已 CTO 放行）。
文件审计（实测）：写集 17 文件（PR-1 = 6 / PR-2 = 11），其中 4 个新建（rbac-default-deny / permission-filter / middleware-order / workspace-access-write-endpoint）。
冲突扫描：rbac@373 · jwtAuth@345 · rateLimit@353；路由注册前移前 12 组、前移后 5 组（豁免集 323/341/344/348/356）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考：Anthropic/第一性原理 + 结论=**安全判据一律 fail-closed；判据必须落在执行路径上，且以「改坏即红」证明其在场**。
历史教训：M3（机制建成未接线）；铁律 0-2（4 次接线失败）；铁律 4/5（后端能力 ≠ 用户可用功能）；D316（"声称完成"无物理证明）。
反例：本单存在 `server.ts:248/249` 两处 `void canXxxWorkspace(...)` —— 判据被丢弃 = 接线了不等于被执行。

## Q2: 范围 — 正确的最简方案
做什么（逐条精确路径，= 本卡全部文件）：
- src/middleware/rbac.ts
- src/middleware/auth.ts
- src/server.ts
- src/routes/workspaces-api.ts
- src/routes/department-workspace.ts
- src/routes/documents.ts
- src/services/request-context.ts
- tests/middleware/rbac.test.ts
- tests/middleware/auth.test.ts
- tests/middleware/rbac-default-deny.test.ts
- tests/middleware/permission-filter.test.ts
- tests/routes/middleware-order.test.ts
- tests/routes/workspace-access-write-endpoint.test.ts
- tests/routes/department-workspace.test.ts
- tests/routes/ga-auth.test.ts
- tests/routes/diagnosis-report-persistence.test.ts
- tests/routes/overflow.test.ts
- docs/synova/product-lines/evidence/D947-20260924/PLAN.md
- docs/synova/product-lines/evidence/D947-20260924/PLAN-REV2.md
- docs/synova/product-lines/evidence/D947-20260924/D947-T-V-verifier-raw-evidence.md
- docs/synova/product-lines/evidence/D947-20260924/D947-code-b-recon.md
- docs/synova/product-lines/evidence/D947-20260924/D947-code-c-recon.md
- docs/synova/product-lines/evidence/D947-20260924/D947-verifier-pr1.md
- docs/synova/product-lines/evidence/D947-20260924/D947-verifier-pr2.md
- docs/synova/product-lines/evidence/D947-20260924/D947-reviewer-pr1.md
- docs/synova/product-lines/evidence/D947-20260924/D947-reviewer-pr2.md
- docs/synova/product-lines/evidence/D947-20260924/D947-RECEIPT.md
- .claude/task-briefs/2026-09-24-D947-middleware-default-posture.md

不做什么（含文件路径）：
- 不改 vitest.config.ts（DEV_MODE/JWT_SECRET 前置必须在夹具内解决）
- 不改 scripts/pre-commit-check.sh、不改 scripts/control-tower/check-ownership.py
- 不改 electron-renderer/src/RightPanel.tsx（Mac 域，dev-seed 旁路另立卡）
- 不改 packages/engine-core/index.ts（铁律 46 白名单外零引用）
- 不碰 scripts/audit/**（K3 红线）、不写审计标准、禁自我审计
- 本卡**不修** JwtPayload 扩 department（Mac 域登录链；R5 已登记为功能回退）

## 写集

| 文件 | 写者 / PR |
|---|---|
| `src/middleware/rbac.ts` | code-a / PR-1 |
| `src/middleware/auth.ts` | code-a / PR-1 |
| `tests/middleware/rbac.test.ts` | code-a / PR-1 |
| `tests/middleware/auth.test.ts` | code-a / PR-1 |
| `tests/middleware/rbac-default-deny.test.ts` | code-a / PR-1（新建） |
| `tests/middleware/permission-filter.test.ts` | code-a / PR-1（新建） |
| `tests/routes/ga-auth.test.ts` | code-a / PR-1（L-18 迁移） |
| `tests/routes/diagnosis-report-persistence.test.ts` | code-a / PR-1（L-18 迁移） |
| `src/server.ts` | code-b / PR-2（单写者） |
| `tests/routes/middleware-order.test.ts` | code-b / PR-2（新建） |
| `src/routes/workspaces-api.ts` | code-c / PR-2 |
| `src/routes/department-workspace.ts` | code-c / PR-2 |
| `src/routes/documents.ts` | code-c / PR-2 |
| `src/services/request-context.ts` | code-c / PR-2 |
| `tests/routes/workspace-access-write-endpoint.test.ts` | code-c / PR-2（新建） |
| `tests/routes/department-workspace.test.ts` | code-c / PR-2 |
| `tests/routes/overflow.test.ts` | code-c / PR-2（N1 归因，见 D947-RULINGS L-7） |

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/pre-commit-check.sh`（13 组）+ 各 PR 夹具（`npx vitest run <file>`）
处理：中间件前移 + 写端点守卫接线 + 唯一漏斗收口 + 夹具「改坏即红」
结果：P0–P8 判据的原始输出 + 独立自验结论 + 独立复核结论（不判「通过」）

## 架构层: L1（交互层 · HTTP 中间件 + 路由注册）

## Done 标准
- [ ] 门禁：`bash scripts/pre-commit-check.sh` 返回 exit 0（13 组通过）
- [ ] P2 收敛：`grep -rn "conditions: \[\]" src/ --include='*.ts' | wc -l` 输出 0
- [ ] P4 顺序：rbac 之前路由注册恰 5 行（豁免集 323/341/344/348/356），且 rbac 行号 > jwtAuth 行号
- [ ] P3 接线：`grep -nE 'void +(canAccessWorkspace|canModifyWorkspace)' src/` 返回 0
- [ ] 夹具全绿：`npx vitest run tests/middleware tests/routes/middleware-order.test.ts tests/routes/workspace-access-write-endpoint.test.ts`
