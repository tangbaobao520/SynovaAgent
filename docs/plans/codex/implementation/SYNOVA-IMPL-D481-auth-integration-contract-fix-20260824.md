<!--
  SYNOVA-IMPL-D481: auth.integration.test.ts 契约对齐修复（D479 审计遗留）
  状态: dev doc | 2026-08-24 | 优先级 P2
  权威文档: D479 交付报告（K3 可核）「诚实上报 #1：auth.integration.test.ts 在 main 基线即 7 failed——login 路由已重写为 email/phone/wechatId + password bcrypt 契约（auth.ts:118），该测试仍发旧格式 {userId, role, orgId} → 确定性 400 → 级联 401。建议另立任务修复」; src/routes/auth.ts（D102 bcrypt 登录+注册契约）; AGENTS.md 铁律 12（集成测试 cover 真实路由，不 mock 管线）+ 铁律 47（契约优先）
  依赖: D479（auth legacy orgId 收敛已合并——本任务收其审计遗留）
  并行: 写集=tests/middleware/auth.integration.test.ts，与 D482（src/tools/org-expert-tools.ts + tests/tools/org-expert-tools.test.ts）**文件级零交集**，可 worktree 隔离并行；与 DSH 线（scripts/、src/sentinel/）零重叠；若必须并行先 worktree 隔离
-->

# SYNOVA-IMPL-D481 auth.integration.test.ts 契约对齐修复

## 1. 权威文档引用

* **D479 交付报告**（K3 可核，2026-08-23）：「诚实上报 #1——auth.integration.test.ts 在 main 基线就是 7 failed：login 路由已重写为 email/phone/wechatId + password bcrypt 契约（auth.ts:118），该测试仍发旧格式 {userId, role, orgId} → 确定性 400 → 级联 401。**建议另立任务修复该测试**（不在我的写集内，不越界）」。
* **login 路由契约**（src/routes/auth.ts L114-118）：`POST /api/auth/login` 要求 `email/phone/wechatId`（至少一个）+ `password`，缺失 → 400 VALIDATION_ERROR；账户不存在/密码错 → 401 AUTH_FAILED；停用 → 403 ACCOUNT_DISABLED。
* **register 路由契约**（src/routes/auth.ts L68-101）：`POST /api/auth/register` 要求 `email/phone/wechatId` + `password(≥6)`，可选 role/orgId；成功 → 201 `{ ok, token, payload: { userId, role, orgId } }`。
* **铁律 12**（AGENTS.md）：集成测试 cover 真实路由，不 mock 管线——本任务保持测试走真实 express 挂载。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：integration 测试全部 login 请求体用旧契约（无 email/password）——共 6 处
* `tests/middleware/auth.integration.test.ts` 旧格式 login 请求体共 **6 处**（实测 Select-String 全列）：
  * L73：login 200 用例 `body: JSON.stringify({ userId: 'ga_001', role: 'ga', orgId: 'acme-corp' })`；
  * L89：validate 用例 `{ userId: 'val_user', role: 'manager', orgId: 'test' }`；
  * L114：`loginAs(role, userId)` helper `{ userId, role, orgId: 'acme-corp' }`（GA 读 L121 / GA 删 L132 / Admin 删 L143 三个用例共用）；
  * L203：refresh 用例 `{ userId: 'refresh_user', role: 'admin', orgId: 'test' }`；
  * L227：revoke 用例 `{ userId: 'revoke_me', role: 'ga', orgId: 'test' }`；
  * L235：revoke 用例的 adminLogin `{ userId: 'owner', role: 'admin', orgId: 'test' }`。
* 路由契约（src/routes/auth.ts L116-118）：`const { email, phone, wechatId, password } = req.body`；`if (!loginKey || !password) return 400`——旧格式请求 → `loginKey=undefined` → 400 → 测试断言 200/401/403 全部落空。

### 缺陷 B：测试未先注册用户（即使请求体改对也 401）
* login 路由（src/routes/auth.ts L121-129）：先查用户 store（getUserStore）→ 找不到 → 401 AUTH_FAILED。测试直接 login 无用户前置——必须经 `POST /api/auth/register` 建号（L68-101 已实现）。

### 现状基线（实测，2026-08-24 复核亲跑）
* `vitest run tests/middleware/auth.integration.test.ts` = **7 failed / 3 passed（10 用例）**——依赖 login 的 7 个用例全失败（login 200 / validate / GA 读 / GA 删 / Admin 删 / refresh / revoke），无 token/无效 token/过期 token 3 个失败模式用例 pass。
* `tests/middleware/auth.test.ts`（unit）23/23 绿（D479 报告）——unit 已对齐新契约，仅 integration 未跟上。

## 3. 实现方案

### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| tests/middleware/auth.integration.test.ts | 修改 | ① 新增 `registerAndLogin(role, tag)` helper：POST /api/auth/register（唯一 email=`${tag}-${Date.now()}@test.local` + password + role + orgId）→ 201 → POST /api/auth/login（{email, password}）→ 200 → 返回 {token, userId: regBody.payload.userId}；② **全部 6 处旧格式 login 体改走 helper**（login 200 / validate / GA 读 / GA 删 / Admin 删 / refresh / revoke 用例），断言 userId 取自注册响应（不硬编码）；③ 保留无 token/无效 token/过期 token 3 个失败模式用例原样 |

> 共享资源标注（S-8）：本写集不含 VERSION.md（测试契约对齐，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；tests/middleware/ 与 D482 的 tests/tools/ 不同目录，零交集。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如 login 响应断言改用登录返回的 payload.userId、或注册 email 生成策略不同、或发现更多旧契约用例），必须在本节同 commit 回填最终形态（S-6）。

**回填（2026-08-24 实现时，全部探针实测）**：
1. **register 请求须携带 bootstrap token（方案偏离主项）**：§3.1 方案假设 helper 匿名 POST register → 201。实测（探针脚本，挂载与 server.ts L290-293 同构）：`/api/auth/register` **不在 jwtAuthMiddleware 白名单**（src/middleware/auth.ts L83-99 仅 `/api/auth/login` 在列）→ 匿名 register = 401 UNAUTHORIZED；带真实 `signJwtToken` 签发 token = 201。最终形态：helper 内 `signJwtToken({ sub: 'test-bootstrap', role: 'admin', orgId: 'acme-corp' })` 签发 bootstrap token 供 register 请求过认证层，中间件真实验证该 token，注册路由逻辑（校验/bcrypt 哈希/去重/token 签发）100% 真实执行（铁律 12 保持）。login 在白名单，无需 token。
2. **诚实上报（D102 遗留缺口，不越界修）**：生产环境 `POST /api/auth/register` 在当前白名单下**不可匿名到达**（需已认证身份）。本任务写集仅测试，未改 src/middleware/auth.ts。建议另立任务决策：register 加入白名单 vs 邀请令牌验证（routes/auth.ts L5 注释"注册 (验证邀请令牌)"尚未实现）。
3. **login 200 用例断言形态增强**：断言从 login 响应 payload 改为 JWT 三段结构 + base64url 解码 payload 段断言 `sub=注册 userId / role / orgId`（用例意图"login 返回合法 JWT 且内容正确"不变，证据更强）。
4. **测试环境 store 形态（实测确认）**：getDatabase() 未初始化 → getUserStore() 降级内存 Map（log.warn 降级路径，铁律 11 合规），register 响应 userId 形如 `usr-1`（内存分支 src/routes/auth.ts L93），零 SQLite 副作用。
5. **顺手清理**：删除存量 unused import `canAccessWorkspace`（原 L18，grep 确认零使用，oxlint error，铁律 37 dead code）。
6. email 生成策略与方案一致：`${tag}-${Date.now()}@test.local`，8 个调用点 tag 各异（login200/validate/ga-reader/ga-deleter/admin-deleter/refresh/revoke-ga/revoke-admin），vitest 文件内串行 + bcrypt 往返 >1ms 保证唯一；连跑 3 次 10/10 无 flake。

### 3.3 不做的事
* 不改 src/routes/auth.ts / src/middleware/auth.ts——bcrypt 契约正确（D102/D479 已定），本任务只对齐测试。
* 不改 tests/middleware/auth.test.ts（unit 已 23/23 绿）。
* 不碰 rbac 中间件与 workspace 路由（非本任务范围）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 集成 tests/middleware/auth.integration.test.ts（修改既有 10 用例） | 10 | ①注册+登录+validate 正常链路；②GA 读工作区 200 / GA 删 403 / Admin 删 200 + refresh/revoke 角色边界；③失败模式：无 token/无效 token/过期 token → 401 |

**RED 必须覆盖失败模式（S-5）**：修复前 `vitest run tests/middleware/auth.integration.test.ts` = **7 failed / 3 passed（2026-08-24 亲跑实测）**——旧契约 400 级联；修复后 10/10 绿。

## 4.5 决策参考（S-12）
* 决策点 1：对齐测试到新契约 vs 回退路由到旧契约？
  * 参考系：第一性原理——email/phone/wechatId + password bcrypt 是 D102/D479 确立的安全契约（组织真实标识登录），测试应跟随实现；回退契约是产品倒退。
  * 结论：改测试。
* 决策点 2：loginAs 每次注册（隔离）vs 共享 fixture？
  * 参考系：Anthropic——测试隔离，用例间零状态耦合；每次注册唯一 email 防 store 分支 DUPLICATE（registerUs 存在时 409）。
  * 结论：registerAndLogin 独立注册 + 唯一 email（Date.now 后缀）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| registerAndLogin helper | 测试内 login/validate/GA/Admin/refresh/revoke 各用例 | `grep -n "registerAndLogin" tests/middleware/auth.integration.test.ts` 命中 ≥6 处 |

> 本任务无新生产 export（纯测试修复）；集成测试真实挂载 authRoutes（铁律 12，不 mock 管线）。

## 6. 完成标准

* **DS1 契约对齐**：`grep -n "body: JSON.stringify({ userId" tests/middleware/auth.integration.test.ts` 零命中（旧格式 login 请求体 6 处全清除）。
* **DS2 注册前置**：`grep -n "api/auth/register" tests/middleware/auth.integration.test.ts` 命中（helper 内）。
* **DS3 测试全绿**：`vitest run tests/middleware/auth.integration.test.ts` 10/10 pass（red 先行 7 failed 已证）。
* **DS4 零回归**：`vitest run tests/middleware/auth.test.ts tests/routes/auth.test.ts` 全绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（仅测试文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（auth 相关）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（旧契约 7 failed → 新契约 10/10）
* [ ] 接线要求真实（registerAndLogin 被 ≥6 用例调用）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：测试修复，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 契约对齐 | grep -n "body: JSON.stringify({ userId" tests/middleware/auth.integration.test.ts | 零命中 |
| DS2 注册前置 | grep -n "api/auth/register" tests/middleware/auth.integration.test.ts | 命中 |
| DS3 测试全绿 | vitest run tests/middleware/auth.integration.test.ts | 10/10 pass |
| DS4 零回归 | vitest run tests/middleware/auth.test.ts tests/routes/auth.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：与 D482 **可并行**（写集零交集：tests/middleware/ vs src/tools/+tests/tools/），必须 worktree 隔离；**只改测试不改 auth.ts 契约**；注册 email 必须唯一（防 DUPLICATE 409）；暂存前查 session-registry（S-9）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
