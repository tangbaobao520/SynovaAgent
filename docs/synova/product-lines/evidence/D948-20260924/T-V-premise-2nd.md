# D948/T-V — 前提独立二次实测 + 反例方法论（第 0 阶段自验输入）

> 成员：**verifier-tv**（独立自验员，非 code-a/code-b）｜ 共享任务：**task-3** ｜ 2026-09-24
> 口径基线：`ref=ef5c8caa`（`feat/d947-middleware-default-posture` tip）
> 侦察工作树：`.synova-wt-d948-server`（`git -C … rev-parse HEAD` → `ef5c8caaf8689cd41ab551495efcd002fb6d4e5f`，开工前 `git status --porcelain` **0 行**）
> 临时产物：`%TEMP%\d948-tv\`（`C:\Users\ADMINI~1\AppData\Local\Temp\d948-tv`）= 本机 `/tmp` 等价物；`mutant-rbac.log` / `baseline-rbac.log`
> **本人不写产品代码、不写产品测试。** 本文件是第 0 阶段自验输入，不是「验过了」；未实施前**无任何判据可判绿**。

**独立 = 换口径，不是重复。** 每条事实至少两种口径交叉：① `git grep -n/-o <ref>` ② `git show <ref>:<file> | Select-String` ③ 落盘工作树后文件系统 `Select-String -Path`。全部数字取自命令原始输出，**未手写**。

---

## 一、三口径对照表（共 7 组）

| # | 事实 | 口径①（git grep） | 口径②（git show + Select-String） | 口径③（工作树文件系统） | 结论 |
|---|---|---|---|---|---|
| 1 | `src/middleware/auth.ts` 内 `department` 命中 | `git grep -n department ef5c8caa -- src/middleware/auth.ts` → **无输出，EXIT=1** | 0 命中行 / 文件 **511 行** | 0 命中行 | **共 0 处**（与队长 0 一致） |
| 2 | `JwtPayload` / `AuthRequestContext` 字段集 | `git grep -n "department" …auth.ts` = 0 | 行区间逐行 dump（见下） | 同文件 0 命中 | **确无 `department`** |
| 3 | `rbac.ts` 写死 `department: undefined` 行号 | `git grep -n "department: undefined" …rbac.ts` → **1 处 :127** | `127:      department: undefined,` | `127:      department: undefined,` | **:127（三口径一致）** |
| 4 | `routes/auth.ts` `signJwtToken` 调用点 | `git grep -n signJwtToken ef5c8caa -- src/` → 5 行（`:146` 定义、`:14` import、`:97/:134/:176`） | 逐处行区间 dump | 与口径①逐行一致 | **签发 3 处：:97 / :134 / :176** |
| 5 | `electron-renderer/src` 内 `x-synova-token` | `git grep -n` → 5 行 / `git grep -o` → **5 处** | —（未单独跑 show；改用 `git grep -c` 逐文件：RightPanel 2 / ga-collab 3 / api.ts EXIT=1） | 5 行（逐行文本一致） | **共 5 处 / 2 文件**（非 6 处） |
| 6 | `tests/routes/auth.test.ts` 性质 | `git cat-file -s` → 1712 字节 | 全文 50 行 dump | — | **50 行纯桩**，零 HTTP / 零 token 解码 |
| 7 | `vitest.config.ts` env DEV_MODE | — | 全文 65 行 dump；`env` 块 `:58-63`，`DEV_MODE: 'true'` 在 **:59** | — | **`'true'`，且 env 块内无 `JWT_SECRET`** |

### 原始输出摘录（关键项）

**（1）`department` in `auth.ts` = 0 处（三口径）**
```
=== 口径1: git grep -n department ef5c8caa -- src/middleware/auth.ts ===
EXIT=1                      ← git grep 无匹配 → 无输出
=== 口径1b: git grep -c department ===
EXIT=1
=== 口径2: git show ef5c8caa:src/middleware/auth.ts | Select-String department ===
口径2 命中行数 = 0
口径2 总行数 = 511
=== 口径3: Select-String .synova-wt-d948-server\src\middleware\auth.ts ===
口径3 命中行数 = 0
```

**（2）类型定义（`:26-33` / `:35-39`，无 `department`）**
```
  26: export interface JwtPayload {
  27:   sub: string;   // userId
  28:   role: string;  // WorkspaceRole | 'ga'
  29:   orgId: string; // tenant/org ID
  30:   iat: number;   // issued at (Unix seconds)
  31:   exp: number;   // expires at (Unix seconds)
  32:   jti: string;   // JWT ID (唯一，用于撤销)
  33: }
  35: export interface AuthRequestContext {
  36:   role: WorkspaceRole | 'ga';
  37:   userId: string;
  38:   orgId: string;
  39: }
```

**（3）`rbac.ts` 逐处命中（`git grep -n department` = 10 命中行；文件 323 行）**
```
ef5c8caa:src/middleware/rbac.ts:97:  department?: string;                 ← RbacContext 已有字段
ef5c8caa:src/middleware/rbac.ts:127:      department: undefined,           ← 断点本体（JWT 分支写死）
ef5c8caa:src/middleware/rbac.ts:241:  visibility?: 'global' | 'department' | 'private';
ef5c8caa:src/middleware/rbac.ts:242:  department?: string;
ef5c8caa:src/middleware/rbac.ts:268:  if (ws.department && !canGaAccessDept(ctx, ws.department)) {
ef5c8caa:src/middleware/rbac.ts:269:    log.warn({ userId: ctx.userId, department: ws.department }, 'GA 无权访问该部门');
ef5c8caa:src/middleware/rbac.ts:284:  if (ws.visibility === 'department') {
ef5c8caa:src/middleware/rbac.ts:287:    return isSameDepartment(ctx.department, ws.department) || role === 'admin';
ef5c8caa:src/middleware/rbac.ts:295:  department?: string;
ef5c8caa:src/middleware/rbac.ts:313:    return isSameDepartment(ctx.department, ws.department) || ws.owner === ctx.userId;
```
精确锚 `department: undefined`：`git grep -n` / `Select-String`（show）/ `Select-String`（fs）**三口径均为 `:127`，各 1 处**。

**（4）签发点逐处 payload**（文件 293 行）
```
  97:     const token = signJwtToken({ sub: finalUserId, role: userRole, orgId: userOrgId });        ← register，无 department
 134:     const token = signJwtToken({ sub: foundUser.userId, role: foundUser.role, orgId: foundUser.orgId }); ← login，无 department
 176:     const newToken = signJwtToken({                                                             ← refresh
 177:       sub: result.payload.sub,
 178:       role: result.payload.role,
 179:       orgId: result.payload.orgId,                                                              ← 无 department
 180:     });
```
附带事实：`:139` login 响应体的 `payload` 镜像同样**只列** `userId/role/orgId/expiresAt/jti`（无 `department`）。
`signJwtToken` 签名 `:146-148` 为 `payload: Omit<JwtPayload,'iat'|'jti'|'exp'>`，实现 `:155-160` 用 `...payload` 展开 ⇒ **类型加字段即签发自动带上**（队长前提成立）。

**（5）桌面端**
```
$ git grep -n x-synova-token ef5c8caa -- electron-renderer/src      → 5 行（EXIT=0）
  RightPanel.tsx:155  (注释)   RightPanel.tsx:159  baseHeaders['x-synova-token'] = seedToken;  ← 唯一代码行
  ga-collab.ts:18 / :44 / :92      ← 全部为注释
$ git grep -o x-synova-token ef5c8caa -- electron-renderer/src      → occurrence 总数 = 5
$ git grep -c 逐文件 → RightPanel.tsx:2 / ga-collab.ts:3 / lib/api.ts EXIT=1（0 处）
$ git grep -n Bearer ef5c8caa -- electron-renderer   → EXIT=1（0 处）
$ git grep -n login  ef5c8caa -- electron-renderer   → EXIT=1（0 处）
```
补充（B1 的必要非充分证据）：
```
getSeedToken   => 4 处   (RightPanel.tsx:10 导入, :157 调用; ga-collab.ts:92 注释, :99 定义)
DevSeedIdentity=> 3 处   (ga-collab.ts:47 定义, :59 注释, :65 返回类型)
```

**（6）`tests/routes/auth.test.ts` 全文性质**（1712 字节 / 50 行）
```
  10: describe('auth routes module', () => {
  11:   it('模块导出默认 router', () => { expect(authRoutes).toBeTruthy(); … });
  18:   it('已注册 POST /api/auth/login', …authRoutes.stack.find((layer: any) => …));
  25:   it('已注册 POST /api/auth/refresh', …);
  32:   it('已注册 POST /api/auth/revoke', …);
  39:   it('已注册 GET /api/auth/validate', …);
  46:   it('Router stack 至少有 4 个路由…', …toBeGreaterThanOrEqual(4));
```
**6 个 `it`，全部断言「模块形状 / 路由注册」，零 HTTP 请求、零 `signJwtToken`、零 token 解码、零 `department`。**

**（7）`vitest.config.ts:58-63`**
```
  58:     env: {
  59:       DEV_MODE: 'true',
  60:       PORT: '3099',
  61:       SYNOVA_DB_PATH: ':memory:',
  62:       SYNOVA_SKIP_MCP: '1',
  63:     },
```
配套：`src/` 内 `DEV_MODE` 读取点 = `auth.ts:54`（`getSecret()` 无密钥时返回 null）、**`auth.ts:350-365`（无密钥 + DEV_MODE=true → 直接注入 `sub:'dev-admin', role:'admin'` 并 `next()`）**、`config.ts:72`。

---

## 二、行号裁决（第三口径）

| 事实 | 派单件坐标 | 队长坐标 | 本席三口径实测 | 裁决 |
|---|---|---|---|---|
| `rbac.ts` 写死 `department: undefined` | `:104-105` | `:127` | **`:127`**（git grep / git show / fs 三口径各 1 处） | **队长对；派单件错。** `:104-105` 实际落在 `RbacContext.authenticated` 的 JSDoc 内（见 `rbac.ts:99-106`），是**注释区**，非代码 |
| `auth.ts` 自报头拒绝分支 | `:501-508` | `:501-506` | `if (req.headers?.['x-synova-token'] !== undefined)` 在 **`:503`**；`log.warn` **`:504-507`**；块结束 `:508`；`return null` `:510`（函数 `:488-511`） | 派单件 `:501-508` 与实测**重合**（501-502 为注释）；队长 `:501-506` 落在块内但未含 `:507-508`。二者都不算错，但**引用应写 `:503-508`**（代码本体） |
| `rightPanel.tsx` 附头行 | `:159` | 背景称 `:155/157/159` | 实际仅 **:155（注释）/ :159（代码）**；`:157` 是 `const seedToken = getSeedToken();`，**不含** `x-synova-token` | 派单件对（`:159`）；「155/157/159 三处」**不成立** |

---

## 三、与队长 / 派单件不符处（明说）

1. **`electron-renderer/src` 的 `x-synova-token` 是 5 处，不是 6 处**（`git grep -o` occurrence = 5；`git grep -n` = 5 行；文件系统 = 5 行）。若「6」来自把 `getSeedToken()` 也算作自报通道，则口径应写明「含 getSeedToken 组装点」——**B1 判据只数 header 字面量，会漏 `getSeedToken`(4) / `DevSeedIdentity`(3) 的残留**。→ **B1 的 grep 判据必要非充分**（见 §五）。
2. **`RightPanel.tsx:157` 不是命中行**（见 §二）。
3. **`rbac.ts` 断点行 = `:127`，派单件 `:104-105` 错**（见 §二）。**队长测得对。**
4. **派单件 §三「`UserRecord` 有 `department` 字段（注册时由 `extra.department` 落库）→ 签发侧数据源已存在」——API 面不成立。**
   - store 侧成立：`src/growth/user-store.ts:24/:37` 字段、`:80` `extra?: {…department?…}`、`:99` `department: extra?.department || ''`、`:218` `updateUser` 可写 `department`。
   - **入口侧为零**：`git grep -n "createUser(" src/ tests/` 全部调用点——
     `src/routes/auth.ts:89` `createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId })`（**无 department**；register 的 body 解析 `:68-69` 也只有 `email/phone/wechatId/password/role/orgId`）；
     `src/routes/enterprise.ts:116` `{ phone, wechatId }`；`src/routes/enterprise.ts:252`（另一路径，需人工确认是否带 department）。
     `updateUser` 在 `src/` 的全部调用（`enterprise.ts:239/:303/:366/:632`、`anomaly-detector.ts:100/:115`）**均不传 `department`**。
   ⇒ **数据库 schema 存在，写入路径不存在**：A1/A7「登录 token 的 department === 该用户记录的部门」**目前没有任何 API 能让用户记录拥有部门**。这是 PLAN 必须先裁的断点（见 §七-1）。
5. **N1 前置模板的行号与断言文本**：派单件写「模板 `tests/middleware/auth.test.ts:58-61`」，且示例断言 `expect(process.env.DEV_MODE).not.toBe('true')`。实测该文件 664 行，`beforeAll` 本体在 **`:57-62`**（置 `JWT_SECRET` `:58`、置 `DEV_MODE='false'` `:59`、断言 `:60-61`），且实际断言是 **`toBe('false')`**（更强，且与 vitest 默认 `'true'` 对撞）。`tests/middleware/rbac.test.ts:11-16` 是同款。建议 PLAN 直接锁定 `toBe('false')` 形态。
6. **`tests/middleware/rbac.test.ts:162` 现存 `} as any)`**（`extractRbacContext({ auth: {...} } as any)`）；同文件 `:101/:137/:201/:277` 用 `role as RbacContext['role']`。该文件**在写集内**、D948 要改它 ⇒ 若 pre-commit 第 1 组按「改动文件」而非「改动行」扫描，`as any` 会拦（**未实测门禁扫描粒度，见 §九**）。至少应作为提交风险预登记。

---

## 四、夹具性质结论（决定 A1 是「改」还是「新建」）

- `tests/routes/auth.test.ts` = **50 行纯桩**（§一-6），无任何 HTTP / 解码能力 ⇒ **A1 不能靠「改一个断言」落地**。
- 但**该文件不需要成为 A1 的宿主**：仓库已有**现成的、更贴 A1 契约的宿主**——
  `tests/middleware/auth.integration.test.ts`（275 行）：
  - `:21-22` 模块顶层 `process.env.JWT_SECRET=…` / `DEV_MODE='false'`（**先于 import**，避开 vitest `env` 覆盖）；
  - `:35-70` 真实 `express()` + `app.listen(0)` + `app.use(jwtAuthMiddleware/authRoutes/rbacMiddleware)`；
  - `:88-115` `registerAndLogin()` = **真实匿名注册 → 真实登录**，`expect(login.status).toBe(200)`；
  - `:126-131` **已经是「解码 token payload 断言」**：`const payload = JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))` + `expect(payload.sub/role/orgId)`。
- ⇒ **A1 的最小改动 = 在 `:126-131` 的 payload 断言上补 `department`，且注册/入库路径必须先能带部门（§三-4）**；「断言响应体/断言 HTTP 200」的反模式在该文件里已有正面先例可挂。
- `tests/routes/auth.test.ts`（桩）仍宜保留作路由注册回归；**不建议**把 A1 塞进它（会同时引入 HTTP 夹具 + 桩语义混装）。

---

## 五、反例（变异体）方法论 —— **已在本阶段实际执行一次**（非纸面设计）

### 5.1 可复现命令序列（Windows / pwsh，已验证）

前置：`WT=D:\novis-backup-20260526\Novis\synova-agent\.synova-wt-d948-server`（`ef5c8caa`）；node_modules 在**主仓库**（两个 worktree 均**无** `node_modules`），故必须 `--root $WT` 且从主仓库调用 vitest。

```powershell
# T0 入口自证：工作树必须干净
git -C $WT status --porcelain          # 期望：0 行（实测 0 行）

# T1 变异（本席用 UTF-8 显式读写，禁 Get-Content 直改——编码会错位，见 §八）
#    变异点：src/middleware/rbac.ts:232-236  isSameDepartment 的「非空字符串」收窄
#    -  return (typeof ctxDept==='string' && ctxDept.length>0 && typeof wsDept==='string' && wsDept.length>0 && wsDept===ctxDept);
#    +  return wsDept === ctxDept;
$utf8 = New-Object System.Text.UTF8Encoding($false)
$orig = [IO.File]::ReadAllText("$WT\src\middleware\rbac.ts",[Text.Encoding]::UTF8)
[IO.File]::WriteAllText("$WT\src\middleware\rbac.ts", $orig.Replace($oldBlock,$newBlock), $utf8)
git -C $WT diff --stat                 # 证明工作树只有这一处改动

# T2 靶向 vitest（禁 PowerShell 管道！用 *> 文件 + $LASTEXITCODE——见 §八）
& "$REPO\node_modules\.bin\vitest.CMD" run --root $WT tests/middleware/rbac.test.ts *> "$TMP\mutant-rbac.log"
$LASTEXITCODE                          # 期望 1（红）

# T3 复原（只允许 checkout，禁 stash / 禁 rm）
git -C $WT checkout -- src/middleware/rbac.ts

# T4 红证不残留（三判，缺一不可）
git -C $WT status --porcelain          # 期望：空
git -C $WT diff --stat                 # 期望：空
# 字节级：复原后文本 -ceq 变异前文本 → True
```

### 5.2 本席实测原始输出（完整，未截断）

```
oldBlock 命中次数 = 1
=== M1: git diff --stat (变异体) ===
 src/middleware/rbac.ts | 6 +-----
 1 file changed, 1 insertion(+), 5 deletions(-)
=== M2: git diff -U2 ===
@@ -230,9 +230,5 @@ export function auditGaAccess(
 function isSameDepartment(ctxDept: string | undefined, wsDept: string | undefined): boolean {
-  return (
-    typeof ctxDept === 'string' && ctxDept.length > 0 &&
-    typeof wsDept === 'string' && wsDept.length > 0 &&
-    wsDept === ctxDept
-  );
+  return wsDept === ctxDept;
 }
=== M3: 靶向 vitest（变异体） ===
VITEST_EXIT=1
 ❯ tests/middleware/rbac.test.ts (58 tests | 5 failed) 92ms
   × L-29 核心: manager + 双方部门皆缺失 + 非属主 → false（双 undefined 不得放行） 19ms
   × L-29: manager + ws 完全无 department 字段 + 非属主 → false 1ms
   × L-32 收口: manager + 双空串部门 + 非属主 → false（空串非「有值」） 2ms
   × L-32 核心: manager + 双 undefined + visibility=department → false（双 undefined 不得放行） 3ms
   × L-32: manager + 双空串部门 → false（空串非「有值」） 1ms
 Test Files  1 failed (1)
      Tests  5 failed | 53 passed (58)
   （5 条失败锚点行号：rbac.test.ts:208 / :224 / :256 / :285 / :297；AssertionError: expected true to be false）
=== RESTORE ===
porcelain 行数 = 0
git diff --stat → 空
字节级复原 = True
```

同口径**绿腿基线**（同一命令、未变异，亦已实测）：
```
VITEST_EXIT=0
 ✓ tests/middleware/rbac.test.ts (58 tests) 55ms
 Test Files  1 passed (1)
      Tests  58 passed (58)
 porcelain 行数 = 0
```

### 5.3 这一步在 PLAN 阶段**能证明什么 / 不能证明什么**

| | 内容 |
|---|---|
| **能证明** | ① 靶向 vitest 命令在本机 worktree 上**真能跑**（`--root` + 主仓库 node_modules），绿/红两种退出码可复现（0 / 1）；② **已验证的失败判据是可判别的**：`isSameDepartment` 的收窄一旦改坏，5 条 fail-closed 断言立即转红（含派单件 A4 声明的「改成 `ctxDept === wsDept` → 必红」这一条**已被现成测试覆盖**）；③ 「红证不残留」流程可执行且可自证（porcelain 空 + diff 空 + 字节级复原 True）；④ 变异窗口只有秒级，报告可挂原始输出。 |
| **不能证明** | ① **不能证明 D948 的 A1–A7/B1–B4 任何一条已实现**——`ef5c8caa` 上这些判据**尚不存在**，本次变异体是 D947 的存量判据，**不是** D948 新判据；② 不能证明新夹具「删掉即报红」——那要等实施后对**新断言**再跑一次同型变异（每条修复各 1 个变异体，见 §六）；③ 不能证明 A1 的缺字段链路（`routes/auth.ts:97/134/176`）会被拦——本席变异点与 A1 无关；④ **不得**把本节写成「判据已验过」。 |
| **PLAN 阶段结论** | 结论只有一条：**反例方法论可用、被测存量判据可判别**；**A1–A7/B1–B4 全部处于「未实施、未验证」状态**。 |

---

## 六、判据可证伪性分级 + 最小独立复现命令（A1–A7 / B1–B4）

分级口径：**G** = 只靠 grep/源码文本就足够判定（静态）；**R** = 必须有运行时证据（真实执行 / 真实 HTTP / 直接 handler 探针）；**V** = **有假绿（空转）风险**，须附「反空转前置」或对照用例；**N** = **当前不可达/不可绿**，须先裁断点。

| 判据 | 最小独立复现命令（口径=ef5c8caa 起） | 分级 | 假绿机制 / 备注 |
|---|---|---|---|
| **A1** 登录 token 解码后 `payload.department === 用户记录部门` | `& node_modules\.bin\vitest.CMD run --root <WT> tests/middleware/auth.integration.test.ts -t "login"`（宿主 `:88-131`；判据须为 `JSON.parse(base64url(parts[1]))` 断言，**不得**断 HTTP 码） | **R + V + N** | **V**：若夹具自己 `signJwtToken({…department})` 再解码，只证明类型透传（`:155` `...payload`），**与 login 路由是否接线无关** → 典型「接线了 ≠ 被执行」。**N**：用户记录**无任何 API 能写入 department**（§三-4） |
| **A2** `extractRbacContext({auth:{sub,role,orgId,department}}).department==='marketing'` | `… vitest run --root <WT> tests/middleware/rbac.test.ts -t "extractRbacContext"`（同型先例 `:93-96`） | **R（单测即运行时）** | ⚠️ **类型前提缺失**：`rbac.ts:119-123` 的 `auth?: { sub; role; orgId; gaConstraints? }` **无 `department`** ⇒ 夹具传 `department` 会 **TS 多余属性报错**，必须先改该内联类型（rbac.ts 在写集内） |
| **A3** 同部门 manager 访问 `GET /api/workspaces/mine` → 含本部门工作区 | **HTTP 面不可用**：`Fetch https://…` → **恒 404**；可用口径 = **直接 handler 运行时探针**（先例 `tests/routes/workspace-access-write-endpoint.test.ts:338-366` `loadMineHandler`/`callMine`，含 `expect(layer)…'必须可提取（否则判空转）'`） | **R + V + N** | **N（关键）**：`workspaces-api.ts` 中 `/:id`（`:126`）注册在 `/mine`（`:264`）**之前** ⇒ Express 以 `:id='mine'` 命中前者 ⇒ HTTP 面恒 `404 workspace not found`（该现状在同文件 `:323-335` 已由 D947 裁定 **(b) 另立卡、本卡不修 ordering**，并由 `:425-432` 登记性断言锁死）。**「A3/A4 用 HTTP 判」在 D948 写集内不可能绿** |
| **A4** 异部门 manager → 不含 | 同 A3 探针；**另可**在单测层用 `canAccessWorkspace(acc('manager','marketing'), {visibility:'department',department:'sales'})` | **R（存量已覆盖）** | 存量已覆盖跨部门/双 undefined/双空串/单侧空串：`rbac.test.ts:284/:289/:293/:297/:301/:302/:306/:310`。**变异体已实测**（§五）：删掉非空收窄 → `:285/:297` 红 |
| **A5** 无 `department` 的合法 JWT + `visibility:'department'` → `canAccessWorkspace===false && canModifyWorkspace===false` | `-t "L-32"` / `-t "L-29"`（`rbac.test.ts:276-320` / `:200-261`） | **R** | 存量已覆盖，勿重复造；新判据只应补「经 `extractRbacContext(auth)` 的**链路**」那一跳 |
| **A6** 带 `x-synova-token` 无 Bearer → 角色 ≠ admin + 留痕 | **两段分开**：① HTTP 面 `-t "白名单"`（`tests/middleware/auth.test.ts:620-624`，`runWhitelist('/api/solutions', {'x-synova-token':'admin:org-x:attacker'})`）；② 留痕須直接调 `extractAuthFromRequest`（`auth.integration`/`auth.test.ts` 的 `logCapture`，先例 `:64-70` `codesSince(mark)`） | **R + V** | **V（高）**：vitest 默认 `DEV_MODE='true'` 且无 `JWT_SECRET` ⇒ `auth.ts:350-365` 注入 `dev-admin` ⇒ 断言 `role !== 'admin'` 会**因上游 dev 逃生口而红**（不是因判据生效），反之若只断「无 401」也可能因 dev-admin 而绿 ⇒ **必须 N1 前置**（`JWT_SECRET` 就位 + `DEV_MODE='false'` 已断言）。另：非白名单路径无 Bearer 直接 `:369+` 401，**留痕分支根本不会执行** |
| **A7** refresh 新 token 仍带原 `department` | `-t "refresh"`（`routes/auth.ts:151-180`；断言同 A1 解码式） | **R + V + N** | **V**：若 refresh 夹具用自带 `department` 的 token 只是「自签自验」再断言，等于测 `signJwtToken` 透传；**必须**断「原 token 有部门 → 新 token 有**同一**部门」。**N**：同 A1 数据源断点 |
| **B1** `grep -rn "x-synova-token" electron-renderer/src` = 0 | `git grep -c x-synova-token ef5c8caa -- electron-renderer/src`（当前 5 处/2 文件） | **G（但不充分）** | 假绿机制：**只删 header 字面量、留 `getSeedToken`(4)/`DevSeedIdentity`(3)** → grep=0 但自报身份组装链仍在（下一步就有人接回去）。⇒ B1 必须**并列** `getSeedToken`/`DevSeedIdentity` 零命中，且**不得**作为唯一验收（派单件红线：禁 grep 型静态判据当验收） |
| **B2** 有 token 时实收头含 `Authorization: Bearer <jwt>` | 桩 fetch 断言实收 headers（`electron-renderer` 侧；根 vitest `include` 仅 `./tests/**` **不含 `electron-renderer/**`** ⇒ B2 的宿主与 include 是 P0-c 讨论点） | **R** | 需「桩 fetch 实收头」而非「源码里出现 Bearer 字样」 |
| **B3** 无 token：不附身份头 + UI 显性呈现需登录 | 桩 fetch：断言 headers **无**身份键；UI 断言（先例 D556 `renderToStaticMarkup` 桥接，见 `docs/plans/.../SYNOVA-IMPL-DSH-D556…:71`） | **R + V** | **V**：`expect(headers['x-synova-token']).toBeUndefined()` 在「请求根本没发出/被 mock 吞掉」时**恒绿** ⇒ 必须并断「请求确已发出」（对照用例：有 token 时同路径实收 Bearer） |
| **B4** 登录成功 → token 落存储 → 后续请求自动带 Bearer | 桩服务端夹具走通「登录 → 读存储 → 下一请求头」 | **R + V** | **V**：只断「存储里有值」会在「登录函数从未被调用」时空绿 ⇒ 必须由 UI 入口触发（D556 先例：`renderToStaticMarkup` 只有 react，无 react-dom，宿主受限） |

**共性结论**：**A2/A4/A5 是存量已覆盖的运行时判据**（勿重复造）；**A1/A7 卡在数据源断点**（§三-4）；**A3/A4 的 HTTP 形态恒 404**（§六-A3）；**A6/B3/B4 的假绿风险最高**，全部需要「配套对照用例」才能证伪。

---

## 七、PLAN 必须先裁的断点（按优先级）

1. **`department` 从哪来（A1/A7 的先决前提，P0）**：现有 API 无任何写入路径（§三-4）。两条路：
   - **(a)** 扩 `routes/auth.ts` register/login 请求契约（`:68-69` 解析 + `:89` `createUser(..., {department})`）+ `:139` 响应镜像 ⇒ 写集内，但属**API 表面扩张**，须 CTO 明示；
   - **(b)** 夹具经 `setUserStore()`（`routes/auth.ts:57` 已 export）+ `createUser(..., {department})` 预置记录，再走真实 login ⇒ 不动 API 表面，但 A1 的「数据来自注册流」语义弱化。
   ⇒ 不裁此条，A1/A7 的「必红」变异体**无处落地**。
2. **A3/A4 的验收面（P0）**：HTTP 恒 404（`/:id` 遮蔽）。要么改用直接 handler 探针（先例 `workspace-access-write-endpoint.test.ts:338-366`），要么先立 ordering 卡（D947 已裁定不修）。**不允许**把 404 写成「没权限」的通过。
3. **A3/A4 的宿主文件不在写集**：派单件 7 文件写集（`auth.ts`/`rbac.ts`/`routes/auth.ts`/3 个测试 + task-state）**不含** `tests/routes/workspace-access-write-endpoint.test.ts`，而它是 A3/A4 唯一现成宿主。⇒ 要么 CTO 扩写集，要么 A3/A4 降级为**单测链路**（`rbac.test.ts` 内 `auth → extractRbacContext → canAccessWorkspace`）并把「HTTP 不可达」写进预登记。
4. **`extractRbacContext` 的 `auth` 入参类型**（`rbac.ts:119-123`）必须一并加 `department?`，否则 A2 夹具 TS 不过（§六-A2）。
5. **B1 判据面**：列上 `getSeedToken` / `DevSeedIdentity` 零命中（§五 5-3 → §六 B1）。

---

## 八、口径/环境陷阱（本席亲历，供后续自验复用）

1. **PowerShell 管道会伪造红腿**：`& vitest.CMD … | Select-Object -Last 40` 时，绿腿（58/58 passed）的**进程退出码仍是 1**——日志走 stderr 的 JSON 触发 `NativeCommandError`。**必须** `*> $file` 后读 `$LASTEXITCODE`（实测：同一命令 `*> file` → `VITEST_EXIT=0`）。
2. **`Get-Content` 读中文源码会错位**：本席首次用 `Get-Content` 读 `rbac.ts` 得到乱码，且行号整体错位（`:231` 显示成别的内容）。改用 `[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)` 后，与 `git show` blob **逐行 323/323 完全一致**。⇒ 行号裁决一律「git blob 或 UTF-8 显式读」。
3. **行尾**：`rbac.ts` 为 **LF（CRLF=0，LF=323）**。变异/复原脚本须按 `"\n"` 处理。
4. **worktree 无 `node_modules`**（`.synova-wt-d948-server`、`.synova-wt-d948-lead` 均无）：vitest 必须从主仓库调用并 `--root <WT>`；解析靠目录向上查找（worktree 是主仓库子目录）。
5. **计数口径**：`git grep -n` 数**行**、`git grep -o` 数**occurrence**、`git grep -c` 数**逐文件行数**。三者不可混用（本席 `x-synova-token`：-n=5、-o=5、-c 逐文件 2/3/0）。

---

## 九、未证实项（诚实登记，不得写成「已完成」）

1. **A1–A7 / B1–B4 全部未实施、未验证**——第 0 阶段无实现代码；本文件只给方法论与前提实测。
2. **本次变异体是 D947 存量判据（`isSameDepartment`），不是 D948 判据**——不构成对 D948 任何验收的证明（§五 5-3）。
3. **pre-commit 第 1 组（`as any`）的扫描粒度未实测**：`tests/middleware/rbac.test.ts:162` 现存 `as any`；该文件在写集内，若门禁按「改动文件」而非「改动行」判定，则 D948 提交会被拦。**本席未读/未跑门禁脚本**（`scripts/**` 不属本席写集，且未在本次测量范围内）。
4. **`src/routes/enterprise.ts:252` 的 `createUser` 调用**是否带 `department` —— 本席只 grep 到调用行，**未展开该处实参**，故 §三-4 的「入口侧为零」只对 `routes/auth.ts:89` 与 `enterprise.ts:116` 有逐字证据。
5. **B 切片（桌面端）全链未实测**：`electron-renderer` 无 `node_modules`、根 vitest `include` 不含 `electron-renderer/**`（`vitest.config.ts:28`）⇒ **B2/B3/B4 的宿主与可运行性未验证**；P0-a/b/c 三条路的取舍**未评价**（属 CTO 裁定 + Mac 域）。
6. **未跑全量门禁 / 全量 vitest**（重型验证串行 ≤1，且非本阶段目标）；只跑了 1 个靶向文件（2 次：绿基线 + 变异体）。
7. **`login` 响应体 `payload` 镜像（`routes/auth.ts:139`）是否需要同步带 `department`** —— 取决于 A1 断言写在「token 解码」还是「响应体 payload」，本席**未裁定**（写进 §七 由 PLAN 定）。
8. **身份链的端到端可达性未验证**：即便 A1 修好，`jwtAuthMiddleware` 白名单（`auth.ts:100` 注释述及）与 `DEV_MODE` 姿态对 `/api/auth/login` 的实际可达性，本席**只在静态层面读到**，未做 HTTP 冒烟。

---

## 十、对账回执（本席实测）

```
$ git ls-remote --heads origin | Select-String 'd947|d948'
9490fd096e6d6ee5baf520797865fb0e1ebce3d9  refs/heads/docs/d947-win-dispatch
df9dc5edcaa753830c80c2a3050a27d2d6d21bd8  refs/heads/docs/d948-identity-chain-dispatch   ← 派单件 tip（与 brief 一致）
ef5c8caaf8689cd41ab551495efcd002fb6d4e5f  refs/heads/feat/d947-middleware-default-posture  ← 切片 A base（一致）

$ git rev-parse origin/main      → 114582799d55ffd43a36daf6fa5e1268488752a0
$ git merge-base --is-ancestor ef5c8caa origin/main ; $LASTEXITCODE → 1   （0=已在 main / 1=未在 main）
   ⇒ 「D947 未合 main、切片 A 需栈式 base」前提**成立**
   ⇒ 远端**尚不存在** `feat/d948-identity-chain-server`（本席未创建任何分支）
```

`ownership.yaml`（P0 表缺口）独立复核：
```
$ git grep -n "electron" ef5c8caa -- docs/synova/coordination/ownership.yaml
docs/synova/coordination/ownership.yaml:172:  - glob: "electron/**"
docs/synova/coordination/ownership.yaml:175:  - glob: "electron-renderer/**"
   ⇒ 仅 2 条规则，**无 `tests/electron/**` 规则** ⇒ 派单件 §四「表缺口」前提**成立**（tests/electron/ 实有 13 个测试文件）
```

**本席工作目录洁净自证**：`.synova-wt-d948-server` 全程 `git status --porcelain` = **0 行**（变异前后均已断言；末次核对 0 行）。本席**未创建/未切换分支，未 commit，未 push，未用 `git stash`**。

---

*本文件仅为第 0 阶段自验输入。自验结论：**可提请独立审计**（针对「前提实测与反例方法论」这一交付物本身）；对 D948 的 A1–A7/B1–B4 **不予判定**——尚无实施物可验。*
