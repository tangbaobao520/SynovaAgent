# Task Brief: D484 企业邀请注册链路打通——enterprise 匿名端点白名单 + 邀请全链路集成测试

> 生成: 2026-08-25 | 分支: feat/win-d484-enterprise-invite-b | as any: 0
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D484-enterprise-invite-slice-b-20260825.md
> 前置依赖: D483 (PR #156) 已合并 main（串行约束，共享 src/middleware/auth.ts isWhitelisted）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。

流程约束: V4.5.1 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + grep 物理门禁 + 决策参考四步框架。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
L1 入口: POST /api/diagnosis/consult / Cron→Sentinel.check() / GET /chat / MCP
五层架构: L1 交互: routes/ tui/ mcp/ | L2 编排: agent/ orchestrator/ | L3 洞察: l3/ sentinel/ expert/ | L4 本体: l4/ evidence/ | L5 存储: store/ cron/

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向: L1 交互层。src/middleware/auth.ts（jwtAuthMiddleware 认证入口）+ src/routes/enterprise.ts（L1 路由，D103 邀请体系）。不改 L2-L5。
- 本任务 = register 认证闭环切片 B：enterprise 邀请体系（D103 已完整实现 invite/accept/token 机制）被认证层挡（匿名 401），打通匿名可达性 + 补邀请全链路集成测试（现状零真实覆盖）。
- 切片位置: 切片 A（D483 开放注册白名单，已合并）→ 本切片 B（企业邀请注册打通）→ 切片 C（注册后 onboarding）。

### b) 文件审计
grep api/enterprise src/middleware/auth.ts → 零命中（isWhitelisted 无任何 enterprise 路径，实测 L83-99/D483 合并后 L83-102）。
grep invitation src/ --include=*.ts → 仅 src/routes/enterprise.ts 命中（邀请实现全仓唯一，无重复造轮子）。
grep enterprise.test tests/ → tests/routes/enterprise.test.ts 已存在（D102+D103 遗留，108 行）——dev doc §2 声称"不存在"不准确；实测内容为 bcrypt 单元测试 + 内存 Map 操作 + 模块导出检查，零 HTTP 路由覆盖，邀请链路（register→invite→query→accept）零断言——dev doc 实质主张（邀请链路零真实覆盖）成立。
grep setUserStore src/ → src/routes/auth.ts:58 + src/routes/enterprise.ts:32 + src/agent/synova-agent.ts:145-155（生产接线: 启动时 SqliteGraphStore → UserStore → setUserStore 注入 enterprise）。
关系: 复用（enterprise.ts 邀请机制 100% 复用，默认零改动）+ 扩充（enterprise.test.ts 保留旧断言 + 新增集成 describe）+ 修改（auth.ts isWhitelisted 加 2 条 enterprise 匿名分支）。

### c) 决策
已有覆盖→复用: enterprise 邀请体系完整（invite 7 天有效期/pending-expired-accepted 状态机/accept 绑定 orgId+role/requireAdmin 角色保护），重建违背"不重复造轮子"。真正缺口 = 匿名可达性（白名单）+ 测试真空。
无覆盖→扩充: 邀请链路集成测试用 D481 auth.integration.test.ts 成熟模式（真实 express 挂载 + native fetch + 真实 signJwtToken + app.listen(0)）。
冲突→无（D483 已合并后开工，isWhitelisted 行级无冲突）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC: dev doc SYNOVA-IMPL-D484 §3-§6（写集 2 修改 + 1 扩充、DS1-DS7）
② 测试: 先写集成测试（RED: 匿名 register/query/accept → 401），vitest run 实测红
③ 实现: isWhitelisted 加 /api/enterprise/register 精确匹配 + /api/enterprise/invitation/ 前缀匹配 两条分支
④ 接线: jwtAuthMiddleware 内部调用 isWhitelisted（src/middleware/auth.ts，server.ts L290 生产全局挂载）——白名单分支即生产接线
⑤ 验证: DS1-DS7 逐项 verify + 自检 6 问

引用依据:
- 铁律 0-2: spec → test → impl → wire → review → merge（先红后绿）
- 铁律 7: Done = 入口可触达（匿名可达）+ 链路走通（register→invite→query→accept）+ 结果可见（vitest 断言 + GraphStore 用户实证）
- 铁律 12: 集成测试 cover 真实路由，不 mock 管线（真实 express + 真实中间件 + 真实 UserStore + native fetch）
- 铁律 24/31: 本任务不新增 catch；测试对降级路径（401/403/400/404）断言
- 铁律 38: as any 零容忍
- 铁律 48: 每个测试有 expect() 真实断言，覆盖正常 + 降级 + 边界
- memory 教训: 2026-08-23-d480（tests/ 写入不触发 D314——RED 阶段安全）、2026-08-24-d481（auth.integration 模式复用）、2026-08-24-d483（Q2 路径紧跟 - 且禁全角括号）

### b) 本任务执行约束
- rule: "enterprise 匿名端点必须且只需 2 条白名单分支"
  verify: "grep -c api/enterprise src/middleware/auth.ts 输出 2"
- rule: "邀请全链路 6 用例真实 HTTP 走通"
  verify: "vitest run tests/routes/enterprise.test.ts 全 pass"
- rule: "requireAdmin 保护不削弱"
  verify: "vitest run tests/routes/enterprise.test.ts 中 invite 无 token 401 + staff token 403 用例 pass"

### c) 决策参考系（Q1c，dev doc §4.5 三决策点）
决策点 1 邀请令牌从零实现 vs 打通现有体系:
① 第一性原理: enterprise.ts invite/accept 已完整（token 生成/有效期/状态机/绑定 orgId+role），全仓唯一，重建是浪费。
② Anthropic 基线: 最小改动达成目标——2 条白名单分支。
③ 开源实证: 邀请链接语义（Slack/Notion）即匿名可达 + token 即凭证。
④ 收敛: 打通不重建。
决策点 2 invitations 内存持久化: 垂直切片聚焦，缺口 B 显式记录遗留另立任务，本次不做。
决策点 3 accept 补 email 匹配: token 即凭证（email 绑定在邀请时），保持现状，安全观察记录。
参考：Anthropic/DeepSeek/第一性原理 + 结论：打通现有体系（白名单+测试），不重建；持久化 descope；token 即凭证保持。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/middleware/auth.ts
- tests/routes/enterprise.test.ts
- src/routes/enterprise.ts

具体: auth.ts isWhitelisted 加 enterprise register 精确匹配 + invitation 前缀匹配（覆盖 :token 查询 + accept 两个匿名端点）；enterprise.test.ts 保留 D102/D103 旧断言 + 新增 D484 邀请全链路集成 describe（真实 express 挂载 jwtAuthMiddleware→authRoutes→enterpriseRoutes，同一 UserStore 实例注入两路由模块，内存 GraphStoreLike 真实实现，6 用例: 匿名企业注册/admin login+invite/匿名查邀请/匿名 accept+UserStore orgId 与 role 实证/已用过期邀请 400/invite 无 token 401 与 staff token 403）；enterprise.ts 仅当集成测试暴露真实 bug 时修复并在 dev doc §3.2 回填，默认零改动。

不做什么：
- 不修改 src/routes/auth.ts
- 不修改 src/middleware/rbac.ts
- 不修改 src/server.ts
- 不修改 src/growth/user-store.ts
- 不修改 tests/middleware/auth.test.ts
- 不修改 tests/middleware/auth.integration.test.ts
- 不修改 tests/routes/auth.test.ts
- 不做 invitations 持久化（缺口 B descope，另立任务）
- 不改 invite/accept 业务语义（token 即凭证保持）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）: 企业注册者/被邀请人匿名 HTTP 请求 POST /api/enterprise/register、GET /api/enterprise/invitation/:token、POST /api/enterprise/invitation/accept（此前被 jwtAuthMiddleware 401 挡，本任务打通）
处理（中间步骤）: jwtAuthMiddleware → isWhitelisted 命中 enterprise 匿名分支 → next() → enterprise 路由（register 建 org+admin 用户 / accept 经 token 校验 createUser 绑定 orgId+role）；invite/管理端点仍走认证+requireAdmin
结果（最终展示）: vitest run tests/routes/enterprise.test.ts 全 pass（含 6 个新集成用例，GraphStore 用户绑定实证）；DS1-DS7 verify 全绿；CI 绿

## 接口审计（从代码 grep，非凭记忆）

- src/middleware/auth.ts:isWhitelisted（L83/D483 合并后 L86——register 分支后）——本任务加 2 分支
- src/middleware/auth.ts:jwtAuthMiddleware（L246）→ src/server.ts:290 生产全局挂载
- src/middleware/auth.ts:signJwtToken（L112）/ verifyJwtToken（L140）——测试签发真实 token
- src/routes/enterprise.ts:register（L96）/ invite（L145）/ get invitation（L199）/ accept（L214）/ requireAdmin（L78）/ setUserStore（L32）
- src/routes/auth.ts:login（L113）/ setUserStore（L58）——测试复用真实 login 取 admin token
- src/growth/user-store.ts:UserStore.createUser（L75）/ queryByEmail（L119）——accept 后用户实证
- src/agent/synova-agent.ts:145-155 生产 UserStore 注入（D224 wiring，不改动，仅参照）

## 架构层: L1
src/middleware/auth.ts + src/routes/enterprise.ts 均属 L1 交互层；测试文件为测试层。无跨层依赖变化。
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: grep -c api/enterprise src/middleware/auth.ts 输出 2
- [ ] 链路走通: verify: vitest run tests/routes/enterprise.test.ts 全 pass（含匿名 register→login→invite→query→accept 全链路 + GraphStore 用户 orgId/role 实证）
- [ ] 保护不削弱: verify: vitest run tests/routes/enterprise.test.ts（invite 无 token 401 + staff token 403 用例）
- [ ] 结果可见: verify: vitest run tests/middleware/auth.test.ts tests/middleware/auth.integration.test.ts tests/routes/auth.test.ts 全绿 + tsc --noEmit 零新增
