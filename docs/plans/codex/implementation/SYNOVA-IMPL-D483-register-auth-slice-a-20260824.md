<!--
  SYNOVA-IMPL-D483: register 认证闭环 切片 A——匿名注册可达（D481 产品发现收尾）
  状态: dev doc | 2026-08-24 | 优先级 P1
  切片: AUTH-A（批次：register 认证闭环 A/B/C）
  权威文档: D481 交付报告「重要产品发现——/api/auth/register 不在 jwtAuthMiddleware 白名单，匿名注册 401（D102 遗留）」; src/middleware/auth.ts isWhitelisted（L83-99 实测仅 login 在列）; src/routes/auth.ts register 契约（L68-101 bcrypt+去重）; AGENTS.md 铁律 12（集成测试 cover 真实路由）
  依赖: D481（auth.integration 契约对齐已合并——本切片收其产品发现）
  并行: 写集=src/middleware/auth.ts + tests/middleware/auth.test.ts + tests/middleware/auth.integration.test.ts，与 D484（切片 B 邀请令牌，串行依赖本切片）+ DSH 线（scripts/、src/sentinel/）**零交集**；若必须并行先 worktree 隔离
-->

# SYNOVA-IMPL-D483 register 认证闭环 切片 A——匿名注册可达

## 1. 权威文档引用

* **D481 交付报告**（K3 可核，2026-08-24）：「重要产品发现——`/api/auth/register` 不在 jwtAuthMiddleware 白名单（src/middleware/auth.ts L83-99 仅 `/api/auth/login` 在列）——探针实测生产同构挂载下匿名注册 401。D102 遗留（'注册 (验证邀请令牌)'未实现）。建议另立任务：加白名单 vs 邀请令牌验证」。
* **isWhitelisted 契约**（src/middleware/auth.ts L83-99）：JWT 中间件放行路径白名单——`/health`、`/`、`/api/auth/login`、`/api/status`、静态资源等；注释「与 server.ts 的白名单同步」；server.ts L290 `app.use(jwtAuthMiddleware)` 全局挂载（白名单唯一来源是 auth.ts）。
* **register 路由契约**（src/routes/auth.ts L68-101）：`POST /api/auth/register` 要求 `email/phone/wechatId` + `password(≥6)`，可选 role/orgId；成功 201 `{ ok, token, payload: { userId, role, orgId } }`——**路由逻辑已完整实现，仅被认证层挡住**。
* **切片方法论**（创始人批准，MAC-DSH 派单-L1切片A-D517-D519-20260824.md 同型）：长任务按用户可见价值切 A/B/C，本批次 = register 认证闭环：A 匿名注册可达 → B 邀请令牌（D102 注释方向，产品决策后做）→ C 注册后 onboarding。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：register 不在认证白名单，匿名注册 401
* `src/middleware/auth.ts` L83-99 `isWhitelisted`：白名单含 `/api/auth/login`（L88）但**无 `/api/auth/register`**——匿名 POST register 被 jwtAuthMiddleware 拦 401（D481 探针实测）。
* `src/server.ts` L290 `app.use(jwtAuthMiddleware)`：全局挂载，白名单判定唯一来源是 auth.ts（server.ts 无独立白名单）。
* `src/routes/auth.ts` L68-101 register 路由：校验/bcrypt/去重/token 签发全部实现——**逻辑完整，仅认证层挡住**。

### 缺陷 B：D481 集成测试用 bootstrap token 绕过（掩盖缺口）
* `tests/middleware/auth.integration.test.ts`：D481 交付的 `registerAndLogin` helper 用 `signJwtToken({ sub: 'test-bootstrap', ... })` 签发 bootstrap token 过认证层（6 处 bootstrap/signJwtToken）——注册逻辑真实执行但"匿名注册 401"被绕过，**白名单缺口在测试层不可见**。

### 现状（实测）
* `tests/middleware/auth.test.ts` L217/L227：白名单单元用例仅覆盖 `/health`、`/api/auth/login`——无 register。
* `tests/middleware/auth.integration.test.ts`：10 用例全绿（D481 交付，含 bootstrap 绕过）。

## 3. 实现方案

### 3.1 写集 (3 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/auth.ts | 修改 | isWhitelisted L88 后加 `path === '/api/auth/register'`（与 login 并列）——注册入口匿名可达；注释同步（"白名单含 login/register，注册走邀请令牌后收紧"留待切片 B） |
| tests/middleware/auth.test.ts | 修改 | 白名单 describe 加 1 用例：`whitelisted path /api/auth/register → pass through`（red=现状 401/拦截 → green=放行） |
| tests/middleware/auth.integration.test.ts | 修改 | registerAndLogin helper：移除 bootstrap token 绕过（6 处）→ 直接匿名 POST register 断言 201；保留 login（本就白名单）→ 返回 {token, userId}；断言注册响应 payload 结构不变 |

> 共享资源标注（S-8）：本写集不含 VERSION.md（功能修复，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；tests/middleware/ 与 D484（切片 B，串行）不同时跑。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如白名单改在 server.ts 路由级而非 isWhitelisted、或测试断言响应结构变化），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* 不做邀请令牌验证（D102 注释方向）——产品决策未定，留切片 B（本切片只打通可达性，不设计安全增强）。
* 不改 register 业务逻辑（bcrypt 哈希/去重/orgId 回落契约，D479 已收敛，零改动）。
* 不改 src/routes/auth.ts login 契约。
* 不碰 DSH 线（scripts/、src/sentinel/）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 单元 tests/middleware/auth.test.ts（白名单 describe 新增） | +1 | register 路径 pass through（red=现状无此用例/行为 401 → green=放行） |
| L2 | 集成 tests/middleware/auth.integration.test.ts（修改 10 用例） | 10 | ①匿名 register 201（red=现状 bootstrap 绕过 → green=匿名直连）；②login+validate 全链路；③GA/Admin 角色边界；④失败模式（无/无效/过期 token → 401） |

**RED 必须覆盖失败模式（S-5）**：用例①以**匿名** POST register（无 Authorization 头）断言 201——修复前 401（D481 探针实测），修复后 201；这同时把"白名单缺口"从测试层暴露出来（不再被 bootstrap 掩盖）。

## 4.5 决策参考（S-12）
* 决策点 1：加白名单 vs 邀请令牌验证？
  * 参考系：第一性原理——register 路由已完整实现，仅认证层挡住；"注册可达"是多租户 onboarding 的底座（GS 场景入口），邀请令牌是**安全增强**（防开放注册滥用），两者不冲突：先可达（本切片），后收紧（切片 B）。
  * 结论：本切片加白名单（最小可达）；邀请令牌启用与否 = 产品决策，留切片 B 单独定。
* 决策点 2：测试是否保留 bootstrap 绕过？
  * 参考系：Anthropic——测试必须反映真实用户路径（匿名注册是真实入口）；bootstrap 绕过掩盖了生产缺陷（D481 就是被它掩盖才没在测试层发现）。
  * 结论：移除绕过，匿名直连（red 先行证 401 → 201）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| isWhitelisted 新增 register 分支 | jwtAuthMiddleware（src/middleware/auth.ts）→ server.ts L290 全局挂载 | `grep -rn "api/auth/register" src/middleware/auth.ts` 命中（isWhitelisted 内） |

> 生产调用点（S-3）：jwtAuthMiddleware 是 server.ts 生产挂载的认证中间件；register 白名单分支在其内部生效；测试调用不计入。

## 6. 完成标准

* **DS1 白名单接线**：`grep -n "api/auth/register" src/middleware/auth.ts` 命中（isWhitelisted 内，与 login 并列）。
* **DS2 单元用例**：`vitest run tests/middleware/auth.test.ts` 全绿（含新增 register 白名单用例）。
* **DS3 匿名注册可达**：`vitest run tests/middleware/auth.integration.test.ts` 10/10 绿（匿名 register 201，无 bootstrap 绕过——`grep -c "signJwtToken" tests/middleware/auth.integration.test.ts` 归零或仅保留过期 token 构造所需）。
* **DS4 零回归**：`vitest run tests/routes/auth.test.ts` 绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（3 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（匿名 register 401 → 201，不再 bootstrap 掩盖）
* [ ] 接线要求真实（isWhitelisted → jwtAuthMiddleware → server.ts 生产挂载）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：功能修复，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 白名单接线 | grep -n "api/auth/register" src/middleware/auth.ts | 命中 |
| DS2 单元用例 | vitest run tests/middleware/auth.test.ts | 全绿 |
| DS3 匿名注册可达 | vitest run tests/middleware/auth.integration.test.ts | 10/10 绿 |
| DS4 零回归 | vitest run tests/routes/auth.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**切片 A 先行**（register 匿名可达），切片 B（邀请令牌）串行依赖本切片，**禁止与切片 B 并行**；**移除 bootstrap 绕过是本切片核心语义**（不再掩盖白名单缺口）；只改 3 文件不扩写集；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
