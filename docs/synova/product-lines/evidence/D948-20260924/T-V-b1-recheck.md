# D948 B-1 收口聚焦复验 — T-V-b1-recheck（verifier-tv 独立自验）

> 成员：**verifier-tv**（独立自验员，非 code-a/code-b）｜ 共享任务：**task-11** ｜ 2026-09-25
> 被验对象：`feat/d948-identity-chain-server`，base `ef5c8caa`，**HEAD = `59f52e3abbff62d4b1bd5294cfe4f7e6fe943759`**（上轮验的 `e551dc83` 之后又前进 1 个 test-only 提交）
> 工作树：`.synova-wt-d948-server`（开工 `porcelain` 0 行 / 收工 **0 行**）
> 临时产物：`%TEMP%\d948-tv\`（`b1-baseline4.log`、`b1-only.log`、`b1-mB1.log`、`m3ca.log`）
> 口径纪律：vitest 一律 `*> file` 后读 `$LASTEXITCODE`（禁 PowerShell 管道——绿腿会被 stderr JSON 日志伪造成 exit 1）；源码一律 `[IO.File]::ReadAllText(UTF8)`；变异落地一律**内容级比较**（不依赖 `\n` 锚点）。

**自验结论：可提请独立审计。** 未发现退回事由；不判 A1–A7「通过」；不判「审计通过」。

---

## 必答 1 — 产品代码零改动 ✓（逐文件 blob 哈希比对）

```
$ git rev-parse e551dc83:src/middleware/auth.ts  → 8fbba1ba7c9a…
$ git rev-parse 59f52e3a:src/middleware/auth.ts  → 8fbba1ba7c9a…   相同=True
$ git rev-parse e551dc83:src/middleware/rbac.ts  → d732add9b150…   相同=True（vs 59f52e3a:d732add9b150…）
$ git rev-parse e551dc83:src/routes/auth.ts      → 70519f0cffdc…   相同=True（vs 59f52e3a:70519f0cffdc…）

$ git diff --stat e551dc83..HEAD -- src/
（空输出 —— 零改动）

$ git diff --stat ef5c8caa..HEAD -- src/
 src/middleware/auth.ts | 23 +++++++++++++++++++++++
 src/middleware/rbac.ts |  9 +++++++--
 src/routes/auth.ts     | 22 +++++++++++++++++++++-
 3 files changed, 51 insertions(+), 3 deletions(-)
```
→ 与 B-1 前**逐字节相同**（三个 blob 哈希一致），仍只有那三件；`e551dc83..HEAD` 的改动面只有
`.claude/bypass.log` / `.claude/task-briefs/…md` / `tests/routes/d948-department-visibility.test.ts`（**test-only + 治理产物**）。
**「产品代码零改动」成立，不构成退回事由。**

## 必答 2 — 4 条新断言存在、非空壳、夹具不假红 ✓

| 位置 | 用例名 | 断言数 | owner 错开自证 |
|---|---|---|---|
| **L391** | `B-1 边界: 大小写差异（ctx="Marketing" vs ws="marketing"）→ 一律 deny` | `expect` @L393（`ctx.userId).not.toBe(WS_MKT.owner)`）、L394、L395 | ✅ 显式自证 |
| **L398** | `B-1 边界: 大小写差异（反向 ctx="marketing" vs ws="Marketing"）→ 一律 deny` | `expect` @L400、L401 | ✅ `owner:'admin-1'` vs ctx `'m-x'` |
| **L404** | `B-1 边界: 空白差异（ctx=" marketing" 首空格 vs ws="marketing"）→ 一律 deny` | `expect` @L406（自证）、L407、L408 | ✅ 显式自证 |
| **L411** | `B-1 边界: 空白差异（反向 ctx="marketing" vs ws="marketing " 尾空格）→ 一律 deny` | `expect` @L413、L414 | ✅ `owner:'admin-1'` vs ctx `'m-x'` |

夹具（`tests/routes/d948-department-visibility.test.ts:360-363`）：
```
360:  const mkCtx = (department?: string): RbacContext => ({
361:    role: 'manager', userId: 'm-x', department, authenticated: true,
362:  });
363:  const WS_MKT = { visibility: 'department' as const, department: 'marketing', owner: 'admin-1' };
```
⇒ `userId='m-x'` ≠ `owner='admin-1'`，**`canModifyWorkspace` 的 `ws.owner === userId` 析取不会把 `false` 救回 ⇒ 不假红** ✓（两条腿各含 `canAccessWorkspace` + `canModifyWorkspace`，双判据都锁）。

文件规模（HEAD 版）：**513 行 / 22 个 `it` / 85 个 `expect(`**（B-1 前为 477 行 / 18 it）。**非空壳。**

**B-1 前提独立复核（「此前零判据」是否属实）**：
```
$ git grep -n "toLowerCase\|toUpperCase" HEAD -- src/middleware/rbac.ts        → EXIT=1（零命中）
$ git grep -n "Marketing" HEAD -- tests/                                       → 仅命中
    · tests/routes/d948-department-visibility.test.ts:391/392/398/400/401（本次新增）
    · tests/l3/gear1-wiring.test.ts:145（无关注释）、tests/sentinels/…/fixed-cost-rigidity.test.ts:26（无关数据）
$ git grep -n "department: 'marketing '" HEAD -- tests/                        → 仅 :413/:414（本次新增）
```
⇒ 产品代码**当前无任何大小写/空白归一化**（故「加 `.trim().toLowerCase()`」是**真实的未来回归场景**，不是既有行为）；收口前**确无**该边界判据。**B-1 是真实缺口，非重复覆盖。**

## 必答 3 — 绿基线 145/145（两口径）

**口径 A（4 靶向文件全跑）**：
```
$ vitest run --root <wt> tests/middleware/auth.test.ts tests/middleware/rbac.test.ts `
      tests/routes/auth.test.ts tests/routes/d948-department-visibility.test.ts *> b1-baseline4.log
$ echo $LASTEXITCODE
0
 ✓ tests/middleware/auth.test.ts (42 tests) 45ms
 ✓ tests/middleware/rbac.test.ts (67 tests) 53ms
 ✓ tests/routes/d948-department-visibility.test.ts (22 tests) 437ms
 ✓ tests/routes/auth.test.ts (14 tests) 1574ms
 Test Files  4 passed (4)
      Tests  145 passed (145)
```
**口径 B（换口径：只单跑 B-1 组，`-t` 过滤）**：
```
$ vitest run --root <wt> tests/routes/d948-department-visibility.test.ts -t "B-1 边界" *> b1-only.log
$ echo $LASTEXITCODE
0
 ✓ tests/routes/d948-department-visibility.test.ts (22 tests | 18 skipped) 157ms
      Tests  4 passed | 18 skipped (22)
```
⇒ **141 → 145 成立**（22 = 18 + 4），且增量**精确落在 4 条 B-1 边界**上（`-t` 单跑恰好 4 passed，其余 18 skipped）。

## 必答 4 — 可红证明独立复现（核心）：M-B1「好心归一化」→ **恰好 4 红 / 141 绿** ✓

变异体（保留非空守卫，只归一化比较式）：
```
-    wsDept === ctxDept
+    wsDept.trim().toLowerCase() === ctxDept.trim().toLowerCase()
```
落地守卫（内容级，不依赖行尾）：
```
锚点命中=1  文件行尾: CRLF=0 LF总=328        ← rbac.ts 确为 LF（与 auth.ts CRLF=534 不同，故锚点必须无 EOL）
MUTATION_LANDED=True (9874 -> 9916 字节)
$ git diff --stat → src/middleware/rbac.ts | 2 +-  1 file changed, 1 insertion(+), 1 deletion(-)
```
运行结果（**原始输出**）：
```
$ vitest run --root <wt> （4 靶向文件） *> b1-mB1.log
$ echo $LASTEXITCODE
1
     × B-1 边界: 大小写差异（ctx="Marketing" vs ws="marketing"）→ 一律 deny 12ms
     × B-1 边界: 大小写差异（反向 ctx="marketing" vs ws="Marketing"）→ 一律 deny 1ms
     × B-1 边界: 空白差异（ctx=" marketing" 首空格 vs ws="marketing"）→ 一律 deny 1ms
     × B-1 边界: 空白差异（反向 ctx="marketing" vs ws="marketing " 尾空格）→ 一律 deny 1ms
 Test Files  1 failed | 3 passed (4)
      Tests  4 failed | 141 passed (145)
```
复原自证：
```
$ git checkout -- src/middleware/rbac.ts
RESTORE: porcelain=0  sha256相同=True
   rbac.ts sha256（变异前 = 复原后）= 273B787BF267214E435D2008838150600EB19A63B763181201ED278860723123
```
⇒ **恰好 4 条红、其余 141 条绿**，与 code-a 自述一致；且「恰好」由**全量 145 计数**（4 failed + 141 passed）独立证明，非只跑单组。**B-1 判据可判别，成立。**

## 必答 5 — M3c 取证复核：**M3c-a 独立复现成功，HTTP 面确会变红** ✓

变异体（rbac 层自报**优先**复活——插在 `if (req.auth)` **之前**，即 D947 前姿态）：
```
锚点 [  if (req.auth) {] 命中=1
MUTATION_LANDED=True (9874 -> 10169 字节)
$ git diff --stat → src/middleware/rbac.ts | 6 +++++-  1 file changed, 5 insertions(+), 1 deletion(-)
```
运行结果（`tests/routes/d948-department-visibility.test.ts` + `tests/middleware/rbac.test.ts`，原始输出）：
```
$ echo $LASTEXITCODE
1
     × P0: x-synova-token=admin::dev 自报 → 角色 ≠ admin 且标记未认证 15ms
     × P0: manager:marketing:alice 自报 → 不解析出 manager/department/alice（越权面归零） 2ms
     × P0: liaison::coordinator 自报 → 不解析出 liaison 1ms
     × P1: 空 token → 不得 admin + 标记未认证 5ms
     × P1: 无冒号 token → 不得 admin + 标记未认证 3ms
     × P1: 自报 admin 上下文 → canAccessWorkspace(global) 拒绝 2ms
     × P1: 自报 admin 上下文 → canModifyWorkspace 拒绝 2ms
     × P1 边界: department 可见但 ws.department 缺失 → 不得因 undefined===undefined 放行 13ms
     × extractRbacContext: JWT auth takes priority over x-synova-token 3ms
     × 仅 x-synova-token=admin:marketing:u1 → 角色≠admin、未认证、部门 undefined 1ms
     × 对照: 验签 auth 在场 → 正常返回（拒绝不是一刀切） 1ms
     × 有效 Bearer(staff, 无部门) + 同请求自报 admin 头 → 身份仍是 staff，且看不到部门工作区 26ms   ← ★ HTTP 面
 Test Files  2 failed (2)
      Tests  12 failed | 77 passed (89)
$ git checkout -- src/middleware/rbac.ts
RESTORE: porcelain=0  sha256相同=True
```
★ 即 code-a 声称的那条 **HTTP 面**断言，**独立复跑确为红**（26ms）。⇒ **「A6 对『优先类』有 HTTP 判别力」成立，取证完成；不需再向 CTO 提「补 M3c 证据」。**

### 5.1 A6 判别力矩阵（本轮 M3c-a + 上轮 M3b 合并，两轮均为本席实跑）

| 复活形态 | 变异 | HTTP 面 A6（`有效 Bearer + 自报头 → 身份仍 staff`） | 单元面 A6（`仅自报头 → null/未认证`） |
|---|---|---|---|
| **优先类**（自报分支在 `req.auth` **之前**）＝D947 前真实姿态 | **M3c-a**（本轮） | **红** ✅ 26ms | 红 |
| **兜底类**（自报分支作为 `req.auth` **之后**的 fallback） | **M3b**（task-8 轮） | **绿**（构造性：`req.auth` 优先级不变） | 红（rbac 9 条） |
| auth 层复活（`extractAuthFromRequest`） | **M3**（task-8 轮） | 不适用（`jwtAuthMiddleware` 非白名单先 401） | 红（5 条） |

⇒ **A6 的判别力边界现已完整可核**：**优先类 —— 恰好是被 D947 退役的那个真实姿态 —— HTTP 面即可抓**；**兜底类 HTTP 面抓不到，由单元级兜住**。因此 task-8 报告 §六-3 登记的「A6 口径偏差」**就判别力而言已闭合**（code-a 文件头 `:409-414` 的标注「HTTP 面为互补断言、判别性证据在单元级」**偏保守**：HTTP 腿对优先类其实有判别力）。是否仍需 CTO 一句「单元级为判别主体」的措辞确认，属收件闸裁量，**不影响本项结论**。

## 必答 6 — 未证实项（诚实登记）

1. **未跑全量套件 / 13 组门禁 / CI**（按约束只跑靶向）。本轮实跑 = 4 靶向文件（145）+ 3 次单文件/单组 = 共 4 次 vitest 调用，**无一次全量**。
2. **未重跑上一轮的 3 个回归面**：因其判定依据是 `src/**` 行为，而本轮已用**三个 blob 哈希逐字节证明 `src/` 未变**（必答 1）⇒ 上一轮 47 passed 的结论对当前 HEAD **仍然适用**（**此为推断，非本轮实测**；若 CTO 要求，可 20s 内补跑）。
3. **B-1 未设「收窄型」配对变异体**：4 条 B-1 全为**负向断言**（deny），理论上对「过宽型」敏感、对「收窄型」（例如改成 `department.length > 5`）不敏感。本轮只按要求跑了「好心归一化」（过宽型）。**收窄型是否也能被这 4 条抓，本席未证**。
4. **`bypass.log` 本轮的 1 行**未单独逐行核（上轮同型已核为 `pre-commit PASS` 登记、无 `detected-bypass`）；本轮 HEAD 前的 `59f52e3a` 是 hook 产物提交，**本席未重跑 pre-commit 门禁**。
5. **M3c-b（auth 层）未独立复跑**：task-11 只要求至少 M3c-a；auth 层同型（`extractAuthFromRequest` 复活）在 task-8 轮已由 **M3** 实跑为红（5 条单元级），但**未测其 HTTP 面表现**（按 `jwtAuthMiddleware` 顺序，非白名单无 Bearer 必先 401 ⇒ 预期无 HTTP 判别力，**未实测**）。
6. **145 的构成未逐用例对账**：本席核到 `22 = 18 + 4` 与逐文件计数（67/42/14/22），未逐条比对用例名清单与 B-1 前的 141 集合是否**仅差这 4 条**（差异面已由 `git diff e551dc83..HEAD` 限定为单文件，风险很低，但严格说是未证）。

---

## 收尾自证

```
$ git -C .synova-wt-d948-server status --porcelain      →（空，0 行）
$ git -C .synova-wt-d948-server diff --stat             →（空）
$ git ls-remote --heads origin | Select-String 'feat/d948-identity-chain-server'
59f52e3abbff62d4b1bd5294cfe4f7e6fe943759  refs/heads/feat/d948-identity-chain-server   ← 与 lead 给定 HEAD 一致
$ git log --oneline -1 HEAD
59f52e3a chore: bypass COMMITTED 登记 (auto hook, D521)
```
本席**未创建/未切换分支，未 commit，未 push，未用 `git stash`**；两个变异体均 `checkout` 复原并给出 `porcelain=0` + sha256 一致；唯一写入文件为本报告。

---

**自验结论：可提请独立审计**（依据：B-1 三条硬事实——产品代码零改动 / 4 断言可判别（恰好 4 红 141 绿）/ M3c-a 的 HTTP 面取证独立复现成功——全部以原始输出落证）。
**不建议退回。** 请 CTO 收件闸注意 §必答 5.1 的 A6 判别力矩阵（口径偏差就判别力而言已闭合）与 §必答 6 的 6 项未证实项（重点：未跑全量、未重跑 3 个回归面）。
