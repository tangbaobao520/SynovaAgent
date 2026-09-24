# D948 切片 A — 实现落点与夹具设计侦察（PLAN 输入）

> 出件：D948 小队 code-a（切片 A 编码者，win 域）｜ 2026-09-24 ｜ 阶段：**第 0 阶段 PLAN（未写任何产品代码/测试代码）**
> 本件性质：**侦察输入 + 落点草案**，不是实现、不是自验结论。判据红色/绿色一律未运行（见 §9 未能证实项）。
> 唯一写文件：本文件。其余操作全部为只读（`git grep` / `git ls-remote` / 读文件）。

---

## 0. 口径与回执（全部为命令原始输出）

### 0.1 工作树与 ref

```
$ cd .synova-wt-d948-server; git rev-parse HEAD; git rev-parse --abbrev-ref HEAD; git status --porcelain
ef5c8caaf8689cd41ab551495efcd002fb6d4e5f
feat/d948-identity-chain-server
(空 — 工作树干净，零未提交改动)
```

```
$ git log --oneline -1 ef5c8caa
ef5c8caa chore: bypass COMMITTED 登记 (auto hook, D521)
```

### 0.2 ls-remote 回执（origin）

```
$ git ls-remote --heads origin | grep -E "d947|d948"
9490fd096e6d6ee5baf520797865fb0e1ebce3d9	refs/heads/docs/d947-win-dispatch
df9dc5edcaa753830c80c2a3050a27d2d6d21bd8	refs/heads/docs/d948-identity-chain-dispatch
ef5c8caaf8689cd41ab551495efcd002fb6d4e5f	refs/heads/feat/d947-middleware-default-posture
e65b2d9470876023a84bb6bfd72791e49bdde2e1	refs/heads/feat/mac-d717-product-debt
```

- base `ef5c8caa` = `origin/feat/d947-middleware-default-posture` tip ✅ 与派单件 §七 一致。
- 派单件 §0 声称 `origin/docs/d948-identity-chain-dispatch` tip = `df9dc5ed` ✅ 成立。
- **`refs/heads/feat/d948-identity-chain-server` 在 origin 上不存在**（本分支尚未推送；PLAN 阶段预期，登记备查）。
- 派单件执行版本核对：`.synova-wt-d948-dispatch` HEAD = `df9dc5ed` 且 `git status --porcelain` 为空 ⇒ 我读到的派单件内容 = origin 版（blob `b338b6b44a8f1601b541855dee31dfdff5969d23`）。

### 0.3 派单件取读

`D:\novis-backup-20260526\Novis\synova-agent\.synova-wt-d948-dispatch\docs\synova\dispatch\D948-win-identity-chain-department-20260924.md`（244 行，全读）。

---

## 1. 前提冻结复核（队长给的 6 条背景 + 派生前提，逐条实测）

| # | 前提（来源） | 复核命令 | 原始输出摘要 | 结论 |
|---|---|---|---|---|
| P1 | `src/middleware/auth.ts` 的 `JwtPayload`(:26-33) 与 `AuthRequestContext`(:35-39) 均无 `department`；全文 `department` 命中 0 | `git grep -c "department" -- src/middleware/auth.ts` | `exit=1`（零命中） | **成立**（:26-33 / :35-39 逐行核对一致） |
| P2 | 自报头显式拒绝分支在 `:501-506`，D947-RULINGS.md:109 硬要求保留 | 读 `auth.ts:499-511`；读 `D947-RULINGS.md:106-109` | `:503 if (req.headers?.['x-synova-token'] !== undefined) {` / `:504-507 log.warn(AUTH_REJECTED …)` / `:508 }` | **成立（区间略偏）**：实际 if 在 **:503**，块止于 **:508**（:501-502 为注释）。RULINGS 引用的「实测 `:470`」为**旧坐标漂移**，实体要求（保留该分支）不变 |
| P3 | `rbac.ts` `extractRbacContext`(:119-132) 的 JWT 分支 :127 写死 `department: undefined`（派单件写 104-105 = 行号漂移）；`isSameDepartment` :231-237；部门判据 :287 / :313 | 读 `rbac.ts` 全文 323 行 | `:124 if (req.auth) {` / `:127 department: undefined,` / `:231-237 isSameDepartment` / `:287` / `:313` | **成立**：:119-140 为函数体（队长给 :119-132 略窄）；:127 ✅；:231-237 ✅；:287 ✅；:313 ✅。**派单件 §三 的 104-105 确为漂移**（实测 :127） |
| P4 | `routes/auth.ts` 三处签发 register :97 / login :134 / refresh :176；内存回退 `users` Map(:30) 的 `UserRecord`(:25-29) 无 department，:94 写入不带 | 读 `routes/auth.ts` 全文 293 行 | `:97` / `:134` / `:176` 三处 `signJwtToken(`；`:25-29` 无 department；`:94 users.set(...)` 无 department | **成立**（三条全部命中；refresh 确为派单件未记载的第三个签发点 → A7） |
| P5 | `user-store.ts`：`UserRecord.department?: string`(:37)、`createUser(..., extra?)`(:75-81)、:99 `department: extra?.department \|\| ''` | 读 `user-store.ts` 全文 271 行 | `:37 department?: string;` / `:80 extra?: { …; department?: string; … }` / `:99 department: extra?.department \|\| '',` | **成立** |
| P6 | `workspaces-api.ts`：store 模块级 `new Map`(:90) **无导出测试钩子**；`POST /api/workspaces`(:99-124) 只产 `visibility:'global'`；唯一产 `department` 的是 `POST /:id/sub`(:219-251)；`GET /mine`(:264-291) 用 `dept = rbac.department`(:278)，非 admin 过滤 :285-287 | 读 `workspaces-api.ts` 全文 343 行 | `:90 const store = new Map<string, Workspace>();` / `:119 visibility: 'global',` / `:219 router.post('/api/workspaces/:id/sub'`（块 :219-252）/ `:244 visibility: 'department',` / `:278 const dept = rbac.department;` / `:285-287` 过滤三或 | **成立**（`export default router` 为唯一导出，:343；`readRbac`/`requireVerifiedRbac` 为模块私有） |
| P7 | 挂载序 `server.ts` jwtAuthMiddleware(:344) → rbacMiddleware(:366) → workspacesApiRoutes(:380)；`readRbac` 取 `req.rbac`(:32-34) | 读 `server.ts:330-399`；读 `workspaces-api.ts:32-34` | `:344 app.use(jwtAuthMiddleware);` / `:366 app.use(rbacMiddleware);` / `:380 app.use(workspacesApiRoutes);` | **成立**（三点位逐一命中） |
| P8 | `vitest.config.ts:58-63` 全局 `env.DEV_MODE='true'`；N1 硬前置模板 `tests/middleware/auth.test.ts:58-61` | 读 `vitest.config.ts` 65 行；读 `auth.test.ts:53-62` | `:58-63 env: { DEV_MODE: 'true', PORT: '3099', SYNOVA_DB_PATH: ':memory:', SYNOVA_SKIP_MCP: '1' }`；`auth.test.ts:57-62 beforeAll` 四条语句 | **成立**（:58-63 ✅；模板四条语句恰在 :58-61 ✅） |
| P9 | `tests/routes/auth.test.ts` 现为 50 行桩（只断路由注册）；`diagnosis-report-persistence.test.ts:37-42`（N1）+ `:197-215`（express + listen(0) + fetch）为真实 HTTP 模板 | 读 `tests/routes/auth.test.ts`（50 行）；读 diagnosis 测试头/中段 | auth.test.ts 5 个用例，全部 `.stack.find(...)` 路由注册断言，零 HTTP、零 payload 断言；diagnosis :37-42 N1 ✅、:197-215 `express()`+`listen(0)`+`waitListening` ✅ | **成立** |
| P10 | （派生）`department` 在 `src/` 全量命中数 | `git grep -n "department" -- src \| Measure-Object` | `src lines: 104`（25 文件，逐文件计数见 §10.2） | 登记（供冲突扫描用） |

**P1–P9 全部成立，无一条不成立。** 三条行号漂移已标注（P2 的 `:470`、P3 覆盖派单件 :104-105、P3 函数体区间）。

---

## 2. Q1 — A1–A7 判据 → 实现落点表

### 2.1 透传链分解：哪些环节「改类型即自动生效」，哪些必须显式改

| 环节 | file:line | 加 `department?: string` 后 | 依据 |
|---|---|---|---|
| `JwtPayload` 类型 | `auth.ts:26-33` | 增字段（源头） | — |
| `signJwtToken` 入参 | `auth.ts:146-148` | **自动**：`Omit<JwtPayload,'iat'\|'jti'\|'exp'>` 继承新字段；因**可选**，既有调用点零破坏（tsc 不会报错） | 读 :146-148 |
| 签发落 payload | `auth.ts:155-160` | **自动**：`{...payload}` 展开即带；`department: undefined` 时 `JSON.stringify` **省略该键**（token 内无该字段） | 读 :155-162 |
| `verifyJwtToken` 必填校验 | `auth.ts:217` | **自动**：只校验 `sub/role/jti`，新增可选字段不被拦 | 读 :217-219 |
| 非白名单注入 | `auth.ts:419` | **自动**：注入整份 `result.payload` | 读 :419 |
| 白名单分支注入 | `auth.ts:330-331` | **自动**：同上（D947/L-20 新增路径） | 读 :323-346 |
| DEV_MODE 逃生口 | `auth.ts:355-363` | **必须显式决定**：dev-admin 字面量 payload **无 department 键**（现状即 fail-closed）；PLAN 建议**不动**（N1 已关掉该路径） | 读 :348-365 |
| `AuthRequestContext` 类型 | `auth.ts:35-39` | 增字段 | — |
| `extractAuthFromRequest` 返回体 | `auth.ts:493-499` | **必须显式改**（否则新字段是死字段：类型声明了、运行时永不填） | 读 :488-511 |
| `extractRbacContext` 入参内联类型 | `rbac.ts:122` | **必须显式改**（否则 `:127` 引用 `.department` 编译不过 —— 该入参是**结构化内联类型**，不是 `JwtPayload`） | 读 :119-123 |
| `extractRbacContext` 返回 | `rbac.ts:127` | **必须显式改**（断点本体） | 读 :124-132 |
| 消费端 | `rbac.ts:287` / `:313`、`workspaces-api.ts:278` / `:285-287` | **自动**（已消费 `ctx.department` / `rbac.department`，零改动） | 读两处 |
| 三处签发 | `routes/auth.ts:97` / `:134` / `:176` | **必须显式改**（数据源各不相同） | 读三处 |
| 本地 `UserRecord` 接口 | `routes/auth.ts:25-29` | **必须显式改**：login 的 `foundUser` 静态类型即此接口（无 `department`）；`queryByEmail(email) as UserRecord \| null`（:122-124）是既有断言 | 读 :25-31、:119-127 |

> ⚠️ **设计要点（供 PLAN 採纳）**：`department` **必须保持可选**——A5 要求「合法 JWT 但无 department」是**合法凭证**，若设成必填则 tsc 会强制所有签发点带值、并把「无部门合法 token」变成类型上不可表达。**代价：编译器无法作为「签发漏带 department」的门禁**，因此派单件 §二 决策 3（夹具直接解码 payload 断言）是**唯一可用**的门禁形态 —— 这与决策 3 完全自洽，不宜试图用 tsc 替代夹具。

### 2.2 逐判据落点 + 改前/改后草稿

**A1 — login 签发带 department**（落点 `src/routes/auth.ts:134`，前置 `:25-29`）

```diff
 // :25-29 本地接口（照 UserStore.UserRecord 补齐）
 interface UserRecord {
   userId: string; email: string; passwordHash: string; role: string; orgId: string;
   status: 'active' | 'disabled'; createdAt: string;
+  department?: string;
   phone?: string; wechatId?: string;
 }
```
```diff
-// :134
-const token = signJwtToken({ sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId });
+// :134（draft — 空串归一为 undefined，见 §8-F5）
+const token = signJwtToken({
+  sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId,
+  department: foundUser.department || undefined,
+});
```
- 备选（不归一）：`department: foundUser.department` —— 空串会进 token。**两者在 A5 边界上都 fail-closed**（`isSameDepartment` 要求 `length > 0`，`rbac.ts:231-237`），差别只在 token 载荷整洁度与夹具边界断言的写法。
- 夹具断言点：**解码 token payload**（不看 HTTP 200、不看响应体）——响应体 `:139` 的 `payload` 字段不含 department，不要误断言它。

**A2 — JWT 分支返回真实部门**（落点 `src/middleware/rbac.ts:122` + `:127`）

```diff
 // :122 入参内联类型
   auth?: { sub: string; role: string; orgId: string; gaConstraints?: GAConstraints };
+  // → auth?: { sub: string; role: string; orgId: string; department?: string; gaConstraints?: GAConstraints };
```
```diff
-// :127
-department: undefined,
+// :127
+department: req.auth.department,
```
- 夹具断言点（派单件 A2 原文）：`extractRbacContext({ auth: { sub, role:'manager', orgId, department:'marketing' } }).department === 'marketing'`。

**A3 / A4 — 部门可见性（消费端已就绪，无 src 落点）**
- **关键结论：A3/A4 在本卡中没有 src 落点**。`workspaces-api.ts:278/:285-287` 已经是「消费 `rbac.department`」的形态，`canAccessWorkspace/canModifyWorkspace` 的部门判据（`rbac.ts:287/:313`）也已就绪。A3/A4 的实质角色是 **A2（+A1）的端到端判别性夹具**——「删掉 `:127` 的改动即报红」。
- ⇒ 若有人把 A3/A4 读成「需要改 workspaces-api.ts」，那是误读；**该文件不在写集**，且本卡不应扩写集（派单件 §五 明示）。
- ⚠️ 但 A3/A4 的「真 HTTP 访问 `GET /api/workspaces/mine`」在本卡写集内**不可实现** —— 见 §3.2（F-1 阻断）。

**A5 — 默认拒绝不回退**（无 src 落点，纯判据/夹具）
- 需固定的事实：`rbac.ts:231-237` 的非空串要求 + `:287`/`:313` 的 `|| role === 'admin'` 旁路**不得新增 manager 旁路**。
- 夹具三形态：①无 department 的合法 JWT + `visibility:'department'` 工作区 → `canAccessWorkspace === false` **且** `canModifyWorkspace === false`；②空串 department（`''`）→ 同上；③对照：同部门 → true（防「恒 false 假绿」）。

**A6 — 自报头零复活**（无 src 落点，**分支必须原样保留**，`auth.ts:503-508`）
- 既有判别性夹具**已存在**（无需新建，只需保留 + 按判据原文补 `admin:marketing:u1` 形态）：
  - `tests/middleware/auth.test.ts:434-437`（`extractAuthFromRequest` + 自报 admin → null）
  - `tests/middleware/auth.test.ts:620-625`（白名单 + 仅自报头 → 不注入，L-20 路径）
  - `tests/middleware/rbac.test.ts:34-38`（`extractRbacContext` 自报 admin → role ≠ admin）
  - `tests/middleware/rbac-default-deny.test.ts:107-113`（自报 manager 带部门 → `ctx.department` 必须 undefined）
  - 留痕断言模板：`auth.test.ts:25-41`（`vi.mock('@synova/logger')` + `codesSince(mark)`），`rbac-default-deny.test.ts:120-127`（`RBAC_DENIED` 计数断言）
- ⚠️ **陷阱（必须写进 PLAN）**：不要用「非白名单路径 + 仅自报头 → 401」当 A6 的判别性夹具 —— 该 401 由 `jwtAuthMiddleware:369-380`（缺 Bearer）产生，**与自报分支是否复活无关**，属「接线了≠被执行」型假判据。真判别夹具要么走**单元级**（上面四条），要么走**白名单路径 + 路由内 requireAuth**（`GET /api/solutions`，先例 `diagnosis-report-persistence.test.ts:351-375` 与 D947-RULINGS L-18）。

**A7 — refresh 不丢部门**（落点 `src/routes/auth.ts:176-180`）

```diff
-const newToken = signJwtToken({
-  sub: result.payload.sub,
-  role: result.payload.role,
-  orgId: result.payload.orgId,
-});
+const newToken = signJwtToken({
+  sub: result.payload.sub,
+  role: result.payload.role,
+  orgId: result.payload.orgId,
+  department: result.payload.department,
+});
```
- 旧 token 无 department → 新 token 该键省略（`JSON.stringify` 行为）→ fail-closed 保持（对应未决项 ②）。
- 夹具：真 HTTP `POST /api/auth/refresh`（`isWhitelisted` 含？**注意**：`/api/auth/refresh` **不在白名单**（`auth.ts:107-108` 只有 login/register）⇒ refresh 请求会被 `jwtAuthMiddleware` 先拦 401。**夹具必须带 `Authorization: Bearer <旧 token>`**（或把 token 放 body 同时仍带 Bearer），这是易踩坑点。

**register（`routes/auth.ts:97`）—— 取决于未决项 ①，本件不预设**

```diff
-// :68-69 入参
-const { email, phone, wechatId, password, role, orgId } = req.body as { … };
+const { email, phone, wechatId, password, role, orgId, department } = req.body as { …; department?: string };
-// :89（UserStore 路径）
-const result = await registerUs.createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId });
+const result = await registerUs.createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId, department });
-// :94（内存回退路径）
-users.set(finalUserId, { userId: finalUserId, email: finalEmail, passwordHash, role: userRole, orgId: userOrgId, status: 'active', createdAt: new Date().toISOString() });
+users.set(finalUserId, { …同上…, department, status: 'active', createdAt: new Date().toISOString() });
-// :97
-const token = signJwtToken({ sub: finalUserId, role: userRole, orgId: userOrgId });
+const token = signJwtToken({ sub: finalUserId, role: userRole, orgId: userOrgId, department: department || undefined });
```
（以上为「若 CTO 选 ①-b」的完整草稿；选 ①-a 则 register 只改 `:97` 签 `department: undefined`，其余不动。）

---

## 3. Q2 — A3/A4 夹具可行性：播种路径与一条硬阻断

### 3.1 播种路径（真 HTTP，不改写集外文件）

已由既有夹具证明可行（`tests/routes/workspace-access-write-endpoint.test.ts:159-187`，D947 产物）：

```
① admin JWT  → POST /api/workspaces {title}                      → parent（visibility: 'global'，owner=admin）
② admin JWT  → POST /api/workspaces/{parent}/sub {department:'marketing', title}  → subMkt（visibility:'department'）
③ admin JWT  → POST /api/workspaces/{parent}/sub {department:'production', title} → subProd
```
判据可满足性核对：
- ①的守卫是 `canModifyWorkspace(rbac, { owner: rbac.userId })`（`workspaces-api.ts:104`）→ admin 在 `:308` 直接 true ✅
- ②③的守卫绑定**父工作区**（`:228`）→ 父为 admin 属主 → `:308` true ✅（**不需要** manager 建 sub）
- 与管理 token（department='marketing'）对 `/mine` 的可见性：`w.department === dept` 命中 ②（`:285-287`）✅
- 异部门 manager（department='production'）对 ② 不命中；对 ③ 命中 → **A4 断言必须精确到「不含 subMkt / 不含 department==='marketing' 的条目」，不得断言「列表为空」**——因为 parent 是 `visibility:'global'`，而过滤条件含 `|| w.visibility === 'global'`（`:286`）⇒ **两个部门的 manager 都会看到 parent**。这是本夹具最容易写假的地方。

⚠️ **id 碰撞风险（实测风险，非推测）**：`workspaces-api.ts:111` 与 `:235` 用 `ws_${Date.now().toString(36)}` / `ws_sub_${Date.now().toString(36)}` 生成 id。父（`ws_`）与子（`ws_sub_`）前缀不同不会撞；**连续两个 sub 若落在同一毫秒则后者覆盖前者**（同一 Map）。夹具须：②③ 之间做一次 await/往返（HTTP 往返本身通常 >1ms，但**不可假设**），或**断言两个 sub 的 id 不同**并在不同则立即判夹具构造失败。建议在 PLAN 里显式写死这条「夹具自证」断言。

### 3.2 ⛔ F-1（阻断项）：`GET /api/workspaces/mine` 在 HTTP 面被 `/:id` 遮蔽 → 恒 404

- 静态事实（我亲核）：`workspaces-api.ts:126` 注册 `router.get('/api/workspaces/:id')`，**早于** `:264` 的 `router.get('/api/workspaces/mine')`。Express 顺序匹配 ⇒ `GET /api/workspaces/mine` 命中 `:id`（id='mine'）→ `store.get('mine')` 为 undefined → `:129` 返回 `404 {error:'workspace not found'}`。
- 运行期事实（第三方证据，非我亲跑）：`tests/routes/workspace-access-write-endpoint.test.ts:425-432` 是 D947 登记的**现状锁定断言**，注释 `:326-336` 载明「CTO 已裁定 (b)：本卡不修 ordering（修之会使 `/conflicts` 由 404 变可达 = 可达面扩张，须另立卡）」，并把该缺陷记为 **F-1**。
- ⇒ 后果：派单件判据 A3/A4 的字面形态「**JWT 访问 `GET /api/workspaces/mine`**」在切片 A 写集内**不可用真 HTTP 实现**（写集不含 `workspaces-api.ts`）。

**三条可选路径（不自行定夺，给选项 + 推荐）**

| 选项 | 做法 | 代价/风险 | 推荐度 |
|---|---|---|---|
| **(a) 直接 handler 探针（D947 同款先例）** | 复用 `workspace-access-write-endpoint.test.ts:339-366` 的 `loadMineHandler()`（从 router.stack 取 handler）+ 假 res 调用 | 属**运行时**探针（非 grep），D947 已有先例；但若 `req.rbac` 由夹具**合成**，则绕过「JWT→req.rbac」整段接线 ⇒ 弱 | ★★★ |
| **(a+) 链式捕获探针（推荐，a 的强化版）** | 起真实 express：`express.json()` + `jwtAuthMiddleware` + `rbacMiddleware` + 一条捕获路由 → 真 fetch 带 manager JWT → **捕获经真实中间件注入的 `req`** → 再把它喂给 `loadMineHandler()` 得到的 handler | 消除「合成 rbac」的接线盲点；比 (a) 多约 20 行夹具 | ★★★★ |
| **(b) 用 `GET /api/workspaces/:id/context` 作 HTTP 腿** | 该端点在 HTTP 面**可达**（段数不同，无遮蔽），内部 `extractRbacContext(req)`（`:206`）+ `canAccessWorkspace`（`:207`）——**与 A3/A4 同一条部门判据链** | 它不测 `/mine` 的过滤表达式（`:285-287`），只测判据函数；作为**HTTP 腿**与 (a+) 组合最完整 | ★★★★ |
| (c) 扩写集修 ordering | 改 `workspaces-api.ts` 注册顺序 | **越界**：写集外 + 会把 `/conflicts` 由 404 变可达（可达面扩张，D947 已明确须另立卡），且必须同步翻转 `:425-432` 的登记断言（又一个写集外文件） | ✗ 不建议 |

**我的推荐：A3/A4 = (a+) ＋ (b) 双腿**：
- 腿 1（判据函数级、真 HTTP）：`GET /api/workspaces/{subMkt}/context` — 同部门 manager → 200；异部门 manager → 403；无 department manager → 403；admin → 200。
- 腿 2（过滤表达式级、真 HTTP 身份 + 直接 handler）：链式捕获探针 → 喂 `/mine` handler — body.department === 'marketing' 且 ids 含 subMkt（A3）；异部门 manager → 不含 subMkt（A4）。
- 并在 PLAN 的未清项里登记 **F-1 未清（本卡不修，随 D947 裁定）**，以及「A3/A4 的字面形态与实现形态之差异」由 CTO 追认。

**另一条 HTTP 腿（写路径，可选加强）**：`PUT /api/workspaces/{subMkt}/status`（`:133-168`，无遮蔽）——同部门 manager → 期望 **200**（`canModifyWorkspace:313` 命中）；异部门 → 403。⚠️ 注意该端点当前被既有夹具 `:235-243` 锁定为「非属主 manager + 部门级 ws → **403（功能回退已登记）**」；D948 落地后**同部门** manager 必须变 200，而异部门仍 403（那条断言用无 department 的 token，**不受影响**，见 §10.3）。

---

## 4. Q3 — 夹具挂载序与模板可复用度

### 4.1 两档挂法（按判据最小化）

| 档 | 用途 | 挂载 | 成本 |
|---|---|---|---|
| **轻档** | A1 / A7（签发链；login 在白名单，refresh 需 Bearer） | `express.json()` → `jwtAuthMiddleware` → `authRoutes` + `listen(0)` + 真实 fetch | 低（无 `createServer()`，无 DB） |
| **身份链档** | A2 / A5（可单元）/ A3 / A4 / A6 | `express.json()` → `jwtAuthMiddleware` → `rbacMiddleware` → `workspacesApiRoutes`（+捕获路由） | 低—中（仍无需 `createServer()`） |

**不要用 `createServer()`（`src/server.ts`）做本切片夹具**：既有夹具注释载明其 bootstrap 实测 ≈15s（`workspace-access-write-endpoint.test.ts:122-126`，需 `beforeAll` 超时抬到 60s）；本切片判据全部可由上述两档覆盖，规避 15s/文件的成本与并发压力。

### 4.2 模板可复用度核对（逐份）

| 模板 | 可复用部分 | 不可复用/需改 |
|---|---|---|
| `tests/routes/enterprise.test.ts` | **A1/A7 首选模板**：`:50-75` `class InMemoryGraphStore implements GraphStoreLike`（`createNode` 原样存 props ⇒ `department` 天然透传，非 mock 管线）；`:178-197` `new UserStore(new InMemoryGraphStore())` + `authSetUserStore(userStore)`（`:181`，`setUserStore` 由 `routes/auth.ts:57` 导出）+ `express()`+`jwtAuthMiddleware`+`authRoutes`+`listen(0)` | 无需改；仅需在 `createUser(..., { department })` 传第 5 参 |
| `tests/routes/diagnosis-report-persistence.test.ts` | `:37-42` N1 形态；`:197-215` app+`listen(0)`+`waitListening`；`:351-375` 「白名单端点 + 路由内 requireAuth」的自报头判别先例 | 它的 `waitListening`/`express` 骨架可直接抄 |
| `tests/routes/workspace-access-write-endpoint.test.ts` | `:47-51` `jwt(sub, role)` 帮助函数（**需扩为 `jwt(sub, role, dept?)`**）；`:62-104` 真实 fetch + body 读取工具；`:159-188` 播种序列；`:339-366` `loadMineHandler()`/`callMine()` 直接 handler 探针 | `:373-432` 的 P0 组结论（自报身份失效）**不要照搬**；`:425-432` 是现状锁定断言（F-1），改动它会误导 |
| `tests/middleware/auth.test.ts` | `:25-41` logger mock + `codesSince()`（留痕判据）；`:57-62` N1；`:413-464` `extractAuthFromRequest` 用例组；`:478-491` 三态 401+留痕 | 文件 664 行、含大量 D947 断言 —— 只做**增量追加**，不要重排 |
| `tests/middleware/rbac.test.ts` | `:11-16` N1；`:101/:137/:201/:277` 的 `RbacContext` 构造帮助；A2 的落点断言可加在 `:33-99` 组尾 | 文件 408 行；注意 `:162` 有既有 `as any`（**写集外行，不要碰**；见 §10.4 风险） |
| `tests/middleware/rbac-default-deny.test.ts` | `:120-127` 留痕计数断言（A6 可对齐） | 全部用例走自报 header ⇒ 不随本卡变化 |

---

## 5. Q4 — N1 硬前置落点

- 事实：`vitest.config.ts:58-63` 把 `DEV_MODE='true'` 注入**所有**测试进程 ⇒ 若不就地重设，`jwtAuthMiddleware:348-365` 的 dev-admin 逃生口会在「无 JWT_SECRET」时把任何请求变成 `admin`，判据**静默失效（空转）**。
- 落点（三个夹具文件 + 一处就地重设）：

| 夹具 | N1 位置 | 内容 |
|---|---|---|
| `tests/middleware/auth.test.ts`（A6、extractAuthFromRequest） | `:57-62` 已有 ✅ | 保留原样 |
| `tests/middleware/rbac.test.ts`（A2、A5） | `:11-16` 已有 ✅ | 保留原样 |
| `tests/routes/auth.test.ts`（A1、A7，新建 HTTP 夹具） | 新增 `beforeAll` | `JWT_SECRET='d947-test-secret-0123456789'`（≥16）+ `DEV_MODE='false'` + 两条 `expect` 断言（派单件 §六 N1 模板原文） |
| `tests/routes/workspace-access-write-endpoint.test.ts`（A3/A4 若复用/新建） | `:127-145` 已有 ✅ | 保留原样 |

- 建议在 PLAN 里把 N1 写成**可复制的一小段**（含 `savedEnv` 还原，模板 `:131-134/:190-197`），并要求**每个涉身份夹具**在 `beforeAll` 内自证，否则视为空转、不算通过。
- ⚠️ 反例：若夹具只设 `JWT_SECRET` 而忘了把 `DEV_MODE` 设为非 `'true'`，则当 `getSecret()` 因 key <16 或缺失返回 null 时，dev-admin 分支会静默把请求升为 admin —— 这正是派单件 §六 要求两条**同时**断言的原因，不要只留一条。

---

## 6. Q5 — 未决项（仅给选项 + 推荐，不定夺）

### ① register（`routes/auth.ts:97`）的部门来源 —— 与创始人决策① 的字面冲突

**实测约束（新增事实，比派单件更硬）**：`UserRecord.department` 在**生产链路无写入者**——
```
$ git grep -n "createUser(" -- src
src/growth/user-store.ts:75:  async createUser(                      ← 定义
src/routes/auth.ts:89:      const result = await registerUs.createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId });
src/routes/enterprise.ts:116:    const result = await getUserStore().createUser(finalEmail, password, 'admin', orgId, { phone, wechatId });
src/routes/enterprise.ts:252:    const result = await store.createUser(
src/routes/enterprise.ts:253:      inv.email, password, inv.role as …, inv.orgId,     ← 第 5 参缺省 → extra?.department → ''
$ git grep -n "updateUser(" -- src
src/growth/user-store.ts:218:  updateUser(userId, props: Partial<Pick<UserRecord,'role'|'status'|'displayName'|'department'|'orgId'>>)
src/routes/enterprise.ts:239:      store.updateUser(existing.userId, { orgId: inv.orgId, role: inv.role });
src/routes/enterprise.ts:303:      getUserStore().updateUser(userId, { role: … });
src/routes/enterprise.ts:366:      getUserStore().updateUser(userId, { status: 'active' });
src/routes/enterprise.ts:632:      getUserStore().updateUser(userId, { role: template.id … });
src/services/anomaly-detector.ts:100/115:  this.userStore.updateUser(userId, { status: … });
$ git grep -c "department" -- src/routes/enterprise.ts
(exit=1 — 零命中)
```
⇒ **3 处 `createUser` 无一传 department；6 处生产 `updateUser` 无一设 department；`enterprise.ts` 全文零 `department`** ⇒ 即使 A1/A2 全绿，`department` 生产值恒为 `''`（`user-store.ts:99`）⇒ 部门工作区对任何真实用户**永不命中**（`isSameDepartment` 拒绝空串）。

- **选项 ①-a（推荐）**：register **不从 body 取 department**，`:97` 只签 `department: undefined`。部门落地留给「管理员设置」通道（`UserStore.updateUser` 已支持 `department`，`user-store.ts:218`），该通道的 HTTP 入口**本卡不建 → 另立卡**。合规性：完全符合决策①字面；代价：**本卡交付后用户可见结果仍不可达**（铁律 4/5 未闭合），必须在 PLAN 未清项里**显式登记为功能缺口**，不得写成「已实现部门可见性」。
- **选项 ①-b**：register 从 body 取 `department` 并落库 + 签发（草稿见 §2.2）。代价：与决策①「客户端自报身份完全不允许」**字面冲突**；但需注意 `role` 已经是同一形态（`:78 const userRole = (role as UserProps['role']) || 'staff'`）——即注册端点**已存在**同类自报缺口（§8-F4）。
- **选项 ①-c**：把 department 绑到「邀请」通道（管理员发邀请时指定部门）。代价：`enterprise.ts` 全文零 `department`，邀请单**不带部门字段** ⇒ 需新增字段 + 传参 + 邀请表结构，**超出本卡写集**。

> **我的推荐：①-a + 明确登记缺口 + 建议 CTO 就「部门赋值入口」另立卡。** 理由：本卡性质是「恢复身份链承载字段」（决策 2/3 的 fail-closed 姿态），不是「产品化部门管理」；用 ①-b 换取「看起来能用」会同时违反决策①并把自报缺口扩大到新字段（我在 §8-F4 独立登记了既有 role 缺口）。

### ② refresh（`:151-203`）旧 token 无 department：fail-closed 还是保持 undefined？

- **选项 ②-a（推荐）**：保持 `undefined`（新 token 无该键），**不 fail-closed 拒绝刷新**。依据：无 department 的合法 JWT 在决策②下仍是**合法凭证**（A5 明确「合法 JWT 但无 department」要成立）；refresh 的作用是续期，不是提权。拒绝刷新会把「无部门用户」变成不可续期账户，属**可达性收窄**而非安全收窄（D947/L-20 已确立「可达性不得因凭据缺失而改变」的取向）。
- **选项 ②-b**：旧 token 无 department → 401 fail-closed。代价：① 若 ①-a 落地，**所有现存用户**刷新即被锁死；② 与 A5 的「无 department 是合法凭证」自相矛盾。
- 判据形态建议：A7 断言新 token `department === 'marketing'`（正路径）+ 一条**降级路径**断言「旧 token 无 department → 新 token 无该键且端点仍 200」。

### ③ 内存 Map 回退路径（`:91-95`）登录后的可见性语义

- 事实：`getUserStore()` 返回 null 时走 `users` Map（`:30`），记录**无 department**（`:94`）⇒ 签发 `department: undefined` ⇒ 非 admin 只能看 `owner===自己` 或 `global`（`workspaces-api.ts:285-287`）。
- **选项 ③-a（推荐）**：**保持 undefined + 明确登记为「内存回退 = 无部门身份」**，并在夹具里把该路径的行为固定成断言（降级路径判据）。理由：这是 fail-closed 侧（不是放行侧），且「回退路径」本身是 SQLite 不可用时的降级态，不应承载部门语义。
- **选项 ③-b**：在 `:94` 也写 `department`（需先选 ①-b）。代价：与 user-store 路径行为**不一致**（graph 路径 `''`、memory 路径 `'x'`），制造两条语义分叉。
- **选项 ③-c**：内存回退时 `log.warn + degraded` 标记（对齐铁律 11/24/31：降级必须留痕）。这是**独立于 a/b** 的补强，建议采纳（无论选 a 还是 b），但它属新增行为，需 CTO 认可是否纳入本卡写集（`routes/auth.ts` 在写集内，可行）。

### ④ `tests/routes/auth.test.ts` 夹具形态

- 现状：50 行、5 个用例，全部是 `authRoutes.stack.find(...)` 路由注册断言 ⇒ 对 A1 **零判别力**（把 `:134` 改回三字段，此文件**仍全绿**）。
- **选项 ④-a（推荐）**：**保留**现有 5 个注册断言（它们防「路由被删」，成本≈0）+ **新增**真实 HTTP 组：`InMemoryGraphStore` + `setUserStore` + `listen(0)` → `POST /api/auth/login` → **解码 token payload** 断言 `department === 'marketing'`（A1）；再落 `POST /api/auth/refresh`（带 Bearer 旧 token，因 refresh 非白名单）断言部门保留（A7）。
- **选项 ④-b**：整文件重写为 HTTP 夹具，删掉注册断言。代价：丢失「路由存在性」这一低成本回归面，且 PR diff 变大。
- ⚠️ 派单件 §五 把 `tests/routes/auth.test.ts` 列为「改」，**不是新建**；写集里没有新增测试文件额度（7 文件含它）。故 ④-a 的形态（同文件内增组）在预算上唯一可行。

---

## 7. Q6 — 反例矩阵草案（「改坏即红」变异体）

> 执行纪律（引用既有裁定，非本件自创）：变异体只在**已提交 SHA** 上做（D947-RULINGS L-14）；回退用 `git checkout -- <file>`，**禁 `git stash` / `--no-verify` / force push**；变异体脚本与临时配置**落 `/tmp` 永不入仓**（L-17）；变异体由**自验员**（非编码者）施加（M3 / 铁律 0-5 自验独立）。以下命令为**草案形态**（本次 PLAN 阶段未执行）。

| 变异体 | 施加命令（草案） | 期望红 | 归属判据 |
|---|---|---|---|
| M1 撤销 login 签发部门 | `routes/auth.ts:134` 改回 `signJwtToken({ sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId })`（或用 `git diff` 反向 patch） | A1 夹具（解码 payload）红 | A1 |
| M2 撤销 rbac JWT 分支 | `rbac.ts:127` 改回 `department: undefined,` | A2 单测红 + A3 腿 1/腿 2 红 | A2 / A3 |
| M3 撤销 refresh 保留部门 | `routes/auth.ts:176-180` 去掉 `department:` 行 | A7 红 | A7 |
| M4 去掉部门非空收窄 | `rbac.ts:231-237` 的 `isSameDepartment` 改成 `return wsDept === ctxDept;`（天真比较） | A5 边界（双 `undefined`／双 `''`）红：`canAccessWorkspace`/`canModifyWorkspace` 会由 false 变 true | A5（并连带既有 `rbac.test.ts:284-302`、`rbac-default-deny.test.ts:78-79` 组） |
| M5 加 manager 旁路 | `rbac.ts:287` 改成 `isSameDepartment(...) \|\| role === 'admin' \|\| role === 'manager'` | A5 红 | A5 |
| M6 复活自报分支（auth） | `auth.ts:503-508` 之前插入「从 `x-synova-token` 解析 `role:orgId:userId` 并 return」的分支 | A6 红（`auth.test.ts:434/:620`、`rbac.test.ts:34`、`rbac-default-deny.test.ts:107` 全变红） | A6 |
| M7 复活自报分支（rbac） | `rbac.ts:135-139` 之前插入自报解析/兜底 `{role:'admin'}` | A6 红 + A5 红（匿名上下文变已认证） | A6 / A5 |
| M8 异部门放行 | `workspaces-api.ts:285-287` 过滤改成 `w.visibility === 'global'`（无视部门） | A4 腿 2 红 | A4 |
| M9 同部门不再命中 | `workspaces-api.ts:286` 改成 `w.owner === userId \|\| w.visibility === 'global'`（删部门项） | A3 腿 2 红 | A3 |
| M10 空串 department 放行 | `rbac.ts:233-234` 的 `length > 0` 删掉 | A5 边界（`''`）红 | A5 |

**形态要求（写进 PLAN 的验收命令）**：每个变异体必须给 **原始输出片段**（完整失败行，禁 `tail -8`），并注明「回退后同一夹具恢复绿」的对照组输出 —— 否则无法区分「判据真判别」与「夹具本来就红」。

---

## 8. 新发现（派单件/任务卡未记载，影响 PLAN 放行）

### F-1（阻断 A3/A4 字面形态）`/mine` 被 `/:id` 遮蔽 ⇒ HTTP 恒 404
见 §3.2。**需要 CTO 明确 A3/A4 的实现形态**（推荐 (a+)+(b) 双腿）。**不自行定夺。**

### F-2（铁律 4/5 未闭合）`department` 无生产写入者 ⇒ 本卡交付后用户可见结果不可达
证据见 §6-① 的三段 `git grep` 原始输出（3 处 createUser / 6 处生产 updateUser / enterprise.ts 零命中）。
⇒ PLAN 必须把「**部门赋值入口缺失**」列为未清项并建议另立卡；**不得**在回执里把「A1–A7 全绿」写成「部门可见性已可用」（这正是红线「把线全绿说成产品被验证」）。

### F-3（写集外文档真相）两处注释将在 D948 后失真
- `src/routes/workspaces-api.ts:278`：`// R5/REV-8: JWT 载荷无 department ⇒ 恒 undefined（已登记功能回退）`
- `tests/routes/workspace-access-write-endpoint.test.ts:236`：`// JWT 载荷无 department ⇒ ctx.department 恒 undefined …（R5/REV-8 已裁定为功能回退，非缺陷）`
⇒ D948 后这两句为**假陈述**（功能回退被本卡反转），而两文件都**不在写集**。处置选项：**(i)** CTO 放行「仅注释订正」的 1–2 行改动到写集（含 `tests/routes/workspace-access-write-endpoint.test.ts` 则 PR 文件数 7→8，仍 ≤12）；**(ii)** 不修，登记为「注释与行为不一致」的遗留项（会被后续 K3/文档真相检查抓到）。**推荐 (i)**，但需 CTO 裁定（属扩写集）。

### F-4（既有缺口，独立登记）register 的 `role` 来自客户端 body
`routes/auth.ts:78`：`const userRole = (role as UserProps['role']) || 'staff'` —— 匿名注册端点接受客户端自报 `role`，与创始人决策①「客户端自报身份完全不允许」**字面冲突**（先于本卡存在）。
⇒ 若 CTO 要「签发端是唯一授权来源」彻底成立，此处需另立卡（本卡写集虽含该文件，但改它会改变既有注册契约、波及 `tests/routes/enterprise.test.ts` 等写集外夹具）。**登记，不夹带。**

### F-5（可达面旁路，写集外）`GET /api/workspaces` 对任意已认证用户返回**全量**工作区
`workspaces-api.ts:92-97`：无 rbac 守卫、无过滤 —— `Array.from(store.values())` 直接返回。该路径不在白名单（`auth.ts:103-133` 无 `/api/workspaces`），故需合法 JWT，但**任何角色**（含 staff）都能拿到全部工作区（含部门级）。
⇒ A3/A4 通过**不等于**「部门隔离在产品面成立」。**必须在 PLAN/回执里显式登记**：本卡只修「身份链承载 department」，`/api/workspaces` 的过滤缺位是另一条可达面缺口（写集外，建议另立卡）。

### F-6（夹具形态陷阱）`visibility:'global'` 使两部门 manager 都能看到 parent
见 §3.1 —— A4 断言若写成「列表为空」会**假红/假绿**双向出错。已在 §7 M8/M9 给出反向判别对。

### F-7（token 载荷语义统一）空串 vs 缺键
`user-store.ts:99` 使 graph 路径的 `department` 恒为 `''`（非 undefined）。建议签发时归一为 `undefined`（`|| undefined`），使「无部门」在 token 里只有一种表示。**属设计建议，需 PLAN 采纳**（不改变 fail-closed 结论）。

---

## 9. 未能证实的项（诚实登记）

| # | 未证实项 | 为什么 | 建议的补证动作 |
|---|---|---|---|
| U-1 | 本件**未亲跑任何 vitest**（A1–A7 无一条红色/绿色由我运行得出） | PLAN 阶段禁写测试代码；且小队重型验证串行 ≤1 —— 我侦察时 `verifier-tv` 为 `running`（`list_agents` 实测），避免并发重型验证 | 实现阶段由自验员跑；本件所有「必红」均为**期望**而非观测 |
| U-2 | `GET /api/workspaces/mine` 经 HTTP 恒 404（F-1）**运行期结论未由我复现** | 同上（需起 app+fetch） | ① 静态侧我已亲核注册序（`:126` 早于 `:264`）；② 由自验员跑 `npx vitest run tests/routes/workspace-access-write-endpoint.test.ts -t "遮蔽"` 取原始输出 |
| U-3 | `ownership.yaml` 的单域判定未亲跑 `check-ownership.py` | 静态读表即已可判（见 §10.1），且避免额外进程 | 实现阶段由队长跑 `python scripts/control-tower/check-ownership.py <7 文件> --owner win` 留回执 |
| U-4 | 「D947 夹具全绿」未亲跑 ⇒ 我把它们当**存在的断言文本**引用，未当**已验证结论**引用 | 同上 | 自验阶段跑 `tests/middleware/auth.test.ts`、`tests/middleware/rbac.test.ts`、`tests/routes/workspace-access-write-endpoint.test.ts` 三件，作为「跨文件回归不转红」证据 |
| U-5 | `npx`/`tsx` 环境下 `@synova/logger` 别名解析路径未验证（故未采用「临时探针跑在 `/tmp`」的形态做 F-1 复现） | 需写探针配置（PLAN 禁写） | 自验阶段按 D947-RULINGS L-17 形态落 `/tmp` |

> 另：我第一轮用「宽 pattern 聚合 grep」统计 `createUser(` 时只看到 1 处（`auth.ts:89`），随后用**定向** `git grep -n "createUser(" -- src` 得到 **3 处**（含 `enterprise.ts:116/252`）——工具输出曾被 250 行上限截断（spill）。**§6-① 的结论以定向命令为准**；此过程登记在此，避免以「聚合命令」当「全量证据」。

---

## 10. 写集、域与跨文件影响面核对

### 10.1 域判定（静态读表）

- `ownership.yaml:35-39`：兜底规则 `glob: "**" → owner: win`（`default: true`），Win 领地含 `src/**`（除下列 Mac 例外）+ 兜底未列明路径。
- Mac 例外中与 `tests/` 相关的**全部**条目（`git grep` 全表核对）只有：`tests/sentinel/**`(:58)、`tests/doc-system/**`(:85)、`tests/control-tower/**`(:106)、`tests/project/**`(:123)。
- ⇒ 切片 A 的 7 文件：`src/middleware/auth.ts`、`src/middleware/rbac.ts`、`src/routes/auth.ts`、`tests/middleware/auth.test.ts`、`tests/middleware/rbac.test.ts`、`tests/routes/auth.test.ts` 全部判 **win**；`task-state/D948.json` 属 `domain_neutral`（`ownership.yaml:207`）⇒ **单域成立（win）**。
- 若采纳 §8-F3 的注释订正（`tests/routes/workspace-access-write-endpoint.test.ts`）→ 该文件**同样判 win**（无 tests/routes 例外）⇒ 不产生跨域，仅 PR 文件数 7→8（≤12 ✅）。

### 10.2 冲突扫描（`department` 全量，命令 + 原始计数）

```
$ git grep -c "department" -- src
src/agent/workspace-service.ts:4          src/growth/proposal-engine.ts:5      src/l4/traversal-permission-filter.ts:10
src/connectors/feishu-bridge.ts:2         src/growth/proposal-store.ts:3       src/loops/loop-trigger-config.ts:6
src/connectors/feishu.ts:3                src/growth/proposal-types.ts:1       src/middleware/rbac.ts:10
src/connectors/nemoclaw.ts:1              src/growth/user-store.ts:7           src/routes/department-workspace.ts:1
src/connectors/types.ts:1                 src/growth/workspace-builder.ts:3    src/routes/workspaces-api.ts:25
src/deploy/bootstrap.ts:1                 src/growth/workspace-types.ts:3      src/server.ts:2
src/growth/action-store.ts:7              src/ingest/knowledge-ingest-bridge.ts:2   src/services/escalation-engine.ts:1
src/growth/action-types.ts:2              src/growth/goal-lifecycle.ts:1
src/growth/goal-types.ts:1                src/l4/department-memory-store.ts:2
$ (合计) src lines: 104   |   $ git grep -n "department" -- tests | Measure-Object → tests lines: 157
```
（完整输出已逐行核对，未用 `head` 截断。逐文件计数即上表全部 25 个 src 文件。）

**与本卡身份链相关的只有 2 个 src 文件**：`src/middleware/rbac.ts`（10 行，写集内）、`src/routes/workspaces-api.ts`（25 行，**写集外**＝消费端已就绪 + F-3 注释失真）。
**无关项（零侧效核对）**：`src/l4/traversal-permission-filter.ts`（含 `ctx.department` 过滤）在 `src/` 内**无任何 import 引用**（`git grep` 该文件名仅命中它自身注释）⇒ 不会因 `req.auth.department` 出现而改变行为。`department-workspace.ts:24 const dept = 'dept'`（派单件未清项 4）与本卡无关，保持不动。

### 10.3 跨文件（写集外）回归不转红核对 —— 逐条给依据

| 文件（写集外） | 是否随 A1/A2 转红 | 依据 |
|---|---|---|
| `tests/middleware/rbac-default-deny.test.ts`（8 行 department） | **否** | 全部用例经 `selfReportedReq()` 自报 header（`:94/:102/:108/:116/:122`），无 `req.auth` ⇒ 与 `:127` 改动无交集 |
| `tests/middleware/rbac.test.ts`（53 行，**写集内**） | 否（改造后仍绿） | `:46-49` 自报断言不涉 req.auth；`:101/:137/:201/:277` 手工构造 `RbacContext` ⇒ 不走 `extractRbacContext` |
| `tests/routes/workspace-access-write-endpoint.test.ts`（21 行） | **否** | `jwt()`（`:47-51`）不传 department ⇒ token 无该键（A5 姿态）；`:453` F-2 组手工构造 ctx；`:235-243` 用 M2（无部门）打部门级 ws → 仍 403 ✅。**但注释失真（F-3）** |
| `tests/middleware/auth.integration.test.ts`（1 行） | **否** | `:56` 手工构造 `{role, userId}`（无 department）且不经 `extractRbacContext` |
| `tests/routes/enterprise.test.ts`（零 department） | **否** | 不改 `user-store.ts`，不改 `enterprise.ts` |
| `tests/growth/user-store.test.ts` | **否** | `user-store.ts` 不在写集 |
| `tests/routes/diagnosis-report-persistence.test.ts` | **否** | 只用 `signJwtToken({sub,role,orgId})`（`:365`）⇒ 可选字段不破坏 |

### 10.4 实现期需注意的门禁风险（写集内既有违规行）

- `tests/middleware/rbac.test.ts:162` 存在既有 `as any`；`tests/middleware/auth.test.ts` 亦有多处 `as unknown as Request` / `as never`（例 `:81`、`:418`）。**这些是既有行**，pre-commit 第 1 组只扫变更行 ⇒ 只要增量编辑不新增、不触碰这些行即可；**不要顺手"清理"**（会扩大 diff 并可能触发跨文件连带）。
- 提交走 `synova-commit`（自带 push，M4：勿手工再推）；本分支目前 origin 无对应 ref（§0.2），首次 push 后需补 `git ls-remote --heads origin | grep d948-identity-chain-server` 回执。

---

## 11. 结论（本件不判「通过」）

- 队长 6 条背景前提 **P1–P9 全部成立**（3 处行号漂移已标注；无一条不成立）⇒ **前提冻结通过，可据此写 PLAN**。
- **PLAN 不能原样采纳派单件 A3/A4 的字面形态**（F-1 阻断），且必须登记 F-2（铁律 4/5 未闭合）、F-3、F-4、F-5 四项，并请 CTO 就 4 个未决项 + 2 个扩写集请求（F-3 注释订正）裁定。
- 本件 **可提请独立审计**（内容为事实清单 + 落点草稿，不含实现与自验结论）；**通过与否归 CTO 收件闸 + K3 终审**。
