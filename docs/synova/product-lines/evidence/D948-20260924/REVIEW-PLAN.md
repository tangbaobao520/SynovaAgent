# D948 / REVIEW-PLAN — PLAN 独立复核（对抗性）

> 复核人：reviewer（task-5，独立复核，**非**自验员 verifier-tv）｜ 写者：reviewer ｜ 唯一写文件 = 本文件
> 复核对象：`.synova-wt-d948-lead/docs/synova/product-lines/evidence/D948-20260924/PLAN.md`（task-4 产出）
> **复核对象修订号（pin，必须按此对账）**：`PLAN.md` @ commit **`48d860af`**（blob `0b564815`），与 HEAD 同源（后续 `edca5b3a` 只改本文件、`0c5e40c8` 只改 `.claude/bypass.log`）。
> ⚠️ **复核期间 PLAN.md 被再次修改**（收口完成时工作树 `PLAN.md` 的 SHA256 = `31C446DA…6816` ≠ 上列 blob）⇒ **本轮结论只对 `0b564815` 这一版负责**；若 PLAN 已出新版，本文件须按 diff 复算后再采信。
> **本件落地状态**：commit `edca5b3a`（本地）；`git rev-list --left-right --count origin/docs/d948-plan...HEAD` = **`0  2`** ⇒ **本地领先 origin 2 提交、尚未 push**（`ls-remote` 回执：`37861bbe0192e3f6adfeb90eeacd450a607bd4e3	refs/heads/docs/d948-plan`）。**推送由队长执行**（本文件 §3.1 建议单点提交）。
> 派单件：`.synova-wt-d948-dispatch/docs/synova/dispatch/D948-win-identity-chain-department-20260924.md`（`origin/docs/d948-identity-chain-dispatch` tip `df9dc5ed`，内容提交 `129a0f53`）
> 基线口径：`ref=ef5c8caa`（feat/d947-middleware-default-posture）；命令口径均标"截至时刻"
> 复核时间：**2026-09-25 00:37 +08:00** ｜ 工作树 HEAD `11458279` = `origin/main` `11458279`
> 用词纪律：本文件只给「自验结论 / 可提请独立审计 / 退回」，**不含"审计通过"**——审计结论只认 K3。

**本文件结构**：第一部分的第 3/4/5/8 项**不依赖 PLAN**，为开始复核时点（PLAN 尚未落地）即已固化；第 1/2/6/7 项与"答队长四问"在 **PLAN 落地（commit `48d860af`）后**于**第二部分**收口。**先读 §〇（撞墙次序）与 §17（收口总表）**，再看细节。**§11 是我的自我更正（撤回我首轮一处方法误差）**，请一并读——不要只看对方的错。

---

## 〇、本轮结论摘要（先给撞墙次序）

| 序 | 项 | 结论 | 谁第一个撞墙 |
|---|---|---|---|
| **0** | **A3/A4 靶端点 `/api/workspaces/mine` 经 HTTP 恒 404（D947 L-28 已裁「本卡不修」）** | `[阻塞]`（最高） | code-a 按派单写 A3/A4 夹具 → **永远 404**，以为是自己实现坏了 |
| **0b** | **模板助手 `syntheticRbac` 把 `department` 写死 `undefined`：沿用=假红、改它=假绿** | `[阻塞]`（最高） | 两条路都错；正解须自建"两中间件 + 抽出的 handler"最小 app |
| 1 | **切片 B 的 P0-a 治不好域缺口** | `[阻塞]` | CTO 裁完 P0-a 后，code-b 仍被 D734 判跨域 |
| 2 | **切片 B 真实写集超预算 + 两个写集缺口文件** | `[阻塞]` | code-b 删 `getSeedIdentity` → tsc/vitest 红 → 补 2 文件 → 8 文件 > ≤6 预算 |
| 3 | **A1 是客户端回声判据（且 `department` 无人落库）** | `[阻塞]` | code-a 让 A1 变绿只能从 body 取 department（违反决策①）或改写集外文件 |
| 4 | **A5 在正确实现上假红** | `[阻塞]` | code-a 见 A5 红，会去松产品代码（违反决策②） |
| 5 | **A3 可被 admin/owner 分支短路** | `[阻塞]` | 夹具用 admin 或"播种即断言"即恒绿，department 断路测不出 |
| 6 | **B1 负向 grep 判据 + 三处 fetch 落点只覆盖一处** | `[阻塞]` | code-b 删头即绿，两个裸 fetch 落点永久无头 |
| 7 | **B2/B3 落在白名单端点 + gating 范围未限** | `[阻塞]` | code-b 把今天能用的面板 gate 成"需要登录"= 8 验证点回退 |
| 8 | **本地 main 落后 origin/main 69 提交** | `[阻塞]` | 任何 `git diff --stat main` 回执掺 69 个无关提交 |
| 9 | 切片 A 域/预算 | `[通过]` | — |
| 10 | 红线（no-verify/stash/force push/audit） | `[通过]` | 无迹象（含一条需澄清的机器提交） |
| 11 | 派单件指纹（D943 卡 / rbac 行号 / canModifyWorkspace 描述） | `[阻塞]`（登记级） | 逐条列，不影响取号合法性 |

**未覆盖面**见 §九。

---

## 一、[通过] 第 4 项 — 域与 PR 预算（自跑，不转述队长）

### 1.1 切片 A 写集 = 单域 win（派单 §五 六文件）

```
$ python scripts/control-tower/check-ownership.py src/middleware/auth.ts src/middleware/rbac.ts \
    src/routes/auth.ts tests/middleware/auth.test.ts tests/middleware/rbac.test.ts tests/routes/auth.test.ts
win  src/middleware/auth.ts
win  src/middleware/rbac.ts
win  src/routes/auth.ts
win  tests/middleware/auth.test.ts
win  tests/middleware/rbac.test.ts
win  tests/routes/auth.test.ts
✅ PASS 6 个文件同域: win（无归属 0，域判定豁免 0）
[exit code: 0]
```
口径：`.synova-wt-d948-lead`，截至 2026-09-25 00:30 +08:00。**结论 1.1 = [通过]**：切片 A 单域 win 成立，`无归属 0 / 豁免 0` 与派单 §五 一致。

### 1.2 把 `task-state/D948.json` 并入 → 仍 PASS（治理产物豁免，不计入单域判定）

```
$ python scripts/control-tower/check-ownership.py <A 六文件> task-state/D948.json
·   domain-neutral  task-state/D948.json
win  ...（六行同 1.1）
✅ PASS 6 个文件同域: win（无归属 0，域判定豁免 1）
[exit code: 0]
```
**结论 = [通过]**：治理产物 `task-state/D948.json` 判 `domain-neutral`（豁免 1），不破坏单域；`docs/.../evidence/D948-20260924/*.md` 亦 `domain-neutral`（实测 `PLAN.md`+`REVIEW-PLAN.md` → `✅ PASS ... 豁免 2`）。**附**：PR 预算 A = 6 个代码文件 ≤ 12 ✓（治理产物按规则不计入）。

### 1.3 切片 B 跨域 FAIL 复现（与派单 §四 一致）

```
$ python scripts/control-tower/check-ownership.py electron-renderer/src/stores/auth-session.ts \
  electron-renderer/src/stores/ga-collab.ts electron-renderer/src/components/RightPanel.tsx \
  electron-renderer/src/components/LoginPanel.tsx electron-renderer/src/lib/api.ts tests/electron/d948-identity.test.ts
mac  electron-renderer/src/stores/auth-session.ts
mac  electron-renderer/src/stores/ga-collab.ts
mac  electron-renderer/src/components/RightPanel.tsx
mac  electron-renderer/src/components/LoginPanel.tsx
mac  electron-renderer/src/lib/api.ts
win  tests/electron/d948-identity.test.ts
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win'] —— 单个 PR 只许一个域（无归属 0，域判定豁免 0）
[exit code: 1]
```
**结论 = [通过]**（派单 §四 的 P0 缺口被如实复现）。**并实测 A∪B 亦 FAIL**（`src/routes/auth.ts`+`src/middleware/auth.ts`+`electron-renderer/src/lib/api.ts`+`tests/electron/d948-identity.test.ts` → `['mac','win']` FAIL）→ 两切片必须两个 PR，不可合并。

### 1.4 `[阻塞]` P0-a 治不好真实的域缺口（本项最重要）

派单 §四 推荐 **P0-a = `ownership.yaml` 增 `tests/electron/** → mac`**。我实测该规则**覆盖不到**切片 B 真实写集里的另一个 win 文件：

```
$ python scripts/control-tower/check-ownership.py electron-renderer/src/stores/app-store.ts tests/ga-collab-logic.test.ts
mac  electron-renderer/src/stores/app-store.ts
win  tests/ga-collab-logic.test.ts
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win']
```
`tests/ga-collab-logic.test.ts` 是 **根级 `tests/*.test.ts`**，不在 `tests/electron/` 之下。而 `ownership.yaml` 现有规则里**没有任何一条**能接住它（已读全表相关行）：

```
L58:  - glob: "tests/sentinel/**"        → win
L85:  - glob: "tests/doc-system/**"      → win（源: 同 scripts/doc-system/**）
L106: - glob: "tests/control-tower/**"   → win
L123: - glob: "tests/project/**"         → win
L172: - glob: "electron/**"              → mac
L175: - glob: "electron-renderer/**"     → mac
（无 tests/electron/**；无根级 tests/*.test.ts 规则 → 落 `**` 兜底）
```

而该文件**必须进写集**（§三 3.4 实测：`getSeedIdentity/getSeedToken` 在 `tests/ga-collab-logic.test.ts:19-20` 被 import，`:57-97` 共 13 处 `expect(getSeedIdentity())` / `:62 expect(getSeedToken()).toBe('ga:default:ga-seed-1')`）。删 `getSeedIdentity` → 该文件必红。

**反驳**：P0-a 只把 `tests/electron/**` 改判 mac，`tests/ga-collab-logic.test.ts` 仍判 win ⇒ **CTO 选完 P0-a 后切片 B 依旧被 D734 硬阻断**，且此时 code-b 会以为"P0 已裁、该能开工了"，把失败误读成自己的问题。三选项里 P0-b（只豁免 `tests/electron/d948-*.test.ts`）与 P0-c（改 `vitest.config.ts`）同样不覆盖该文件。

**该改哪一句**：派单 §四 P0 表 P0-a 行改为
> `ownership.yaml` 增 **两条**：① `tests/electron/** → mac`；② `tests/ga-collab-logic.test.ts → mac`（或按 `tests/ga-collab*.test.ts` glob），依据同为「测试跟随被测模块」（`electron/`+`electron-renderer/` 均 mac）——**只加 ① 不足以放行切片 B**（实测 `tests/ga-collab-logic.test.ts` 仍判 win）。

### 1.5 `[阻塞]` 切片 B PR 预算：真实最小写集 8 文件 > 「≤6 文件（含测试）」

```
$ python scripts/control-tower/check-ownership.py <1.3 六文件> tests/ga-collab-logic.test.ts   # 并入缺口文件后
mac×6（含 app-store.ts）+ win×2（tests/electron/d948-*.test.ts、tests/ga-collab-logic.test.ts）
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win']
```
计数：`auth-session.ts`、`ga-collab.ts`、**`app-store.ts`**、`RightPanel.tsx`、`LoginPanel.tsx`、`api.ts`、`tests/electron/d948-*.test.ts`、**`tests/ga-collab-logic.test.ts`** = **8**，而派单 §五 定 **≤6 文件（含测试）**。
**该改哪一句**：派单 §五 切片 B 预算行改为「≤8 文件（含测试；已含补集文件 `app-store.ts` 与 `tests/ga-collab-logic.test.ts`）」——按「不擅自扩写集」纪律，此改动须 CTO 裁定，**执行方不得自行扩预算**。

---

## 三、第 3 项 — 写集互斥（两两比对）

| 对 | 判定 | 依据 |
|---|---|---|
| 切片 A × 切片 B | `[通过]`（无重叠） | A = `src/**`+`tests/{middleware,routes}/**`；B = `electron-renderer/**`+`tests/electron/**`+`tests/ga-collab-logic.test.ts` |
| **`src/routes/auth.ts` 单写者** | `[通过]` | 派单 §五 仅 A 表列它（写者 code-a）；B 表 §五 正文「**不改 `src/**`**（切片 A 已覆盖）」（L138）→ 单写者成立 |
| A × 队长（`task-state/D948.json`） | `[阻塞]`（同文件、两分支） | 派单 §五 A 表列 `task-state/D948.json` 写者=队长；task-4 写集亦含它。同一写者但**跨两条分支**（phase-0 `docs/d948-plan` vs PR-1 `feat/d948-identity-chain-server`）→ 见 3.1 |
| 队长 × reviewer / code-a / code-b / verifier-tv | `[通过]` | 证据目录内 5 个文件互异：`PLAN.md` / `REVIEW-PLAN.md` / `A-recon.md` / `B-recon.md` / `T-V-premise-2nd.md` |
| 切片 B × 自验（`tests/electron/d948-*.test.ts`） | `[阻塞]`（写者栏自相矛盾） | 派单 §五 B 表该行「写者」栏写 **"verifier 复跑"**——「复跑」是动作不是写者，见 3.2 |

### 3.1 `[阻塞]` 同一文件两分支 + 5 人共用一个工作树/分支

**实测**：`docs/d948-plan` 为**本地分支、未推 origin**（`git ls-remote --heads origin | grep d948` 只有 `refs/heads/docs/d948-identity-chain-dispatch df9dc5ed`；`feat/d948-identity-chain-server` 亦仅本地 worktree 存在）。五个成员（lead/code-a/code-b/verifier-tv/reviewer）**全部把产物写进同一个 `.synova-wt-d948-lead`**、同一条 `docs/d948-plan`，而 `synova-commit` **自带 push**（M4）。
**反驳**：文件级互斥成立，但**分支级不是**——两人近同时 commit → 后者 push 被拒/需 rebase，撞的是流程而非写集；且 `task-state/D948.json` 在 phase-0 分支写一次、PR-1 分支又写一次，是同文件二次写。
**该改哪一句**：PLAN 的执行形态节补
> ① 证据目录 5 个文件**由队长单点提交**（成员只交文件、不各自 commit/push `docs/d948-plan`）；② `task-state/D948.json` 明确「**只在 PR-1 分支更新**，phase-0 分支不写该文件」（或反之），避免同文件二次写。

### 3.2 `[阻塞]` 自验写还是编码写，派单没定

**该改哪一句**：派单 §五 切片 B 表 `tests/electron/d948-*.test.ts` 行「写者」由 `verifier 复跑` 改为 `code-b（编码写测试）`，并在 §六/§七 补一句「自验员 `verifier-tv` 只读 + 只复跑 + 只写 `/tmp`，不写仓库内测试文件」——否则两种读法都能被引用（一读=code-b 写测试、verifier 只复跑；他读=verifier 写测试 → 自验员写产品域文件，与「自验员只读」冲突）。

### 3.3 `[通过]` 切片 B 写集没有漏"其他调用方"

我把 `getSeedIdentity|getSeedToken|DevSeedIdentity|GA_SEED_STORAGE_KEY` 全仓库穷举了一遍（`git grep -n ... ef5c8caa`，共 34 命中），剔除 `docs/**`、`.claude/task-briefs/**`、`task-state/D556.json` 后，**代码/测试命中只有 5 处**：

```
electron-renderer/src/components/RightPanel.tsx:10   import { getSeedToken, ... }
electron-renderer/src/components/RightPanel.tsx:157  const seedToken = getSeedToken();      ← 在写集
electron-renderer/src/stores/ga-collab.ts:47/54/65/99  DevSeedIdentity/KEY/getSeedIdentity/getSeedToken  ← 在写集
electron-renderer/src/stores/app-store.ts:5  import { getSeedIdentity } from './ga-collab';  ← 【不在写集】
electron-renderer/src/stores/app-store.ts:128 return getSeedIdentity() ? 'ga' : 'admin';     ← 【不在写集】
tests/ga-collab-logic.test.ts:19-20 import / :57-97 13 处断言                          ← 【不在写集】
tests/routes/diagnosis-report-persistence.test.ts:531 / tests/routes/ga-auth.test.ts:116  ← 仅**注释**引用，不 import → 不受影响
```
**结论 = [通过]（就"穷举是否漏人"而言）**：除派单已登记的 `app-store.ts` 外无第六个代码调用方；同时把"7 文件"缩到 **2 个必补文件**（`app-store.ts` + `tests/ga-collab-logic.test.ts`），而这两个文件的域/预算后果见 1.4/1.5。

---

## 五、第 5 项 — 判据可证伪性（本项为核心；共挑出 6 条假绿/假红，要求 ≥2）

### FG-1 `[阻塞]` A1 是"客户端回声"判据 —— 会假绿，且与创始人决策①冲突

**命令与原始输出**（ref=ef5c8caa）：

```
$ git show ef5c8caa:src/routes/auth.ts   （:66-101 register）
:68   const { email, phone, wechatId, password, role, orgId } = req.body as {...};
:78   const userRole = (role as UserProps['role']) || 'staff' as const;
:79   const userOrgId = orgId || 'default';
:89   const result = await registerUs.createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId });
:97   const token = signJwtToken({ sub: finalUserId, role: userRole, orgId: userOrgId });

$ git show ef5c8caa:src/middleware/auth.ts  （:103-133 isWhitelisted）
:107    path === '/api/auth/login' ||
:108    path === '/api/auth/register' ||      ← register 免认证（匿名）
```

```
$ git grep -n "createUser" ef5c8caa -- src
ef5c8caa:src/routes/auth.ts:89:  ... createUser(finalEmail, password, userRole, userOrgId, { phone, wechatId });
ef5c8caa:src/routes/enterprise.ts:116: ... createUser(finalEmail, password, 'admin', orgId, { phone, wechatId });
ef5c8caa:src/routes/enterprise.ts:252: ... createUser(inv.email, password, inv.role, inv.orgId,);   ← 无 extra
$ git show ef5c8caa:src/growth/user-store.ts
:80   extra?: { displayName?: string; department?: string; phone?: string; wechatId?: string },
:99   department: extra?.department || '',
```
**穷举结论**：**全仓库三处 `createUser` 调用，无一传 `department`** ⇒ 经任何 HTTP 路由建出的用户，库里 `department === ''`（空串，非 undefined）。派单 §三 的「`UserRecord` 有 `department` 字段（注册时由 `extra.department` 落库）→ 签发侧数据源已存在」**只对了一半：schema 在、人口为 0**——这正是「接线了 ≠ 被执行」作用在**字段**上。

**反驳**：A1 断言「登录 token 解码后 `payload.department === 该用户记录的部门`」。要让 A1 变绿，`foundUser.department` 必须先非空，而唯一能把它填成"该用户记录的部门"的现成通路只有 `req.body`（register 是**匿名**端点，且已从 body 取 `role`/`orgId` 直接签发）⇒ **A1 可以完全由"客户端回声"满足**，与创始人决策①「客户端自报身份完全不允许」正面冲突；而 A1 的验收语（判据表）对此**零约束**。
另：`tests/routes/auth.test.ts` 现为 **50 行纯路由注册桩**（`[System.IO.File]::ReadAllText` + `\n` 计数 = 50；6 个 `it`，全部断 `authRoutes.stack`；含 `(layer: any)` 注解）。**更正**：我首轮据 `Measure-Object -Line` 报"44 行"——该 cmdlet 漏算空行为 0，属我方方法误差，已撤回（详见 §11）。其中 login 响应体 `payload`（auth.ts:139）**不含 `department`**——若夹具断言 `res.body.payload.department`，落点须补 `routes/auth.ts:139`（同文件、在写集，但 PLAN 必须点名，否则会被读成"签发函数坏了"）。

**该改哪一句**：判据表 A1 改为
> **A1**：① 经 `UserStore.updateUser(userId, { department: 'marketing' })`（`src/growth/user-store.ts:218`，**服务端侧**落库）后登录 → token 解码 `payload.department === 'marketing'`；② **反向**：以 `body.department='attacker'` 注册 → token 解码**不含** `attacker`（或 register 不接收该字段）→ 缺 ② 则 A1 不成立。

### FG-2 `[阻塞]` A5 在**正确实现**上会假红 —— 会被当成产品 bug 去改产品代码

**命令与原始输出**：

```
$ git show ef5c8caa:src/middleware/rbac.ts   （:292-317 canModifyWorkspace）
:307   const role = ctx.role as string;
:308   if (role === 'admin') return true;
:309   if (role === 'manager') {
:313     return isSameDepartment(ctx.department, ws.department) || ws.owner === ctx.userId;
:314   }
$ git show ef5c8caa:src/routes/workspaces-api.ts   （:219-251 唯一的 department 工作区产线）
:228   if (!canModifyWorkspace(rbac, { department: parent.department, owner: parent.owner })) {
:244   owner: rbac.userId, visibility: 'department',
```
**事实**：派单 §三 写「`canModifyWorkspace` manager 分支：同上，共用同一判据（`isSameDepartment(...) || role === 'admin'`）」——**不实**。真值是 `|| ws.owner === ctx.userId`（admin 走 :308，不在 manager 分支）。
**反驳**：A5 要求 `canModifyWorkspace === false`；但 department 工作区的 `owner` 就是建它的人（:244），而建它需要 admin（:228 对 `visibility:'global'` 的 parent 判 `isSameDepartment(dept, undefined)=false` → 仅 admin 过）。夹具若用"建者本人的上下文"断言（最自然写法），**正确实现也返回 true ⇒ A5 假红**。假红比假绿更危险：它驱动实施者去松 `isSameDepartment` 或删 owner 分支，**直接违反创始人决策②**。
**该改哪一句**：判据表 A5 拆两条并补前置
> A5-a（单元，必红点=`rbac.ts:313`）：`canModifyWorkspace({ role:'manager', department:'marketing', userId:'u1', authenticated:true }, { visibility:'department', department:'marketing', owner:'u2' }) === false`——**夹具必须保证 `ws.owner !== ctx.userId`**；
> A5-b（登记既有语义，不作安全判据）：`ws.owner === ctx.userId` 时返回 `true`（同 :313）。
> 同时把派单 §三「`canModifyWorkspace` manager 分支…共用同一判据」改为「`|| ws.owner === ctx.userId`」。

### FG-3 `[阻塞]` A3 单条判据可被两条析取短路 —— 假绿

**命令与原始输出**：

```
$ git show ef5c8caa:src/routes/workspaces-api.ts   （:264-291 GET /api/workspaces/mine）
:274   const rbac = requireVerifiedRbac(req, res);
:277   const role = rbac.role;
:278   const dept = rbac.department;   // R5/REV-8: JWT 载荷无 department ⇒ 恒 undefined
:282   if (role === 'admin' || role === 'liaison') { list = Array.from(store.values()); }
:285   else { list = Array.from(store.values()).filter(w =>
:286     w.department === dept || w.owner === userId || w.visibility === 'global', ); }
```
**反驳**：A3 =「同部门 manager 的 JWT 访问 `/mine` → 结果含本部门工作区」。过滤是**三析取**，而 department 工作区的**唯一产线**是 `/api/workspaces/:id/sub`（需 admin），其 owner = 建者。
**注**：本条与 FG-7 叠加——A3 的字面 HTTP 形态**连 404 都过不去**（先撞 FG-7）；即使换成探针形态，本条仍成立。
- 若夹具**用 admin 播种 + 用 admin 断言** → 走 :282 全量分支 → **`department` 断路也恒绿**；
- 若夹具**用同一身份播种并断言**（"播种即断言"，最省事的写法）→ 走 `w.owner === userId` → **恒绿**。
两种最自然写法都使 A3 对 `rbac.ts:127` 的 `department: undefined` **完全不敏感**。只有"**非 admin、非 owner、同部门**"的第三方 manager 才让 A3 具判别力。
**该改哪一句**：判据表 A3 补夹具约束
> A3 断言身份 = `role:'manager'`（**非** admin/liaison）、`userId !== ws.owner`；且验收以**集合差**给出：`ids(A3 断言身份可见) ∩ ids(A4 异部门身份可见) = ∅` 且 `本部门 ws ⊆ ids(A3)`。单独 A3 不构成判据。

### FG-4 `[阻塞]` B1 是负向 grep 判据（删掉即绿）+ 三处 fetch 落点只覆盖一处

**命令与原始输出**：

```
$ git grep -n "apiFetch" ef5c8caa -- electron-renderer/src/components/RightPanel.tsx
:153  async function apiFetch<T>(path: string, opts?: RequestInit, capture?: {...}) {
:157    const seedToken = getSeedToken();
:158    const baseHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
:159    if (seedToken) baseHeaders['x-synova-token'] = seedToken;
:160    const res = await fetch(`${getApiBase()}${path}`, {
:161      ...opts,
:162      headers: opts?.headers ?? baseHeaders,
:163    });
:186    const res = await fetch(`${getApiBase()}/api/diagnosis/reports?limit=1`);   ← 裸 fetch #2
:352    const res = await fetch(                                                     ← 裸 fetch #3
:353      `${getApiBase()}/api/diagnosis/consult/${currentReportId}/report?format=markdown`, );
```
**注**：`git grep -n "apiFetch("`（含左括号）在 ref 上 **exit 1 / 零命中**——全部调用点写作 `apiFetch<T>(...)`（泛型）。**他方若用 `apiFetch(` 口径自查会误判"函数不存在"**（我在首轮就踩到，改用 `"apiFetch"` 才对）。这条请 PLAN 写进指纹对账口径。

**反驳（双重）**：
① **B1 = `grep -rn "x-synova-token" electron-renderer/src` → 0 命中**，只测量"删除"。最坏结果——删掉两个裸 fetch 与 apiFetch 的身份附头后**什么都不接**（桌面端恒 401 / fail-closed，正是派单 §一 描述的故障态）——**同样满足 B1 = 绿**。
② **落点只覆盖 1/3**：Bearer 若只加在 `apiFetch`（:160），裸 fetch `:186`（报告列表恢复链）与 `:352`（报告 markdown）**永久无头**；而 B1 的 grep 依旧 0 命中 ⇒ 绿。派单 §八.6「三条 fetch 坐标三方值」正是此隐患的指纹，PLAN 必须显式收进 B2。
**该改哪一句**：判据表 B1 行加限定「**B1 仅作死代码清除的辅助判据，不单独作为切片 B 验收**」；B2 行改为「**三处 fetch 落点逐一断言实收头**：`apiFetch`（RightPanel.tsx:160）、`fetchLatestReportId`（:186）、报告 markdown（:352）」。

### FG-5 `[阻塞]` B2/B3 落在**白名单端点**上 —— 假绿 + 可能造成功能回退

**命令与原始输出**（ref=ef5c8caa，`src/middleware/auth.ts:103-133` 白名单全表）：

```
:119    path.startsWith('/api/sentinel/') ||
:121    path.startsWith('/api/diagnosis/consult') ||
:122    path.startsWith('/api/diagnosis/reports') ||
:123    path.startsWith('/api/conversations') ||
:124    path.startsWith('/api/sessions') ||
:125    path.startsWith('/api/notifications') ||
:126    path.startsWith('/api/solutions') ||
:127    path.startsWith('/api/ga/clients') ||
:128    path.startsWith('/api/ga/switch') ||
（`/api/workspaces/mine` 不在白名单内——:104-131 全表已逐行读）
```
**反驳**：RightPanel 今天实际请求的端点（`/api/sentinel/*` :288-289/:694、`/api/solutions*` :405/:423/:438、`/api/diagnosis/reports` :186、`/api/diagnosis/consult/.../report` :352）**全部在白名单里** ⇒ 这些端点**不要求身份**，B2「有 token 时请求头含 Bearer」在它们身上**无判别力**（带不带都通）；反过来，B3「无 token → UI 呈现'需要登录'」若施加到这些既有面板，会把今天**能用**的哨兵/方案/报告页 gate 成"需要登录" ⇒ 与「能装/能开/能用 8 验证点已闭环」**直接冲突**，属**功能回退**（派单 §八.7 要求回退必须写"功能回退"，不得写"已知限制"）。
**该改哪一句**：判据表 B2 补「**靶端点须为非白名单端点**（建议 `/api/workspaces/mine`），或同时断言'头存在'与'该端点无头必 401'」；B3 补「gating 范围 = **需要验签身份的端点**；白名单端点不 gate（保持既有可用性）」，并在回执 §八.7 登记该范围为**功能变更**。

### FG-6 `[阻塞]` N1 断言的是"环境变量"，不是"代码真的走了验签分支"
**命令与原始输出**：

```
$ git show ef5c8caa:vitest.config.ts   （:58-63）
:58     env: {
:59       DEV_MODE: 'true',
:60       PORT: '3099',
:61       SYNOVA_DB_PATH: ':memory:',

$ git show ef5c8caa:src/middleware/auth.ts
:349    const secret = process.env.JWT_SECRET;
:350    if (!secret && process.env.DEV_MODE === 'true') {         ← dev-admin 逃生口的**真条件**
:351      log.warn({ code: 'AUTH_DEV_MODE_GRANT', reason: 'jwt_secret_not_configured' }, ...);
:355      (req as Request & { auth?: JwtPayload }).auth = { sub: 'dev-admin', role: 'admin', ... };
:323    if (isWhitelisted(req.path)) { ... :345 return next(); }   ← 白名单分支：**仅验签通过才注入**
:50-65  function getSecret(): string | null { ... if (!secret && DEV_MODE==='true') return null; }
```
**反驳**：
① 逃生口的**充要条件是 `JWT_SECRET` 缺失**（:350 `!secret &&`）。N1 的两条断言里真正关掉它的是**第一条**（`JWT_SECRET.length >= 16`）；第二条 `expect(process.env.DEV_MODE).not.toBe('true')` **并不充分**，却给出"已检查过 DEV_MODE"的错觉。
② 更关键：N1 断的是**环境**，不是**请求走了哪条分支**。若夹具路径命中白名单（:323-345），中间件在 `:345 next()`，且**只在验签通过时**注入 `req.auth`——于是"身份未注入 → `requireVerifiedRbac` 拒绝 → 403"与"安全判据正确拒绝 → 403"**观测完全相同**。A6 若只断 `role !== 'admin'` 或 `status === 403`，在 500 / 404 / 非 JSON 体上**同样为绿**（`undefined !== 'admin'`）。
**该改哪一句**：N1 改为
```ts
expect(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16).toBe(true);   // 关掉 dev-admin 逃生口
// 增补判别器（断"走了验签分支"而非"环境干净"）：
//  · logger spy：断言 `AUTH_DEV_MODE_GRANT` **未**出现，且目标路径上 rbac 的 `RBAC_DENIED`（rbac.ts:135/:248/:301）**出现**
//  · 或同一夹具内以「合法 JWT → 200/含数据」与「无 JWT → 403」成对出红→绿，证明该路径确实消费 req.auth
```
A6 行改为「**403 + 响应体不含任何 workspaces + log.warn 的 code 命中 `AUTH_REJECTED`/`RBAC_DENIED`**」三条件同时成立。

### FG-7 `[阻塞·最高]` A3/A4 的靶端点在 HTTP 面**恒 404**（且 D947 已由 CTO 裁定"本卡不修"）—— 派单件零提及

**命令与原始输出**（我自跑的静态证明）：

```
$ git grep -n "router.get('/api/workspaces" ef5c8caa -- src/routes/workspaces-api.ts
:92   router.get('/api/workspaces', ...)
:126  router.get('/api/workspaces/:id', ...)          ← 先注册
:198  router.get('/api/workspaces/:id/context', ...)
:255  router.get('/api/workspaces/by-dept/:dept', ...)
:264  router.get('/api/workspaces/mine', ...)          ← 后注册，被 :126 遮蔽
:294  router.get('/api/workspaces/conflicts', ...)     ← 同型
$ git show ef5c8caa:src/routes/workspaces-api.ts   （:126-131）
:127  const id = String(req.params.id);
:128  const ws = store.get(id);
:129  if (!ws) return res.status(404).json({ ok: false, error: 'workspace not found' });
```
Express 按注册顺序匹配 ⇒ `/api/workspaces/mine` 命中 `:126`（`id='mine'`）⇒ `store.get('mine')` 未命中 ⇒ **404**。

**仓内既有运行时长证据（他方跑的，非我自跑，标注来源）**：
- `docs/synova/product-lines/evidence/D947-20260924/D947-verifier-pr2.md:282` → `[L-28-a] GET /api/workspaces/mine      status=404 body={"ok":false,"error":"workspace not found"}`
- `D947-code-c-pr2b.md:393` → `GET /api/workspaces/mine（带合法 JWT）→ 404 {"ok":false,"error":"workspace not found"}`
- `D947-RULINGS.md:253` → 「L-28 … → 本卡不修，另立卡 + 现状锁定断言」；`D947-RECEIPT.md:191` → CTO 已裁 **(b) 本卡不修**（修之使 `/conflicts` 由 404 变可达 = 可达面扩张）⇒ 须另立卡。
- `tests/routes/workspace-access-write-endpoint.test.ts:326-335` 把该裁决写进了注释，并注明「**CTO 裁定：本卡不修 ordering**」。

**反驳**：派单 §六 判据 A3/A4 的字面形态是「manager 的 JWT 访问 `GET /api/workspaces/mine` → 结果含/不含本部门工作区」。该端点在 HTTP 面**不可达**，而派单件 §三/§五/§六 **通篇未提 L-28**。⇒ code-a 照字面写夹具，只会拿到 404，且**会认为"我的实现坏了"**（实现其实没坏）。

**衍生（同一条链的第二处事实错误）**：派单 §一 表格写当前症状为「打开部门工作区 → **恒'无权限/空列表'**」。实测**不是**——用户看到的是**永久"加载中…"**：

```
$ git show ef5c8caa:src/routes/department-workspace.ts   （:82-98，部门工作区页面 = 用户可见结果面）
:89   try{const r=await fetch(API+'/api/workspaces/mine');const d=await r.json();
:90     const el=document.getElementById('ws-list');
:91     if(!d.workspaces.length){...'暂无工作区'...}
:96   }catch(e){
:97     console.warn("部门工作区 DOM 渲染", { err: ... });      ← 只 console.warn
:98   }
:67   <div class="workspace-list" id="ws-list">…加载中...</div>
```
404 体 `{ok:false,error:'workspace not found'}` 无 `workspaces` 键 ⇒ `:91 d.workspaces.length` **抛 TypeError** ⇒ 落 `catch` ⇒ 仅 `console.warn`，`#ws-list` 仍是 `加载中...`。⇒ 这既是**症状描述不实**，也是一处既存的**铁律 24/31 违规**（无 `degraded` 标记、无错误 UI）。

**该改哪一句**：
1. 判据表 A3/A4 的**靶面**由「HTTP `GET /api/workspaces/mine`」改为
> 「**最小 app 探针**：`express()` + `app.use(jwtAuthMiddleware)` + `app.use(rbacMiddleware)` + `app.get('/api/workspaces/mine', <从 router.stack 抽出的真实 handler>)`，请求带**真实验签 JWT**」
——已核实三个件均可挂：`jwtAuthMiddleware`（`auth.ts:311` 导出）、`rbacMiddleware`（`rbac.ts:320` 导出，`req.rbac = extractRbacContext(req); next()`）、handler 可从 `mod.default.stack` 按 `route.path==='/api/workspaces/mine'` 抽出（仓内既有先例 `workspace-access-write-endpoint.test.ts:338-350`）。**该形态只绕开"遮蔽"这一既有缺陷，不绕开身份链**。
2. 派单 §一 症状行改为「打开部门工作区 → 页面**永久停在'加载中…'**（`/mine` 经 HTTP 404 → 前端 `catch` 仅 `console.warn`）」。
3. 若本卡确实要交付"**用户可见**的本部门工作区"，则必须修 `workspaces-api.ts` 路由顺序 —— **不在切片 A 写集内**（派单 §五 明写"不含 `src/routes/workspaces-api.ts`"），且与 **L-28 裁决 (b)** 直接冲突 ⇒ **须 CTO 先裁**；否则本卡的"结果"环节恒不可达，须按 §八.7 写成 **「功能回退」**（不得写"已知限制"）。

### FG-8 `[阻塞·最高]` 模板助手 `syntheticRbac` 把 `department` 写死 `undefined` —— 沿用=假红，改它=假绿

**命令与原始输出**（ref=ef5c8caa，派单 §五 指定为 A3/A4 **模板**的那份夹具）：

```
$ git show ef5c8caa:tests/routes/workspace-access-write-endpoint.test.ts
:338  async function loadMineHandler() { ... stack.find(l => l.route?.path === '/api/workspaces/mine' ...) }
:353  async function callMine(req) { const handler = await loadMineHandler(); ... await handler(req, res); ... }
:363    // 判据不得被丢弃：handler 必须真的写出响应（否则判空转）
:364    expect(wroteJson, 'handler 未写出 JSON 响应（判据被丢弃 / 未接线）').toBe(true);
:369  function syntheticRbac(role: string, userId: string, authenticated = true) {
:370    return { role, userId, department: undefined, authenticated };   ← 写死 undefined，无 department 形参
:371  }
```
**反驳（两条路都错）**：
- **沿用原样** → 每次 `callMine({ rbac: syntheticRbac('manager','u1') })` 传入的 `department` 恒为 `undefined` ⇒ `workspaces-api.ts:286` 的 `w.department === dept` 恒不成立 ⇒ **A3"同部门可见本部门工作区"在正确实现上永远为红**（假红），且因有 :364 的"未接线"自检，红得像是**实现没接线**。
- **改造助手加 `department` 形参** → department 由**夹具直接合成**后喂给 handler，**完全绕过 `jwtAuthMiddleware → rbacMiddleware → extractRbacContext`** ⇒ 即使 `rbac.ts:127` 一个字符不改（仍 `department: undefined`），A3/A4 **照样全绿**（假绿）。这正是「接线了 ≠ 被执行」作用在**夹具合成对象**上：判据只验了消费者，没验生产者。

**该改哪一句**：判据表 A3/A4 的夹具形态改为（与 FG-7 第 1 条合流）
> **A3/A4 必须走真实身份链**：夹具签发**真实 JWT（含 department）**→ 经 `jwtAuthMiddleware`（验签注入 `req.auth`）→ `rbacMiddleware`（`extractRbacContext` 产出 `req.rbac`）→ 真实 handler。**禁止**用合成 `rbac` 对象直喂 handler（`syntheticRbac` 形态）充当 A3/A4 的判别性证据；如仍需合成路径，只能作**辅助**用例并显式标注"不覆盖 `rbac.ts:127`"。
> 并补**判别性变异体**：把 `rbac.ts:127` 改回 `department: undefined` → A3 must 红（证明该判据确实经过 :127）。

### 5.7 其余判据的证伪性快评（逐条给，不空泛）

| 判据 | 可执行 | 可观测 | 改坏即红 | 备注 |
|---|---|---|---|---|
| A2 | ✓ | ✓ | ✓ | **落点缺一**：`rbac.ts:119-123` 的形参类型 `auth?: { sub; role; orgId; gaConstraints? }` **无 `department`** ⇒ 直传对象字面量是 tsc 过量属性错误。PLAN 落点表须点名 `rbac.ts:122`，否则会被 `as` 绕过（触 铁律 38） |
| A4 | ✓ | ✓ | ✓ | 与 A3 合起来才有判别力（见 FG-3）；变异体「去掉 `isSameDepartment` 非空检查」（`rbac.ts:231-237`）确会红 ✓ |
| A6 | ✓ | **弱** | ✓ | 观测弱见 FG-6② |
| A7 | ✓ | ✓ | ✓ | 落点须点名 `routes/auth.ts:176-180`（refresh 三字段）与 open item ② 的 fail-closed 语义 |
| B4 | ✓ | ✓ | ✓ | 须点名落存储键名 + `api.ts`（现 39 行无 `authHeaders`）的接线路径 |

---

## 八、第 8 项 — 红线核对

### 8.1 `[通过]` 禁项与工作树清洁度

```
$ git status --porcelain   （三个 D948 工作树：dispatch / server / lead）
（三者输出均为空）
```
- 派单 §九 明文：禁 `--no-verify` / `git stash` / force push（L222）；禁 `scripts/audit/**`（K3 红线）与 `scripts/**`（L138/L225）。
- 第 0 阶段**零产品代码改动**（`git status` 空 + `docs/synova/product-lines/evidence/D948-20260924/` 尚不存在）⇒ 无 stash 残留、无 `--no-verify` 迹象。
- 本复核自身只写本文件 + `/tmp`，未跑任何重型验证（避免与队友并发；vitest 属重型，串行 ≤1）。

### 8.2 `[建议]` 一条需澄清但**不构成绕过证据**的机器提交

派单分支 tip `df9dc5ed` 是**自动 hook 提交**：

```
$ git show df9dc5ed
commit df9dc5edcaa753830c80c2a3050a27d2d6d21bd8
    chore: bypass COMMITTED 登记 (auto hook, D521)
 .claude/bypass.log | 1 file changed, 1 insertion(+)
+2026-09-24T23:51:44+08:00 | COMMITTED | pre-commit PASS (hook 层登记) | HASH=129a0f5394a69ccbf2d40a00d2d3267f3e11452c
```
**判定**：该行是 `COMMITTED | pre-commit PASS`，**不是** `detected-bypass`（对照 CLAUDE.md「Gatekeeper 误判修复：只匹配 detected-bypass 行」）⇒ **不构成 `--no-verify` 证据**。
**但**：派单件**内容提交是 `129a0f53`**，`df9dc5ed` 只含一行 log ⇒ 回执/复核若只贴 `tip=df9dc5ed`，会让人以为"该 commit 就是派单件"。建议 PLAN 的指纹对账行同时写 `内容提交 129a0f53 / tip df9dc5ed（auto hook）`。

### 8.3 `[阻塞]` 本地 `main` 落后 `origin/main` **69** 个提交 —— 回执口径炸弹

```
$ git rev-list --left-right --count origin/main...main
69	0
$ git merge-base --is-ancestor 1a1cccc8 origin/main   →  本地 main 是 origin/main 的祖先（落后，非分叉）
$ git rev-parse --short main / origin/main            →  main=1a1cccc8   origin/main=11458279
```
**反驳**：派单 §八.4 要求回执含 `git diff --stat`。谁若写 `git diff --stat main`（或跑任何以**本地** `main` 为基准的比对/基线），产出会**掺入 69 个无关提交**——这正是 D334 记载的同型事故（tracking ref 过期 → 误判），且执行方会以为是自己的 diff 有问题。
**该改哪一句**：派单 §八.4 改为
> `git diff --stat` **必须写明基准**：切片 A 用 `git diff --stat ef5c8caa`（D947 tip）；跨切片/收件用 `git diff --stat origin/main`。**禁用本地 `main` 作基准**（实测落后 `origin/main` 69 提交）。

### 8.4 `[阻塞]`（登记级）派单件三处指纹与实际不符

| # | 派单件原文 | 实测 | 命令 |
|---|---|---|---|
| ① | §〇「main 上最大为 **D942**；D943–D951 无卡」 | `task-state/D943.json` **在 origin/main 上存在**（同一表自己又写"D943 = CTO 已占"⇒派单件内部自相矛盾） | `git ls-tree origin/main task-state/D943.json` → `100644 blob de2ae287…` |
| ② | §三「`src/middleware/rbac.ts:104-105` JWT 分支返回 `department: undefined`」 | 实为 **`:127`**（`:104-105` 是 JSDoc 注释区） | `git grep -n "department" ef5c8caa -- src/middleware/rbac.ts` → `:127: department: undefined,` |
| ③ | §三「`canModifyWorkspace` manager 分支：同上，共用同一判据（`\|\| role === 'admin'`）」 | 实为 `\|\| ws.owner === ctx.userId`（:313） | 见 FG-2 |
| ④ | §三「`electron-renderer/src/stores/ga-collab.ts:60` `getSeedToken()` 组装自报串」 | 函数定义在 **`:99`**；`:92` 是 JSDoc | `git grep -n "getSeedToken" ef5c8caa -- electron-renderer/src/stores/ga-collab.ts` → `:99:export function getSeedToken(): string \| null {`（另 `:57-59` 是 `getSeedIdentity` JSDoc、`:65` 定义） |
| ⑤ | ~~task-1 派单描述「`tests/routes/auth.test.ts` 现为 **50 行**桩」→ 实测 44 行~~ **【本行已自我更正，见 §11】**：正确值 = **50 行 / 6 个 `it`**，**派单件与 PLAN P20 均正确**；我首轮的"44 行"是 PowerShell `Measure-Object -Line` 漏算空行的**我方方法误差**，非 PLAN 缺陷 | — | `[System.IO.File]::ReadAllText` + `\n` 计数 = 50（口径见 §11） |
| ⑥ | 派单 §六 A3/A4 用 `GET /api/workspaces/mine` 作靶端点 | 该端点在 HTTP 面**恒 404**，且 **D947 L-28 已由 CTO 裁定「本卡不修」**；派单**通篇零提及** | 见 FG-7（静态）+ `D947-RULINGS.md:253`、`D947-verifier-pr2.md:282` |
| ⑦ | 派单 §一 症状「打开部门工作区 → 恒'无权限/空列表'」 | 实测用户看到的是页面**永久停在"加载中…"**（404 → `d.workspaces.length` 抛错 → `catch` 仅 `console.warn`） | `src/routes/department-workspace.ts:89-98` |

**判定**：①–⑤ 均**不影响 D948 取号合法性**（实测 d948 无卡、无远端分支），但按「计数与引用必须带命令+口径」纪律须逐条登记，且 ②③ 直接决定 A2/A5 的落点与红点，**必须在 PLAN 里改正后再执行**，否则 code-a 会照派单写 `rbac.ts:104-105` 扑空、照"共用同一判据"误判 A5。⑥⑦ 更严重：直接决定 A3/A4 的**靶面是否存在**（见 FG-7）。

---

## 二 / 六 / 七、[待收口] 第 1、2、6、7 项

**收口前置实测**：`PLAN.md` 不存在 ⇒ **不得凭空复核**（task-5 派单原话）。
- 第 1 项（派单 8 项回执逐项落点）、第 2 项（前提表逐条命令+口径+输出/有无凭记忆）、第 6 项（派单前复核第⑨项：验收命令与期望结果互斥性）、第 7 项（编制/串行/工作目录/禁项自检）**待 task-4 completed 后**按本文件同一格式补齐，结论并回。
- 已可预置的输入（本轮已测，供收口比对）：§8.4 的 5 处指纹偏差、§1.4/1.5 的 P0 与预算缺口、§3.1/3.2 的写者歧义、§FG-1..6 的判据修正案。

---

## 九、未覆盖的复核面（诚实登记）

1. **`electron/**`（主进程）是否也发自报头**：派单说不碰，我**未实测**（属 code-b task-2 范围；主进程代码不在本复核口径内）。
2. **P0-b/P0-c 的完整影响面**：我只实测了 P0-a 不足以放行（§1.4）；P0-b/c 对 `tests/ga-collab-logic.test.ts` 的覆盖性**未逐项穷举**（结论方向一致：三者都不接根级 `tests/*.test.ts`）。
3. **`tests/control-tower/check-ownership.test.sh` 逐字节断言**：P0-a 落地后该断言是否全绿**未实测**（不得碰 `scripts/**`，且 P0 未裁定）。
4. **三条 fetch 的运行时可观测性**：我核实了**源码层**三处落点与白名单归属；**未跑**渲染层夹具证明"实收头"（属切片 B 夹具，P0 未裁定前不开工）。
4b. **FG-7 的运行时长证据非我自跑**：我只自跑了**静态证明**（注册顺序 + `:126-131` 逻辑 + 页面 `:89-98` 链路）。"HTTP 恒 404"的**运行时**证据来自仓内既有 D947 产物（`D947-verifier-pr2.md:282`、`D947-code-c-pr2b.md:393`），我**标注为他人证据**。我**未**自跑 `tests/routes/workspace-access-write-endpoint.test.ts`——该文件会起服务、属重型验证，按小队纪律（重型串行 ≤1）让位于队友，避免并发。**若 PLAN 采信 FG-7，建议把该文件的复跑排进串行队列作为独立确认。**
4c. **`tests/electron/**` 13 个既有文件在 P0-a 下的连带改判**：我只复算了其中 1 个（`tests/electron/d948-identity.test.ts` → win）；**13 个逐个改判结果未穷举**（code-b task-2 §6-2 已做，属其范围，我未二次复核）。
5. **`verifyJwtToken` 对 `department` 的字段校验行为**：我只确认 `signJwtToken` 的 `Omit<JwtPayload,'iat'|'jti'|'exp'>` 透传（派单 §三）；**未逐行读** `verifyJwtToken` 的必须字段校验逻辑 ⇒ 若它对字段集做白名单校验，A7（refresh 带 department）可能有额外落点。**列为 PLAN 待证项**。
6. **`getUserStore()` 返回 null 的内存 Map 回退路径（auth.ts:91-95）**：`:94` 的 UserRecord 对象**无 `department` 键**⇒ 该分支下登录 token 的 department 语义未定（派单 open item ③）。我未就"vitest env 下 `createSystemGraphStore()` 是否成功"实测 ⇒ **谁在 `SYNOVA_DB_PATH=':memory:'` 与 `DEV_MODE='true'` 下跑夹具，A1 落点会不同**，须 PLAN 明确。
7. **未跑任何重型验证**（vitest / 全量门禁 / 黄金门禁）：按小队纪律重型串行 ≤1，本轮让位于队友，避免并发。

---

**本轮自验结论**：切片 A 的域/预算结论为 `[通过]`；其余 12 项为 `[阻塞]`/`[建议]`（明细见 §〇 与各节）。
**不作**"通过/审计通过"判定；第 1/2/6/7 项收口后，本复核可 **可提请独立审计**（K3）——合并与否归 CTO 收件闸 + K3 终审。

---

# 第二部分 — PLAN 收口（第 1 / 2 / 6 / 7 项）

> 收口对象：`PLAN.md`，**复核时点已经 commit**（内容提交 `48d860af docs(D948): 第0阶段 PLAN — 23条前提实测 + 三堵墙可达性裁决 + 逐判据落点/夹具/反例`；分支 tip `37861bbe`）。实测 `git status --porcelain` = **空**（工作树干净）。
> 复核读数口径：`[System.IO.File]::ReadAllText` + `\n` 计数（PowerShell `Get-Content`/`Measure-Object -Line` 在本仓库会**漏算空行**，见 §11）。
> PLAN 当前行数 = **244**（`A-recon.md` 437 / `B-recon.md` 392 / `T-V-premise-2nd.md` 336）。

## §11 自我更正（先撤回我自己的两处方法误差）

| # | 我首轮的说法 | 实测（正确） | 结论 |
|---|---|---|---|
| 1 | `tests/routes/auth.test.ts` = **44 行**（并据此暗示 PLAN P20 的"50 行"有误） | **50 行 / 6 个 `it`** | **我方方法误差**：PowerShell `Measure-Object -Line` 对空串计 0 行 ⇒ 6 个空行被吃掉。**PLAN P20 的"50 行；6 个 `it`"完整正确**，派单件 task-1 的"50 行"亦正确。**撤回我 §8.4-⑤ 与该行的"PLAN 有误"取向**。 |
| 2 | （同一方法产生的）对 PLAN §0/§10 行数 `437/392/337` 的"可疑" | `A-recon=437`、`B-recon=392`、`T-V=336` | `437`/`392` **正确**；`337` 与实测 `336` **差 1**（末行换行计数口径）⇒ 降为 `[建议]`（统一口径），**不构成缺陷**。 |

**纪律自陈**：我首轮用了一个**不适用的计数命令**并据此写出"PLAN 有误"的取向——这正是我在 FG 系列里要求别人避免的事。已按"数字必贴原始输出"重测并撤回。**保留的教训**：`Measure-Object -Line` 在本仓库不可用于行数；行数一律用 `ReadAllText + \n` 计数。

## §12 第 1 项 `[阻塞]` 派单 8 项回执 → PLAN 落点逐项

| 回执项（派单 §八） | PLAN 落点 | 判定 |
|---|---|---|
| 1 逐判据 `file:line` + 改前/改后 + **反例夹具原始输出** | §3（A1–A7）/§4（B1–B4）给了落点与改前/改后 + 反例设计；**反例"原始输出"本阶段不可能有**（零实施） | `[建议]` 补一句「§八.1/2 的**原始输出**属 PR 阶段回执，本件只交设计」——现由 §11「不予判定」隐含，字面未声明 |
| 2 三路径夹具输出（正常/降级/边界） | §3/§4 每判据三路径列齐 | `[通过]`（设计层；输出同上属 PR 阶段） |
| 3 团队成员运行记录（成员名·运行状态·**token**·共享任务 id 与状态） | §0 表：成员/产出/**实际行数**/共享任务/状态 齐 | `[建议]` **缺 `token`**（派单 §八.3 字面要求）；建议在 §0 表加 `target`（如 `lead`/`code-a`…）与模型列 |
| 4 `git diff --stat` + `ls-remote` 回执 | §9 有 `ls-remote` 三种 ref + blob 指纹；**`git diff --stat` 全件无** | **`[阻塞]`** —— 且 §0 L23 写「（见 §9 `git diff --stat`）」是**悬空引用**（§9 无该段）。**该改哪一句**：§0 L23 删「（见 §9 `git diff --stat`）」，并在 §9 增设一段 `git diff --stat 11458279..HEAD`（base = `origin/main` tip，**禁本地 `main`**，见 §8.3） |
| 5 未清项清单（诚实登记） | §7 共 **22 条**，含 W1/W2/W3、P0、预算、写集缺口、编制冲突、bash 不可用 | `[通过]`（本项是本件最强的部分） |
| 6 **派单件指纹对账（三条 fetch 坐标三方值）** | §9 **标题**写「三条 fetch 坐标三方值」，**表内容却是 分支/base/main/规格 blob** —— 无任何 `fetch` 坐标 | **`[阻塞]`** 名不符实。**该改哪一句**：§9 增一张表，对 `RightPanel.tsx:160`（`apiFetch` 内）/`:186`（`fetchLatestReportId`）/`:352`（报告 markdown）三处 `fetch` 逐处给「派单件声明 vs 实测 vs 覆盖与否」；本队 §FG-4 已实测三处落点（**B2 只覆盖 1/3**），可直接引用 |
| 7 功能回退 / 新增回退显式登记 | §8 三条，明确写「功能回退（部分恢复，未闭环）」并禁写"已知限制" | `[通过]` |

**小结**：8 项中 **5 `[通过]` / 3 `[建议]`→其中 2 项实为 `[阻塞]`**（第 4 项缺 `git diff --stat` 且悬空引用；第 6 项 fetch 指纹名不符实）。

## §13 第 2 项 — 前提实测表逐条核（命令+口径+输出）

**总体 `[通过]`**：23 条 + §1-补 5 条，口径统一（`ref=ef5c8caa`、读取时刻、worktree、HEAD），未发现"凭记忆"条目。我**独立复算 12 条**，逐条对照：

| 前提 | 我的独立复算 | 一致 |
|---|---|---|
| P4 `auth.ts` 内 `department` 零命中 | `git grep -n` ref 对象 → 零 | ✅ |
| P5 实为 `rbac.ts:127` | `git grep -n department -- src/middleware/rbac.ts` → `:127: department: undefined,` | ✅ |
| P6 三处签发 `:97/:134/:176` | 读 `routes/auth.ts` → 三处 | ✅ |
| P7 落点 `:231-237`/`:287`/`:313` | 读 → 一致（**含 `:313` = `\|\| ws.owner === ctx.userId`**） | ✅ |
| P8/P10 类型在、人口 0 | 三处 `createUser` 调用全不传 department；`:99 extra?.department \|\| ''` | ✅ |
| P13 `DEV_MODE='true'` 全局 | `vitest.config.ts:58-63` | ✅ |
| P15/P16 `Bearer` 零命中；`x-synova-token` **5 处 / 2 文件** | `git grep -n "x-synova-token" ef5c8caa -- electron-renderer` → `RightPanel.tsx:155/159` + `ga-collab.ts:18/44/92` | ✅ |
| P17 `getSeedToken` 在 `:99` | 读 → `:99 export function getSeedToken()` | ✅ |
| P18 写集缺口 `app-store.ts:5/:128` | 读 → 一致 | ✅ |
| P20 `auth.test.ts` = 50 行桩 | `ReadAllText` LF=50、`it(`×6 | ✅（我首轮"44"是方法误差，见 §11） |
| P21/P22/P23 域 | 我自跑 `check-ownership.py` → A `✅ PASS win`；B `❌ FAIL ['mac','win']`；`tests/electron/...` → `win` | ✅ |
| P16 派单 `:157` 实为 `getSeedToken()` 调用行 | 读 `:157 const seedToken = getSeedToken();` | ✅ |
| P12 `/mine` 恒 404 | 我**静态证明**（`:126` 先注册 + `:127-129` 无 guard）；**运行时长证据属队长探针与 D947 仓内产物**（见 FG-7 来源标注） | ✅（来源已标注） |
| P15 `bash` 本机不可用（§7-15） | 我自跑 `bash --version` → 输出为 WSL「没有已安装的分发版」，`exit=-1` | ✅ **成立** |

**`[建议]` 两条（不阻塞）**：
1. P2/P3/P5/P7/P9/P11/P13/P14/P19/P20 的"命令"栏写的是「**读 <file>**」而非可复跑命令 → 与"每条 = 命令 + 口径 + 原始输出"的字面要求有差；建议换成 `git show ef5c8caa:<file> | Select-String -Pattern <段>` 一类原文命令。
2. **P20 引用的命令与引用的数字不同源**：`git show ef5c8caa:tests/routes/auth.test.ts | Measure-Object -Line` 实得 **44**（漏算空行），而 P20 写 **50**。数字对、命令错配 ⇒ 建议把命令改为 `ReadAllText + \n` 计数，或直接标"50 行（含 6 空行）"。
3. `337` vs `336`（T-V 行数，§0/§10）→ 统一口径即可。

## §14 第 6 项 `[阻塞]` 内部一致性（验收命令 vs 期望结果两两比对）

| # | 不一致 | 证据 | 判定 |
|---|---|---|---|
| I-1 | §0 L23「（见 §9 `git diff --stat`）」**悬空** | §9 表内无 `git diff --stat` 行 | `[阻塞]`（同 §12-4） |
| I-2 | §9 标题「三条 **fetch** 坐标三方值」vs 表内容（分支/base/main/blob） | PLAN §9 全表 | `[阻塞]`（同 §12-6） |
| **I-3** | **A4 的反例对 A4 不判别** | A4 = 「manager@sales 的真实 JWT → 响应**不含** marketing 工作区」；而其反例写「去掉 `isSameDepartment` 非空收窄（改 `ctxDept === wsDept`）→ 必红」。该变异在下 `ctx='sales'` / `ws='marketing'` 时**两版均为 false** ⇒ **A4 不变色**，只有**双空/双 `undefined`** 才变色（那是 **A5 的边界路径**） | `[阻塞]` **该改哪一句**：A4 反例改用 A-recon **M8**（`workspaces-api.ts:285-287` 过滤改 `w.visibility === 'global'` → A4 红）；A3 反例补 **M9**（`:286` 删 `w.department === dept` 项 → A3 红）。现 A4 行等于把 A5 的变异体挂错了判据 |
| **I-4** | **A5 的 `canModifyWorkspace === false` 在正确实现上假红**（= 我的 FG-2，PLAN 未纳入） | `rbac.ts:313` = `isSameDepartment(...) || ws.owner === ctx.userId`（**无** `\|\| role === 'admin'`；PLAN §1 P7 已正确记到 `:313`，但 §3 A5 未落这条语义）；department 工作区 `owner = rbac.userId`（`workspaces-api.ts:244`）即建者 | `[阻塞]` **该改哪一句**：A5 正常路径补「**夹具须保证 `ws.owner !== ctx.userId`**」；并加 A5-b 登记「`owner === ctx.userId` 时 `canModifyWorkspace === true`」为**既有语义、不作安全判据**。否则实施者按「A5 不改实现、只加夹具」执行时会卡死在红上，进而去动产品代码（违反决策②） |
| I-5 | A6 观测弱 | 仅断「`role !== 'admin'` + `log.warn` 在场」；403/500/非 JSON 体下 `undefined !== 'admin'` **同为绿** | `[建议]` 加 `status === 401`（`/mine` 非白名单）+ 响应体不含 workspaces + log code ∈ {`AUTH_REJECTED`,`RBAC_DENIED`}（FG-6②） |
| I-6 | §4 标题「受 P0 + **4 项** CTO 裁定阻塞」vs §7 实列 ≥5 项（P0 选项/宿主/预算/W1/W3/B-②） | §4 标题 vs §7-1/2/3/4/6/12 | `[建议]` 数字对齐 |
| I-7 | §3 A1 判据「解码后 `department ===` 该用户记录的部门」在 PLAN 内的**来源已正确收窄**（`InMemoryGraphStore` + `setUserStore` 落库，非 body） | §3 A1 正常路径 | `[通过]`（此即我 FG-1 要求的正解，PLAN 已与决策①自洽） |
| I-8 | §1 P12「❌ A3/A4 字面形态不可实现」与 §3 A3「改口径后用最小 app 探针」 | — | `[通过]`（前后自洽：判据不可实现 → 已换形态并登记） |

## §15 第 7 项 — 编制 / 流程自检

| 检查点 | PLAN 落点 | 判定 |
|---|---|---|
| 成员编制与上限冲突声明 | §0「5 人 vs 预设 ≤4」显式登记 + 请求 CTO 裁定 | `[通过]` |
| 串行规则「A 合了再开 B」 | §5 L142 明文 | `[通过]` |
| 重型验证串行 ≤1 | §5 L142 明文，且本阶段只跑 1 个靶向文件 | `[通过]`（**并实测一致**：我在本阶段**未跑任何 vitest**，避免与队友并发） |
| 工作目录钉死 worktree | §0/§5 各成员唯一写入文件 + §1 口径写 HEAD | `[通过]` |
| 禁项清单（`--no-verify`/`git stash`/force push/临时产物 `/tmp`） | **PLAN 正文无此条款**（A-recon §7 有；PLAN 未复述） | `[建议]` 在 §5 或 §7 补一段禁项清单 |
| 分支/回执 | §7-17 登记分支未推 origin；§9 附 ls-remote | `[通过]` |
| 治理产物域归属 | §6：P0-a+ 三件 → 我**独立复跑** `check-ownership.py docs/synova/coordination/ownership.yaml .github/CODEOWNERS tests/control-tower/check-ownership.test.sh` → `mac ×3` / `✅ PASS 3 个文件同域: mac` | `[通过]`（PLAN 该项声明**实测成立**） |
| A3/A4 新宿主域 | 我复跑：`tests/routes/d948-department-visibility.test.ts` → **`win`**，与 A 其余 6 件合并 ⇒ `✅ PASS 7 个文件同域: win` | `[通过]`（**推荐选项 (iii) 不破坏单域**，7→8 件 ≤12） |
| P0-a+ 是否真能放行 B | PLAN 声明"P0-a+ 后 8 文件 `✅ PASS`" | `[建议]` **该预测在本机不可实测**（须先改 `ownership.yaml`，而治理件属 mac 域、P0 未裁）；覆盖关系可逐文件推出（两个 win 文件恰为新规则目标），但应标注为"**预测值，未实测**"以免被当作已验结论 |

**分支 tip 登记（非缺陷，防误读）**：PLAN 所在分支 tip = `37861bbe chore: bypass COMMITTED 登记 (auto hook, D521)`，其内容为 `.claude/bypass.log` 追加 `COMMITTED | pre-commit PASS (hook 层登记)` —— **不是** `detected-bypass`，**不构成绕过证据**；但回执贴 tip 时应同时给**内容提交 `48d860af`**（同 §8.2 对派单件的处置）。

## §16 答 lead 四问（逐问表态）

**问 1：§2 三堵墙是否成立？**
- **W1（`department` 无生产写入者）→ 我独立复核成立**：全仓库 3 处 `createUser` 调用（`routes/auth.ts:89`、`enterprise.ts:116`、`enterprise.ts:252`）**无一传 `department`**；`user-store.ts:99` 落库为 `extra?.department || ''` ⇒ 经任何 HTTP 路由建出的用户库里是**空串**。派单 §三「签发侧数据源已存在」**在人口层面不成立**。
- **W2（`/mine` HTTP 恒 404）→ 我独立复核成立**（静态证明：`:126` 先于 `:264`，`:127-129` 无 guard；运行时长证据来自队长探针 + D947 仓内产物，来源已在 FG-7 标注）。
- **W3（桌面端无部门工作区消费点）→ 我【未二次复核】**：该条出自 code-b B-recon §N-4，我未独立穷举 renderer 的消费点。**故我只对 W1/W2 表态成立**；W3 需 verifier-tv 二次实测或由其出示命令原文。
- ⇒ 若 CTO 采信"用户可见目标不可达"，§8 的「**功能回退（部分恢复，未闭环）**」是唯一诚实写法；**我支持该登记纪律**，并强调：**不得**因为"达成了签发/验签层"而写成"部门可见性已恢复"。

**问 2：N1 裁决（推翻 code-b N-1）是否认同？**
- **我认同队长的裁决**，理由可核：`getSecret()` 在 `auth.ts:50-65` 是**函数体**，`:51 const secret = process.env.JWT_SECRET;`、`:54 process.env.DEV_MODE === 'true'` 均为**每次调用读 env**（非模块级常量）⇒ 夹具 `beforeAll` 覆写有效；队长亲跑 `tests/middleware/auth.test.ts` = `34 passed (34)` 属物理证据。
- **我不主张"N1 不可满足"**（即不认同 code-b 的 N-1 原文结论）。"先覆写再断言"口径正确。
- **但补一条限定（FG-6①）**：逃生口的充要条件在 `auth.ts:350` `!secret && process.env.DEV_MODE === 'true'` ⇒ **真正关掉它的是 `JWT_SECRET` 存在且 ≥16**；`DEV_MODE !== 'true'` 单独**不充分**。建议 N1 保留两条断言，但在 PLAN 里注明**哪一条是判别性的**，并加一个"确实走了验签分支"的判别器（logger spy 断言 `AUTH_DEV_MODE_GRANT` 未出现 / `RBAC_DENIED` 出现）。这不是否决策裁决，是补判别力。

**问 3：§7-2 A3/A4 宿主三选，是否有更好放法？**
- **我推荐 (iii) 新建 `tests/routes/d948-department-visibility.test.ts`，与队长一致**，并补三条理由：① (i) 把 D948 判据塞进 D947 的**现状锁定**夹具——该文件 `:326-335` 明写「登记性断言在此**锁定现状（不代表期望行为）**」，语义相冲；② (ii) 把 workspace 判据塞进 auth 路由夹具 = 跨主题；③ **(iii) 无域代价**：我实测该路径判 **`win`**，与 A 其余 6 件合并 `✅ PASS 7 个文件同域: win` ⇒ 单域不破、7→8 件 ≤12。
- **更优放法（我未找到）**：另一种是"探针完全独立、不新增文件"——即把最小 app 探针写进**已在集内的** `tests/routes/auth.test.ts`，但那是 (ii) 的变体，语义更差。**故 (iii) 是当前最优**。
- **一条附加要求**：新建文件须在 PLAN 里点明其**域归属实测值**（我已代跑：`win`），并把它计入 A 的 PR 文件数（7→8）。

**问 4：§5 写集互斥 / `src/routes/auth.ts` 单写者 / PR 预算？**
- **A × B 零交集 → `[通过]`**（我按两切片文件清单逐一比对）。
- **`src/routes/auth.ts` 单写者 = code-a → `[通过]`**：派单 §五 仅 A 表列它；B 表正文「不改 `src/**`」；我另穷举该文件在 D948 内的写者，无第二处。
- **PR 预算 → `[阻塞]` 两条要修正**：① PLAN §5 写「A 与队长文件仅 `task-state/D948.json` 相邻但**无重叠**」——**不准确**：派单 §五 A 表把 `task-state/D948.json` 列为 **A 的 7 文件之一**（写者=队长），即**同一文件出现在 phase-0 分支与 PR-1 文件表两处**，应写成「**同一写者、跨分支二次写，须择一**」（我 §3.1 的 `[阻塞]`）；② B 真实最小写集我独立复算 = **8 文件（6 mac + 2 win）** ✓ 与 PLAN 一致，**须 CTO 裁预算**（派单 ≤6）；③ **P0-a+ 能否放行 B 目前是"预测"而非实测**（本机无法先改治理表），建议标注。
- **P0-a+ 三件域归属我独立复跑 = `mac ×3` `✅ PASS`** ⇒ §6「P0-a+ 自身即干净单域 mac PR」**成立**。

## §17 收口后的总表（替换 §〇 的临时摘要）

| 复核项 | 结论 |
|---|---|
| 1 派单 8 项回执落点 | **2 `[阻塞]`**（缺 `git diff --stat` + §0 悬空引用；fetch 指纹名不符实）+ 3 `[建议]` + 3 `[通过]` |
| 2 前提实测表 | `[通过]`（12 条独立复算一致；3 条 `[建议]` 属命令/口径形式问题） |
| 3 写集互斥 | `[阻塞]`（`task-state/D948.json` 跨分支二次写；B 测试写者栏歧义）+ `[通过]`（A×B 零交集、`auth.ts` 单写者、无第六调用方） |
| 4 域与 PR 预算 | `[阻塞]`（**P0-a 原案放行不了 B**；B 真实写集 8 > ≤6；本地 `main` 落后 69 提交的**回执基准**）+ `[通过]`（A 单域 win、证据/治理件域、P0-a+ 三件 mac、新宿主 win） |
| 5 判据可证伪性 | **`[阻塞]` 8 条**（FG-1 A1 回声 / FG-2 A5 假红 / FG-3 A3 短路 / FG-4 B1 负向+覆盖面 / FG-5 白名单靶点 / FG-6 N1 判别力 / FG-7 A3A4 靶端点不可达 / FG-8 `syntheticRbac` 假红假绿） |
| 6 内部一致性 | **`[阻塞]` 3 条**（I-1 悬空引用、I-2 标题失实、**I-3 A4 反例不判别**、**I-4 A5 假红未纳入** —— 共 4 条）+ 2 `[建议]` |
| 7 编制/流程自检 | `[通过]`（编制冲突/串行/重型≤1/worktree/域）/ `[建议]`（补禁项清单；P0-a+ 预测值标注） |
| 8 红线 | `[通过]`（无 `--no-verify`/`stash`/force push 迹象；工作树干净；未碰 `scripts/**`、`scripts/audit/**`）+ 2 条登记（tip 为 auto-hook 登记提交、本地 main 落后） |

**收口后未覆盖面（追加）**：
8. **`tests/middleware/auth.test.ts` 34/34 绿未由我复跑**（属重型验证；队长已跑，我按"重型串行 ≤1"让位）。
9. **W3（桌面端无部门消费点）未二次复核**（归 code-b/verifier-tv）。
10. **P0-a+ 放行 B 的 `✅ PASS` 是预测值**，本机无法先行实测（治理件未改）。
11. **`ELECTRON` 主进程是否发自报头、`tests/electron/` 13 件连带改判**：未复核（前者属 code-b 未决项，后者我只复算了 1 件）。

**最终自验结论**：本 PLAN 的**前提表、三堵墙裁决、功能回退登记、P0-a+ 建议**四项为 `[通过]`；**判据层与回执层共 12 条 `[阻塞]`**（分布见 §17），其中 **I-3/I-4/A5-A4 反例与假红**、**§12-4/6 回执缺口**、**§1.4/1.5 P0-a 与预算**、**§3.1 跨分支二次写** 为"若照此执行，实施者会先撞墙且会误判为自己的问题"的六处。
**本件不判"通过"**；修正上述 `[阻塞]` 后，本复核为 **可提请独立审计**（K3 终审）；合并与否则归 CTO 收件闸。

---

## §18 复核后 PLAN 新版（`0950d771`）对账 —— 2 处仍未收口

**背景**：收口后 PLAN.md 被队长再度提交，`PLAN.md` blob 由 `0b564815`（本件 pin）→ **`0950d771`**（`git diff --numstat 0b564815 0950d771` = `59 10`，+59/−10）。逐条对账如下。

### 18.1 已按本复核改正（我逐条核过，认可）

| 我的条目 | 新版落点 | 核查 |
|---|---|---|
| I-3（A4 反例错挂） | §3 A4 行加「⚠️ **独立复核 I-3 更正**」 | 已响应（**但新挂的变异体仍不成立，见 18.2-A**） |
| I-4（A5 假红） | §3 A5 行加「夹具工作区**必须满足 `ws.owner !== ctx.userId`**」+ A5-b 登记 owner 析取为既有语义 | ✅ **正确且完整**——正是 `rbac.ts:313` 的语义 |
| §3.1（`task-state/D948.json` 跨分支二次写） | §5 改写「同一写者、**跨分支二次写**…**须择一**」+ §7-23 | ✅ **正确**（撤回"无重叠"措辞） |
| §12-4（缺 `git diff --stat`） | §10 增 `git diff --stat origin/main..HEAD` 段（含 6 个文件行数） | ✅ 已补；**仅小瑕**：§0 L23 指针写「见 §10 文件清单 + **§11** `git diff --stat`」，而该段实际在 **§10** ⇒ 指针半错 |
| §12-6（§9 标题 vs 内容） | §9 改题「三条**坐标** × 三方值」+ 口径更正说明 | ⚠️ **可接受但需 CTO 追认**：派单 §八.6 字面是「三条 **fetch** 坐标」；队长改释为"三条 ref 坐标"。若 CTO 原意为三个 `fetch()` 落点，则其实质已由 §4 B-②「15 个 fetch 点仅 1 处带身份」覆盖——**风险低，但属口径变更，宜显式请追认** |
| FG-5 / FG-6 | §7-24 / §7-25 | 已登记（**但 24 的举例端点选错，见 18.2-B**） |

### 18.2 仍未收口（`[阻塞]`，均在 `0950d771` 上复核）

**A. A4 的"改坏即红"仍不成立 —— 负向断言不能被"收窄型"变异体打红**
- 新版 A4 反例 = 「把过滤改 `w.department===dept \|\| w.visibility==='global'`（**去掉 owner 析取**）→ A4 必红」（源自 A-recon §7 `M8`）。
- **逐值验证**（`workspaces-api.ts:285-287`）：A4 场景 = manager@`sales` 断言**列表不含**`department==='marketing'` 的 subMkt（其 `owner` = 建它的 admin，`visibility='department'`）。
  - 原式：三项皆 false ⇒ 不含 ⇒ **A4 绿（正确）**；
  - 新版变异（去掉 owner 析取）：仍两项皆 false ⇒ **仍然不含 ⇒ A4 依旧绿**。
- ⇒ **"去掉一个析取"是收窄，负向断言只会更绿，不可能红**。该变异实际打红的是 **A3 腿 2**（同部门 manager 不再命中 subMkt）——即 A-recon 的 `M8`/`M9` 归属**互换了**（M9 的内容才是 A3 的正解）。
- **正解（A4 唯一判别形态 = 过宽型变异）**：把部门项改成恒真，例如
  `w.department === dept` → `true`（或整条过滤退化为 `list = Array.from(store.values())`）⇒ 异部门 manager 会看到 marketing ⇒ **A4 红、A3 仍绿**（是本卡唯一"只打 A4"的变异体）。
- **该改哪一句**：§3 A4 反例改为「把 `workspaces-api.ts:286` 的 `w.department === dept` 改为 `true`（或过滤退化为全量）→ **A4 必红、A3 保持绿**」；并请 code-a 订正 A-recon §7 中 M8/M9 的归属（M9→A3，A4 需新变异体 M8′）。

**B. §7-24 举的靶端点 `/api/ga/clients` **本身在白名单里** —— 自我矛盾**
- §7-24 写「B2/B3 夹具端点须选**受 JWT 门禁保护**者（**如 `/api/ga/clients`**）」。但实测 `src/middleware/auth.ts:103-133` 白名单**含** `:127 path.startsWith('/api/ga/clients')` ⇒ 该端点**免认证**，正是 FG-5 指出的"无判别力"那一类。
- **正解（非白名单且可达）**：`/api/auth/refresh`（白名单只含 `/api/auth/login`、`/api/auth/register` ⇒ refresh 受 JWT 门禁，A-recon §6-④ 亦同此口径）；或 A-recon §3.2 推荐的 `GET /api/workspaces/:id/context`（HTTP 面可达、同一条部门判据链）。
- **该改哪一句**：§7-24 的举例由 `/api/ga/clients` 改为 **`/api/auth/refresh`**（或 `/api/workspaces/:id/context`），并注明「`/api/ga/clients`、`/api/sentinel/*`、`/api/diagnosis/*`、`/api/solutions*` 均在 `auth.ts:119-131` 白名单内，不得作 B2/B3 靶端点」。

### 18.3 复核后状态

- 本件 pin（`0b564815`）**已被 `0950d771` 取代**；§18.2 两条是在**新版**上复核得出，其余 §1–§17 结论对新版**仍然适用**（新版只动了 §0/§3/A4·A5/§5/§7/§9/§10），因为 §12-4/§12-6 的修正方向已核、I-3/I-4 的**剩余问题已按新版重述**。
- **修订号 pin（更新）**：复核裁决对 **`0b564815` → `0950d771`** 两版均成立；若 PLAN 再出新版，18.2 两条须重算。
- **本件落地**：`edca5b3a` + `2a68ffe4`（本文件）+ 本次追加（§18）——均在本分支；`git rev-list --left-right --count origin/docs/d948-plan...HEAD` = **`0  6`** ⇒ **本地领先 6 提交，尚未 push**。

