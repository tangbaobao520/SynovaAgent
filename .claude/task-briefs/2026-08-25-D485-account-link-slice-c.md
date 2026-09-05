# Task Brief: D485 register 认证闭环 切片 C——双轨账号关联（个人账号绑定企业）

> 生成: 2026-08-25 | 分支: feat/win-d485-account-link-c | as any: 0
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D485-account-link-slice-c-20260825.md
> 前置依赖: D483 (PR #156) + D484 (PR #170) 均已合并 main（串行约束，共享 auth/enterprise 链路）

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
- 纵向: L1 交互层 + L1 依赖的存储适配。src/routes/enterprise.ts（accept 端点，D484 打通匿名可达）+ src/growth/user-store.ts（GraphStore 用户持久化，D106）。不改 L2-L5。
- 本任务 = register 认证闭环切片 C: 双轨衔接。创始人决策 2026-08-25——个人开放注册（auth/register，个人空间）+ 企业邀请制（enterprise invite/accept）双轨并存；个人账号被邀请可加入企业（飞书/钉钉模式）。
- 现状断点: accept（enterprise.ts L224-227 实测）直接 createUser 不查重——个人轨已注册 email 被邀请后新建重复账号，userId/密码断裂；UserStore.updateUser（user-store.ts L214 实测）props 仅 role/status/displayName/department 4 字段，无 orgId，绑定缺能力。
- 切片位置: 切片 A（D483 已合并）→ 切片 B（D484 已合并）→ 本切片 C（双轨账号关联）。

### b) 文件审计
grep queryByEmail src/routes/enterprise.ts → 仅 L108 register 去重命中（accept 零命中，查重缺口实测确认）。
grep updateUser src/ → user-store.ts L214 定义 + enterprise.ts L275/L325/L587 + services/anomaly-detector.ts L86/L100/L110（独立鸭子接口，方法语法 bivariant，类型扩展零破坏）。
grep linked src/routes/enterprise.ts → 零命中（响应无绑定语义字段）。
grep -rn "按 email 绑定" src/ → 零命中——全仓无既有账号绑定组织实现，本切片为新增衔接非重复（dev doc S-14 实测复核成立）。
关系: 复用（queryByEmail L119 现成、D484 集成测试基建: 真实 express 挂载 + InMemoryGraphStore + 共享 UserStore 注入）+ 扩充（updateUser Pick 类型加 orgId + accept 加查重绑定分支 + 测试 3 用例）+ 修改（无既有代码删除）。

### c) 决策
已有覆盖→复用: queryByEmail（user-store.ts L119）与 D484 测试基建（beforeAll 挂载/共享状态链式依赖模式）100% 复用。
无覆盖→新增: updateUser orgId 支持（Pick 加 1 字段，最小扩展）+ accept 绑定分支（对照 register L108-110 与 auth register L87-89 的既有去重模式补齐 accept 这一唯一不查重路径）。
冲突→无（D483/D484 均已合并，主链路串行本任务独占，写集与 main 新增 19 提交零交集已实测）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC: dev doc SYNOVA-IMPL-D485 §3-§6（写集 3 修改、DS1-DS7）
② 测试: 先写 3 用例（RED: 用例①以现状断言 accept 新建重复账号 userId 断裂），vitest run 实测红
③ 实现: user-store.ts updateUser Pick 加 orgId；enterprise.ts accept 加 queryByEmail 查重——已存在 → 密码验证 + updateUser 绑定（userId/密码保留，linked=true）；不存在 → createUser 现状（linked=false）
④ 接线: accept 是 D484 打通的生产入口（jwtAuthMiddleware 白名单匿名可达 + server.ts 挂载 enterpriseRoutes），绑定分支在其内部即生产接线
⑤ 验证: DS1-DS7 逐项 verify + 自检 6 问

引用依据:
- 铁律 0-2: spec → test → impl → wire → review → merge（先红后绿）
- 铁律 7: Done = 入口可触达（accept 匿名端点 D484 已通）+ 链路走通（个人注册→invite→accept 绑定）+ 结果可见（vitest 断言 + GraphStore userId/orgId 实证）
- 铁律 12: 集成测试 cover 真实路由不 mock 管线（复用 D484 真实 express + 真实 UserStore + native fetch 基建）
- 铁律 24/31: accept 新增分支沿用既有 try/catch + log + degraded 结构；密码验证失败 401 不消耗邀请 token
- 铁律 38: as any 零容忍
- 铁律 48: 每个测试有 expect() 真实断言，覆盖正常 + 降级 + 边界
- memory 教训: 2026-08-25-d484（同链路交付 + CI D516 strict 铁律 47 模板误触发）、2026-08-24-d483（Q2 路径紧跟 - 且禁全角括号）、2026-08-23-d480（tests/ 写入不触发 D314——RED 阶段安全）

### b) 本任务执行约束
- rule: "accept 必须查重（queryByEmail）且响应区分 linked true/false"
  verify: "grep -n queryByEmail src/routes/enterprise.ts 命中 accept 段 + grep -n linked src/routes/enterprise.ts 命中"
- rule: "updateUser props 类型必须含 orgId"
  verify: "grep -n \"'orgId'\" src/growth/user-store.ts 命中 Pick 类型行"
- rule: "绑定路径 userId 不变 + 密码不重置 + 新建路径现状回归 + 边界 403 不削弱"
  verify: "vitest run tests/routes/enterprise.test.ts 全 pass（20 用例）"

### c) 决策参考系（Q1c，dev doc §4.5 三决策点 + 实现层 2 项回填）
决策点 1 双轨并存 vs 单轨收口: 参考系第一性原理——创始人决策 + 飞书/钉钉产品参照。结论: 双轨并存，本切片补衔接。
决策点 2 绑定 vs 新建另立: 参考系 Anthropic 最小破坏——绑定保留 userId/密码连续性。结论: updateUser 更新 orgId/role。
决策点 3 已存在账号密码: 参考系第一性原理——密码延续，accept 的 password 仅用于新账号。结论: 不重置密码。
实现层决策 a（超出 dev doc 方案的偏离，§3.2 回填）: 绑定路径加 bcrypt.compare 密码验证。
① 第一性原理: 绑定 = 修改账号归属（orgId 变更 = 数据访问边界变更），匿名端点上唯一能证明"我是该 email 账号主人"的方式就是密码；invite 响应直接返回 token，若绑定不验密码，任何企业管理员可 invite 任意已注册 email 后自调 accept 完成账号劫持。
② Anthropic 基线: fail-closed——验证失败拒绝绑定，token 不消耗可重试。
③ 开源实证: 飞书/钉钉加入企业均要求登录态或身份证明；GitHub org 邀请 accept 需登录会话。
④ 收敛: 绑定需密码验证（401 拒绝 + token 保持 pending）。
实现层决策 b（超出 dev doc 方案的偏离，§3.2 回填）: 绑定路径拒绝 status 非 active 的已存在账号（ACCOUNT_DISABLED 403）——冻结/软删账号不得经邀请链接复活，与 auth login L130 语义一致。
参考：Anthropic/DeepSeek/第一性原理 + 结论：双轨并存 + 绑定（密码验证 + disabled 拒绝）+ 密码不重置。

### d) 相关 Note 引用
- [x] memory/notes/proposed/2026-08-25-d485-account-link.md（双轨衔接安全边界: 匿名绑定必须验密码——本任务决策沉淀）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/growth/user-store.ts
- src/routes/enterprise.ts
- tests/routes/enterprise.test.ts

具体: user-store.ts updateUser props 类型 Partial<Pick<UserRecord,...>> 加 orgId 字段（类型层最小扩展，updateNode 为通用 props merge 生产可持久化——SqliteGraphStore L318-334 实测无字段白名单）；enterprise.ts accept 加 store.queryByEmail(inv.email) 查重——已存在且 active → bcrypt.compare 验证密码（失败 401 AUTH_FAILED 不消耗 token）+ updateUser(existing.userId, { orgId, role }) 绑定 + 响应 linked=true（userId/密码保留）；已存在但 disabled → 403 ACCOUNT_DISABLED；不存在 → createUser 现状路径 + 响应 linked=false；测试文件保留既有 17 用例 + 新增 D485 describe 3 用例（①个人注册→同 email 邀请→accept→userId 不变+orgId 更新+linked=true+原密码可登录+错误密码 401 可重试；②新 email accept→新建+linked=false 现状回归；③未绑定个人账号调 members 403 边界不削弱）。

不做什么：
- 不修改 src/routes/auth.ts
- 不修改 src/middleware/auth.ts
- 不修改 src/middleware/rbac.ts
- 不修改 src/server.ts
- 不修改 tests/middleware/auth.test.ts
- 不修改 tests/middleware/auth.integration.test.ts
- 不修改 tests/routes/auth.test.ts
- 不做个人空间 orgId 独立化（orgId=default 语义保持，涉及存量数据搬迁另立任务，dev doc §3.3 遗留记录）
- 不改 invite/register 业务语义与白名单（D483/D484 已定）
- 不实现个人空间接企业系统（边界保持: staff+default 调企业端点被 requireAdmin 拦）
- 不碰 electron-renderer 与前端向导（本切片只出后端契约）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）: 被邀请人（个人轨已注册，持有该 email 账号密码）匿名 HTTP 请求 POST /api/enterprise/invitation/accept { token, password }（D484 已打通匿名可达）
处理（中间步骤）: jwtAuthMiddleware 白名单放行 → accept 路由 token/有效期/状态校验 → queryByEmail 查重 → 已存在: bcrypt.compare 密码验证 → updateUser 绑定 orgId/role → inv.status=accepted；不存在: createUser 现状
结果（最终展示）: 响应 data 带 linked true/false 区分绑定/新建；vitest run tests/routes/enterprise.test.ts 全 pass 20 用例（GraphStore userId/orgId/密码哈希实证 + 绑定后原密码 login payload.orgId=企业实证）；DS1-DS7 verify 全绿；CI 绿

## 接口审计（从代码 grep，非凭记忆）

- src/routes/enterprise.ts:accept（L214，D484 白名单匿名可达）——本任务加查重+绑定分支
- src/routes/enterprise.ts:requireAdmin（L78）——用例③ 403 断言依据
- src/growth/user-store.ts:queryByEmail（L119）→ UserRecord 含 userId/orgId/role/passwordHash——查重+绑定判定
- src/growth/user-store.ts:updateUser（L214）——本任务 Pick 类型加 orgId
- src/routes/auth.ts:register（L67）/login（L114）——用例①③ 复用真实端点
- src/adapters/sqlite-graph-store.ts:updateNode（L318）——通用 props merge，orgId 持久化生产实证（不改动，仅参照）
- 既有 updateUser 调用方 enterprise.ts L275/L325/L587 + anomaly-detector.ts L86——Partial 字段全可选零破坏

## 架构层: L1
src/routes/enterprise.ts 属 L1 交互层；src/growth/user-store.ts 为 L1 路由依赖的存储适配（D106 既有归属，不新增跨层依赖）。无跨层依赖变化。
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: verify: grep -c "queryByEmail" src/routes/enterprise.ts ≥ 2（register + accept 双命中）
- [ ] 绑定能力: verify: grep -n "'orgId'" src/growth/user-store.ts 命中 updateUser Pick 行
- [ ] 绑定语义: verify: grep -n "linked" src/routes/enterprise.ts 命中
- [ ] 链路走通: verify: vitest run tests/routes/enterprise.test.ts 全 pass（20 用例 = 既有 17 + 新增 3）
- [ ] 零回归: verify: vitest run tests/middleware/auth.test.ts tests/middleware/auth.integration.test.ts tests/routes/auth.test.ts 全绿 + tsc --noEmit 零新增
- [ ] 结果可见: verify: git push 后 git log origin/main..HEAD --oneline 空 + CI 绿
