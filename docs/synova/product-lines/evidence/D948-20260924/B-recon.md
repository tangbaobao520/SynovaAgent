# D948 / 切片 B — 侦察报告（PLAN 输入，禁写产品代码）

> 作者：**code-b**（切片 B 编码者，mac 域）｜ 载体：`.synova-wt-d948-lead` 工作树内本文件（唯一写入）
> 侦察工作树：`.synova-wt-d948-server`，分支 `feat/d948-identity-chain-server`，**ref = `ef5c8caa`**（实测 `git rev-parse HEAD` = `ef5c8caaf8689cd41ab551495efcd002fb6d4e5f`）
> 派单件口径：`origin/docs/d948-identity-chain-dispatch` tip = `df9dc5ed`（`git ls-remote --heads origin` 实测命中，与队长给定值一致）
> 状态：**PLAN 输入。本阶段未写任何产品代码 / 测试代码**；切片 B 另受 P0 未裁定阻塞，未开工。
> 纪律：每条结论挂「命令 + 原始输出 + 共 N 处」；数字一律来自命令原始输出，无手写；验不出来的写「未能证实」。

---

## §0 环境与口径核对

| # | 核对项 | 命令 | 原始输出 | 判定 |
|---|---|---|---|---|
| 0-1 | 侦察树 ref | `git rev-parse HEAD` | `ef5c8caaf8689cd41ab551495efcd002fb6d4e5f` | 与队长给定 `ef5c8caa` **一致** |
| 0-2 | 侦察树分支 | `git rev-parse --abbrev-ref HEAD` | `feat/d948-identity-chain-server` | — |
| 0-3 | 派单分支 tip | `git ls-remote --heads origin`（grep d948\|d947） | `df9dc5edcaa753830c80c2a3050a27d2d6d21bd8 refs/heads/docs/d948-identity-chain-dispatch` | 与队长给定 `df9dc5ed` **一致** |
| 0-4 | **`feat/d948-identity-chain-server` 是否在 origin** | 同上（穷举 grep `d948`） | 仅 `docs/d948-identity-chain-dispatch`；**无 `feat/d948-identity-chain-server`、无 `feat/d948-identity-chain-desktop`** | ⚠️ 本切片分支**未推 origin**（本地 worktree 持有） |
| 0-5 | `bash` 可用性 | `bash tests/control-tower/check-ownership.test.sh` | `使用 wsl.exe --list --online` / `安装 wsl.exe --install <Distro>` | ⚠️ **bash 不可用**（Win 上 bash 解析到未安装的 WSL 存根）→ 治理 bash 测试/门禁**本机无法复跑**；本报告所有治理实测改用 `python scripts/control-tower/check-ownership.py`（可用，见 §6） |
| 0-6 | 本报告写入范围 | — | 仅本文件；临时产物落 `/tmp/D948-recon/`（实测 `/tmp` 可用） | 合规 |

---

## §1 队长给定前提逐条复核（成立 / 不成立）

> 口径：`ref=ef5c8caa`，读于本次侦察。

| # | 队长前提（原文） | 复核 | 证据（命令 + 原始输出摘要） |
|---|---|---|---|
| P-1 | `git grep "Bearer" electron-renderer` 与 `git grep -i "login" electron-renderer` **均零命中** | ✅ **成立** | `git grep -n "Bearer" -- electron-renderer` → `exit=1`（零命中，无输出）；`git grep -in "login" -- electron-renderer` → `exit=1`（零命中）。**补测**：`git grep -n "Authorization" -- electron-renderer` → `exit=1`（零命中） |
| P-2 | `RightPanel.tsx:157-163` 的 apiFetch 逻辑；**`opts.headers` 存在时 baseHeaders 被整体丢弃** | ⚠️ **代码事实成立；但「自报头在那些调用点其实没被发出去」不成立** | 代码事实：`RightPanel.tsx:162` 原文 `headers: opts?.headers ?? baseHeaders,`（`??` = 整体替换而非合并）。**反证**：`git grep -n "apiFetch" -- electron-renderer` = **共 20 处**，其中真实调用点 **12 处**（`:288 :289 :405 :423 :438 :694 :761 :828 :891 :905 :935 :964`）。逐点看第二/第三实参：`undefined`（288/289/891/905）、无第二参（405/694/761/828）、`{ method:'POST', body: JSON.stringify(...) }`（423/438/935/964）——**无一传 `headers`** ⇒ 12 处全部走 `?? baseHeaders` ⇒ **seed 头实际被发出**。风险性质 = **潜在/维护期**（新增 call site 传 headers 即静默丢身份），**非当前激活** |
| P-3 | `ga-collab.ts:47 DevSeedIdentity / :54 GA_SEED_STORAGE_KEY / :65 getSeedIdentity / :99 getSeedToken` | ✅ **成立** | 逐行命中：`:47 export interface DevSeedIdentity {`、`:54 export const GA_SEED_STORAGE_KEY = 'synova.dev-identity';`、`:65 export function getSeedIdentity(): DevSeedIdentity \| null {`、`:99 export function getSeedToken(): string \| null {` |
| P-4 | **写集缺口**：`app-store.ts:5` import `getSeedIdentity`、`:128` `return getSeedIdentity() ? 'ga' : 'admin'` | ✅ **成立** | `:5 import { getSeedIdentity } from './ga-collab';`、`:127-129 function bootUserRole(): UserRole { return getSeedIdentity() ? 'ga' : 'admin'; }` |
| P-5 | **测试缺口**：`tests/ga-collab-logic.test.ts:14-29` import、`:57-97` 断言 | ✅ **成立** | `:19 getSeedIdentity,` `:20 getSeedToken,`（import 块 `:14-29`）；`describe('D556 getSeedIdentity/getSeedToken: seed 身份读取'` 在 `:57`，用例体 `:57-99`（`:58` `expect(identity).toEqual(...)`、`:62` `expect(getSeedToken()).toBe('ga:default:ga-seed-1')`、`:66/:73/:81/:86/:88/:90/:95/:97` 均为 `expect(getSeedIdentity()).toBeNull()`） |
| P-6 | `electron-renderer/src/lib/api.ts` 全 39 行，只有 `getApiBase()`，无 authHeaders | ✅ **成立** | 读全文 = 39 行；唯一 export = `:28 export function getApiBase(): string`；`authHeaders` 零命中（`git grep -n "authHeaders" -- electron-renderer` → 零） |
| P-7 | `vitest.config.ts:28` include 仅 `./tests/**/*.test.ts` 与 `*.integration.test.ts` | ✅ **成立** | `:28 include: ['./tests/**/*.test.ts', './tests/**/*.integration.test.ts'],` |
| P-8 | root lockfile 无 react-dom；先例 `tests/electron/right-panel-report-sentinel.test.ts:19-24` 走 test-support 桥接 + mock react-markdown | ✅ **成立** | `package-lock.json`（12097 行）中 `node_modules/react-dom` 出现 **0 次**（`node_modules/react-markdown` 1 次 / `node_modules/zustand` 1 次 / `node_modules/react"` 1 次）；先例文件 `:19 import { renderToStaticMarkup } from '../../electron-renderer/src/test-support/render';`、`:24 vi.mock('react-markdown', () => ({ default: () => null }));`；`electron-renderer/package.json` dependencies 确有 `react-dom ^18.3.1`、`react-markdown ^10.1.0`（子包有、root lock 无） |
| P-9 | `tests/electron/` 现 13 个文件 | ✅ **成立** | `git ls-files tests/electron/` = **共 13 个文件**（auto-update / backend-spawn / capability / desktop-build / dual-guide-packaging-guard / ipc-contract / mac-install-verify / notification-center / right-panel-report-sentinel / upgrade-data-verify / use-streaming-contract / use-streaming-conversation / win-install-verify） |
| P-10 | P0 实测：切片 B 写集 = FAIL 跨域；治理三件均判 mac | ✅ **成立**（本报告 §6 复跑 + 扩展） | 见 §6-1 / §6-4 |

### §1-补 队长**未提**的实测发现（本次新增，均带证据）

| # | 发现 | 证据 |
|---|---|---|
| N-1 | **N1 硬前置在 root vitest 下恒红（判据与禁项直接冲突）** | `vitest.config.ts:58-63` `env: { DEV_MODE: 'true', PORT: '3099', SYNOVA_DB_PATH: ':memory:', SYNOVA_SKIP_MCP: '1' }`，且全文件**无 `setupFiles`**（65 行全文已读）。派单 §六 N1 要求每个身份夹具 `beforeAll` 断言 `process.env.JWT_SECRET?.length >= 16` 与 `process.env.DEV_MODE !== 'true'` —— 在 root vitest 下**两条都不成立**（配置硬写 `DEV_MODE='true'`，且无任何环境注入 JWT_SECRET）；而「改 `vitest.config.ts`」是派单切片 B 明文**禁项**（§五「不做」）。⇒ **N1 作为文字判据不可满足**，须改口径（见 §7-1） |
| N-2 | **B1 现值不是 0，是 5 处（4 处注释）** | `git grep -n "x-synova-token" -- electron-renderer/src` → **共 5 处**：`RightPanel.tsx:155`（注释）、`RightPanel.tsx:159`（**唯一实现行**）、`ga-collab.ts:18`（注释）、`ga-collab.ts:44`（注释）、`ga-collab.ts:92`（注释）。⇒ B1（「→ 0 命中」）要成立必须**连注释一并清理**；且 **B1 本身是 grep 型静态判据**，与本队铁律「禁 grep 型静态判据当验收」冲突（见 §7-2） |
| N-3 | **renderer 侧 15 个真实 fetch 调用点，只有 1 处带身份头** | `git grep -n "fetch(" -- electron-renderer/src` = **共 16 处**，其中 `lib/api.ts:5` 是**注释**（`相对路径 fetch('/api/...') 失效`）⇒ 真实调用点 **15 个**。明细（见 §3-2 表）。除 `RightPanel.tsx:160`（apiFetch，带 seed 头）外，**其余 14 处零身份**；含主用户路径 `useStreaming.ts:303`（`/api/diagnosis/consult`）与非白名单端点 `LeftPanel.tsx:63`（`/api/ga/clients`） |
| N-4 | **桌面端没有「部门工作区」消费点** | `git grep -n -E "api/workspaces\|department\|部门" -- electron-renderer/src` = **共 1 处**，且是注释：`useWorkspaces.ts:19`「MVP: 本地创建，不调用 API。未来通过 /api/workspaces POST 实现」。⇒ 派单 §一 的用户可见目标（「打开部门工作区看到本部门」）在桌面端**今日没有落点**（见 §7-4） |
| N-5 | **主进程不自报头**（派单说「不碰」，实测确无） | `git grep -n -E "x-synova-token\|Bearer\|Authorization" -- electron` → `exit=1`（零命中）；`electron/main.cjs` 唯一网络点 `:299 const res = await fetch(\`${SERVER_URL}/api/cockpit/data\`);`（`-B4 -A6` 上下文实测，**无 headers 实参**）；`git grep -n -i -E "token\|auth\|login" -- electron/preload.cjs` → `exit=1`（零命中） |
| N-6 | **mac 域写者视角的额外跨域面**：治理金测试是**逐字节 drift 门禁** | `tests/control-tower/check-ownership.test.sh`（全文已读）§7 断言 `.github/CODEOWNERS` 与 `--emit-codeowners` 输出**逐字节一致**；且 §1 只断言 `tests/control-tower/ownership.test.sh` 的 `--owner mac`（该文件**不存在**，靠「尚未创建的路径也可判域」通过）。`git grep -n -E "tests/electron\|electron-renderer\|tests/ga-collab" -- tests/control-tower/` = **共 0 处** ⇒ 治理测试**不**枚举 tests/electron，P0-a 不会因 golden 断言而红，但**必须同批重跑 emit** |

---

## §2 必答 1 — B1–B4 逐判据实现落点（文件 + 改前/改后草稿）

> 判据原文取自派单 §六「切片 B 判据」B1–B4。

### B1 `grep -rn "x-synova-token" electron-renderer/src` → 0 命中

| 项 | 内容 |
|---|---|
| 落点 | `electron-renderer/src/components/RightPanel.tsx:155`（注释）、`:157`+`:159`（实现）；`electron-renderer/src/stores/ga-collab.ts:18`、`:44`、`:92`（注释，随 `getSeedToken`/`DevSeedIdentity`/文件头 D551 契约注释一并清理） |
| 改前 | `RightPanel.tsx:157-159`：`const seedToken = getSeedToken();` / `const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };` / `if (seedToken) baseHeaders['x-synova-token'] = seedToken;` |
| 改后草稿 | 三行删除；`RightPanel.tsx:10` 的 `getSeedToken,` import 同步删除；`ga-collab.ts` 删 `getSeedToken()`（`:91-102`）与 `DevSeedIdentity`（`:46-51`） |
| 风险 | 现值 **5 处**（N-2）：只删实现不删注释 → 判据红 |
| 判别性 | ⚠️ **B1 是 grep 型静态判据，不得单独当验收**（见 §7-2）。必须配行为夹具：**无 token ⇒ 桩 fetch 实收 headers 不含任何身份键**（改坏即红，见 §5-B3） |

### B2 有 token 时请求头含 `Authorization: Bearer <jwt>`（桩 fetch 断言实收头）

| 项 | 内容 |
|---|---|
| 落点（必覆盖） | ① `electron-renderer/src/lib/api.ts` 新增**唯一头装配点**（如 `authHeaders(extra?)`）；② `electron-renderer/src/components/RightPanel.tsx:160-163` apiFetch 改用它；③ **N-3 列出的其余 14 个 fetch 点**（凡指向受 JWT 门禁保护的端点者） |
| 改前 | `:160-163` `const res = await fetch(\`${getApiBase()}${path}\`, { ...opts, headers: opts?.headers ?? baseHeaders });` |
| 改后草稿（**合并式而非覆盖式**） | `const res = await fetch(\`${getApiBase()}${path}\`, { ...opts, headers: authHeaders(opts?.headers) });`，其中 `authHeaders` 语义 = `{ 'Content-Type':'application/json', ...extra, ...(token ? { Authorization: \`Bearer ${token}\` } : {}) }`——**杜绝 `??` 覆盖导致的静默丢头**（P-2 的潜在风险在此一并收口） |
| 判别性 | **反例**：改发 `x-synova-token` → 桩 fetch 实收头断言红。**本条覆盖不足即判据在真实链路上不成立**（见 §7-3） |

### B3 无 token 时：不附任何身份头 + UI 呈现「需要登录」

| 项 | 内容 |
|---|---|
| 落点（逻辑） | `auth-session.ts` 导出 `getAuthToken(): string \| null` / `getAuthState(): 'signed-in' \| 'signed-out'`；`api.ts:authHeaders()` 无 token ⇒ **不产出 `Authorization`**，且**不得**产出 `x-synova-token` |
| 落点（UI） | ① 入口 = 新建 `electron-renderer/src/components/LoginPanel.tsx`；② 显性态 = 复用仓内**既有降级呈现先例**：`RightPanel.tsx:379-381` 的 `degradedReason` 提示条（`⚠ {degradedReason}`）+ `ga-detail-sections.tsx` 的 `cap-degraded-banner`（先例测试 `tests/ga-collab-ui.test.ts` 场景 4 断言该 banner）；③ **必须移除** `app-store.ts:127-129 bootUserRole()` 的 seed→role 派生，改为由 auth-session 会话态决定 |
| 改前 | `app-store.ts:128 return getSeedIdentity() ? 'ga' : 'admin';` |
| 改后草稿 | `return getAuthSession() ? getAuthSession().role : 'staff';`（无会话 ⇒ 只读/最低权，**不猜 admin**）；**具体取值域须 CTO 裁定**（见 §7-4a） |
| 判别性 | **反例 1**（判据明文）：无 token ⇒ 回退 dev/seed 身份 → 红。**反例 2**：无 token 却仍渲染出已登录态 UI（如 GA 面板/角色徽章）→ 红。**反例 3**：UI 静默降级（无"需要登录"文案却也不报错）→ 红（铁律 11 静默降级禁止） |

### B4 登录成功后 token 落存储，后续请求自动带 Bearer

| 项 | 内容 |
|---|---|
| 落点（写） | `auth-session.ts`：`login(account, password)` → `POST /api/auth/login` → 取响应 token → `localStorage.setItem(KEY, token)` |
| 落点（读/接线） | `authHeaders()` 读 `localStorage.getItem(KEY)` → 全 fetch 点自动带（B2 已铺唯一装配点） |
| 键名建议 | 跟仓内 `synova:` **冒号族**先例：`synova:last-session-id`（`conversation-store.ts:49`）、`synova:last-report-id`（`app-store.ts:135`）、`synova:read-tickets`（`useNotifications.ts:29`）⇒ 建议 `synova:auth-token`（或存会话对象 `synova:auth-session`）。**注意**：既有 `synova.dev-identity`（点号，`ga-collab.ts:54`）是本族**异类**，随 B1 一并退役 |
| 形态建议 | **只落 token 字符串**（最小面、最小泄露）；**不落账号密码**；**不落 payload 明文**（role/orgId/department 由服务端每次验签给出，客户端不得自持权威身份） |
| 判别性 | **反例 A**：登录成功但不落存储 → 红（判据明文）。**反例 B**：落存储但 `authHeaders()` 未接 → 后续请求实收头无 Bearer → 红（「接线了 ≠ 被执行」） |
| ⚠️ 前置依赖 | `POST /api/auth/login` 的**路径与响应 token 字段名**由**切片 A**（`src/routes/auth.ts`）定义；A **未合 main**（派单 §〇 `IN_MAIN=no`）⇒ B4 夹具**在 A 的接口契约冻结前无法写**（见 §7-6） |

### §2-附 判据 → 落点总表

| 判据 | 主落点文件 | 域 | 夹具 | 反例（改坏即红） |
|---|---|---|---|---|
| B1 | RightPanel.tsx / ga-collab.ts（清理 5 处） | mac | 行为夹具（非 grep） | 恢复附头一行 |
| B2 | lib/api.ts（新 authHeaders）+ RightPanel.tsx + 14 个 fetch 点 | mac | 桩 fetch 实收头 | 改发 `x-synova-token` |
| B3 | lib/api.ts + LoginPanel.tsx（新）+ app-store.ts + RightPanel.tsx | mac | 桩 fetch 实收头（无身份键）+ render 字符串断言 | 无 token 回退 seed 身份 |
| B4 | auth-session.ts（新）+ LoginPanel.tsx（新） | mac | 桩 fetch（登录请求 + 带 Bearer 的后续请求） | 登录不落存储 / 落存储但不带头 |

---

## §3 必答 3 — B4 的 token 落存储键名/形态 + 「后续请求自动带 Bearer」接线路径

### §3-1 现状接线路径（api.ts 只有 getApiBase，无 authHeaders）

```
[当前]  LoginPanel: 不存在（git ls-files electron-renderer/src/components/ 共 14 个文件，无 LoginPanel.tsx）
  ↓
RightPanel.tsx:157  getSeedToken()  ──→ ga-collab.ts:99 ──→ getSeedIdentity() ──→ localStorage['synova.dev-identity']
  ↓
RightPanel.tsx:159  baseHeaders['x-synova-token'] = 'ga:<orgId>:<userId>'
  ↓
RightPanel.tsx:162  headers: opts?.headers ?? baseHeaders   ← 仅 apiFetch 一处生效
  ↓
[目标]  auth-session.ts(新)  → localStorage['synova:auth-token']  → api.ts:authHeaders()  → 全部 15 个 fetch 点
```

### §3-2 必须接线的 fetch 点全表（N-3 展开，共 16 命中 / 15 真实调用点）

| # | 坐标 | 端点 | 当前头 | 是否受 JWT 门禁（依据） |
|---|---|---|---|---|
| 1 | `lib/api.ts:5` | —（**注释**，非调用点） | — | — |
| 2 | `App.tsx:52` | `/health` | 无 | 白名单（健康检查） |
| 3 | `CenterPanel.tsx:39` | `/api/sessions/:id` | 无 | 待切片 A 口径确认 |
| 4 | `LeftPanel.tsx:63` | `/api/ga/clients` | 无 | **非白名单**（L1 审计：`auth.ts` 白名单含 `/api/sentinel/*`，不含 `/api/ga/clients`） |
| 5 | `LeftPanel.tsx:74` | `/api/sessions?limit=20` | 无 | 待确认 |
| 6 | `LeftPanel.tsx:100` | `/api/sentinel/signals` | 无 | 白名单内含 `/api/sentinel/*` |
| 7 | `LeftPanel.tsx:110` | `/api/loops/status` | 无 | 待确认 |
| 8 | `LeftPanel.tsx:123` | `/api/actions` | 无 | 待确认 |
| 9 | `LeftPanel.tsx:139` | `/api/ga/switch/:orgId`（POST） | 无 | **非白名单** |
| 10 | `RightPanel.tsx:160` | apiFetch（多端点） | **seed 头（唯一）** | 视 path 而定 |
| 11 | `RightPanel.tsx:186` | `/api/diagnosis/reports?limit=1` | 无 | **非白名单**（L1 审计同族） |
| 12 | `RightPanel.tsx:352` | `/api/diagnosis/consult/:id/report?format=markdown` | 无 | **非白名单** |
| 13 | `useNotifications.ts:148` | `/api/sentinel/tickets` | 无 | 白名单内含 |
| 14 | `useNotifications.ts:195` | `/api/sentinel/tickets/:id/transition` | `Content-Type` | 白名单内含 |
| 15 | `useStreaming.ts:303` | `/api/diagnosis/consult` \| `/api/conversations`（**主用户路径**） | `Content-Type` | **非白名单** |
| 16 | `llm-config.ts:134` | 由 `init` 决定 | `Content-Type`（`:185`/`:210`） | 待确认 |

> 结论：B2/B4 若只落在 `api.ts` + `RightPanel.tsx`，**第 3–9、11–16 号点仍是零身份请求** ⇒ 判据「后续请求自动带 Bearer」在真实链路上**不成立**（§7-3）。

---

## §4 必答 2 — B3 的「UI 显性呈现需要登录」落点与判别性

| 维度 | 结论 |
|---|---|
| **入口** | `LoginPanel.tsx`（新建，mac）。今日**无任何登录 UI**：`git grep -in "login" -- electron-renderer` = 零命中；`electron-renderer/src/components/` 14 个文件无 LoginPanel |
| **挂载点候选** | `App.tsx`（根组件，153 行）：无任何登录门/启动门；候选挂载位 = ① `:123` 根 div 内的全屏遮罩（未登录⇒挡主界面），② `WelcomeScreen.tsx`（已有"首启向导"语义，但本卡不动它）。**须 CTO 裁定**（见 §7-4b） |
| **显性呈现先例（复用，勿新造）** | `RightPanel.tsx:379-381` 的 `degradedReason` 条；`ga-detail-sections.tsx` 的 `cap-degraded-banner`（先例断言 `tests/ga-collab-ui.test.ts` 场景 4）；`App.tsx:71 setLlmUnconfigured(true)` + 黄条（D575，`app-store.ts:84-85`）——**「未配置」类黄条是仓内既有范式**，"需要登录"应同形 |
| **不得做的事（判别性）** | ① 无 token ⇒ **不得**静默降级（铁律 11）；② 无 token ⇒ **不得**回退 dev/seed 身份（判据明文反例）；③ 无 token ⇒ **不得**伪造身份（含把 `userRole` 猜成 `'admin'`）；④ 401 时**不得**吞错（须留痕 + 呈现） |
| **可判别夹具** | 逻辑层：无 token 的 `authHeaders()` 返回 headers **无任何身份键**（枚举断言：`Authorization`、`x-synova-token`、`token`、`x-auth-*` 逐键 `toBeUndefined`）。UI 层：`renderToStaticMarkup(<LoginPanel …/>)` / `renderToStaticMarkup(<RightPanel …/>)` 字符串断言含「需要登录」文案、**不含**已登录态标记。⚠️ 见 §5 限制：`render.ts` 只吃**纯函数组件树**（`:17` 原文明示含 hook 的组件不适用）→ LoginPanel 若用 `useState` 则 UI 断言须下沉到**纯展示子组件** |

---

## §5 必答 4 — 夹具方案（B2/B3/B4）

### 5-1 硬约束（实测）

| 约束 | 证据 |
|---|---|
| 渲染层测试**只能住 `tests/`** | `vitest.config.ts:28` include 仅 `./tests/**/*.test.ts` + `*.integration.test.ts` |
| root 无 `react-dom` ⇒ 必须走桥接 | `package-lock.json`（12097 行）中 `node_modules/react-dom` **0 次**；桥接 = `electron-renderer/src/test-support/render.ts`（91 行，零依赖元素树序列化器） |
| 桥接**只吃纯函数组件树** | `render.ts:17` `@error — 非纯函数组件（class 组件/hook 组件）调用即抛`；`:65-68` 直接调用 FC 展开、**不执行 hook/effect** |
| 必须 mock `react-markdown` | 先例 `tests/electron/right-panel-report-sentinel.test.ts:21-24`（`vi.mock('react-markdown', () => ({ default: () => null }))`）——RightPanel 顶部 `:151` 真 import |
| **「桩 fetch 断言实收头」先例已存在** | `tests/electron/use-streaming-conversation.test.ts:127-131` `const init = fetchMock.mock.calls[callIndex]?.[1];` + `:147 expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')`；`tests/electron/notification-center.test.ts:68` `vi.fn(async (input: string \| URL \| Request, init?: { method?: string; body?: string }) => {` |
| ⚠️ 现有先例**只记 URL 不记 init** | `right-panel-report-sentinel.test.ts:72-88` 的桩 `calls.push(url)` 仅存 URL（`:74 vi.fn(async (input: string \| URL \| Request) => {`，**无第二参**）⇒ B2 的新夹具**必须**升级为记录 `(url, init)` |
| `tests/` 内 `headers` 出现 | `git grep -n "headers" -- tests/electron/ tests/ga-collab-ui.test.ts tests/ga-collab-logic.test.ts` = **共 0 处** ⇒ 无现成"实收头"断言可抄，须自建 |
| 环境注入 | `vitest.config.ts:58-63` 强制 `DEV_MODE='true'`、`PORT='3099'`、`SYNOVA_DB_PATH=':memory:'`、`SYNOVA_SKIP_MCP='1'`；**无 `setupFiles`** ⇒ N1 冲突（N-1） |

### 5-2 夹具形态（建议，逐判据）

```ts
// tests/electron/d948-identity-chain.test.ts（P0 裁定后落此，单域）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from '../../electron-renderer/src/test-support/render';
vi.mock('react-markdown', () => ({ default: () => null }));

// 桩 fetch：**同时记录 url 与 init**（升级 §5-1 的先例）
function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  }));
  return { calls };
}
```

| 判据 | 夹具断言（可判别） | 反例（改坏即红） |
|---|---|---|
| **B2** 正常路径 | `localStorage['synova:auth-token'] = '<jwt>'` → 触发请求 → `const h = new Headers(calls[0].init?.headers); expect(h.get('Authorization')).toBe('Bearer <jwt>')` | 改发 `x-synova-token` ⇒ `h.get('Authorization')` 为 null ⇒ 红 |
| **B2** 边界 | token 为空串 / 只有空白 → `h.get('Authorization')` 为 null（不得产出 `'Bearer '`） | 产出 `'Bearer '` ⇒ 红 |
| **B3** 降级路径 | 无 token → **逐键枚举**断言 `['authorization','x-synova-token','token','cookie']` 全部 `toBeUndefined`；且 `renderToStaticMarkup(<LoginPanel/>)` 含「需要登录」 | 无 token 却回退 seed 身份 / 静默无提示 ⇒ 红 |
| **B4** 正常路径 | `login()` 后 `localStorage['synova:auth-token']` 非空；**紧接的第二个请求** `calls[1].init.headers` 含 `Bearer`（桩服务端夹具） | 落存储但第二请求无 Bearer ⇒ 红（「接线了 ≠ 被执行」） |
| **B4** 降级 | 登录 401/网络异常 ⇒ 不落存储 + `console.warn` 留痕 + UI 呈现错误（铁律 24/31） | 静默吞错 ⇒ 红 |
| **N1 前件** | ⚠️ **不可按派单原文写**（N-1）。改法见 §7-1 | — |

### 5-3 三路径覆盖（派单 §六 要求）

正常（有 token → Bearer 发出）/ 降级（`localStorage` 不可达 或 登录失败 → `console.warn` + 显性呈现）/ 边界（空串 token、`undefined` token、非法 token 形态 → 一律不产出身份头，fail-closed）。

---

## §6 必答 5 — P0 影响面：三选项实测矩阵

> 全部为**本机实测**，命令 `python scripts/control-tower/check-ownership.py <文件…> [--yaml <副本>]`；副本在 `/tmp/D948-recon/`（只读原表，不改仓库）。

### 6-0 B 切片候选写集（含缺口，8 文件）

```
mac  electron-renderer/src/stores/auth-session.ts      (新建)
mac  electron-renderer/src/stores/ga-collab.ts         (改)
mac  electron-renderer/src/components/RightPanel.tsx   (改)
mac  electron-renderer/src/components/LoginPanel.tsx   (新建)
mac  electron-renderer/src/lib/api.ts                  (改)
mac  electron-renderer/src/stores/app-store.ts         (改 ← 队长实测的写集缺口 1)
win  tests/electron/d948-identity-chain.test.ts        (新建)
win  tests/ga-collab-logic.test.ts                     (改 ← 队长实测的写集缺口 2)
❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win'] —— 单个 PR 只许一个域（无归属 0，域判定豁免 0）
exit=1
```

对照组（仅 6 个 mac 源码，**不含 tests**）：`✅ PASS 6 个文件同域: mac（无归属 0，域判定豁免 0）`，`exit=0`。

### 6-1 三选项实测矩阵

| 选项 | 落地文件清单 | 域归属实测（B 候选写集 8 文件） | 失败模式 |
|---|---|---|---|
| **P0-a（派单推荐原案）** `tests/electron/** → mac` | ① `docs/synova/coordination/ownership.yaml`（**实测 mac**）② `.github/CODEOWNERS`（**实测 mac**，须重跑 `--emit-codeowners`）③ `tests/control-tower/check-ownership.test.sh`（**实测 mac**，drift/结构断言） | ❌ **FAIL 跨域 ['mac','win']** —— `mac` ×7 + `win  tests/ga-collab-logic.test.ts`，`exit=1` | **原案不足以放行切片 B**：`tests/ga-collab-logic.test.ts` 在 `tests/` 根，不经 `tests/electron/**` 规则 ⇒ 仍判 win ⇒ 单域仍不成立 |
| **P0-a+（本报告修正建议）** `tests/electron/** → mac` **且** `tests/ga-collab-logic.test.ts → mac` | 同上三件（治理件全 mac） | ✅ **PASS 8 个文件同域: mac（无归属 0，域判定豁免 0）**，`exit=0` | ① 治理件是 mac 域 ⇒ 须 Mac-CTO 收件；② CODEOWNERS 必须同批重跑 emit（drift 门禁**逐字节**）；③ `tests/electron/` **13 个既有文件全部改判 mac**（含 D716 Win 建的 `dual-guide-packaging-guard.test.ts`）⇒ 需 CTO 一句裁定 |
| **P0-b** 只把 `tests/electron/d948-*.test.ts` 登记进 `domain_neutral` | `docs/synova/coordination/ownership.yaml` **一行** | ❌ **FAIL 跨域 ['mac','win']（域判定豁免 1）**，`exit=1`：`· domain-neutral  tests/electron/d948-identity-chain.test.ts` 生效，但 `win  tests/ga-collab-logic.test.ts` 仍在 | 打补丁不治病；**D948 本卡就过不去**；下次桌面改动照旧撞 |
| **P0-c** 测试改放 `electron-renderer/src/**` 并扩 vitest include | 落到 `vitest.config.ts`（**判 win**）+ 若干 `electron-renderer/src/**` | 未模拟（结论由表结构直接给出）：`vitest.config.ts` = win，与 mac 源码同 PR ⇒ **新的跨域** | 更绕；且 `include` 改动影响**全仓测试收集面**（非本卡局部） |

### 6-2 P0-a 的连带改判（实证：`tests/electron/` 13 文件全变 mac）

```
mac  tests/electron/auto-update.test.ts
mac  tests/electron/backend-spawn.test.ts
mac  tests/electron/capability.test.ts
mac  tests/electron/desktop-build.test.ts
mac  tests/electron/dual-guide-packaging-guard.test.ts   ← D716 Win 建的，改判 mac
mac  tests/electron/ipc-contract.test.ts
mac  tests/electron/mac-install-verify.test.ts
mac  tests/electron/notification-center.test.ts
mac  tests/electron/right-panel-report-sentinel.test.ts
mac  tests/electron/upgrade-data-verify.test.ts
mac  tests/electron/use-streaming-contract.test.ts
mac  tests/electron/use-streaming-conversation.test.ts
mac  tests/electron/win-install-verify.test.ts
✅ PASS 13 个文件同域: mac（无归属 0，域判定豁免 0）   exit=0
```

### 6-3 P0-a 对 CODEOWNERS 产物的影响（drift 门禁）

- 模拟 `--emit-codeowners --yaml /tmp/D948-recon/p0a.yaml` → `emit exit=0`；
- 生成产物**新增一行** `tests/electron/**                        @tangbaobao520`（`Select-String` 命中 **共 1 行**）；
- 现行 `.github/CODEOWNERS` 中 `tests/electron` 命中数 = **0**；
- `tests/control-tower/check-ownership.test.sh` §7 断言「`.github/CODEOWNERS` 与生成结果**逐字节一致**」⇒ **P0-a 必须同批重写 `.github/CODEOWNERS`**，否则该治理测试红。
- 治理测试**不需要**新增断言：`git grep -n -E "tests/electron|electron-renderer|tests/ga-collab" -- tests/control-tower/` = **共 0 处**（不枚举这些路径）。
- 结构约束：新规则**须落在 `**` 兜底之后**（`ownership.yaml` 语义「按顺序求值，最后匹配者胜出」；`check-ownership.test.sh` §7 亦断言兜底行号在 Mac 例外之前）。

### 6-4 治理三件域归属复跑（与队长实测一致）

```
mac  docs/synova/coordination/ownership.yaml     ✅ PASS 1 个文件同域: mac   exit=0
mac  .github/CODEOWNERS                          ✅ PASS 1 个文件同域: mac   exit=0
mac  tests/control-tower/check-ownership.test.sh ✅ PASS 1 个文件同域: mac   exit=0
```

### 6-5 P0 表缺口的结构性证据（现行 `ownership.yaml`）

- `git grep -n -E "electron|^tests|^\s+- 'tests" -- docs/synova/coordination/ownership.yaml` → 仅 `:172 - glob: "electron/**"` 与 `:175 - glob: "electron-renderer/**"`（**均为 mac**）；
- **无 `tests/electron/**` 规则** ⇒ 落 `**` 兜底 → win（`ownership.yaml` 兜底 `- glob: "**" / owner: "win" / default: true`）。
  文件共 164 行（`Measure-Object -Line`）。

---

## §7 必答 6 — 未决项诚实登记（含「主进程是否也发自报头」）

| # | 未决项 | 实测/依据 | 需要谁裁 |
|---|---|---|---|
| 7-1 | **N1 前置与 `vitest.config.ts` 的 `DEV_MODE='true'` 直接冲突** | `vitest.config.ts:58-63`（`env: { DEV_MODE:'true' }`）+ 无 `setupFiles`；N1 两断言（`JWT_SECRET≥16` / `DEV_MODE≠'true'`）在 root vitest 下**恒不成立**；改 `vitest.config.ts` 是切片 B 禁项 | **CTO**：要么改 N1 口径为「夹具内 `vi.stubEnv('DEV_MODE','false')` + 断言"覆盖后有效值"且**记录覆盖动作**」，要么把 `vitest.config.ts` 移出禁项（＝扩写集，走 §十 规则）。**不得**让 N1 静默失效（这正是派单自己警示的「空转而非通过」） |
| 7-2 | **B1 是 grep 型静态判据，与本队纪律「禁 grep 型静态判据当验收」冲突** | B1 原文 = `grep -rn "x-synova-token" electron-renderer/src → 0 命中`；且现值 5 处含 4 处注释 | **CTO**：确认 B1 降级为「辅助指纹」，验收以行为夹具（无 token ⇒ 实收头零身份键）为准 |
| 7-3 | **B2/B4 覆盖面不足**：15 个真实 fetch 点中 14 个零身份，且**均不在派单切片 B 写集**（`useStreaming.ts` / `LeftPanel.tsx` / `useNotifications.ts` / `llm-config.ts` / `CenterPanel.tsx` / `App.tsx`） | §3-2 全表（`git grep -n "fetch(" -- electron-renderer/src` = 16 处，1 处注释） | **CTO**：裁定「B2 只保证 apiFetch 链」是否可接受；若否，须扩写集（新增 6 个 mac 文件，仍在 PR ≤12 文件上限内） |
| 7-4a | **`bootUserRole` 的目标取值域未定** | `app-store.ts:10 export type UserRole = 'admin' \| 'manager' \| 'ga' \| 'liaison' \| 'staff'`；今日 `:128` 二值化（`ga`/`admin`）。改成什么（`'staff'`？新增 `'anonymous'`？）无派单依据 | **CTO**（属产品/权限语义，非技术自决） |
| 7-4b | **LoginPanel 挂载点未定** | `App.tsx` 153 行无登录门；`WelcomeScreen.tsx` 已被 D575 首启向导占用 | **CTO** |
| 7-4c | **桌面端无「部门工作区」消费点**：派单 §一 的用户可见目标（「看到本部门工作区、异部门互不可见」）在 renderer 无落点 | `git grep -n -E "api/workspaces\|department\|部门" -- electron-renderer/src` = **共 1 处**，且是注释（`useWorkspaces.ts:19`「MVP: 本地创建，不调用 API」） | **CTO**：B 的验收只能到「请求头层 + 登录 UI 层」，**端到端部门隔离不可由本卡证明**；须显式登记，**不得**写成"已完成" |
| 7-5 | **P0-a 原案不足以放行 B**（见 §6-1） | B 候选写集 P0-a 下 `FAIL 跨域 exit=1`；P0-a+ 下 `PASS 8 文件同域 mac exit=0` | **CTO**：在 P0-a+ / P0-a / P0-b / P0-c 间裁定（推荐 **P0-a+**） |
| 7-6 | **B4 依赖切片 A 的接口契约**（`POST /api/auth/login` 路径 + 响应 token 字段名），而 A 未合 main | 派单 §〇 `IN_MAIN=no`；`src/routes/auth.ts:97/:134` 为 A 的落点 | **CTO / code-a**：A 的契约冻结后 B4 夹具才可写（B 不碰 `src/**`） |
| 7-7 | **主进程 `electron/**` 是否也发自报头 → 实测：无** | `git grep -n -E "x-synova-token\|Bearer\|Authorization" -- electron` = `exit=1`（零命中）；唯一网络点 `main.cjs:299` 无 headers；`preload.cjs` 的 `token/auth/login` = `exit=1` | **已闭合**（派单「不碰 electron/**」成立且低风险） |
| 7-8 | **`bash` 不可用** ⇒ 治理 bash 测试、pre-commit/pre-push、baseline-check 本机无法复跑 | `bash tests/control-tower/check-ownership.test.sh` → WSL 未安装存根报错 | **CTO/队长**：门禁证据须改在 mac 侧或改用 python 直调；本报告治理实测一律走 `python …check-ownership.py` |
| 7-9 | **`feat/d948-identity-chain-server` 未推 origin**（无 `feat/d948-identity-chain-desktop`） | `git ls-remote --heads origin` 穷举 `d948` ⇒ 仅 `docs/d948-identity-chain-dispatch` | **队长**：交付回执须附 ls-remote 回执（本卡尚无分支可附） |
| 7-10 | **预算**：派单切片 B 写集「≤ 6 文件」，真实最小写集 **8 文件** | §8 | **CTO**：确认 8 文件预算（仍在 PR ≤12 文件上限内），或裁定替代方案（§9 列出三条，各有代价） |

---

## §8 写集缺口结论（task-2 必答项）

### 8-1 真实最小写集 = **8 文件（6 mac + 2 win）**

| # | 文件 | 动作 | 域 | 是否派单原写集 |
|---|---|---|---|---|
| 1 | `electron-renderer/src/stores/auth-session.ts` | 新建（token 存取 / 登录调用 / 过期 / `degraded`；契约 JSDoc 先行） | mac | 是 |
| 2 | `electron-renderer/src/stores/ga-collab.ts` | 改（删 `getSeedToken()` + `DevSeedIdentity` + 相关注释） | mac | 是 |
| 3 | `electron-renderer/src/components/RightPanel.tsx` | 改（`Authorization: Bearer`；无 token 不附任何身份） | mac | 是 |
| 4 | `electron-renderer/src/components/LoginPanel.tsx` | 新建（最小登录入口） | mac | 是 |
| 5 | `electron-renderer/src/lib/api.ts` | 改（`authHeaders()` 唯一装配点） | mac | 是 |
| 6 | **`electron-renderer/src/stores/app-store.ts`** | 改（`bootUserRole` 去 seed 派生） | mac | **否 ← 缺口 1（必须入集）** |
| 7 | **`tests/ga-collab-logic.test.ts`** | 改（删 `getSeedIdentity`/`getSeedToken` import 与 `:57-99` 用例） | **win** | **否 ← 缺口 2（必须入集）** |
| 8 | `tests/electron/d948-identity-chain.test.ts` | 新建（B1–B4 断言） | win（P0-a+ 后 mac） | 是（P0-a 落地后随 mac） |

### 8-2 为什么 `app-store.ts` **必须**入集（无正当替代）

- **不入集的直接后果**：`getSeedIdentity` 一旦删除/改签名 ⇒ `app-store.ts:5` import 失败 + `:128` 编译失败（tsc 红）。
- **保留 seed 读路径的后果**：`bootUserRole()` 仍由 `localStorage['synova.dev-identity']` 派生出 `'ga'` ⇒ **命中 B3 明文反例**（「无 token 时回退 dev/seed 身份 → 必红」），且违反派单 §二 决策 1「客户端自报身份完全不允许」。
- ⇒ 缺口 1 **必须入集**；`app-store.ts` 判 **mac**，不新增跨域。

### 8-3 为什么 `tests/ga-collab-logic.test.ts` **必须**入集（三条替代方案及代价）

| 替代方案 | 做法 | 代价（实测依据） |
|---|---|---|
| **A. 不入集 + 删符号** | 只改 `ga-collab.ts` | 该文件 `:19-20` import / `:57-99` 断言直接引用 ⇒ **tsc 报 no exported member + vitest import 失败** ⇒ 铁律 36「vitest 必须全量通过」不成立。**不可取** |
| **B. 保留弃用占位** | `getSeedToken()` 留空壳返回 `null` | 违反派单明文「删 `getSeedToken()`」+ 留下死代码/旧引用（铁律 37）。**不可取** |
| **C. 删除整个测试文件** | 连同 `:57-99` 一起删 | 该文件共 **361 行**（`-TotalCount` 增量读取已确认 >100 行，`buildCalibrationRequest`/`buildSignalRequest`/状态机/降级决策等既有断言全部丢失）。**不可取** |
| **D. 保留 `getSeedIdentity` 不删** | 只删 `getSeedToken` + `DevSeedIdentity` | `getSeedIdentity(): DevSeedIdentity \| null` 的**返回类型即 `DevSeedIdentity`** ⇒ 删接口必改签名；且保留即保留「无 token 可读 seed 身份」路径 ⇒ **B3 反例命中**。**不可取** |

⇒ **无正当「不入集」替代**。缺口 2 **必须入集**；该文件判 **win**，是 P0 必须覆盖的**第二个**跨域面（**P0-a 原案覆盖不到**，见 §6-1）。

### 8-4 与派单 P0 章节的差异（须 CTO 知悉）

派单 §四 的 P0-a 只写「`tests/electron/** → mac`」，其依据是「测试跟随被测模块」。实测表明该规则**不足以**覆盖 D948/切片 B：`tests/ga-collab-logic.test.ts` 虽同样「测试跟随被测模块」（被测 = `electron-renderer/src/stores/ga-collab.ts`，判 mac），但路径在 `tests/` 根，**不在 `tests/electron/**` 之下**。⇒ 建议规则写成 **`tests/electron/**` + `tests/ga-collab*.test.ts`**（或更一般地「`electron-renderer`/`electron` 的测试跟随」白名单），并**逐条实测**（§6-1 P0-a+ 行）。

---

## §9 未证实项（诚实登记，本阶段未做/不能做）

| # | 项 | 原因 | 现状 |
|---|---|---|---|
| 9-1 | **现有测试套件在 ref `ef5c8caa` 是否全绿** | 未获放行；且「重型验证（vitest）串行 ≤1」纪律 + 本阶段只读 | **未能证实**（未跑 vitest） |
| 9-2 | `check-ownership.test.sh` 基线是否全绿 | `bash` 不可用（WSL 未安装） | **未能证实**；改以 `python check-ownership.py` 直调逐项实测（§6） |
| 9-3 | `vitest.config.ts` 的 `DEV_MODE='true'` 是否**确实**导致服务端 dev-admin 逃生口（而非仅环境变量） | 属切片 A 域（`src/middleware/auth.ts`），本阶段未审 | **未能证实**（仅证实 N1 断言不成立这一物理事实） |
| 9-4 | 各 fetch 点对应端点的**白名单/门禁归属**（§3-2 表中标「待确认」的 6 行） | 逐点核对 `src/middleware/auth.ts` 白名单属 A 域；本卡不碰 `src/**` | **部分未能证实**（已确证：`/api/ga/clients`、`/api/diagnosis/*` 非白名单，来源 `docs/synova/research/L1全量审计-20260907/L1-audit-report.md:182`） |
| 9-5 | P0-c 的实际判定结果 | 仅由表结构推断（`vitest.config.ts` 判 win ⇒ 与 mac 源码同 PR 即跨域），**未做副本模拟** | **未实测**（推断，已标注） |
| 9-6 | `tests/ga-collab-ui.test.ts` 是否引用 seed 身份 | 已 grep：`synova.dev-identity`/`getSeedIdentity`/`getSeedToken` 在三处测试文件命中 —— `tests/electron/right-panel-report-sentinel.test.ts:112`（**仅 setItem，无断言依赖**）、`tests/ga-collab-logic.test.ts` | **已核实**：`tests/ga-collab-ui.test.ts` **零命中**（不属缺口） |

---

## §10 取证命令清单（可复跑，按执行顺序）

```
# 环境
git rev-parse HEAD ; git rev-parse --abbrev-ref HEAD ; git ls-remote --heads origin
# 前提复核
git grep -n "Bearer" -- electron-renderer                     # exit=1
git grep -in "login" -- electron-renderer                      # exit=1
git grep -n "Authorization" -- electron-renderer                # exit=1
git grep -n "apiFetch" -- electron-renderer                     # 共 20 处 / 12 调用点
git grep -n "x-synova-token" -- electron-renderer/src           # 共 5 处（4 注释 + 1 实现）
git grep -n "fetch(" -- electron-renderer/src                   # 共 16 处（1 注释 ⇒ 15 调用点）
git grep -n "headers" -- electron-renderer/src                  # 共 5 处
git grep -n "getSeedToken\|getSeedIdentity" -- .                # 共 17 / 24 处
git grep -n -E "GA_SEED_STORAGE_KEY|DevSeedIdentity|synova\.dev-identity" -- .   # 共 18 处
git grep -n -E "x-synova-token|Bearer|Authorization" -- electron     # exit=1（主进程零自报头）
git grep -n -i -E "token|auth|login" -- electron/preload.cjs         # exit=1
git grep -n -E "api/workspaces|department|部门" -- electron-renderer/src   # 共 1 处（注释）
git grep -n "headers" -- tests/electron/ tests/ga-collab-ui.test.ts tests/ga-collab-logic.test.ts  # 共 0 处
# 域判定（本机 python 直调；bash 不可用）
python scripts/control-tower/check-ownership.py <8 文件> [--yaml /tmp/D948-recon/p0a*.yaml]
python scripts/control-tower/check-ownership.py $(git ls-files tests/electron/) --yaml /tmp/D948-recon/p0a.yaml
python scripts/control-tower/check-ownership.py --emit-codeowners --yaml /tmp/D948-recon/p0a.yaml
```

---

## §11 结论摘要（供 PLAN 引用）

1. 队长给定 **10 条前提中 9 条完全成立**；**P-2 部分不成立**——「`opts.headers` 覆盖 `baseHeaders`」是代码事实，但「自报头其实没被发出去」**不成立**（12 个 apiFetch 调用点无一传 headers，seed 头实际发出）；风险为**潜在**（维护期新增 headers 即静默丢身份）。
2. **写集缺口两条均成立，且两条都必须入集**：`app-store.ts`（mac）与 `tests/ga-collab-logic.test.ts`（win，三条替代方案全不可取）。
3. **P0-a 原案不足以放行切片 B**（实测 `FAIL 跨域 exit=1`）；**P0-a+**（额外把 `tests/ga-collab-logic.test.ts` 判 mac）实测 `PASS 8 文件同域 mac exit=0`。P0-b 实测仍 `FAIL`（打补丁不治病）。
4. **三项新增阻塞须 CTO 先裁**：N-1（N1 与 `DEV_MODE='true'` 冲突，判据恒红 vs 改配置是禁项）、N-3（14/15 个 fetch 点零身份且不在写集 ⇒ B2/B4 覆盖面不足）、N-4（桌面端无「部门工作区」消费点 ⇒ 端到端用户可见目标无落点）。
5. **B1 不得作为主验收**（grep 型静态判据，现值 5 处含 4 处注释），须以「无 token ⇒ 实收头零身份键」行为夹具为准。
6. 未证实项 6 条（§9），含**未跑 vitest**、**bash 不可用**、P0-c 未实测。

> **自验结论**：本文件为 **PLAN 输入**，**未写任何产品/测试代码**，**不构成「通过」判定**；切片 B 在 P0 裁定 + 上述 4 项 CTO 裁前**未开工**。
