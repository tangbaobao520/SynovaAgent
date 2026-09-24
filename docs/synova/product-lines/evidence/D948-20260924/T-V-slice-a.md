# D948 切片 A 独立自验 — T-V-slice-a（判据独立复现 + 变异体实跑）

> 成员：**verifier-tv**（独立自验员，非 code-a/code-b）｜ 共享任务：**task-8** ｜ 2026-09-24/25
> 被验对象：分支 `feat/d948-identity-chain-server`，base `ef5c8caa`，HEAD = **`e551dc837897d7d078b173ec7890ab5740d04a42`**
> 工作树：`.synova-wt-d948-server`（`porcelain` 开工 0 行 / 收工 0 行）
> 临时产物：`%TEMP%\d948-tv\`（= 本机 /tmp 等价物）：`probe-run.log`、`probe-shadow2.log`、`batch1-codea-4files.log`、`batch2-regression-3files.log`、`mut-*.log`
> 口径纪律：vitest 一律 `*> file` 后读 `$LASTEXITCODE`（**禁 PowerShell 管道**——绿腿会被 stderr JSON 日志伪造成 exit 1）；源码读取一律 `[IO.File]::ReadAllText(UTF8)`（`Get-Content` 读中文源码会行号错位）。

**结论（只说这三句之一）：自验结论 = 可提请独立审计。** 不判 A1–A7「通过」；不判「审计通过」；无判据判退回（§七 列未清项/未证实项）。

---

## 一、code-a 自述数字的独立复现（不许转述）

### 1.1 靶向 4 文件 = 141 passed

```
$ & <主仓库>\node_modules\.bin\vitest.CMD run --root .synova-wt-d948-server `
    tests/middleware/auth.test.ts tests/middleware/rbac.test.ts `
    tests/routes/auth.test.ts tests/routes/d948-department-visibility.test.ts *> batch1-codea-4files.log
$ echo $LASTEXITCODE
0
 ✓ tests/middleware/rbac.test.ts (67 tests) 65ms
 ✓ tests/middleware/auth.test.ts (42 tests) 54ms
 ✓ tests/routes/d948-department-visibility.test.ts (18 tests) 288ms
 ✓ tests/routes/auth.test.ts (14 tests) 1523ms
 Test Files  4 passed (4)
      Tests  141 passed (141)
   Duration  3.03s
```
**复现一致**：4 / 141 / exit 0。逐文件计数 67+42+14+18 = 141 ✓。

### 1.2 `git diff --stat ef5c8caa..HEAD` —— **是 9 个文件，不是 9 行**

```
 .claude/bypass.log                                 |   4 +
 .claude/task-briefs/2026-09-25-D948-slice-a-identity-chain.md | 110 +++++
 src/middleware/auth.ts                             |  23 +
 src/middleware/rbac.ts                             |   9 +-
 src/routes/auth.ts                                 |  22 +-
 tests/middleware/auth.test.ts                      |  92 ++++
 tests/middleware/rbac.test.ts                      |  85 ++++
 tests/routes/auth.test.ts                          | 296 ++++++++++++-
 tests/routes/d948-department-visibility.test.ts    | 477 +++++++++++++++++++++
 9 files changed, 1102 insertions(+), 16 deletions(-)
```
- 产品/测试写集文件 = **7**（3 src + 4 test）；治理产物 = 2（task-briefs 新建 + bypass.log）→ **9**，在 PR ≤12 预算内。
- 派单件切片 A 写集里的 **`task-state/D948.json` 不在本分支**（派单件表格归「队长」，非 code-a）→ 登记为未清项（§七-3）。

### 1.3 `.claude/bypass.log` 的 4 行是 **PASS 登记，不是 `--no-verify` 绕过**

```
$ git diff ef5c8caa..HEAD -- .claude/bypass.log | Select-String '^\+[^+]'
+2026-09-25T02:20:43+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=8421d416…   (8421d416 = 主实现提交)
+2026-09-25T02:26:50+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=85aaa132…
+2026-09-25T02:35:21+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=e959656c…
+2026-09-25T02:45:45+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=091cb329…
```
→ 无 `detected-bypass` 行；4 个 D948 提交均登记 pre-commit PASS。**未发现绕过**。分支末端 4 个 `chore: bypass COMMITTED 登记 (auto hook, D521)` 提交为 hook 产物（属治理噪音，非违规）。

---

## 二、判据独立复现（A1–A7）——换口径：**自建 tsx 探针，不用 code-a 的任何夹具**

口径说明（这是本席的独立口径，与 code-a 的 vitest 夹具**不同源**）：
- **不跑 vitest**：`tsx --tsconfig <wt>\tsconfig.json <tmp>\probe-slice-a.ts`（同进程直调生产模块 + 起真实 express + 真实 `fetch`）。
- A3/A4 走**未被遮蔽的** `GET /api/workspaces/:id/context`（真 HTTP），而 code-a 走 `/mine` 的链式捕获探针 → 两条独立路径同时成立才算复现。
- A6 的留痕由**进程 stderr 实捕**核对（非 mock logger）。

原始输出（`probe-run.log`，PROBE 行全量）：
```
PROBE A2-with-dept        :: {"role":"manager","department":"marketing","userId":"mkt-1","authenticated":true}
PROBE A2-without-dept     :: {"role":"manager","userId":"mkt-1","authenticated":true}
PROBE A5-access-no-dept   :: false
PROBE A5-modify-no-dept   :: false
PROBE A5-control-same-dept:: true
PROBE A5-boundary-double-empty :: false
PROBE A6-extractAuthFromRequest-selfreport :: "null"
PROBE A6-extractRbacContext-selfreport     :: {"role":"staff","authenticated":false,"userId":"unauthenticated"}
PROBE seed-record-dept    :: {"mkt":"marketing","nodept":"","mktId":"node-1","nodeptId":"node-2"}
PROBE A1-login            :: {"status":200,"decoded":{"sub":"node-1","role":"manager","orgId":"org-tv","department":"marketing","iat":…,"exp":…,"jti":"…"},"verified":"marketing"}
PROBE A1b-login-no-dept   :: {"status":200,"hasKey":false,"verifiedOk":true}
PROBE A7-refresh          :: {"status":200,"decoded":{"sub":"node-1","role":"manager","orgId":"org-tv","department":"marketing",…}}
PROBE A6-http-only-selfreport :: {"status":401}
PROBE FG6-invalid-bearer  :: {"status":401,"code":"UNAUTHORIZED"}
PROBE FG6-probe-req-auth  :: {"sub":"nodept-1","role":"manager","jti":"…"}
PROBE A6b-http-staff-bearer-plus-selfreport :: {"status":200}
PROBE seed-workspaces     :: {"parentStatus":200,"sub1":200,"sub2":200,"parentId":"ws_…","subMkt":"ws_sub_…","subSales":"ws_sub_…"}
PROBE A3-http-same-dept-context  :: {"status":200,"department":"marketing","wsId":"ws_sub_…"}
PROBE A4-http-cross-dept-context :: {"status":403,"error":"access denied"}
PROBE A4-control-same-dept-context :: {"status":200,"department":"sales"}
PROBE A5-http-no-dept-context    :: {"status":403}
PROBE_DONE
```
留痕核对（stderr 实捕，非 mock）：
```
…"code":"AUTH_REJECTED","reason":"self_reported_token_header_ignored","msg":"安全判据: 被拒绝 — 忽略未验签的 x-synova-token 自报凭据（…
AUTH_REJECTED 命中行数 = 3   （另两条：missing_or_invalid_authorization_header / Invalid token format）
```

| 判据 | 独立复现结论 | 独立证据 |
|---|---|---|
| **A1** 登录 token 解码后 `department === 用户记录部门` | **成立**（`200` + 解码 `department:"marketing"` + 验签回读同值） | `PROBE A1-login` |
| **A1 降级**（记录 `''` → 归一为键缺失、token 仍合法） | **成立**（`hasKey:false`，`verifiedOk:true`） | `PROBE A1b` |
| **A2** `extractRbacContext({auth:{…department}})` 返回真实部门 | **成立**（含值/无键两种形态均正确） | `PROBE A2-*` |
| **A3** 同部门 manager 可见本部门工作区 | **成立（两条独立路径）**：真 HTTP `/context` → `200 + department=marketing`；code-a 的 `/mine` 探针 → 含本部门 | `PROBE A3-http-*` |
| **A4** 异部门 manager 不含该部门 | **成立**：真 HTTP `/context` → `403 access denied`；对照同部门 → `200` | `PROBE A4-*` |
| **A5** 无部门一律 fail-closed | **成立**：`canAccess=false` + `canModify=false`；对照同部门非属主 → `true`；双空串 → `false`；真 HTTP → `403` | `PROBE A5-*` |
| **A6** 自报头零复活 + 留痕 | **成立（判别性在单元级 + 运行期留痕）**：`extractAuthFromRequest` → `null`；`extractRbacContext` → `staff/unauthenticated`；`AUTH_REJECTED/self_reported_token_header_ignored` **运行期实发** | `PROBE A6-*` + stderr |
| **A7** refresh 保留原部门 | **成立**：新 token 解码仍为 `marketing` | `PROBE A7-refresh` |
| **FG-6**（附加）走验签分支而非 dev-admin 逃生口 | **成立**：无效 Bearer → `401 UNAUTHORIZED`；探针 `req.auth.sub = "nodept-1"`（真实验签身份，非 `dev-admin`） | `PROBE FG6-*` |

### 2.1 附带前提复核（code-a 文件头声称「`/mine` HTTP 面恒 404」）

独立探针实跑（`probe-shadow2.log`）：
```
PROBE mine-http      :: {"status":404,"body":"{\"ok\":false,\"error\":\"workspace not found\"}"}
PROBE conflicts-http :: {"status":404,"body":"{\"ok\":false,\"error\":\"workspace not found\"}"}
```
→ `/:id`（`workspaces-api.ts:126`）遮蔽 `/mine`（`:264`）**在本分支上确为事实**；code-a 改用链式捕获探针的理由**成立**（且该 ordering 缺陷已被 D947 裁定「本卡不修」，不在本卡写集）。

---

## 三、变异体（改坏即红）实跑 —— 8 个变异体，全部「先断言落地、再跑测试、后复原」

### 3.1 落地守卫（code-a 第一轮的假绿根因，本席以**内容比较**实现，不依赖 `\n` 锚点）

```
$orig = ReadAllText(path, UTF8)
cnt = 命中数(orig, old)     ; cnt != 1 → ABORT MUTATION_ANCHOR_NOT_UNIQUE
write(orig.Replace(old,new))
$after = ReadAllText(path, UTF8)
($after -ceq $orig)                    → ABORT MUTATION_DID_NOT_LAND(未变)
(-not $after.Contains($new))           → ABORT MUTATION_DID_NOT_LAND(新内容未落盘)
… 跑靶向 vitest …
git checkout -- <file>
porcelain == 0 且 ($restored -ceq $orig) == True   ← 收尾自证
```

**行尾实测（CRLF 陷阱的成因，已独立核实）**：
```
src/middleware/auth.ts                          CRLF=534  LF总=534  纯LF=0     ← CRLF
src/routes/auth.ts                              CRLF=313  LF总=313  纯LF=0     ← CRLF
src/middleware/rbac.ts                          CRLF=0    LF总=328  纯LF=328   ← LF
src/routes/workspaces-api.ts                    CRLF=0    LF总=343  纯LF=343   ← LF
tests/routes/d948-department-visibility.test.ts CRLF=0    LF总=477  纯LF=477   ← LF
```
→ **code-a 自曝的第 ① 条属实且可复现**：`auth.ts` 是 CRLF，若变异脚本用带 `\n` 的多行锚点，`Replace` 命中 0 而脚本静默继续 → 「没改却报绿」。**本席 8 个变异体全部先断言落地，无一例静默。**

### 3.2 逐条变异体（原始输出摘要）

| # | 变异点（file:line） | 靶向 | red 用例（原始） | 退出码 | 复原 |
|---|---|---|---|---|---|
| **M1** | `rbac.ts:132` `department: req.auth.department,` → `undefined,` | rbac.test.ts + d948-*.test.ts | 9 failed / 76 passed：`× 载荷带 department → ctx.department 同值`、`× 成对判据（防恒真恒假）`、`× 对照: 验签 auth 在场 → 正常返回`、`× 腿 1（真 HTTP）…context → 200 + department=marketing`、`× 腿 2（链式捕获探针）: 真实验签 req → 含本部门子工作区`、`× 腿 2（链式捕获探针）: 异部门 manager → 不含…`、`× 对照（防"恒 403/恒空"假绿）`、`× 反向负控（对称方向）`、`× 对照（防"恒 false"假绿）` | 1 | porcelain=0 / 字节级True |
| **M2** | `workspaces-api.ts:286` `w.department === dept \|\| w.owner === userId \|\| w.visibility === 'global',` → `true,`（**过宽型**） | d948-*.test.ts | 4 failed / 14 passed：`× 腿 2: 异部门 manager → /mine 不含 marketing 子工作区`、`× 反向负控（对称方向）`、`× 无部门 manager → /mine 过滤不含任何部门工作区`、`× 有效 Bearer(staff,无部门)+自报 admin 头 → 身份仍是 staff，且看不到部门工作区`。**A3 两条腿保持 ✓** | 1 | porcelain=0 / 字节级True |
| **M3** | `auth.ts:526` 自报分支内插入 `return {role:…split(':')[0]…}`（复活自报） | auth.test.ts | 5 failed / 37 passed：`× D947: x-synova-token 自报 admin → 不再解析，返回 null`、`× x-synova-token 格式不对时返回 null`、`× D947: legacy 自报 token → 一律 null`、`× L-20/P0: 白名单 + 仅自报 → 不注入`、`× 仅 x-synova-token=admin:marketing:u1 → 返回 null 且留痕 AUTH_REJECTED` | 1 | porcelain=0 / 字节级True |
| **M3b** | `rbac.ts:133` 前插入自报**兜底分支**（`req.auth` 优先不变） | rbac.test.ts + d948-*.test.ts | 9 failed / 76 passed（全部在 **rbac.test.ts**：P0 自报×4、P1 自报×4、`× D948/A6 — 仅 x-synova-token=admin:marketing:u1 → 角色≠admin`）；**d948-*.test.ts 仍 1 passed（A6 的 HTTP 两条断言全绿）** | 1 | porcelain=0 / 字节级True |
| **M4** | `auth.ts:370` dev-admin 逃生口条件 → `if (true)` | d948-*.test.ts | **18 skipped**（夹具 `beforeAll` 自证先炸：播种工作区 `owner` 全变 `dev-admin` ⇒ `expect(owner).toBe('admin-1')` 失败 → 整文件跳过，exit 1） | 1 | porcelain=0 / 字节级True |
| **M5b** | `auth.ts:389` 与 `:414` 两处**分支体内**注入 dev-admin+`next()`（仅未验签请求被吞；合法 Bearer 行为不变） | d948-*.test.ts | 3 failed / 15 passed：`× 仅带自报头（无 Bearer）→ 401`、`× 无效 Bearer → 401（dev-admin 姿态下会 200/admin）`、`× 无 Authorization → 401`；`✓ 验签身份 ≠ dev-admin（sub / jti 均非逃生口字面量）`**仍绿** | 1 | porcelain=0 / 字节级True |
| **M6** | `routes/auth.ts:148` `department: foundUser.department \|\| undefined,` 删除（login 丢部门） | tests/routes/auth.test.ts | 2 failed / 12 passed：`× 正路径: token 载荷 department === 记录部门（marketing）`、`× 正路径: 带部门旧 token（Bearer）→ 新 token 仍带原部门` | 1 | porcelain=0 / 字节级True |
| **M7** | `routes/auth.ts:199` `department: result.payload.department \|\| undefined,` 删除（refresh 丢部门） | tests/routes/auth.test.ts | 1 failed / 13 passed：`× 正路径: 带部门旧 token（Bearer）→ 新 token 仍带原部门` | 1 | porcelain=0 / 字节级True |

**每个变异体的收尾自证均一致**：`RESTORE: porcelain=0 字节级复原=True`。8/8 变异体「落地已断言 → 红 → 复原 → 空」闭环；**红证零残留**（收工时工作树 `porcelain` 0 行）。

**M1 的判别结构（重要）**：`department → undefined` 时 `× 腿 1（异部门 → 403）` **未变红**——负向断言在 fail-closed 下天然为真。这正是 A4 必须配 **M2 过宽型**变异体的结构性理由：**收窄型只打正向断言，过宽型只打负向断言，缺一不可**（与复核 §18.2 一致）。

---

## 四、专项逐条判定

### 4.1 A4 判别性专项 → **成立（可判别）**
- 我核到 code-a 挂的 A4 变异体是 **M2 = `workspaces-api.ts:286` 部门析取 → 恒真（过宽型）**，不是收窄型：`git diff` 内的替换为 `      true,`，语义确为「一律放行」。
- 实跑结果与其自述**一致**：**A4 红（腿 2 + 反向负控）、A3 绿**（见 §3.2 M2 原始输出）。→ **不判退回**。
- 附带事实（应登记，非缺陷）：过宽型还顺带打红了 **A5 的 `/mine` 腿**与 **A6 的 `/mine` 腿**（因为这两条也含负向断言）。语义正确，但「A3 绿 / A4 红」的干净归属只对 A3/A4 这一对成立。

### 4.2 A5 专项 → **成立（满足 `ws.owner !== ctx.userId`）**
夹具原文（`tests/routes/d948-department-visibility.test.ts`）：
```
359:  const noDeptCtx: RbacContext = { role: 'manager', userId: 'nodept-1', authenticated: true };
363:  const WS_MKT = { visibility: 'department' as const, department: 'marketing', owner: 'admin-1' };
386:    // 反向对照：owner 析取是**既有语义**（A5-b 不回改）——无部门但属主本人 → 仍可改
387:    expect(canModifyWorkspace(noDeptCtx, { department: 'marketing', owner: 'nodept-1' })).toBe(true);
```
`userId='nodept-1'` × `owner='admin-1'` ⇒ **owner 析取不会救回 `false`，不构成假红**；且夹具还显式加了「属主本人 → `true`」的反向对照把 `rbac.ts:313` 的既有语义钉住。我的独立探针同样用非属主构造：`A5-modify-no-dept = false` + `A5-control-same-dept = true`（对照）。→ **无假红。**

### 4.3 N1 专项 → **成立（先覆写再断言 + FG-6 判别器可红）**
- 「先覆写、再断言」原文（`d948-department-visibility.test.ts:198-207`）：
```
198:  savedEnv.JWT_SECRET = process.env.JWT_SECRET;
199:  savedEnv.DEV_MODE = process.env.DEV_MODE;
200:  savedEnv.SYNOVA_ORG_ID = process.env.SYNOVA_ORG_ID;
202:  process.env.JWT_SECRET = 'd948-test-secret-0123456789';
203:  process.env.DEV_MODE = 'false';
204:  process.env.SYNOVA_ORG_ID = ORG;
206:  expect(process.env.JWT_SECRET?.length ?? 0).toBeGreaterThanOrEqual(16);
207:  expect(process.env.DEV_MODE).toBe('false');
```
`afterAll` 复原（`:266-272`）；对照 vitest 默认 `env: { DEV_MODE: 'true' }`（`vitest.config.ts:59`）→ **覆写确实生效**（我的探针也独立验证：`DEV_MODE=false` 下 `extractAuthFromRequest(自报头) === null`）。
- **FG-6 判别器可红 —— 已单独证实**：code-a 的 M9 用「切环境为 dev-admin 姿态」触发，被夹具前置断言先拦下（18 skipped，我复现为 **M4**）。本席改用**等价但更精确**的变异（**M5b**：只让未验签请求被逃生口吞掉），结果 **FG-6 三条中两条「401」断言直接变红**（`× 无效 Bearer → 401`、`× 无 Authorization → 401`），第三条 `✓ 验签身份 ≠ dev-admin` 因其只覆盖**已验签路径**而保持绿。
  → 判定：**FG-6 的判别器要求（"走验签分支而非 dev-admin" 可被改红）成立**；但须登记其精确边界：**它能抓「未验签请求被放行」，不能单独抓「已验签请求被替换成 dev-admin」**（后者由 M4 的夹具自证 + FG-6 第三条覆盖，且都表现为整文件红/跳过，非静默绿）。

### 4.4 A6 标注是否「诚实且够用」→ **诚实且必要；够用（不判退回）**
- **标注属实**：`tests/routes/d948-department-visibility.test.ts:409-414` 明写「A6 的**判别性**证据在单元级…本组只补 HTTP 面的可达性事实…单看 401 属『接线了≠被执行』型假判据」。文件头 `18-25` 亦标注判别性清单。
- **本席独立证明了「不只诚实，而且必要」**：M3b（复活自报兜底分支）下 `rbac.test.ts` **9 条红**，而同一变异下 **d948 文件的 A6 两条 HTTP 断言全绿**（1 passed）。即：**HTTP 面（带合法 Bearer + 自报头）对「自报分支作为兜底复活」结构性无判别力**——这不只是「不便」，而是构造性不可能（`extractRbacContext` 的 `req.auth` 优先级 + 非白名单路径缺 Bearer 必 401）。若没有单元级那条，A6 就会成为纯形式判据。
- **够用性判定**：A6 的实质要求（自报头不产生身份 + 留痕）**在单元级可判别且已实跑为红**（M3/M3b）+ **运行期留痕实发**（stderr 捕获 `self_reported_token_header_ignored`）。**A6 成立**，其 HTTP 腿按标注只作互补；**不判退回**。
- 一条**必须随卡登记的口径修正**：派单件 A6 原文写「请求带 `x-synova-token` 且无 Bearer → 角色**不等于** admin（且留痕 `log.warn`）」。在 HTTP 面上该请求**根本到不了 `extractAuthFromRequest`**（`jwtAuthMiddleware` 非白名单分支先 401），故「留痕」只能在单元级验证。**code-a 的标注与实现均与此一致；但 A6 的验收口径应由 CTO 确认为「单元级为判别主体、HTTP 面为互补」**，以免 K3 按派单件字面（HTTP + 留痕）核验时判不成立。

### 4.5 空转检测 → **未发现空转**
| 检查项 | 证据 | 结论 |
|---|---|---|
| 无 `DEV_MODE='true'` 下静默放行 | N1 覆写 + 断言（见 4.3）；FG-6 判别器可红（M5b 三条红）；dev-admin 姿态触发时整文件 **18 skipped + exit 1**（M4），**不静默绿** | 通过 |
| 无「只断 HTTP 200 不断 payload」 | A1 断言载体是 `decodePayload(token)['department']`（`tests/routes/auth.test.ts:216`）+ `verifyJwtToken` 双证（`:218-220`）；M6 证明该断言**可被 payload 缺失打红**，而 HTTP 仍是 200 | 通过 |
| 无 grep 型静态判据当验收 | 4 个靶向文件内 `readFileSync / readFile( / execSync / spawnSync / child_process` 命中 = **0 / 0 / 0 / 0**；`expect(` 数 = 127 / 123 / 39 / 75，全为运行时行为断言 | 通过 |
| 判据不被丢弃 | 夹具内含「否则判空转」守卫：`loadMineHandler` 的 `expect(layer?.route…).toBeDefined()`、`callMine` 的 `expect(wroteJson…).toBe(true)`、`captureReq` 的 `expect(probeReqs.length).toBe(before+1)`、`readAuth/readRbac` 缺字段直接 throw（`:98/:110/:152/:154/:156/:172`） | 通过 |
| 夹具自身可判空转 | `beforeAll` 自证：`expect(subMktId).not.toBe(subSalesId)`（同毫秒覆盖防护）`/ owner='admin-1' / visibility / department`（`:257-263`）——M4 正是被这条自证拦下 | 通过 |

---

## 五、code-a 未跑的回归面 —— **已实跑（3 文件 47 passed）**

```
$ vitest run --root <wt> tests/routes/workspace-access-write-endpoint.test.ts `
      tests/middleware/rbac-default-deny.test.ts tests/middleware/auth.integration.test.ts *> batch2-regression-3files.log
$ echo $LASTEXITCODE
0
 ✓ tests/middleware/rbac-default-deny.test.ts (9 tests) 18ms
 ✓ tests/middleware/auth.integration.test.ts (10 tests) 2566ms
 ✓ tests/routes/workspace-access-write-endpoint.test.ts (28 tests) 13141ms
 Test Files  3 passed (3)
      Tests  47 passed (47)
   Duration  19.62s
```
→ code-a「静态判定不转红」在**这三个回归面上实证为真**。**累计实跑：4+3 = 7 文件 / 188 tests 全绿**（未跑全量套件）。

---

## 六、本席发现的问题/风险（按严重度）

1. **[低·治理] `task-state/D948.json` 不在分支**——派单件切片 A 写集列有该文件（写者=队长）。本分支未含 ⇒ 若 CTO 收件闸按写集对账会缺项。归队长，非 code-a。
2. **[低·噪音] 4 个 `chore: bypass COMMITTED 登记` 提交**——hook 自动产物，已核实**非绕过**（§1.3）；但使分支提交面不干净，若 CTO 要求单一路径提交可 squash。
3. **[中·口径] A6 验收口径需 CTO 确认**（§4.4 末）：派单件字面（HTTP+留痕）与可实现口径（单元级为判别主体）不一致，code-a 已如实标注，需一句裁定。
4. **[中·口径] A3 的 HTTP 面载体与派单件字面不同**：派单件写 `GET /api/workspaces/mine`，实测该端点在 HTTP 面**恒 404**（本席独立复核），故 A3 只能用 `/context`（真 HTTP）+ `/mine`（handler 探针）。该 ordering 缺陷 D947 已裁定本卡不修 ⇒ **登记性偏差，非缺陷**。
5. **[低·风险] 过宽型变异体同时打红 A5/A6 的 `/mine` 腿**（§4.1）——归属不纯，但不影响 A3/A4 的判别结论。
6. **[低·纪律] `tests/middleware/rbac.test.ts` 存量 `as any`**：本次改动**未新增**禁用断言（`git diff | grep -E '^\+\s*(as any|as never|as unknown as)'` 仅命中注释/文档行），但该文件内 `:162` 的存量 `} as any)` 若被门禁按「改动文件」扫描会拦（D948 改了该文件）。**未实测门禁扫描粒度**（§七-2）。

---

## 七、未证实项（诚实登记，不得写成「已验证」）

1. **未跑全量套件**（`vitest run` 全量 / 13 组门禁 / CI）——按派单「只跑靶向文件」约束，**累计只实跑 7 个靶向文件**。全量回归与 CI 结果**本席未证实**。
2. **pre-commit 13 组的实际执行结果未复现**：`.claude/bypass.log` 显示 4 次「pre-commit PASS (hook 层登记)」，但**本席未独立重跑 pre-commit**，也未实测组 1（`as any`）对存量文件的扫描粒度。不得据此声称「门禁全绿」。
3. **B 切片（桌面端）与本卡的接口面未验**：`electron-renderer` 变化、`vitest.config.ts` include 范围、`tests/electron/**` 域归属均**不在本次范围**。
4. **`/mine` 的真 HTTP 行为断言未通过真 HTTP 验证**：本席只验证了「恒 404」（遮蔽事实）与 handler 探针结果；**修 ordering 后的真 HTTP 正路径未验证**（本卡不修，属另立卡）。
5. **A3/A4 的「用户可见结果」（客户端呈现）未验**：本席只验服务端判据，桌面端呈现不在切片 A。
6. **降级路径的 `degraded:true` 传播链未全验**：`tests/routes/auth.test.ts:305-307` 有 `JWT_SECRET` 不可用 → `500 + degraded:true` 用例且实跑为绿，但**调用方是否消费该标记**未跟踪（切片 A 范围外）。
7. **变异体只覆盖 7 个判据点**（M1/M2/M3/M3b/M4/M5b/M6/M7）；**未对 A5 的边界（双空串/单侧空串）单独设变异体**——其判别力由 M1（`isSameDepartment` 相关断言）与 PLAN 阶段已实测的 `isSameDepartment` 收窄型变异体间接支撑，**未在本分支上单独实跑**。
8. **未验证 `refresh` 端点在真 HTTP 下的白名单/可达性组合**（我只验证了带 Bearer 的 200 与 token 载荷）——`routes/auth.ts:271` 的「不带 Bearer → 401」由 code-a 夹具覆盖且实跑为绿，本席未独立复现该条。

---

## 八、收尾自证

```
$ git -C .synova-wt-d948-server status --porcelain
（空输出，0 行）                      ← 8 个变异体 + 2 轮探针 + 2 轮 vitest 之后
$ git -C .synova-wt-d948-server diff --stat
（空输出）
$ git ls-remote --heads origin | Select-String 'd948'
e551dc837897d7d078b173ec7890ab5740d04a42  refs/heads/feat/d948-identity-chain-server   ← 与 lead 给定 HEAD 一致
df9dc5edcaa753830c80c2a3050a27d2d6d21bd8  refs/heads/docs/d948-identity-chain-dispatch
bdbce64f6ede92962917d9a24f864a3e34f383b5  refs/heads/docs/d948-plan
```
本席**未创建/未切换分支，未 commit，未 push，未用 `git stash`**；唯一写入文件为本报告（`.synova-wt-d948-lead` 内）。

---

**自验结论：可提请独立审计。** 依据：① code-a 的关键数字（4 文件 / 141 passed；9 文件 diff）独立复现一致；② A1–A7 全部以**换口径**（自建 tsx 探针 + 真 HTTP `/context`）独立复现成立；③ 8 个变异体全部「落地已断言 → 红 → 复原 → porcelain 空 + 字节级复原」，含 A4 专项的**过宽型**变异体；④ 补充实跑 code-a 未跑的 3 个回归面（47 passed）；⑤ 空转检测 5 项均通过。
**不建议退回**；请 CTO 收件闸注意 §六-1/3/4 三项登记项与 §七 未证实项。**A1–A7「是否通过」的判定权在 CTO 收件闸 + K3 终审，不在本席。**
