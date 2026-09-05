<!--
  SYNOVA-IMPL-D485: register 认证闭环 切片 C——双轨账号关联（个人账号绑定企业，飞书/钉钉模式）
  状态: dev doc | 2026-08-25 | 优先级 P1
  切片: AUTH-C（批次：register 认证闭环 A/B/C）
  权威文档: 创始人决策（2026-08-25）——双轨并存：个人开放注册（auth/register，个人空间：自己聊天/喂资料，不接企业系统）+ 企业邀请制（enterprise/register+invite+accept，接 CRM/ERP/OA/财务）；个人账号被邀请可加入企业（对齐飞书/钉钉）；src/routes/enterprise.ts accept（D484 打通）; src/growth/user-store.ts（queryByEmail L119 / updateUser L214）; D338 多租户隔离
  依赖: D483（切片 A 个人注册可达）+ D484（切片 B 企业邀请链路）——**必须串行，禁止并行**（共享 auth/enterprise 链路）
  并行: 写集=src/routes/enterprise.ts + src/growth/user-store.ts + tests/routes/enterprise.test.ts，与 D483/D484（已完成）+ DSH 线（scripts/、src/sentinel/）**零交集**；若必须并行先 worktree 隔离
  借鉴: 无 DSH 迁移直接借鉴项（账号关联为自有业务；飞书/钉钉邀请绑定模式为产品参照非代码借鉴）
-->

# SYNOVA-IMPL-D485 register 认证闭环 切片 C——双轨账号关联

## 1. 权威文档引用

* **创始人决策（2026-08-25）**：双轨并存——①个人开放注册（auth/register）：个人空间，只能自己聊天/自己喂资料，**不能接入企业 CRM/ERP/OA/财务系统**（用户自己电脑，数据隔离）；②企业邀请制（enterprise/register + invite + accept）：接企业系统。个人账号被邀请可加入企业（飞书/钉钉模式）。
* **accept 现状**（src/routes/enterprise.ts L214-228，D484 打通）：token+password → `createUser(inv.email, password, role, orgId)`——**不查重**，个人已注册 email 被邀请会新建重复账号（双轨衔接断点）。
* **UserStore 能力**（src/growth/user-store.ts）：`queryByEmail`（L119）可查重；`updateUser`（L214）可更新 role/status/displayName 等——**props 类型不含 orgId**（需扩展）。
* **边界现状**（实测）：个人账号 role=staff + orgId='default'，调企业端点被 `requireAdmin`（enterprise.ts L78-83，需 admin/manager）拦截——个人轨"不接企业系统"基本成立；企业数据按 orgId 隔离（D338）。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：accept 不查重，个人账号被邀请 → 新建重复账号
* `src/routes/enterprise.ts` L224-227：accept 直接 `createUser(inv.email, password, ...)`——**无 queryByEmail 查重**。个人轨已注册的 email（auth/register 创建，orgId='default'）被企业邀请后，accept 会**新建同 email 账号**（或 GraphStore 唯一性冲突）——个人账号无法"加入"企业（userId 断裂，个人数据/密码不延续）。
* 对照 auth/register（src/routes/auth.ts L87-89）与企业注册（enterprise.ts L108-110）：均做三标识符去重——**accept 是唯一不查重的创建路径**（D102 邀请令牌语义应绑已有账号）。

### 缺陷 B：UserStore.updateUser 无法更新 orgId（绑定缺能力）
* `src/growth/user-store.ts` L214-216：`updateUser(userId, props: Partial<Pick<UserRecord, 'role' | 'status' | 'displayName' | 'department'>>)`（实测 L214 仅 4 个字段，无 phone/wechatId/orgId）——**不含 orgId**；绑定个人账号到企业需要更新 orgId，当前不可行。

### 现状确认（实测）
* 个人轨：auth/register 创建 orgId='default'、role='staff'（L79-80）；调企业端点（members/ima/ga-access 等）被 requireAdmin 拦（staff 非 admin/manager）。
* 企业轨：D484 已打通 invite/accept；企业数据按 orgId 存（enterprise.ts Map + UserStore USER_GRAPH）。
* 双轨数据隔离：个人数据在 orgId='default'，企业数据在企业 orgId（D338 隔离语义）——**绑定后个人账号 orgId 更新为企业，即获得企业身份**。

### 无重复造轮子审计（S-14，2026-08-25 实测）
* 账号绑定能力：全仓无"按 email 绑定已有用户到组织"的实现（grep updateUser/orgId 组合零命中）——本切片为新增衔接，非重复。
* 邀请/注册端点：invite/accept 唯一（enterprise.ts，D484 已确认）；auth/register 唯一（auth.ts）——无已存在替代。
* DSH 迁移施工图：账号/认证领域零命中（自有业务线）；飞书/钉钉邀请绑定为产品参照非代码借鉴。

## 3. 实现方案

### 3.1 写集 (3 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/growth/user-store.ts | 修改 | `updateUser` props 类型扩展含 `'orgId'`（Partial<Pick<UserRecord, 'role' | 'status' | 'displayName' | 'department' | 'orgId'>>）——绑定个人账号到企业需更新 orgId |
| src/routes/enterprise.ts | 修改 | accept 逻辑：`queryByEmail(inv.email)` 查重——已存在 → `updateUser(existing.userId, { orgId: inv.orgId, role: inv.role })`（**绑定**：userId/密码保留，inv.status='accepted'，响应带 userId=existing.userId + `linked: true`）；不存在 → createUser（现状，响应 `linked: false`）；password 对已存在账号**不重置**（个人账号密码延续） |
| tests/routes/enterprise.test.ts | 修改 | 新增 3 用例：①个人注册（auth/register）→ 同 email 被邀请 → accept → **userId 不变 + orgId 更新为企业 + linked=true**；②新 email accept → 新建 + linked=false（现状回归）；③个人账号（未绑定）调企业 members 端点 → 403（边界不削弱） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（功能衔接，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；与 D483/D484（已完成）无并行冲突。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如绑定改为新建账号再迁移数据、或 accept 需校验邀请 email 与请求者一致、或 updateUser 实现需加 orgId 校验），必须在本节同 commit 回填最终形态（S-6）。

**实现回填（2026-08-25，同 commit）**——绑定主路径与 §3.1 方案一致（queryByEmail 查重 → updateUser({ orgId, role }) → linked=true；新建 → linked=false；密码不重置）。两项实现层安全增强偏离，均超出 §3.1 字面方案：

1. **绑定路径加 bcrypt.compare 密码验证**（src/routes/enterprise.ts accept 绑定分支）：验证失败 → 401 `AUTH_FAILED` + **邀请 token 不消耗**（inv.status 保持 pending，可重试）。
   * 威胁模型（§3.1 方案未覆盖）：invite 不验证 email 归属（管理员可 invite 任意 email）且响应直接返回 token；accept 是匿名端点。若绑定不验密码，恶意企业管理员可 invite 任意已注册 email 后自调 accept，把受害者个人账号 orgId/role 划进自己企业（数据访问边界迁移 = 账号劫持）。绑定 = 修改账号归属，匿名上下文唯一的所有权证明是密码。
   * 参考：Anthropic（fail-closed：验证失败拒绝 + token 不消耗）/ 第一性原理（归属变更需所有权证明）/ 开源实证（飞书/钉钉加入企业需登录态；GitHub org 邀请 accept 需登录会话）→ 收敛。
   * 决策沉淀：memory/notes/proposed/2026-08-25-d485-account-link.md。
2. **绑定路径拒绝非 active 账号**：queryByEmail 命中且 status !== 'active' → 403 `ACCOUNT_DISABLED`（冻结/软删账号不得经邀请链接复活，与 auth login 同语义）。

测试相应增强：用例①含「错误密码 401 + 邀请仍 pending（GET 200）」子断言（用例总数不变，仍 3 个）。

### 3.3 不做的事
* **不重构个人空间 orgId**（个人账号 orgId='default' 语义保持——个人数据空间；企业独立 orgId 隔离，D338 已立）。个人空间标识独立化（如 personal-<userId>）记录为遗留（涉及数据迁移，另立任务）。
* 不改 auth/register 个人轨（双轨并存，创始人决策）。
* 不碰前端/Mac（electron-renderer、app/admin.html 向导——D246 已有，本切片只出后端契约）。
* 不实现个人空间接企业系统（边界保持：staff+default 调企业端点被 requireAdmin 拦）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 集成 tests/routes/enterprise.test.ts（新增 3 用例 + 既有 17 回归） | +3 | ①个人注册→邀请→accept 绑定（userId 不变 + orgId 更新 + linked=true）；②新 email accept 新建（linked=false 现状回归）；③个人账号调企业端点 403（边界不削弱） |

**RED 必须覆盖失败模式（S-5）**：用例①以现状断言——个人注册（orgId='default'）→ accept → **当前会新建重复账号（userId ≠ 个人 userId）**（red=绑定断裂）→ 修复后 userId 不变 + orgId 更新（green=绑定成功）。用例③以现状断言个人账号调 members 403（边界已成立，回归不削弱）。

## 4.5 决策参考（S-12）
* 决策点 1：双轨并存 vs 单轨（邀请制收口）？
  * 参考系：第一性原理——创始人决策 + 飞书/钉钉产品参照：个人开放注册（体验/个人助手）+ 企业邀请制（组织 onboarding）并存，账号可被邀请加入企业（绑定而非重建）。
  * 结论：双轨并存（auth/register 保留 + 邀请制）；本切片补双轨衔接（绑定）。
* 决策点 2：绑定（保留 userId/密码）vs 新建账号迁移？
  * 参考系：Anthropic——最小破坏：绑定保留个人数据/密码连续性（飞书模式：手机号注册的账号加入企业后仍是同一账号）；新建迁移会断链且数据迁移复杂。
  * 结论：绑定（updateUser 更新 orgId/role，userId 不变）。
* 决策点 3：已存在账号的 password 处理？
  * 参考系：第一性原理——个人账号密码延续，accept 的 password 仅用于**新账号**创建；已存在账号不接受新密码（避免被邀请链接改密）。
  * 结论：已存在账号不重置密码。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| updateUser 支持 orgId | accept（src/routes/enterprise.ts）绑定路径 | `grep -rn "updateUser" src/routes/enterprise.ts` 命中（绑定分支） |
| queryByEmail 查重 | accept（src/routes/enterprise.ts）绑定判定 | `grep -rn "queryByEmail" src/routes/enterprise.ts` 命中 |

> 生产调用点（S-3）：accept 是企业邀请注册的生产入口（D484 打通）；绑定/新建分支在其内部；测试调用不计入。

## 6. 完成标准

* **DS1 绑定能力**：`grep -rn "queryByEmail" src/routes/enterprise.ts` 命中（accept 查重）+ `grep -n "'orgId'" src/growth/user-store.ts` 命中（updateUser props 类型含 orgId——单引号精确匹配 Pick 类型，排除 createUser 参数 L79 的 orgId）。
* **DS2 绑定语义**：`grep -n "linked" src/routes/enterprise.ts` 命中（响应区分 linked true/false）。
* **DS3 测试全绿**：`vitest run tests/routes/enterprise.test.ts` 全 pass（20 用例 = 既有 17 + 新增 3；red 先行已证）。
* **DS4 零回归**：`vitest run tests/middleware/auth.test.ts tests/middleware/auth.integration.test.ts tests/routes/auth.test.ts` 全绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（3 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（个人账号绑定断裂 → 绑定成功；边界 403 不削弱）
* [ ] 接线要求真实（queryByEmail/updateUser → accept 生产入口）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：功能衔接，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 绑定能力 | grep -rn "queryByEmail" src/routes/enterprise.ts + grep -n "'orgId'" src/growth/user-store.ts | 双命中 |
| DS2 绑定语义 | grep -n "linked" src/routes/enterprise.ts | 命中 |
| DS3 测试全绿 | vitest run tests/routes/enterprise.test.ts | 20/20 pass |
| DS4 零回归 | vitest run tests/middleware/* + tests/routes/auth.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**切片 C 依赖切片 A/B（D483/D484 已合并）**——共享 auth/enterprise 链路，禁止与未完成的同链路任务并行；**双轨并存语义**：auth/register 个人轨保留、accept 支持绑定已有账号（userId 不变、密码不重置、orgId 更新为企业）；个人空间 orgId 独立化记录遗留（另立任务，涉及数据迁移）；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
