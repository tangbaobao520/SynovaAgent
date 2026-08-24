<!--
  SYNOVA-IMPL-D484: register 认证闭环 切片 B——企业邀请注册链路打通（D102 邀请令牌补全）
  状态: dev doc | 2026-08-25 | 优先级 P1
  切片: AUTH-B（批次：register 认证闭环 A/B/C）
  权威文档: D481 交付报告「D102 遗留——注册 (验证邀请令牌) 未实现」; src/routes/enterprise.ts（D103 企业路由：邀请体系已实现，invite/accept/管理 5 端点）; src/middleware/auth.ts isWhitelisted（L83-99 实测无 enterprise 路径）; src/server.ts 挂载顺序（L290 jwtAuthMiddleware → L354 enterpriseRoutes）
  依赖: D483（切片 A，共享 src/middleware/auth.ts isWhitelisted——**必须串行，禁止并行**）
  并行: 写集=src/middleware/auth.ts + src/routes/enterprise.ts + tests/routes/enterprise.test.ts，与 D483（切片 A，同改 isWhitelisted）**写集重叠 → 串行依赖**；与 DSH 线（scripts/、src/sentinel/）零交集；若必须并行先 worktree 隔离
-->

# SYNOVA-IMPL-D484 register 认证闭环 切片 B——企业邀请注册链路打通

## 1. 权威文档引用

* **D481 交付报告**（K3 可核，2026-08-24）：「D102 遗留（'注册 (验证邀请令牌)'未实现）。建议另立任务：加白名单 vs 邀请令牌验证」——切片 A 做了开放注册白名单（D483），本切片 B 补**邀请令牌路径**。
* **enterprise 邀请体系**（src/routes/enterprise.ts，D103）：`POST /api/enterprise/register`（L96 企业注册）、`POST /api/enterprise/invite`（L145 admin 发邀请，7 天有效期）、`GET /api/enterprise/invitation/:token`（L199 匿名查邀请）、`POST /api/enterprise/invitation/accept`（L214 匿名接受，token+password → createUser 绑定 orgId/role）——**邀请令牌机制已完整实现**。
* **认证层现状**（src/middleware/auth.ts L83-99 + src/server.ts L290/L354）：`isWhitelisted` 无 enterprise 路径；enterpriseRoutes 挂在 jwtAuthMiddleware 之后——**匿名端点被认证层挡**。
* **切片方法论**（创始人批准）：A 匿名注册可达（开放）→ B 企业邀请注册打通（邀请制）→ C 注册后 onboarding。

## 2. 代码审计——现状（全部实测 file:line）

### 缺口 A（阻断）：enterprise 匿名端点被认证层挡，邀请链路不可达
* `src/middleware/auth.ts` L83-99 `isWhitelisted`：白名单含 `/api/auth/login`（L87）、`/api/auth/register`（L90，切片 A 加）但**无任何 `/api/enterprise/` 路径**。
* `src/server.ts` L290 `app.use(jwtAuthMiddleware)` 全局认证 → L354 `app.use(enterpriseRoutes)`——enterprise 路由全部在认证保护后。
* 后果：`POST /api/enterprise/register`（企业注册，应匿名）、`GET /api/enterprise/invitation/:token`（被邀请人查邀请，应匿名）、`POST /api/enterprise/invitation/accept`（接受邀请，应匿名）——**匿名 401**，与切片 A 修复前 register 同型。

### 缺口 B（可靠性，建议记录遗留）：邀请/企业数据全内存存储
* `src/routes/enterprise.ts` L55-58：`enterprises`/`invitations`/`imaBindings`/`gaAccessTokens` 全部 `new Map`——**进程重启即丢**：已发邀请失效、企业注册丢失。用户本体走 UserStore（GraphStore 持久化，L225），但企业/邀请元数据无持久化。

### 缺口 C（测试真空）：邀请链路零真实覆盖
* `tests/routes/enterprise.test.ts` **不存在**（grep 确认）。
* `tests/e2e/customer-flow.e2e.test.ts` L49-55：仅 `api/enterprise/register` 桩（`token = 'already-registered'` 占位）——邀请链路（register→invite→query→accept）零断言。

### 现状确认（实测）
* `src/routes/enterprise.ts` L78-83 `requireAdmin`：invite/管理端点要求 admin/manager（认证+角色），语义正确。
* invite 生成 `nextId('inv')`（L151），token 含 email/orgId/role/expiresAt（7 天），accept 校验 pending/expired（L219-222）。
* accept 以 `inv.email` 创建用户（L225-227）——**token 即凭证**（设计如此，不校验请求者身份）。

## 3. 实现方案

### 3.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/auth.ts | 修改 | isWhitelisted 加 3 个 enterprise 匿名端点：`path === '/api/enterprise/register'`、`path.startsWith('/api/enterprise/invitation/')`（覆盖 `:token` 查询 + accept 两个端点）——企业注册与邀请接受匿名可达；invite/管理端点保持认证（requireAdmin 内部再校验角色） |
| src/routes/enterprise.ts | 修改 | 仅在测试暴露 bug 时修（如 accept 后 invitations 清理、错误路径）；默认零改动 |
| tests/routes/enterprise.test.ts | 新建 | 邀请全链路 6 断言：①企业注册 200（匿名）→ orgId/admin 返回；②admin 发邀请 200（带 auth token）→ token 返回；③匿名查邀请 200 → email/orgId/role 匹配；④匿名 accept 200 → 用户创建且 orgId/role 绑定（GraphStore 查询实证）；⑤过期/已用邀请 → 400；⑥无认证发邀请 → 401/403（requireAdmin 保持） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（功能打通，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；与 D483（切片 A）共享 auth.ts——**串行，D483 合并后本切片才开工**。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如白名单用前缀匹配而非逐路径、或 accept 需补 email 校验、或测试暴露 enterprise.ts bug 需修），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* **不做 invitations 持久化**（缺口 B）——涉及 GraphStore 企业/邀请元数据模型，独立任务（本切片记录遗留，不扩写集）。
* 不改 invite/accept 的业务语义（token 即凭证设计保持；email 绑定在邀请时）。
* 不做 admin 邀请管理 UI（前端另排）。
* 不碰 DSH 线（scripts/、src/sentinel/）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 集成 tests/routes/enterprise.test.ts（新建） | 6 | ①企业注册匿名 200（red=现状 401 → green=可达）；②admin 发邀请（带 token）200；③匿名查邀请 200；④匿名 accept 200 + 用户绑定 orgId/role；⑤过期/已用 400；⑥无认证发邀请 401/403 |

**RED 必须覆盖失败模式（S-5）**：用例①/③/④以**匿名**请求断言 200——修复前 401（认证层拦截，实测推断同 D483 模式）；用例②/⑥验证 requireAdmin 保护不削弱（有 token 200 / 无 token 401）。

## 4.5 决策参考（S-12）
* 决策点 1：邀请令牌从零实现 vs 打通现有 enterprise 体系？
  * 参考系：第一性原理——enterprise.ts 的 invite/accept 已完整实现（token 生成/有效期/状态/绑定 orgId/role），重建是浪费；真正缺口是匿名可达性（被认证层挡）+ 测试真空。
  * 结论：打通现有体系（白名单 + 全链路测试），不重建。
* 决策点 2：invitations 内存持久化是否本次做？
  * 参考系：Anthropic——垂直切片聚焦（本次=链路可达 + 可验证）；持久化涉及存储层新模型，混入会扩写集、拖长验收。
  * 结论：本次不做，缺口 B 显式记录遗留（另立任务）。
* 决策点 3：accept 是否补 email 匹配校验？
  * 参考系：第一性原理——token 即凭证（邀请链接语义，类似 Slack/Notion 邀请），email 绑定在邀请时已确定；补请求者 email 匹配会破坏"链接直达注册"体验。
  * 结论：保持现状，安全观察记录（若产品要求防冒用，另立任务）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| isWhitelisted 新增 enterprise 匿名分支 | jwtAuthMiddleware（src/middleware/auth.ts）→ server.ts L290 全局挂载 | `grep -rn "api/enterprise" src/middleware/auth.ts` 命中（isWhitelisted 内） |

> 生产调用点（S-3）：jwtAuthMiddleware 是 server.ts 生产挂载认证中间件；enterprise 匿名分支在其内部生效；invite/管理端点的 requireAdmin 保护不受影响。

## 6. 完成标准

* **DS1 白名单接线**：`grep -n "api/enterprise" src/middleware/auth.ts` 命中（isWhitelisted 内，含 register + invitation/ 前缀）。
* **DS2 测试全绿**：`vitest run tests/routes/enterprise.test.ts` 全 pass（6 用例；red 先行 401 → green 200）。
* **DS3 链路实证**：测试中匿名 register→invite→query→accept 全链路真实走通（GraphStore 查询断言用户 orgId/role 绑定）。
* **DS4 零回归**：`vitest run tests/middleware/auth.test.ts tests/middleware/auth.integration.test.ts tests/routes/auth.test.ts` 全绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（3 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（匿名 401 → 200；requireAdmin 保护不削弱）
* [ ] 接线要求真实（isWhitelisted → jwtAuthMiddleware → server.ts 生产挂载）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：功能打通，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 白名单接线 | grep -n "api/enterprise" src/middleware/auth.ts | 命中 |
| DS2 测试全绿 | vitest run tests/routes/enterprise.test.ts | 全 pass |
| DS3 链路实证 | vitest run tests/routes/enterprise.test.ts（accept 用例断言 GraphStore 用户） | 绑定 orgId/role |
| DS4 零回归 | vitest run tests/middleware/* + tests/routes/auth.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**切片 B 依赖切片 A（D483 合并后开工）**——共享 src/middleware/auth.ts isWhitelisted，禁止与 D483 并行；**只打通不重建**（enterprise 邀请体系已实现，本切片补匿名可达 + 全链路测试）；invitations 内存持久化显式 descope（缺口 B 遗留另立任务）；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
