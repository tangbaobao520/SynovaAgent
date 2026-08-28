# Task Brief: D486 register 认证闭环批次收尾——三切片独立复核 + 交付证据 + 簿记闭环（批次含 D483/D484）

> 生成: 2026-08-28 20:35:00 | 分支: feat/d483-register-auth (base origin/main 54ed1cf5) | as any: 0
> 派单: docs/synova/coordination/派单-D483-D486-register-auth-20260828.md | 执行: DSH 编码 session（worktree 隔离）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。pre-commit 物理阻断跨层 import。

**横向解耦：独立 Monorepo 包**
五层内部拆为独立包，接口边界明确。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码。

流程约束: V5.1.1 — 本地软提示 + CI 权威门禁（D515/D516）。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [ ] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（文件驱动，不改 TypeScript）——本任务仅新增 coordination 交付报告文档，零 TS 代码变更

本任务属于基础设施线（流程簿记/证据落仓）。register 认证闭环批次（AUTH-A/ AUTH-B / AUTH-E2E）三切片实现已由 win 线 Claude Code 完成并合入 main（D483=78c5a84f/PR #156、D484=a6d4af07/PR #170、D486=b036d380/PR #208），但 task-state 仍停在 spec_done（D393 派生制下 D483/D484 可由 git log (D#) 自动派生 impl_done；D486 的 commit 消息 `test: D486 ...` 无 ASCII 括号，生成器 `\(D(\d{3})\)` 匹配不上，将永久派生不出 impl_done）。本任务 = 按派单做三切片独立物理复核（claim-verifier 场景 2）+ 交付证据报告落仓 + 以 (D486) commit 消息在生成器机制内补齐 D486 簿记。不重实现、不发明新范围。

### b) 文件审计
grep isWhitelisted / enterprise / invitation / auth-register-flow 在 src/ 与 tests/（实测 2026-08-28 worktree@54ed1cf5）:
- src/middleware/auth.ts L91-93: register + enterprise/register + invitation/ 前缀三分支已在 isWhitelisted（D483/D484 实现存在）
- tests/middleware/auth.test.ts L237-243: register 白名单单元用例已在（D483）
- tests/middleware/auth.integration.test.ts: signJwtToken 零命中（bootstrap 绕过已移除, D483）
- tests/routes/enterprise.test.ts: 17 it() / 366 行（D484 全链路 6 用例 + 旧 11 断言）
- tests/e2e/auth-register-flow.e2e.test.ts: 5 it() / 39 expect（D486 交付物）
- expert/ sentinel/ extensions/ knowledge/ skills/: 零命中（无文件驱动模块涉及本任务）

关系: 复用（已有实现工件 + 既有 spec DS 标准）→ 零新建代码；唯一新建 = coordination 交付报告文档。

### c) 决策
已有覆盖（三切片实现 + spec §3.2 回填）→ 复用，不重建（不重复实现 = 防撞车 + 防范围膨胀）。
簿记缺口 → 走生成器既有机制（commit 消息 (D#) 派生），不改 scripts/（审计红线 + 派单不碰清单）。
无冲突 → 不取消。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC/Done — 交付报告落仓 + 三切片 DS1-DS7 证据链齐 + K3 批次审计请求
② 测试 — 复跑既有测试组（4 套件 57/57 + e2e 4/4 真实 server，Mac 实测 2026-08-28）
③ 实现 — 仅交付报告文档（声称↔证据逐条对照，M2 禁空泛）
④ 接线 — 文档落 docs/synova/coordination/（DSH 领地）；(D486) 消息 → gen-cto-health.py impl 派生
⑤ 验证 — 自检 6 问 + check-brief-parseable + check-plan-integrity + pre-commit 13 组

引用依据:
- 铁律 0-2: spec → test → impl → wire → review → merge（本批次实现段已由 win 线走完，本任务补 review/证据段）
- 铁律 12: 集成测试 cover 真实路由（e2e 真实 server 实测复跑）
- claim-verifier 场景 2: 声称完成必须物理证明（grep/git/测试输出/CI API），不凭文档

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: "本任务零代码变更——src/ tests/ scripts/ 只读（派单不碰清单 + 审计红线）"
  verify: "git diff --cached --name-only | grep -vE '^(docs/|.claude/)' | wc -l"
- rule: "交付报告逐条声称必须附物理证据（命令+输出+file:line），M2 禁空泛"
  verify: "grep -c '证据' docs/synova/coordination/DELIVERY-REPORT-D483-D484-D486-register-auth-20260828.md"
- rule: "不改 task-state json 的 status/impl 字段（D393 派生制 deprecated，改了也会被生成器覆盖）"
  verify: "git diff --cached --name-only | grep 'task-state/' | wc -l"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
参考：Anthropic（验证优先——不信任文档声称，CI API + 本地实测双通道取证；测试反映真实用户路径——e2e 用真实 server 复跑）+ 第一性原理（实现已存在 → 最简簿记 = 证据文档 + 消息派生，不重实现）+ 开源实证（GitHub check-runs API 为 CI 结论权威来源）+ 结论：三参考系收敛 → 复核 + 证据落仓 + 簿记闭环，不重实现。

### d) 相关 Note 引用
- 无新建 Note：本任务无治理脚本/铁律/规则文档变更（docs/ 纯文档，D534 §4.2 明确排除）。D393 派生制结论直接引用既有规范 task-state/README.md（D393/D399 章节）。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- docs/synova/coordination/DELIVERY-REPORT-D483-D484-D486-register-auth-20260828.md（新建——三切片缺陷清单逐条声称↔证据对照 + CI check-runs + Mac 独立实测 + E2E 真实 server 证据 + K3 批次审计请求）
- .claude/task-briefs/2026-08-28-D486-register-auth-closure-batch.md（本 brief，随 commit 入仓）

不做什么：
- 不改 src/middleware/auth.ts (D483/D484 实现已入 main, 78c5a84f + a6d4af07)
- 不改 src/routes/enterprise.ts (D484 spec §3.2 定稿为零改动)
- 不改 tests/middleware/auth.test.ts (D483 register 白名单用例已在 main L237-243)
- 不改 tests/middleware/auth.integration.test.ts (bootstrap 绕过已移除, signJwtToken 零命中)
- 不改 tests/routes/enterprise.test.ts (D484 17 用例已在 main)
- 不改 tests/e2e/auth-register-flow.e2e.test.ts (D486 交付物已在 main, b036d380)
- 不改 scripts/pre-commit-check.sh (门禁脚本只读——派单不碰清单 + 审计红线)
- 不改 task-state/D486.json (D393 派生制: json status/impl 字段 deprecated 被生成器覆盖, 只认 git log 消息)
- 不改 scripts/control-tower/gen-cto-health.py (生成器只读; D486 派生缺口用 commit 消息机制内修复, 不动脚本)

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：创始人派单（chat 批次工单 2026-08-28）+ 三份 spec（docs/plans/codex/implementation/SYNOVA-IMPL-D483/D484/D486-*.md）
处理（中间经过哪些步骤）：claim-verifier 物理核验（grep file:line / 4 套件 57 用例复跑 / tsc 28=28 基线 / e2e 真实 server PORT=3099 复跑 4/4 / GitHub check-runs API 三 PR 取证）→ 交付报告逐条对照 spec 缺陷清单 → (D486) 簿记 commit
结果（最终展示在哪）：交付报告入 docs/synova/coordination/ + 分支 PR（CI 绿）+ 最终 chat 交付报告 + K3 批次审计请求（创始人转发 K3）

## 架构层: 基础设施
coordination 簿记文档，不触及 L1-L5 代码层。
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: `bash scripts/workflow/check-brief-parseable.sh .claude/task-briefs/2026-08-28-D486-register-auth-closure-batch.md` exit 0
- [ ] 链路走通: `test -f docs/synova/coordination/DELIVERY-REPORT-D483-D484-D486-register-auth-20260828.md` exit 0
- [ ] 结果可见: `grep -c "D483" docs/synova/coordination/DELIVERY-REPORT-D483-D484-D486-register-auth-20260828.md` 输出 ≥ 1
