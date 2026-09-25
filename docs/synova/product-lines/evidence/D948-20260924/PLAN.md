# D948 PLAN — 身份链补全：部门可见性恢复（第 0 阶段，待 CTO 复核放行）

> 出件：**synova-squad-lead**（队长，不下场写码）｜ 2026-09-24
> 载体：分支 `docs/d948-plan`（base `origin/main` tip `11458279`），本文件 + `task-state/D948.json`
> 规格：`docs/synova/dispatch/D948-win-identity-chain-department-20260924.md` @ `origin/docs/d948-identity-chain-dispatch` tip `df9dc5ed`
> **状态：PLAN 未经 CTO 复核放行，未写任何产品代码 / 产品测试代码。**
> 本文件所有数字来自命令原始输出；口径与截至时刻见各段。**执行方不判"通过"**——本件只给自验结论 / 可提请独立审计 / 退回。

---

## §0 小队与运行记录（回执第 3 项预置）

| 角色 | 成员 | 本阶段产出（唯一写入文件） | 共享任务 | 状态 |
|---|---|---|---|---|
| 队长 | `lead` | `PLAN.md` + `task-state/D948.json` | task-4 | in_progress → 本件 |
| 编码 A | `code-a` | `A-recon.md`（437 行） | task-1 | **completed** |
| 编码 B | `code-b` | `B-recon.md`（392 行） | task-2 | **completed** |
| 独立自验 | `verifier-tv` | `T-V-premise-2nd.md`（337 行） | task-3 | **completed** |
| 独立复核 | `reviewer` | `REVIEW-PLAN.md` | task-5 | blocked_by task-4（本件完成后开工） |

**⚠️ 编制上限冲突（须 CTO 裁）**：本卡派单 §七要求「队长 + 2 编码 + 1 自验 + 1 复核」= **5 人**；队长预设上限为「成员 ≤4（队长 + ≤2 编码 + 1 自验），不组第 5 人」。派单件第 7 行自我声明「凡本件与任何旧基线冲突，以本件为准」⇒ 本阶段**按派单执行 5 人**，并在此显式登记冲突，请 CTO 裁定后续是否并轨。

**本阶段成员"运行"的物理证明**：四份成员产出（A/B/T-V/REVIEW）均由对应成员写入并 commit（见 §10 文件清单与 `git diff --stat`）；成员若只有队长在跑 = 交付退回——本卡不适用（4 名成员均有产出）。

**⚠️ 流程偏差登记（诚实登记）**：独立复核员 `reviewer` 自行向队长分支 `docs/d948-plan` 提交了 3 个 commit（`edca5b3a` / `2a68ffe4` / `2f163f65` = REVIEW-PLAN.md 及其修订），**违反"单分支单写者"纪律**。后果无害（内容正确、已并入交付），但纪律上应由队长提交；本卡不追溯改写历史，仅登记，供 CTO 判是否需在后续卡收紧成员提交权限。

**⚠️ 编码事故登记（诚实登记）**：队长在最后一次提交前用 PowerShell `Get-Content | -replace | Set-Content -Encoding utf8` 改一处计数，导致 PLAN.md 被 **BOM + mojibake 损坏**（48719 bytes），该损坏版已随 `b0ca3d47` push 到 origin。**处置**：从 `HEAD~2`（36728 bytes，无 BOM 正常版）恢复后以 edit 工具重做全部终轮修订，本修正版为新提交（**不 force push**，用前向修正 commit 覆盖语义）。**教训**：中文 UTF-8 文件禁用 PowerShell 管道式原地改写（读时按系统 ANSI 解码 → 写回即双重编码）；改用 edit 工具。

---

## §1 前提实测表（开工前冻结；每条 = 命令 + 口径 + 原始输出）

口径统一：`ref = ef5c8caa`（`feat/d947-middleware-default-posture` tip），读取时刻 2026-09-24，工作树 `.synova-wt-d948-server`（HEAD `ef5c8caaf8689cd41ab551495efcd002fb6d4e5f`）。

| # | 派单件/我的前提 | 命令 | 原始输出摘要 | 判定 |
|---|---|---|---|---|
| P1 | D947 未合 main（栈式 base 必须） | `git merge-base --is-ancestor ef5c8caa origin/main` | `EXIT=1`（非祖先） | ✅ 成立 |
| P2 | `JwtPayload` 无 department | `git show ef5c8caa:src/middleware/auth.ts` 读 :26-33 | `{sub,role,orgId,iat,exp,jti}` | ✅ 成立 |
| P3 | `AuthRequestContext` 无 department | 同上 :35-39 | `{role,userId,orgId}` | ✅ 成立 |
| P4 | `auth.ts` 内 `department` 零命中 | `git grep -n "department" ef5c8caa -- src/middleware/auth.ts` | 零输出（三口径一致，见 §1-补） | ✅ 成立 |
| P5 | `rbac.ts` JWT 分支写死 `department: undefined` | 读 :119-132 | **实为 `rbac.ts:127`** | ✅ 成立（**派单件写 `:104-105` → 漂移，那是 `RbacContext.authenticated` 的 JSDoc 区**） |
| P6 | `routes/auth.ts` 签发点 | `git grep -n "signJwtToken" ef5c8caa -- src/routes/auth.ts` | `:97`（register）/ `:134`（login）/ **`:176`（refresh）** | ✅ 成立（**派单件只写 `:97`/`:134`，漏 refresh 行号**；A7 依赖它） |
| P7 | 部门判据落点 | 读 `rbac.ts` | `isSameDepartment` `:231-237`；`canAccessWorkspace` 部门分支 `:287`；`canModifyWorkspace` manager 分支 `:313` | ✅ 成立 |
| P8 | `UserRecord` 有 department（签发侧数据源已存在） | `git grep -n department ef5c8caa -- src/growth/user-store.ts` | `:37 department?: string;`、`:75-81 createUser(..., extra?: {department?})`、`:99 department: extra?.department \|\| ''` | ✅ 类型层成立，**但生产无写入者（见 P10/F-2）** |
| P9 | `workspaces-api.ts` 消费 `rbac.department` | 读 :264-291 | `:278 const dept = rbac.department;`（注释自陈「恒 undefined（已登记功能回退）」） | ✅ 成立 |
| P10 | **department 在生产无写入路径** | `git grep -n "department" ef5c8caa -- src/routes/auth.ts` | `:68-69` body 解构**不含** department；`:89 createUser(finalEmail,password,userRole,userOrgId,{phone,wechatId})` **不传**；`:94` 内存回退写入**不含** | ❌ **派单件「签发侧数据源已存在」在 API 面不成立** |
| P11 | 挂载序 `jwtAuthMiddleware → rbacMiddleware → workspacesApiRoutes` | 读 `src/server.ts` | `:344` / `:366` / `:380` | ✅ 成立 |
| P12 | **`GET /api/workspaces/mine` HTTP 面恒 404** | 运行时探针（见 §1-补 probe） | `STACK[2] /api/workspaces/:id` 早于 `STACK[8] /api/workspaces/mine`；`PROBE /api/workspaces/mine -> STATUS=404 BODY={"ok":false,"error":"workspace not found"}` | ❌ **A3/A4 字面形态不可实现**（**有裁定出处**：`docs/synova/product-lines/evidence/D947-20260924/D947-RULINGS.md:253`「L-28 … → 本卡不修，另立卡 + 现状锁定断言」，物理存在已核） |
| P13 | `vitest.config.ts` 全局 `DEV_MODE='true'` | 读 :58-63 | `env: { DEV_MODE:'true', PORT:'3099', SYNOVA_DB_PATH:':memory:', SYNOVA_SKIP_MCP:'1' }`，无 `setupFiles` | ✅ 成立（N1 空转风险真实存在，但有解，见 §1-补 N1） |
| P14 | 渲染层测试只能住 `tests/` | 读 :28 | `include: ['./tests/**/*.test.ts', './tests/**/*.integration.test.ts']` | ✅ 成立 |
| P15 | 桌面端零 Bearer / 零 login | `git grep -n "Bearer" ef5c8caa -- electron-renderer`、`git grep -in "login" …` | 两条均零输出；补测 `Authorization` 零命中 | ✅ 成立 |
| P16 | 桌面端 `x-synova-token` 命中数 | `git grep -n "x-synova-token" ef5c8caa -- electron-renderer` | **5 处 / 2 文件**：`RightPanel.tsx:155`(注释)、`:159`(实现)、`ga-collab.ts:18/44/92`(注释) | ⚠️ **派单件口径含 `:157`，实测 `:157` 是 `getSeedToken()` 调用行、不是 header 字面量** |
| P17 | `getSeedToken` / `DevSeedIdentity` 行号 | `git grep -n` | `ga-collab.ts:47`(接口) `:54`(KEY) `:65`(getSeedIdentity) `:99`(getSeedToken) | ⚠️ **派单件写 `ga-collab.ts:60` → 漂移** |
| P18 | 写集缺口 1：`app-store.ts` 依赖 seed 身份 | `git grep -n "getSeedIdentity" ef5c8caa -- electron-renderer` | `app-store.ts:5 import`、`:128 return getSeedIdentity() ? 'ga' : 'admin';` | ✅ 成立（**不在派单写集**） |
| P19 | 写集缺口 2：测试依赖 seed 符号 | 读 `tests/ga-collab-logic.test.ts:14-29`、`:57-97` | import `getSeedIdentity`/`getSeedToken` + 9 条断言 | ✅ 成立（**不在派单写集**） |
| P20 | `tests/routes/auth.test.ts` 是桩 | `git show ef5c8caa:tests/routes/auth.test.ts \| Measure-Object -Line` | **50 行**；6 个 `it` 全断路由注册；零 HTTP、零 token 解码 | ✅ 成立 ⇒ A1 夹具是**新建**而非"改" |
| P21 | 切片 A 写集单域 | `python scripts/control-tower/check-ownership.py <7 文件>` | `✅ PASS 6 个文件同域: win（无归属 0，域判定豁免 1）` `EXIT=0` | ✅ 成立 |
| P22 | 切片 B 写集跨域 | 同上（B 候选 6 文件） | `❌ FAIL 跨域: 变更落在 2 个域 ['mac','win']` `EXIT=1` | ✅ 成立（P0 表缺口） |
| P23 | `tests/electron/**` 落兜底判 win | `… check-ownership.py tests/electron/dual-guide-packaging-guard.test.ts` | `win  …` `EXIT=0` | ✅ 成立 |

### §1-补 三条独立裁决（队长亲跑，非转述）

1. **P4 三口径一致**：`git grep -n`（ref 对象）· `git show | Select-String` · 工作树文件系统 grep —— 均零命中。
2. **P12 运行时探针**（探针文件落 `.synova-wt-d948-server`，跑完即删，收尾 `git status --porcelain` **空**）：
   ```
   STACK[2] /api/workspaces/:id
   STACK[8] /api/workspaces/mine
   PROBE /api/workspaces/mine -> STATUS=404 BODY={"ok":false,"error":"workspace not found"}
   PROBE /api/workspaces/conflicts -> STATUS=404 BODY={"ok":false,"error":"workspace not found"}
   ```
   ⇒ **F-1 为运行时事实**，且**同族 `/conflicts` 同病**。既有夹具 `tests/routes/workspace-access-write-endpoint.test.ts:326-333` 已把此记为 **D947 期间 CTO 裁定「另立卡，本卡不修 ordering」**，并改用「直接 handler 运行时探针」取证。
3. **N1 可行性裁决（推翻 code-b 的 N-1「判据恒红」）**：
   - `auth.ts:50-54 getSecret()` **惰性读 env**（`:51 const secret = process.env.JWT_SECRET;`、`:54 process.env.DEV_MODE === 'true'`），**非模块级常量** ⇒ 夹具内 beforeAll 覆写有效。
   - 队长亲跑存量同款夹具：`npx vitest run tests/middleware/auth.test.ts` → **`Test Files 1 passed (1) / Tests 34 passed (34)`**，`Duration 971ms`；该文件 `:58-61` 正是 N1 的「先设后断」形态（`process.env.JWT_SECRET='d947-test-secret-0123456789'` → `DEV_MODE='false'` → 两条 `expect` 断言）。
   - ⇒ **N1 可满足**，正确口径 = 「夹具内先覆写 `JWT_SECRET`(≥16)/`DEV_MODE='false'` **再**断言覆盖后的有效值，并记录覆写动作」；**不是**「断言进程启动时的 ambient env」。code-b 的 N-1 降级为**口径澄清项**（§7-13），不构成阻塞。
4. **B-0b（reviewer 提出，队长复核成立）——派单指定模板的助手会同时造成假红与假绿**：
   `tests/routes/workspace-access-write-endpoint.test.ts:369-371` 的 `function syntheticRbac(role: string, userId: string, authenticated = true)` **写死 `department: undefined` 且无形参**（现场读数：`:370 return { role, userId, department: undefined, authenticated };`）。
   - 沿用它做 A3（同部门可见）⇒ **在正确实现上永远红**（假红）；
   - 为它加 `department` 形参后**直喂 handler** ⇒ **绕过 `rbac.ts:127`**，该行不改也全绿（假绿）。
   ⇒ **A3/A4 必须走"真实中间件链 + 抽出 handler"的最小 app 探针**（见 §3），并必须附判别性变异体「`rbac.ts:127` 改回 `undefined` → A3 必红」。
5. **症状订正（reviewer 提出，队长复核成立）——派单 §一 症状表第 3 行不实**：
   派单写「打开部门工作区 → **恒"无权限/空列表"**」。实测 `src/routes/department-workspace.ts:89-98`：页内 `fetch('/api/workspaces/mine')` 在 **404** 响应上仍 `await r.json()`（得 `{ok:false,error:'workspace not found'}`）→ `:91 if(!d.workspaces.length)` 对 `undefined` **抛 TypeError** → `:96-98 catch` 只 `console.warn`、**无任何 UI 呈现** ⇒ 页面**永久停在初始态（"加载中…"）**，用户看到的既不是"无权限"也不是"空列表"。
   **兼带两条存违规**：铁律 24/31（catch 无 degraded、前端不呈现降级）——非本卡引入，登记备查（§7 新增）。

---

## §2 ⛔ 本卡目标可达性裁决：三堵墙（PLAN 最重要结论）

派单 §一 的用户可见目标 = 「市场部总监看到市场部工作区，异部门互不可见」。**三面独立墙**使该目标在 D948 范围内不可达：

| 墙 | 事实 | 证据 | 谁已裁 |
|---|---|---|---|
| **W1** `department` 无写入者 | register/login/updateUser 的生产路径**没有任何一处**把部门写进用户记录 | §1 P10；`createUser` 3 处调用全不传 dept；生产 `updateUser` 6 处全不设 | 未裁（本件提请） |
| **W2** `/api/workspaces/mine` HTTP 恒 404 | `:id`(:126) 遮蔽 `/mine`(:264)；同族 `/conflicts` 同病 | §1-补 2（队长运行时探针） | **D947 已裁「本卡不修 ordering」**（`workspace-access-write-endpoint.test.ts:326-333`） |
| **W3** 桌面端无「部门工作区」消费点 | renderer 内 `api/workspaces`/`department`/`部门` **共 1 处且是注释**（`useWorkspaces.ts:19`） | code-b B-recon §N-4 | 未裁（本件提请） |

**⇒ 裁决**：D948 交付后，可证明的最远边界 = **「登录签发的 JWT 载有真实部门 + 服务端验签后把它带进 RBAC 上下文 + 部门判据在同/异部门上正确（纯函数与 handler 层）」**。
**不可证明**：「用户打开部门工作区看到本部门内容」——W1/W2/W3 任一未解即不成立。

**登记纪律（红线）**：本卡交付**必须**登记为
> **功能回退（未闭环）**：D947 登记的「JWT 用户部门级可见性恒 deny」在 D948 后**仅恢复到签发/验签层**，用户可见层因 W1/W2/W3 仍未恢复。
**严禁**写成"已知限制"或"部门可见性已可用"（派单 §八-7 + 本队红线）。

---

## §3 逐判据实现落点 + 夹具 + 反例（切片 A）

> 落点行号基于 `ef5c8caa`。**可选字段的陷阱**：`department?: string` 是可选 ⇒ **tsc 不会拦住"漏带部门"** ⇒ 夹具的解码断言是唯一门禁（与派单 §二 决策 3 自洽）。

| 判据 | 落点（改前 → 改后） | 夹具（正常 / 降级 / 边界） | 反例（改坏即红） |
|---|---|---|---|
| **A1** 登录 token 解码含真实部门 | `src/routes/auth.ts:134`：`signJwtToken({ sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId })` → **+`department: foundUser.department`** | 正常：注入 `UserStore`（`InMemoryGraphStore` + `setUserStore`，模板 `enterprise.test.ts:50-75/:178-197`）建 `department:'marketing'` 用户 → `POST /api/auth/login` → **base64url 解码 token 第二段** → `payload.department === 'marketing'`（**不断 HTTP 200**）<br>降级：用户记录无 department → `payload.department === undefined`（不得伪造）<br>边界：`department:''` → 仍 `undefined` 或空串，**不得**被下游当"同部门" | 把该行改回三字段 → 解码断言必红 |
| **A2** `extractRbacContext` 返回真实部门 | `src/middleware/rbac.ts:122`（内联 `auth` 入参类型 **必须**加 `department?: string`，否则 `:127` 编不过）+ `:127`：`department: undefined` → **`department: req.auth.department`** | 正常/降级/边界：纯函数直调（`JWT auth` 带/不带/空串部门） | 把 `:127` 改回 `undefined` → 必红 |
| **A3** 同部门可见 | **被 W2 阻断**（HTTP 恒 404）→ 改口径：**最小 app 探针** = `express()` + 真实 `jwtAuthMiddleware`（`auth.ts:311` 导出）+ 真实 `rbacMiddleware`（`rbac.ts:320`，`req.rbac = extractRbacContext(req)`）+ 从 `router.stack` 抽出的**真实 handler**（先例 `workspace-access-write-endpoint.test.ts:338-350 loadMineHandler`）。**只绕开「路由遮蔽」，不绕开身份链**。播种 = admin JWT 经 HTTP 建 parent → `POST /:id/sub{department:'marketing'}` | 正常：manager@marketing 的**真实 JWT**（非合成 ctx）经中间件 → handler 响应含该部门工作区 | ① `rbac.ts:127` 改回 `undefined` → 必红；② **禁止用 `syntheticRbac`**（`:369-371`）——它写死 `department: undefined` 且无形参 ⇒ 假红/假绿（§1-补 4） |
| **A4** 异部门不可见 | 同 A3（同一最小 app 探针） | 正常：manager@sales 的真实 JWT → 响应**不含** marketing 工作区 | ⚠️ **独立复核 §18.2 二次更正（最终口径）**：A4 是**负向**断言（"不含"）⇒ **收窄型**变异体（去掉 owner 析取 / 收紧 `isSameDepartment`）只会让它**更绿**，不可能红。**唯一判别形态 = 过宽型**：把 `workspaces-api.ts:286` 的 `w.department === dept` 改成 `true`（或过滤退化为全量）→ **A4 红、A3 仍绿**。队长已采纳，并请 code-a 订正 `A-recon.md` 的 M8/M9 归属互换 |
| **A5** 无部门仍 fail-closed | 不改实现（**只加夹具**）；判据落 `rbac.ts:287` / `:313` 现状 | 正常：合法 JWT 但无 department + `visibility:'department'` 工作区 → `canAccessWorkspace===false && canModifyWorkspace===false`<br>**⚠️ 独立复核 I-4 必加约束**：夹具工作区**必须满足 `ws.owner !== ctx.userId`** —— 否则 `:313` 的 `\|\| ws.owner === ctx.userId` 析取会使 `canModifyWorkspace` 在**正确实现上为 true** ⇒ A5 假红，实施者会被逼去改产品代码<br>边界：`''`、`undefined`、双空、仅一侧空 → 全 false | 在部门分支加 `\|\| role === 'manager'` 旁路 → 必红。**A5-b 登记**：`canModifyWorkspace` 的 owner 析取路径（`:313`）属**既有语义不回改**，A5 不覆盖它 |
| **A6** 自报头零复活 | `auth.ts:503-508` 显式拒绝分支 **严禁删除**（D947-RULINGS.md:109 硬要求） | 正常：请求带 `x-synova-token: admin:marketing:u1` 且无 Bearer → `role !== 'admin'` + `log.warn` 留痕编码在场 | 恢复任一自报分支（auth 或 rbac）→ 必红 |
| **A7** refresh 不丢部门 | `src/routes/auth.ts:176-180`：`signJwtToken({sub,role,orgId})` → **+`department: result.payload.department`** | 正常：带部门 JWT → refresh → 新 token 解码仍有部门<br>⚠️ **夹具硬约束（队长实测）**：`/api/auth/refresh` **不在白名单**（白名单只有**精确** `path === '/api/auth/login'` / `'/api/auth/register'`，`auth.ts:107-108`）⇒ 走非白名单分支、要求 `Authorization: Bearer`。故夹具**必须把旧 token 放 `Authorization` 头**；只放 `body.token` 会**在路由之前被中间件 401**（路由虽也读 body.token，但到不了，`auth.ts:369-379`）<br>降级/边界：旧 token 无部门 → 新 token 也无（保持 `undefined`，**fail-closed 不猜测**，见 §7-8） | 改回三字段 → 必红 |

### §3-补 三条未决项（**队长不自决，供 CTO 裁**）

| # | 问题 | 选项 | 队长推荐 |
|---|---|---|---|
| U1 | **register 的 department 来源**：`:89 createUser` 只收 `extra.department`，签发时**尚无 UserStore 记录**，唯一可能来源 = `req.body.department` —— 而**客户端自报身份被创始人决策 ① 完全禁止** | (a) register **不取** body department（保持 `undefined`），部门只由后续管理动作/另一张卡写入；(b) register 接受 body.department 并落库（= 注册期自报，与决策 ① 存在张力）；(c) 本卡不碰 register | **(a)** —— 决策 ① 无例外，且 W1 的关闭属产品决策，另立卡 |
| U2 | **refresh 遇到"旧 token 无 department"** | (a) 保持 `undefined`（fail-closed 语义不变，最小改动）；(b) 拒绝刷新 | **(a)** |
| U3 | **内存 Map 回退路径**（`routes/auth.ts:91-95`，无 UserStore 时） | (a) 保持无部门 + 补 `degraded` 留痕；(b) 视为错误拒绝登录 | **(a)** |

---

## §4 逐判据实现落点 + 夹具 + 反例（切片 B，**受 P0 + 4 项 CTO 裁定阻塞，本阶段不开工**）

| 判据 | 落点（改前 → 改后） | 夹具 | 反例 |
|---|---|---|---|
| **B1** `x-synova-token` 零命中 | 现值 **5 处**（4 注释 + 1 实现）：`RightPanel.tsx:155/159`、`ga-collab.ts:18/44/92`（连注释一并于 `getSeedToken`/`DevSeedIdentity` 退役时清理） | ⚠️ **grep 型静态判据不得当验收**（本队纪律）→ 降级为辅助指纹，主验收改用 B3 行为夹具 | 恢复附头一行 |
| **B2** 有 token 发 Bearer | `electron-renderer/src/lib/api.ts` 新增**唯一装配点** `authHeaders(extra?)`；`RightPanel.tsx:162` `headers: opts?.headers ?? baseHeaders` → **改合并式** `headers: authHeaders(opts?.headers)` | 桩 fetch **记录 `(url, init)`**（先例 `use-streaming-conversation.test.ts:127-131`，但既有 `right-panel-report-sentinel.test.ts:74` **只记 URL** ⇒ 必须升级）→ `new Headers(init.headers).get('Authorization') === 'Bearer <jwt>'` | 改发 `x-synova-token` → 红 |
| **B3** 无 token 不伪造身份 + 显性呈现"需要登录" | `api.ts:authHeaders()` 无 token ⇒ **不产出任何身份键**；`app-store.ts:128 return getSeedIdentity() ? 'ga' : 'admin'` → **去 seed 派生**；新建 `LoginPanel.tsx`；显性态复用 `RightPanel.tsx:379-381 degradedReason` / `cap-degraded-banner` 先例 | 无 token → 逐键枚举 `authorization/x-synova-token/token/cookie` 全 `undefined` + 渲染串含"需要登录" | 无 token 回退 seed 身份 → 红；静默无提示 → 红（铁律 11） |
| **B4** 登录成功 → 落存储 → 后续自动带 Bearer | `auth-session.ts`（新）：`login()` → `POST /api/auth/login` → 落 `localStorage['synova:auth-token']`（`synova:` 冒号族先例，**不落账号密码、不落 payload 明文**） | 桩服务端：`login()` 后键非空，**紧接第二个请求** `init.headers` 含 Bearer | 登录不落存储 / 落存储但第二请求无 Bearer → 红（"接线了≠被执行"） |

**B 阶段三项已识别硬约束**（详见 §7）：
- **B-①** 写集真实最小 = **8 文件（6 mac + 2 win）> 派单 ≤6**；**CTO R3 已批准 8 文件**。两条缺口（`app-store.ts` / `tests/ga-collab-logic.test.ts`）实测是硬依赖，无替代路径。
- **B-②** ✅ **CTO 要求交回的白名单对照表 → 见 §4-补（本轮新增，逐点实测）**。CTO 两处订正已采纳：`LeftPanel.tsx:63`（打 `/api/ga/clients`）与 `useStreaming.ts:303`（打 `/api/diagnosis/consult`｜`/api/conversations`）**均在白名单**，队长原判"非白名单"有误 ⇒ 覆盖面结论按 §4-补 重写。
- **B-③** B4 依赖切片 A 的接口契约（`POST /api/auth/login` 路径 + 响应 `token` 字段名）⇒ **B 必须等 A 合入**。

### §4-补 B-② 白名单对照表（**CTO 交付要求；队长逐点实测**，口径：`ref=ef5c8caa`，读取时刻 2026-09-25）

分类依据（两套并列，缺一不可）：
- **白名单**（`auth.ts:104-132` 的 `isWhitelisted`）：认证「**不要求**」——但仍会尝试解析 Bearer 并在有效时注入 `req.auth`（D947/L-20 修正后的语义）。
- **挂载序豁免**：`server.ts:344 app.use(jwtAuthMiddleware)` **之前**挂载的路由（`:322` setupGuideGone / `:340` **llmConfigRoutes** / `:343` uploadV2Gone）——**根本不过 JWT 中间件**。
- **受门禁**：既不在白名单、又挂载在 `:344` 之后 ⇒ 无 Bearer **必 401**。

| # | 坐标 | 端点 | 分类 | 依据 |
|---|---|---|---|---|
| 1 | `App.tsx:52` | `/health` | **白名单** | `auth.ts:105 path === '/health'` |
| 2 | `CenterPanel.tsx:39` | `/api/sessions/{id}` | **白名单** | `:124 startsWith('/api/sessions')` |
| 3 | `LeftPanel.tsx:63` | `/api/ga/clients` | **白名单** ← **CTO 订正①** | `:127 startsWith('/api/ga/clients')`（队长原判"非白名单"**有误**） |
| 4 | `LeftPanel.tsx:74` | `/api/sessions?limit=20` | **白名单** | `:124` |
| 5 | `LeftPanel.tsx:100` | `/api/sentinel/signals` | **白名单** | `:119 startsWith('/api/sentinel/')` |
| 6 | `LeftPanel.tsx:110` | `/api/loops/status` | **🚩 受门禁** | 不在白名单；`server.ts:422 app.use(loopRoutes)` 在 `:344` 之后 ⇒ 无 Bearer 401 |
| 7 | `LeftPanel.tsx:123` | `/api/actions` | **🚩 受门禁** | 不在白名单；`server.ts:384 app.use(actionsApiRoutes)` 在 `:344` 之后 |
| 8 | `LeftPanel.tsx:139` | `/api/ga/switch/{orgId}` | **白名单** | `:128 startsWith('/api/ga/switch')` |
| 9 | `RightPanel.tsx:160` | apiFetch(path) — 12 个调用点 | **视 path** | 端点由实参决定；见 §4-补-注 |
| 10 | `RightPanel.tsx:186` | `/api/diagnosis/reports?limit=1` | **白名单** | `:122 startsWith('/api/diagnosis/reports')` |
| 11 | `RightPanel.tsx:352` | `/api/diagnosis/consult/{id}/report` | **白名单** | `:121 startsWith('/api/diagnosis/consult')` |
| 12 | `useNotifications.ts:148` | `/api/sentinel/tickets` | **白名单** | `:119` |
| 13 | `useNotifications.ts:195` | `/api/sentinel/tickets/{id}/transition` | **白名单** | `:119` |
| 14 | `useStreaming.ts:303` | `/api/diagnosis/consult`（mode=diagnosis）｜`/api/conversations` | **两者均白名单** ← **CTO 订正②** | `:121` / `:123 startsWith('/api/conversations')`。**主用户路径（GA 诊断 / 对话）免认证** |
| 15 | `llm-config.ts:134` | `/api/llm/config`｜`/api/llm/test` | **非白名单，但"挂载序豁免"** | `server.ts:340 app.use(llmConfigRoutes)` **早于** `:344` ⇒ 不过 JWT 中间件，实际可达（D575 首启向导豁免集） |

> 说明：`lib/api.ts:5` 是**注释**（`fetch('/api/...')`），非调用点；故 16 命中 − 1 注释 = **15 真实调用点**，与 B-recon §3-2 计数一致。

**§4-补-注（apiFetch 12 调用点的端点分类，逐点）**：`RightPanel.tsx` 内 apiFetch 的 path 实参需逐点核（写集内可改）；**这是 B2 覆盖面裁定的关键**，B 开工前须逐点标完。

**§4-补-结论（重写 B-② 覆盖面）**：
> 15 个真实 fetch 点中，**仅 3 个受 JWT 门禁**（#6 `/api/loops/status`、#7 `/api/actions`、#9 apiFetch 中指向受保护 path 者），**12 个免认证**（含**主用户路径** GA 诊断 / 对话 / 会话读回 / 哨兵 / 通知 / 解决方案 / GA 客户）。
> ⇒ **B2/B4 的"后续请求自动带 Bearer"在真实链路上只覆盖极少流量**；B 的实际价值应重述为：**(a) 撤掉服务端已忽略的自报头，(b) 提供登录 UI 与 Bearer 装配点（供受门禁端点用），(c) 无 token 时显性呈现"需要登录"而非伪造身份**。
> ⇒ **CTO §7-12 裁定**：B 只保证 **apiFetch 链 + 诚实登记**；渲染层统一封装（把 15 点收敛到单一 `authHeaders()`）**另立卡**。**但本表未交回前 B 不算完成**——本表即为该项交付。
> ⇒ **B2/B3 靶端点必须选受门禁者**：推荐 **`/api/auth/refresh`**（非白名单、受门禁，实测）或 **`/api/loops/status`** 或 `GET /api/workspaces/:id/context`。**不得**用 `/api/ga/clients`、`/api/sentinel/*`、`/api/diagnosis/*`、`/api/solutions*`、`/api/conversations*`、`/api/sessions*`（全在白名单，无判别力）。

---

## §5 两条（三条）PR 的 base、顺序、写集与域

| PR | 分支 | base | 域 | 文件数 | 状态 |
|---|---|---|---|---|---|
| **PR-1 切片 A** | `feat/d948-identity-chain-server`（本地已建，**未推 origin**） | **`feat/d947-middleware-default-posture` tip `ef5c8caa`（栈式）** | win（`✅ PASS 6 同域 win` 实测） | 7（含 `task-state/D948.json`＝域豁免）≤12 ✅ | **可立即开工**（P0 不影响 A） |
| **PR-0 P0 治理**（若选 P0-a+） | `fix/d948-ownership-electron-tests` | `origin/main` | **mac**（治理三件实测均 mac） | 3 ≤12 ✅ | 待 CTO 选 P0 选项 |
| **PR-2 切片 B** | `feat/d948-identity-chain-desktop` | **A 合入后的 main**（若 A 走栈式合并则 = A 链尾） | mac（P0-a+ 后 8 文件同域实测 `PASS`） | 8 > 派单 ≤6 → **须 CTO 裁** | **阻塞**：P0 未裁 + B-②③ 未裁 |

**顺序（硬）**：`PR-1` → （`PR-0`，若需）→ `PR-2`。串行规则：**A 合了再开 B**；重型验证（vitest / 全量门禁 / 黄金门禁）**串行 ≤1**（本阶段队长只跑了 1 个靶向文件用于 N1 裁决，未与他人并跑）。

**写集互斥核对**（A 7 文件 vs 队长 2 文件 vs B 8 文件）：
- A 与 B **零交集**；`task-state/D948.json`：**同一写者（队长）、跨分支二次写**（phase-0 本分支已写 + 派单 §五 A 表又把它列为 PR-1 文件）⇒ **须择一**：推荐 **A 分支不再重复写该文件**，或 A 分支继承时以本分支版本为准（§7 新增登记）。**不写成"无重叠"**（独立复核 §3.1 更正）。
- `src/routes/auth.ts` **单写者 = code-a**（A/D948 内无第二写者；全仓库其他卡未持有）✅。
- **A3/A4 宿主问题**：handler 探针的唯一现成宿主 `tests/routes/workspace-access-write-endpoint.test.ts` **不在 7 文件写集** ⇒ 需 CTO 在三种放法中选择（见 §7-2）。

**回执基准纪律（§7-20）**：本地 `main` 落后 `origin/main` **69 提交** ⇒ 交付回执的 `git diff --stat` **必须写明基准**（切片 A 用 `ef5c8caa`；其余用 `origin/main`），**禁用本地 `main`**。

---

## §6 P0 影响面（三选项实测矩阵 + 治理件域归属）

| 选项 | 落地文件 | B 候选 8 文件域实测 | 结论 |
|---|---|---|---|
| **P0-a（派单推荐原案）** `tests/electron/** → mac` | ownership.yaml + CODEOWNERS + check-ownership.test.sh | `❌ FAIL 跨域 ['mac','win'] EXIT=1`（`tests/ga-collab-logic.test.ts` 在 `tests/` 根，不经该规则） | **原案不足以放行 B** |
| **P0-a+（本 PLAN 推荐）** `tests/electron/** → mac` **且** `tests/ga-collab-logic.test.ts → mac` | 同上三件 | `✅ PASS 8 个文件同域 mac EXIT=0` | **唯一实测可放行的选项** |
| **P0-b** 仅把 `tests/electron/d948-*.test.ts` 记入 `domain_neutral` | ownership.yaml 一行 | `❌ FAIL 跨域（域判定豁免 1）EXIT=1` | 补丁不治病，本卡仍过不去 |
| **P0-c** 测试改放 `electron-renderer/src/**` + 扩 vitest include | 落 `vitest.config.ts`（**判 win**）+ mac 源码 | 由表结构直接推出**新跨域**（未实测，code-b 已标注"推断"） | 更绕，且影响全仓测试收集面 |

**P0-a+ 的自洽性（关键）**：需改的三个治理件 —— `docs/synova/coordination/ownership.yaml`、`.github/CODEOWNERS`、`tests/control-tower/check-ownership.test.sh` —— **实测均为 mac** ⇒ **P0-a+ 自身就是一个干净的单域（mac）PR**，与切片 B 的 mac 域一致。
**连带影响（必须同批）**：① `tests/electron/` **13 个既有文件全部改判 mac**（含 D716 Win 建的 `dual-guide-packaging-guard.test.ts`）⇒ 需 CTO 一句裁定；② `.github/CODEOWNERS` **必须重跑** `--emit-codeowners`（`check-ownership.test.sh` §7 是**逐字节** drift 断言）；③ 新规则须落在 `**` 兜底行之后（表语义「最后匹配者胜出」）。
**治理件归属 1 处登记**：`tests/control-tower/ownership.test.sh` 在测试中被引用但**文件不存在**（靠"尚未创建的路径也可判域"通过）——非本卡引入，登记备查。

---

## §7 未清项预登记（诚实登记，共 27 条）

| # | 项 | 归属 | 处置 |
|---|---|---|---|
| 1 | **P0 选项**：推荐 **P0-a+**（原案 P0-a 实测不足） | CTO | **阻塞 B** |
| 2 | **A3/A4 夹具宿主**（HTTP 恒 404；唯一现成宿主在写集外） | CTO | 三选一：(i) 放 `tests/routes/workspace-access-write-endpoint.test.ts`（+1 文件，语义正）；(ii) 放 `tests/routes/auth.test.ts`（在集内但语义错位）；(iii) 新建 `tests/routes/d948-department-visibility.test.ts`（+1 文件，语义最正）。**推荐 (iii)**（7→8 文件，仍 ≤12） |
| 3 | **切片 B 写集 8 文件 > 派单 ≤6** | CTO | 确认 8（仍 ≤ PR 12 上限）或裁替代 |
| 4 | **W1：`department` 无生产写入者** | CTO（产品） | 用户可见目标不可达 → 另立卡；本卡只到签发/验签层 |
| 5 | **W2/F-1：ordering 不修** | 沿用 D947 裁定 | A3/A4 改 handler 探针；**登记为既有限制** |
| 6 | **W3：桌面端无部门工作区消费点** | CTO（产品） | B 的验收只到"请求头层 + 登录 UI 层" |
| 7 | 未决 U1（register department） | CTO | 推荐 (a) 不取 body |
| 8 | 未决 U2（refresh 旧 token 无部门） | CTO | 推荐 (a) 保持 undefined |
| 9 | 未决 U3（内存回退路径） | CTO | 推荐 (a) 无部门 + degraded 留痕 |
| 10 | **`bootUserRole` 目标取值域**（`app-store.ts:128`，今日二值 `'ga'`/`'admin'`） | CTO（权限语义） | 无会话应落何值？不得猜 `admin` |
| 11 | **LoginPanel 挂载点**（`App.tsx` 无登录门；`WelcomeScreen` 已被 D575 占用） | CTO | 产品决策 |
| 12 | **B2/B4 覆盖面** | ✅ **CTO 已裁（2026-09-25）** | **只保证 apiFetch 链 + 诚实登记**；渲染层统一封装（15 fetch 点收敛到单一 `authHeaders()`）**另立卡**。覆盖面表见 **§4-补**（15 点逐点实测：仅 **3 点受门禁**、12 点免认证）。**该表已交回** ⇒ 此项关闭 |
| 13 | **N1 口径澄清**（code-b N-1 已被队长裁决推翻：`:58-61` 先设后断形态 **34/34 绿**） | 队长已裁 + CTO 知悉 | 按"先覆写再断言"执行；**不得**按 ambient 断言写 |
| 14 | **B1 是 grep 型静态判据**（现值 5 处含 4 注释） | CTO 知悉 | 降级为辅助指纹，主验收用 B3 行为夹具 |
| 15 | **`bash` 本机不可用**（WSL 未装）⇒ `scripts/**` 门禁与 `*.test.sh` 治理测试**本机无法复跑** | 队长/CTO | 治理实测一律改用 `python scripts/control-tower/check-ownership.py`；CI 侧为权威 |
| 16 | **编制 5 人 vs 预设上限 4** | CTO | 本阶段按派单 5 人执行，登记冲突 |
| 17 | **分支未推 origin**（`feat/d948-identity-chain-server` 仅本地；无 desktop 分支） | 队长 | 回执附 ls-remote |
| 18 | **F-3 注释失真**：`workspaces-api.ts:278` 与夹具 `:236` 的「恒 undefined（已登记功能回退）」在 A 交付后失真 | CTO | 写集外；建议放行注释订正（7→8 文件仍 ≤12） |
| 19 | **F-4 / F-5 既有缺口**：register 的 `role` 来自 body（自报且各态可写）；`GET /api/workspaces`(:92-97) **无守卫无过滤** = 部门隔离的 HTTP 旁路 | CTO | 本卡不修（写集外），登记 |
| 20 | **本地 `main` 落后 `origin/main` 69 提交**（`git rev-list --left-right --count origin/main...main` → `69  0`，实测）⇒ **回执 `git diff --stat` 的基准必须写明**（切片 A 用 `ef5c8caa`；其余用 `origin/main`），**禁用本地 `main`**（否则数字无意义） | 队长（回执纪律） | 本 PLAN 及后续回执一律显式标注基准 |
| 21 | **B-0b：模板助手 `syntheticRbac` 造成假红/假绿**（`:369-371` 写死 `department: undefined` 且无形参） | CTO 知悉 + 执行纪律 | A3/A4 改走"真实中间件链 + 抽出 handler"探针；**禁止**合成 ctx 直喂；必须附 `rbac.ts:127` 判别性变异体 |
| 22 | **症状订正**：派单 §一 症状表「恒'无权限/空列表'」不实，实为 `department-workspace.ts:89-98` 的 `undefined.length` 抛错被 `console.warn` 吞掉 → 页面永久停在加载态（兼铁律 24/31 存违规） | CTO 知悉 | 非本卡引入，登记；`department-workspace.ts` 不在写集 |
| 23 | **`task-state/D948.json` 跨分支二次写**（phase-0 本分支已写 + 派单 §五 A 表又列它为 PR-1 文件） | 队长 | 择一：A 分支不重复写 / 以 `docs/d948-plan` 版本为准（§5 已更正"无重叠"措辞） |
| 24 | **FG-5（独立复核）**：B2/B3 的夹具若落在**白名单端点**⇒ **无判别力**；且给这些端点加 gating 可能**回退已闭环的 8 验证点** | CTO | **靶端点必须是"受 JWT 门禁保护"者**，如 **`POST /api/auth/refresh`**（实测**不在**白名单）或 `GET /api/workspaces/:id/context`。**⚠️ 独立复核 §18.2 更正**：队长初稿举例的 `/api/ga/clients` **本身就在白名单**（`auth.ts:127`）⇒ 自相矛盾，已作废。**白名单全表（`auth.ts:104-132` 实测）**：`/health`、`/`、**`/api/auth/login`、`/api/auth/register`**、`/api/enterprise/register`、`/api/enterprise/invitation/*`、`/api/status*`、`/assets/*`、`*.html/js/css/ico`、`/cockpit`、`/api/healthz`、`/api/sentinel/*`、`/api/cockpit/*`、`/api/diagnosis/consult*`、`/api/diagnosis/reports*`、`/api/conversations*`、`/api/sessions*`、`/api/notifications*`、`/api/solutions*`、`/api/ga/clients*`、`/api/ga/switch*`、`/api/ontology/graph/*`、`/api/ontology/ingest`、`/api/knowledge/ask*` —— **以上任一不得作 B2/B3 靶端点** |
| 25 | **FG-6（独立复核）**：N1 的真实判别条件是 `auth.ts:350 if (!secret && DEV_MODE==='true')`，**只断 `DEV_MODE` 不充分** | CTO 知悉 + 执行纪律 | 夹具须**同时**断「走的是验签分支」而非 dev-admin 分支（加分支判别器，不只断环境变量） |
| 26 | **⚠️ 队长更正 code-b 的 §0-5「`bash` 不可用」**：`bash` 仅**在 PowerShell PATH 中**解析到未安装的 WSL 存根；**Git 自带 bash 可用**（`C:\Program Files\Git\bin\bash.exe`，实测 `GNU bash 5.3.9`），但**须自带 PATH**（否则 `grep/tr/rm: command not found` → 出现 49 项**环境性假失败**，队长已亲历一次） | 队长（口径更正） | 治理 bash 测试**本机可复跑**：`$env:PATH='C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;'+$env:PATH; bash <script>`。**新增实测证据**：治理金测试 `tests/control-tower/check-ownership.test.sh` 在 base（无 P0 改动）下 **`✅ 全部通过: 58 项` / EXIT=0**（含 §7 CODEOWNERS 逐字节 drift 断言）⇒ P0-a+ 落地后必须重跑并保持 58/58 |
| 27 | **§9「三条 fetch 坐标」口径**：派单字面写"三条 fetch 坐标三方值"，队长按其意解释为"三条**待核对坐标** × 三方值"并已在 §9 显式标注 | CTO 追认 | 若 CTO 原意是三个 `fetch()` 调用点，请指明，队长重做 |

---

## §8 功能回退登记（不得写成"已知限制"）

1. **D947 登记的功能回退（桌面 GA 自报身份通道整体断链）**：D948 切片 B 是其**修复路径**，但 B 受 P0 + §7-1/2/3/12 阻塞 ⇒ **若 B 未开工/未合，该回退在 D948 交付后仍未闭环** —— 必须显式写「功能回退」。
2. **D947 登记的「JWT 用户部门级可见性恒 deny」**：D948 切片 A 只恢复到**签发/验签/RBAC 上下文层**；用户可见层因 **W1/W2/W3** 未恢复 ⇒ 登记为「**功能回退（部分恢复，未闭环）**」。
3. **新增回退（无）**：切片 A 不删除任何既有能力（`auth.ts:503-508` 拒绝分支保留、`isSameDepartment` 收窄不变）⇒ 本卡**不引入**新回退。

---

## §9 派单件指纹对账（**三条坐标 × 三方值**；独立复核 §12-6 口径更正）

> 口径更正：本节标题原写「三条 fetch 坐标」易被误读为三个 `fetch()` 调用点。实际所指 = **三条待核对坐标**（派单件分支 / 切片 A base / main），每条给**三方值**：①派单件声明 ②`ls-remote` 远端权威 ③本地检出（remote-tracking ref 与 worktree HEAD）。

| 坐标 | ①派单件声明 | ②`ls-remote` 远端权威 | ③本地检出（tracking ref / worktree HEAD） | 一致 |
|---|---|---|---|---|
| 派单件分支 `docs/d948-identity-chain-dispatch` | tip `df9dc5ed` | `df9dc5edcaa753830c80c2a3050a27d2d6d21bd8` | `df9dc5ed`（`.synova-wt-d948-dispatch` HEAD 同） | ✅ |
| 切片 A base `feat/d947-middleware-default-posture` | tip `ef5c8caa` | `ef5c8caaf8689cd41ab551495efcd002fb6d4e5f` | `ef5c8caa`（`.synova-wt-d947-middleware` HEAD 同） | ✅ |
| `main` | —（派单未固定） | `114582799d55ffd43a36daf6fa5e1268488752a0` | `11458279`（`docs/d948-plan` 的 base；**本地 `main` 落后 69**，见 §7-20） | ✅ |

**内容指纹（派单件未自附，队长补）**：派单件 blob SHA1 `b338b6b44a8f1601b541855dee31dfdff5969d23`（17340 bytes / 175 行）；卡片 blob `1ba676e4bc992c8347a8e9ad99cd964409d07dd2`（2931 bytes）；工作树文件 `git hash-object` 与 blob **逐位相等** ⇒ 检出无漂移。

---

## §10 本阶段交付物清单与证据

| 文件 | 作者 | 状态 |
|---|---|---|
| `docs/synova/product-lines/evidence/D948-20260924/PLAN.md` | lead | 本件 |
| `docs/synova/product-lines/evidence/D948-20260924/A-recon.md` | code-a | 437 行 |
| `docs/synova/product-lines/evidence/D948-20260924/B-recon.md` | code-b | 392 行 |
| `docs/synova/product-lines/evidence/D948-20260924/T-V-premise-2nd.md` | verifier-tv | 337 行 |
| `docs/synova/product-lines/evidence/D948-20260924/REVIEW-PLAN.md` | reviewer | 待出（task-5） |
| `task-state/D948.json` | lead | 本阶段状态回填 |

**本阶段 `git diff --stat`（回执第 4 项；基准 `origin/main` = `11458279`，**禁用本地 main**，见 §7-20）**：
```
 $ git diff --stat origin/main..HEAD
 docs/synova/product-lines/evidence/D948-20260924/A-recon.md            | 437 +++
 docs/synova/product-lines/evidence/D948-20260924/B-recon.md            | 392 +++
 docs/synova/product-lines/evidence/D948-20260924/PLAN.md              | 244 ++
 docs/synova/product-lines/evidence/D948-20260924/REVIEW-PLAN.md        | 474 +++
 docs/synova/product-lines/evidence/D948-20260924/T-V-premise-2nd.md    | 336 +++
 task-state/D948.json                                                   |  69 ++
```
（终值见 §12 收口后的实际输出。）

**独立复核状态**：`task-5` 由 `reviewer` 对本件做**对抗性复核**；**复核未通过前本 PLAN 不得视为已定型**（派单 §十：独立复核未通过 = 未完成）。

---

## §11 自验结论

- 本阶段**未写任何产品代码 / 产品测试代码**（可核：`git status --porcelain` 仅证据目录与 `task-state/D948.json`）。
- 前提实测：23 条，其中 **P10 / P12 两条推翻派单件既述**（`department` 生产无写入者；`/mine` HTTP 恒 404），**P5 / P6 / P16 / P17 四条行号漂移**已登记，**N-1 一条被队长裁决推翻**（N1 可满足，34/34 绿证）。
- **自验结论：PLAN 可提请 CTO 复核放行**（并请一并裁定 §7 的 1/2/3/4/6/7-12）。
- **不予判定**：A1–A7 / B1–B4 **全未实施**，不存在任何"通过"结论；通过与否归 **CTO 收件闸 + K3 终审**。

---

## §12 独立复核（task-5，`reviewer`）结论与收口

**复核产出**：`REVIEW-PLAN.md`（606 行 / 62288 bytes）｜复核员自验结论：**可提请独立审计**（不判通过）。
**复核员自我更正**：其首轮「`auth.test.ts` = 44 行 / PLAN P20 有误」系其自方方法误差（`Measure-Object -Line` 漏算空行）——**正确 = 50 行 / 6 个 `it`，PLAN P20 与派单件均正确**；相关对 437/392/337 行数的怀疑亦已撤回。

### §12-1 已收口（本 PLAN 本轮修订直接吸收）

| 复核项 | 处置 |
|---|---|
| **I-3** A4 变异体不判别（`isSameDepartment` 收紧对 sales/marketing 两版同为 false） | ✅ §3 A4 行改用 **A-recon M8**（过滤去 owner 析取） |
| **I-4** A5 在正确实现上**假红**（`:313` 的 `\|\| ws.owner === ctx.userId` 析取） | ✅ §3 A5 行加硬约束「夹具必须 `ws.owner !== ctx.userId`」+ A5-b 登记 owner 路径为既有语义 |
| **§12-4** 回执第 4 项缺 `git diff --stat` + §0 悬空引用 | ✅ §10 补 `git diff --stat`（含基准）；§0 交叉引用改指 §10/§11 |
| **§12-6** §9 标题名不符实 | ✅ §9 改为「三条坐标 × 三方值」并逐列标注三方来源 |
| **§3.1** `task-state/D948.json` 跨分支二次写 | ✅ §5 更正"无重叠"措辞 + §7-23 登记 |
| **§1.4/1.5** P0-a 原案放行不了 B + B 写集 8 > 6 | ✅ 已在 §6 / §4 / §7-2/3 登记（与本 PLAN 独立结论一致） |
| **FG-5** B 夹具落白名单端点无判别力 | ✅ §7-24 登记 |
| **FG-6** N1 只断 `DEV_MODE` 不充分 | ✅ §7-25 登记 |

### §12-2 复核员对队长四问的答复（原样登记）

1. **W1 / W2 独立复核成立**；**W3 未二次复核**（只对 W1/W2 表态）→ 本 PLAN 的 W3 仍为单一来源（code-b），登记为**未独立复核**。
2. **认同队长推翻 code-b N-1**（`getSecret()` 惰性读 env + 34/34 绿为物理证据）；复核员不主张 N1 不可满足，只补"判别力"要求（见 §7-25）。
3. **A3/A4 宿主推荐 (iii)** 新建 `tests/routes/d948-department-visibility.test.ts`，并**代跑域**：该路径判 **win** ⇒ A 写集 7 件合并 `✅ PASS 7 同域 win`，单域不破。
4. A×B **零交集** ✓；`src/routes/auth.ts` **单写者 = code-a** ✓；**P0-a+ 治理三件复跑 = `mac ×3` `✅ PASS`** ✓；但「P0-a+ 后 B 8 件 PASS」为**预测值、本机未实测**（治理件未改）——本 PLAN 已按此标注。

### §12-3 复核员未覆盖面（与 §7 未清项合并）

`tests/middleware/auth.test.ts` 34/34 未由复核员复跑（队长亲跑）；W3 未二次复核；P0-a+ 放行 B 未实测；`electron/**` 主进程与 `tests/electron/` 13 件连带改判未复核。**以上四项不得在回执中表述为"已验"。**

---

## §13 CTO 第 0 阶段复核结论（2026-09-25）与放行范围

**结论：PLAN 通过。** 以下 R1–R6 **覆盖派单原文**，为本卡后续执行的唯一权威口径。

| # | 裁定 | 落地 |
|---|---|---|
| **R1** | **P0 = P0-a+，规则扩为 glob**：`tests/electron/** → mac` **＋** `tests/ga-collab-*.test.ts → mac`（**不是只列 logic 一件**——`tests/ga-collab-ui.test.ts` 同以 `electron-renderer/src/**` 为被测主体）。`tests/electron/` 13 件连带改判 mac **一并批准**（D716 那件头注自陈断言对象是 mac 域资产，改判系纠正旧误标）。规则落点在 `**` 兜底行之后。**由 D949 单独落** | ✅ 已开 `task-7` / 分支 `fix/d949-ownership-electron-tests` / base `origin/main@6a714483` |
| **R2** | A3/A4 夹具宿主 = **方案 (iii)**：新建 `tests/routes/d948-department-visibility.test.ts`（判 win）。A 写集 7→8，仍 ≤12 | ✅ 已开 `task-6`，写集 8 文件 |
| **R3** | 切片 B 写集 = **8 文件，批准**（两条缺口是硬依赖，无替代路径） | ✅ PLAN §4 B-① 已更新；B 仍 hold |
| **R4** | **register 不取 body 的 department**，定 (a)。决策①「客户端自报身份完全不允许」**无例外**；W1 的正解是**管理动作写入**（邀请携带部门 / 管理员分配），不是注册期自报 | ✅ 已写入 `task-6` 约束 |
| **R5** | 无会话 `bootUserRole` 定 **`'staff'`**（今日 `app-store.ts:128` 无会话落 `'admin'`，与 D947 治的是同一类病）。有 token 取 token 角色；无 token 取 `'staff'` 且 UI 显性呈现"需要登录"。**夹具：无 token 时 `!== 'admin' && !== 'ga'`** | ⛔ B hold；已登记待 B 开工 |
| **R6** | `LoginPanel` 挂载 = **`App.tsx` 顶层门**，放在 app-body **外层**、保留 TitleBar（无边框窗口要能拖动/关闭）。顺序 = 登录 → LLM 向导(D575) → 主界面。**外加硬要求：LoginPanel 必须含注册入口**（`POST /api/auth/register` 在白名单内可达），否则新装机用户没账号又进不了门 = **被锁死** | ⛔ B hold；已登记待 B 开工 |

### §13-1 口径追认（CTO）

§八-6「三条 fetch 坐标三方值」= **三条待核对坐标 × 三方值**（派单件声明 / ls-remote / 本地检出）。**队长与 verifier 的做法正确，无需重做；错的是派单措辞。**

### §13-2 两处必须订正 → 处置

| # | CTO 订正 | 处置 |
|---|---|---|
| ① | §4 B-② 把 `LeftPanel.tsx:63` 标"非白名单"——它打 `/api/ga/clients`，**在白名单里**；`useStreaming.ts:303` 打 `/api/diagnosis/consult`，**也在白名单**。要求**重跑 15 点清单、逐点标 whitelist/非 whitelist，以那张表写覆盖面** | ✅ **已交回：§4-补**（15 点逐点实测 + 分类 + 重写覆盖面结论）。**重跑结果比原判更严重：15 点中仅 3 点受门禁、12 点免认证** |
| ② | §7-12 覆盖面裁定：**只保证 apiFetch 链 + 诚实登记**，渲染层统一封装另立卡 | ✅ 已写入 §4-补-结论 + §7-12 更新；**本表已交回，B 的前提满足**（仍待 D949 落地） |

### §13-3 三项纪律（登记，不追溯，均记正向）

1. **编制 5 人 vs 预设上限 4**：**派单为准**。
2. **`reviewer` 直提 3 commit 到队长分支**：登记；后续收紧为「**成员产出交队长提交**」。**已执行**：`T-V-slice-a.md` 与 `REVIEW-EXEC.md` 由队长统一 commit + push（`d22506e0`）。
3. **PLAN 编码事故 + 前向修正**：处置正确（不 force push、事故写进 §0）；**新增纪律——中文 UTF-8 文件禁 PowerShell 管道原地改写，一律走 edit 工具**。

### §13-5 Windows 抓取判据的三个编码/计数陷阱（**两名成员各踩一次后固化**；建议升为团队工具链纪律）

> 来源：队长（PLAN 编码事故）+ `reviewer`（两处自误，已入 `REVIEW-EXEC.md §11`）。**同一类坑本卡内已出现 3 次** ⇒ 按「同类第二次立即升级」升级登记，**建议 CTO 批准落 `docs/tools.md`**（`reviewer` 已备好可粘贴条目，但该文件**不存在且在其写集外**，未擅自创建）。

| # | 坑 | 症状 | 正确姿势 |
|---|---|---|---|
| 1 | **PowerShell `>` 重定向写 UTF-16LE** | `python … --emit-codeowners > /tmp/x` 后比对得 6326 B vs 3420 B（≈1.85× 恰为 UTF-16 膨胀）⇒ **误判「CODEOWNERS 漂移」**。队长比 CODEOWNERS 时同样假报漂移 | 用 **Git bash 的 `>`** 或 Python 捕获 stdout 原始字节后 `read_bytes()` 比较；**禁用** PowerShell `>` |
| 2 | **`Measure-Object -Line` 漏算空行** | `git show <ref>:tests/routes/auth.test.ts \| Measure-Object -Line` → 44，真值 **50** ⇒ `reviewer` 一度误判 PLAN P20 有错（已撤回） | `[System.IO.File]::ReadAllText()` 按 `` `n `` 计数，或 Python `read().split(b'\n')` |
| 3 | **`Get-Content` 默认编码读中文源码** | 输出 mojibake（如 `缁撹锛堟湰浠朵笉鍒ゃ€岄€氳繃`），并可能按行错位 | `-Encoding utf8` / `ReadAllText($p,[Text.Encoding]::UTF8)` |
| 附 | **CRLF/LF 混合 + 变异锚点带 `\n`** | code-a 首轮 M1/M3 **静默没落地却报绿**（`auth.ts` CRLF=534、`routes/auth.ts` CRLF=313；`rbac.ts`/`workspaces-api.ts` 是 LF） | 变异脚本一律 `ReadAllText`+`Replace`+**落地后断言**（内容比较），禁只靠锚点；verifier 已用内容比较复现 |
| 附 | **PowerShell 管道污染退出码** | 绿腿进程 `$LASTEXITCODE` 变 1 | `cmd *> file` 后单独读 `$LASTEXITCODE` |

**固化建议（供 CTO 裁）**：字节级/行数级判据一律走 **Python 或 Git bash 原生重定向**；禁用 PowerShell `>` 与 `Measure-Object -Line` 作判据。

### §13-6 A6 口径偏差（**须 CTO 一句确认，否则 K3 按派单字面核验可能判不成立**）

| 面 | 对「自报**兜底**复活」(M3b) | 对「自报**优先/覆盖验签身份**」(M3c) |
|---|---|---|
| **单元级**（`rbac` 断言） | **可红**（verifier 实测 9 红） | 可红 |
| **HTTP 面**（`d948-department-visibility.test.ts` 两条） | **构造性无判别力（全绿）** | **有判别力**（夹具 `:425-443`：有效 Bearer staff + 自报 admin → 断言 role 仍是 staff）；`reviewer` 建议加 M3c 实跑取证，**该推断 reviewer 未实跑** |

⇒ 回执必须写明：**A6 的判别主体在单元级；HTTP 面为互补面**，并对"兜底类"变异体无判别力。**请 CTO 确认此口径**（或要求补 M3c 实跑证据）。

### §13-7 复核订正（verifier 措辞，结论不变）

`verifier` 报「bypass.log 无 `detected-bypass` 行」——**措辞不准确**：全文件**有 19 条历史行**，但 base 与两个 HEAD 的计数**恒为 19 ⇒ 本卡零新增**。`reviewer` 已订正。**结论（无 `--no-verify` 绕过）不变**，口径以本条为准。

### §13-8 K3 审计发现处置（2026-09-25）

**M-1｜A5b 变异计数失真（16 → 18）—— 队长订正，并给出完整三方对账**

**根因（我方过错）**：回执与 PLAN 写了**不带口径的裸数字**「M5 `|| role==='manager'` → **16 failed**」，违反「计数必须带**命令 + 口径 + 截至时刻**」。该 16 系**转述 code-a 自述**，且其变异点/HEAD/文件集与 K3 的**都不同** ⇒ 不可比。

**三方对账（全部含变异点 + HEAD + 文件集 + 结果）**：

| # | 变异点（file:line） | HEAD | 文件集 | 结果 | 来源 |
|---|---|---|---|---|---|
| ① | `rbac.ts:292` `canAccessWorkspace` 部门分支 + `\|\| role==='manager'` | `e551dc83`（**B-1 前**，141 用例） | 4 靶向 | **16 failed** | code-a 自述（**队长未独立复测**，即回执数字来源） |
| ② | **`rbac.ts:318` `canModifyWorkspace`** 部门分支 + `\|\| (ctx.role as string)==='manager'` | `59f52e3a`（**B-1 后**，145 用例） | 4 靶向 | **18 failed / 127 passed** | **K3**（`k3_audit.not_established` M-1）——**队长本轮按 K3 原文口径独立复跑，结果完全一致** |
| ③ | `rbac.ts:292` `canAccessWorkspace` 部门分支 + `\|\| role==='manager'` | `59f52e3a`（B-1 后，145 用例） | 4 靶向 | **20 failed / 125 passed** | 队长本轮实测（命令见下） |

**同点跨 HEAD 自洽性检验**：① 与 ③ 是**同一变异点**，差异仅"B-1 新增 4 条断言" ⇒ **16 + 4 = 20** ✅ 闭合（实测 B-1 组 4 条在该变异下**全部变红**）。
**② 与 ③ 不可直接比较**：② 打的是 `canModifyWorkspace`（:318）、③ 打的是 `canAccessWorkspace`（:292）——**两个不同函数**。

**⇒ 订正**：本卡 A5b 变异红态数字，**凡引用 K3 口径处一律用 18**（②）；引用`canAccessWorkspace` 口径处用 20（③）；**裸写"16 failed"作废**（其真实含义 = ①，即 B-1 前、`canAccessWorkspace` 口径）。**下游勿以 16/18 作回归基线**（三数各自绑定变异点与 HEAD）。

**复跑命令（可核）**：`python` 内容级变异（断言 `OCCURRENCES==1` 且 `MUTATION_LANDED==True`）→ `npx vitest run` 4 靶向文件 → `git checkout -- src/middleware/rbac.ts` → 复原 `SHA=273B787BF267214E`（逐字节一致）+ `porcelain` 空。**两次变异均已复原自证**。

**M-6｜越权分支与建议件非逐字** —— 已处置：在 D1001 建议件新增 **§1-补** 逐项声明差异（**规则本体逐字相同**；差异只在 `source` 与注释，且 `source` 差异**为改号规则所强制**——旧号不得进入新产物）。

**关联口径偏差（K3 登记，属正常前进）**：回执写证据分支 HEAD = `13688938`，其后又前进至 `c14c1f45`（D1001 建议件入库）。**以 `c14c1f45` 及后续为准**。

### §13-4 放行范围

| 项 | 状态 |
|---|---|
| **PR-1 切片 A**（win，8 文件，base `ef5c8caa`） | ✅ **立即开工**（task-6 已派 code-a） |
| **D949 P0-a+ 治理**（mac，3 件 + 卡片，base `origin/main@6a714483`） | ✅ **立即开工**（task-7 已派 code-b）；**它是 B 的前置** |
| **PR-2 切片 B** | ⛔ **hold**：等 **D949 落地 + §4-补 表交回**（表已交回，尚差 D949） |

**基准纪律（不改）**：回执 `git diff --stat` 必须写明基准——**切片 A 用 `ef5c8caa`；其余用合后 `origin/main`**；**禁用本地 `main`**。

**功能回退登记（口径已批）**：D948 交付登记为「**功能回退（部分恢复，未闭环）**」——W1 `department` 无生产写入者 / W2 `/mine` 恒 404 / W3 桌面无部门工作区消费点。**严禁**写成"已知限制"或"部门可见性已可用"。**派单 §一 症状表第 3 行已作废**（实测是页面永停加载态）。
