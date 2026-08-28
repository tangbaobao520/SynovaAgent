# 交付报告 — register 认证闭环批次（D483/D484/D486）独立复核 + 证据落仓 + 簿记闭环

> 日期: 2026-08-28 | 执行: DSH 编码 session（worktree 隔离, base origin/main 54ed1cf5）
> 派单: docs/synova/coordination/派单-D483-D486-register-auth-20260828.md
> spec（执行唯一依据）: SYNOVA-IMPL-D483-register-auth-slice-a-20260824.md / SYNOVA-IMPL-D484-enterprise-invite-slice-b-20260825.md / SYNOVA-IMPL-D486-register-e2e-slice-20260825.md
> 方法: claim-verifier 场景 2（声称完成必须物理证明——grep / 测试输出 / git / CI API，不凭文档）

---

## 0. 关键事实更正（派单前提 vs main 物理现实）

| 派单前提 | 物理实测（2026-08-28, worktree@54ed1cf5） | 判定 |
|---|---|---|
| 三切片 spec 停在 spec_done，本单转实现 | 三切片**代码实现均已入 main**：D483=78c5a84f（PR #156）、D484=a6d4af07（PR #170）、D486=b036d380（PR #208），且三份 spec §3.2 均含"最终实现同 commit 回填" | 派单前提过时 |
| task-state 三任务 spec_done | 属实，但 D393 派生制下 json status/impl 字段 **deprecated**（task-state/README.md：生成器从工件重算，人工只维护 task_id/title/fix_task_id）——停在 spec_done 是**簿记派生缺口**，不是实现缺失 | 簿记缺口 |

**处置**（防撞车 + 防范围膨胀）：不重实现。本 session 执行 ①独立物理复核（Mac 实测）②CI check-runs 取证 ③D486 E2E 本地真实 server 复跑 ④证据落仓 ⑤D486 簿记闭环。所有代码文件零改动（Q2 排除项物理验证）。

---

## 1. D483 切片 A — 匿名注册可达（AUTH-A）

### 缺陷 A: register 不在认证白名单，匿名注册 401

| spec §2/§3 主张 | 物理证据 | 结论 |
|---|---|---|
| isWhitelisted 加 register 分支（与 login 并列） | `grep -n "api/auth/register" src/middleware/auth.ts` → **L91** `path === '/api/auth/register' \|\|`（isWhitelisted 函数体内） | ✅ 已修复（main 78c5a84f） |
| 生产接线 isWhitelisted → jwtAuthMiddleware → server.ts 全局挂载 | spec §5 接线链；白名单唯一来源 auth.ts（server.ts 无独立白名单），本 session 复核 src/server.ts 挂载保持 | ✅ |
| 实现独立提交 | commit **78c5a84f** `fix(D483): register 匿名注册可达——isWhitelisted 加 register 分支 + 集成测试移除 bootstrap 绕过` → **PR #156**（head 25dfec21）merged=true | ✅ |

### 缺陷 B: D481 集成测试 bootstrap token 绕过掩盖缺口

| spec 主张 | 物理证据 | 结论 |
|---|---|---|
| 移除 bootstrap 绕过（signJwtToken import + 签发 + 注释） | `grep -c "signJwtToken" tests/middleware/auth.integration.test.ts` → **0**（spec DS3 零命中要求） | ✅ |
| 单元用例 register pass through | tests/middleware/auth.test.ts **L237-243** `it('whitelisted path /api/auth/register → pass through', ...)` 无 Authorization 头放行断言 | ✅ |
| 匿名直连语义（真实用户路径） | 集成测试 10/10 绿（Mac 实测，见 §6）；e2e 阶段① 匿名 register 201（真实 server，见 §3） | ✅ |

### D483 DS1-DS7 对照

| DS | 证据 | 结论 |
|---|---|---|
| DS1 白名单接线 | grep L91 命中（isWhitelisted 内） | ✅ |
| DS2 单元用例全绿 | Mac 实测 vitest auth.test.ts（见 §6, 4 文件 57/57 含此文件） | ✅ |
| DS3 集成 10/10 + signJwtToken 零命中 | grep=0 + 集成 10 tests 绿 | ✅ |
| DS4 零回归 + tsc 28=28 | tests/routes/auth.test.ts 绿 + tsc --noEmit **28** 处（_extinct 25 + server.ts 2 + ima.ts 1，与 spec 基线一致，零新增） | ✅ |
| DS5 范围一致 | 原实现 78c5a84f 写集 = spec §3.1 三文件（git show --stat 复核） | ✅ |
| DS6 无绕过 | PR 流程合并（GitHub web merge 不产生本地 bypass）；本 session 全程未用 --no-verify | ✅ |
| DS7 推送 + CI | PR #156 CI check-runs（head 25dfec21b19fb42a0579b28898252d23a1ed6c25）**全部 success**：TypeScript + Lint + Iron Laws / Architecture Check / Vitest (1/2)(2/2) / Integration Contract Check / Control Tower Gate Tests (ubuntu+windows) / Checker Review / npm audit / Golden Case F1 Gate | ✅ CI 权威绿 |

---

## 2. D484 切片 B — 企业邀请链路打通（AUTH-B）

### 缺口 A（阻断）: enterprise 匿名端点被认证层挡

| spec 主张 | 物理证据 | 结论 |
|---|---|---|
| isWhitelisted 加 2 条分支（register 精确 + invitation/ 前缀） | `grep -n "api/enterprise" src/middleware/auth.ts` → **L92** `path === '/api/enterprise/register' \|\|`、**L93** `path.startsWith('/api/enterprise/invitation/') \|\|`；**L84** 注释明确复数管理端点 `/api/enterprise/invitations` 不匹配前缀、保持认证 + requireAdmin | ✅ 已修复（main a6d4af07） |
| invite/管理端点保持认证 | 集成用例⑥（staff 发邀请 403）+ e2e 阶段④（个人 staff 调 /api/enterprise/invite → 403 FORBIDDEN, 真实 server 实测） | ✅ 保护未削弱 |

### 缺口 B（可靠性）: 邀请/企业数据全内存存储

| spec 主张 | 物理证据 | 结论 |
|---|---|---|
| 记录遗留，不实现持久化（spec §3.3 显式 descope） | src/routes/enterprise.ts 内存 Map 保持原样（本任务零改动）；**真实 server 复跑佐证边界**：UserStore 用户数据走 SqliteGraphStore（server 日志 `UserStore 自初始化成功 (SqliteGraphStore)`、注册 store:"graph"），而企业/邀请元数据无持久化——**遗留真实存在，保持开放，待另立任务** | ✅ 按spec记录遗留 |

### 缺口 C（测试真空）: 邀请链路零真实覆盖

| spec 主张 | 物理证据 | 结论 |
|---|---|---|
| enterprise.test.ts 扩充至 17 用例（旧 11 + D484 集成 6） | `grep -c "it(" tests/routes/enterprise.test.ts` → **17**；366 行 | ✅ |
| 全链路 register→invite→query→accept 真实走通 | Mac 实测 17/17 绿（§6）；e2e 阶段②③ 真实 server 再证（invite 返回 inv- 前缀 token → accept 200 绑定 orgId/role → staff login → /api/enterprise/status 200） | ✅ |

### D484 DS1-DS7 对照

| DS | 证据 | 结论 |
|---|---|---|
| DS1 白名单接线 | grep L92-93 命中（isWhitelisted 内） | ✅ |
| DS2 测试全绿 | Mac 实测 enterprise.test.ts 17/17（§6） | ✅ |
| DS3 链路实证 | 集成用例④ + e2e ②③（GraphStore 持久化下 orgId 绑定断言） | ✅ |
| DS4 零回归 + tsc 28=28 | auth.test/auth.integration/auth.test(routes) + tsc 28 基线零新增 | ✅ |
| DS5 范围一致 | 原实现 a6d4af07 写集 = auth.ts + enterprise.test.ts + brief/reference-map（§3.2 回填与实现一致） | ✅ |
| DS6 无绕过 | PR 流程合并；本 session 零 --no-verify | ✅ |
| DS7 推送 + CI | PR #170 CI check-runs（head 0af8d7b5）**全部 success**（同 §1 检查矩阵） | ✅ CI 权威绿 |

---

## 3. D486 — register 认证闭环端到端测试切片（AUTH-E2E）

### 交付物与覆盖

| spec DS | 证据 | 结论 |
|---|---|---|
| DS1 e2e 文件存在 | tests/e2e/auth-register-flow.e2e.test.ts（9872 bytes, commit b036d380 → **PR #208** merged=true） | ✅ |
| DS2 4 阶段 ≥4 it + ≥10 expect | `grep -c "it("` → **5**；expect 计数 **39** | ✅ |
| DS3 本地真实 server 全链路绿（非 skip） | **Mac 独立复现（2026-08-28）**：`PORT=3099 JWT_SECRET=d486-e2e-test-secret DEV_MODE=true SYNOVA_DB_PATH=./data/e2e-scratch.db npx tsx src/index.ts`（spec §3.2 契约原样）→ healthz 探活 1s 内 → `PORT=3099 npx vitest run tests/e2e/auth-register-flow.e2e.test.ts` → **4 passed (4)** / 460ms。server 日志关键行：`注册成功 store:"graph"`（个人轨）→ `企业注册成功 org-1-mtcx8ew9` → `邀请已创建` → `邀请已接受` → `登录成功`×3；scratch DB 585KB 落盘（SqliteGraphStore 真实持久化） | ✅ 非 skip 真跑 |
| DS4 缺口处理 | 首跑即 4/4 绿——与 win 回填结论一致（D483/D484 合并产物在真实 server 下双轨链路完好，无 D486 范围内缺口，无 src 修复） | ✅ |
| DS5 零回归 | 4 套件 57/57（§6）+ tsc 28=28 | ✅ |
| DS6 范围一致 | b036d380 写集 = e2e 文件 + spec §3.2 回填（本 session 零越界，不碰 D485 写集 enterprise.ts/user-store.ts） | ✅ |
| DS7 CI | 见下方 CI 分类 | ✅（带分类说明） |

### D486 PR #208 CI 分类（诚实记录）

| 检查 | 当时结论（head 34a9c28d） | 分类 |
|---|---|---|
| TypeScript + Lint + Iron Laws / Architecture / Vitest (1/2)(2/2) / Integration Contract / Checker Review / npm audit / Golden Case F1 | **全部 success** | ✅ |
| Control Tower Gate Tests (windows-latest + ubuntu-latest) | **failure**（2026-08-26T16:44Z） | ⚠️ 瞬态：失败窗口恰为控制塔 gate 脚本高频变更期（08-26~27 D541 正则收窄 / D542 strict 打印 / D543 密封测试对齐 / D547 骨架 brief 门禁）。D486 写集仅 tests/e2e/**（CI 明确排除），无因果路径。**最新 main 54ed1cf5 实测两平台均 success**（GitHub check-runs API）——失败已随 gate 修复消散 | 

**附带观察（均 auth 链外既有问题，非本批次范围，留给对应领地）**：
1. main HEAD 54ed1cf5 上 `build: failure`（electron 打包线检查；macos dmg+zip / windows nsis / generate 均 success，仅 build 一项失败）——桌面线/CT 线关注。
2. Mac server 启动日志：`sentinel/builtins` 4 个文件"未导出哨兵对象"（cash-flow/cpc/goal-alignment/integration-health）+ 3 个 sentinel "依赖的节点类型在本体中不存在 — degraded"（Financial 相关）+ MCP brave/github 无 API key 退出——sentinel 线既有 degraded 语义，非本批次引入。

---

## 4. 簿记闭环（本 commit 的可执行增量）

- **机制**（task-state/README.md D393/D399）：status/impl/audit 由 `scripts/control-tower/gen-cto-health.py` 从工件派生——`git log --all --format=%s` 中 `\(D(\d{3})\)` ASCII 括号精确匹配即 impl ✅；json status/impl 字段 deprecated 被覆盖。
- **缺口**：D483（`fix(D483):`）、D484（`fix(D484):`）消息格式匹配 → 派生 impl_done ✅；**D486 的实现 commit 消息为 `test: D486 ...`（D486 无 ASCII 括号包裹）→ 生成器匹配不上 → D486 将永久派生 spec_done**。
- **修复**（不改 scripts/，走机制内路径）：本交付报告 commit 消息含 `(D483) (D484) (D486)`——报告本身是 D486 交付的验收证据（spec DS3"报告附证据"），语义上就是 D486 相关提交；merge 后 `gen-cto-health.py` 对 D486 派生 impl ✅ / status impl_done。
- **验证**（merge 后任何人可跑）：`bash scripts/control-tower/gen-cto-health.py` 输出 D486 行 impl ✅；或 `git log --all --format=%s | grep -c "(D486)"` ≥ 1。
- task-state/*.json 未动（deprecated 字段，动了会被覆盖——Q1b rule 3 物理验证 0 命中）。

---

## 5. K3 批次审计请求（三切片完成后提交）

- **请求**：对 register 认证闭环批次 D483 / D484 / D486 提起 K3 批次审计（audit_pending）。
- **审计入口工件**：
  - spec 三份（含 §3.2 实现回填）: docs/plans/codex/implementation/SYNOVA-IMPL-D483-register-auth-slice-a-20260824.md / SYNOVA-IMPL-D484-enterprise-invite-slice-b-20260825.md / SYNOVA-IMPL-D486-register-e2e-slice-20260825.md
  - 实现 commit: 78c5a84f / a6d4af07 / b036d380（PR #156 / #170 / #208，CI check-runs 见 §1-§3）
  - 本报告（独立复核证据 + Mac 实测记录）
- **审计重点建议**：① D484 缺口 B 内存存储遗留的开放状态是否需独立任务跟踪 ② D486 PR #208 Control Tower Gate 瞬态失败的分类是否成立 ③ D486 簿记修复路径（消息派生）语义合法性 ④ 本报告 §3 附带观察的归属分流。

---

## 6. 证据索引（本 session Mac 实测，2026-08-28）

| # | 命令 | 输出 |
|---|---|---|
| 1 | `npx vitest run tests/middleware/auth.test.ts tests/middleware/auth.integration.test.ts tests/routes/auth.test.ts tests/routes/enterprise.test.ts` | **Test Files 4 passed (4) / Tests 57 passed (57)**（auth.integration 10 tests 含其中） |
| 2 | `grep -c "signJwtToken" tests/middleware/auth.integration.test.ts` | 0 |
| 3 | `grep -n "api/auth/register\|api/enterprise" src/middleware/auth.ts` | L91 / L92 / L93（+L84 注释） |
| 4 | `npx tsc --noEmit` | 28 errors（_extinct 25 + src/server.ts 2 + src/connectors/ima.ts 1，零新增） |
| 5 | 真实 server（Node v24.19.0, spec §3.2 契约）+ `PORT=3099 npx vitest run tests/e2e/auth-register-flow.e2e.test.ts` | **Test Files 1 passed (1) / Tests 4 passed (4)** / 460ms（非 skip） |
| 6 | GitHub API `commits/{head}/check-runs`（PR #156 / #170 / #208 + main 54ed1cf5） | #156 全 success；#170 全 success；#208 除 Control Tower Gate 双平台 failure（已消散）；main 双平台 success |
| 7 | 环境注记 | worktree node_modules 为空 → 依赖沿目录树解析至主仓；主仓 better-sqlite3 ABI=137（Node 24 编译），shell Node v22.22.0 不兼容 → server 用 nvm v24.19.0 启动（ABI 匹配）。vitest/tsc 在两版本 Node 下均可运行 |

> 本报告零代码变更：`git diff --name-only` 仅含本文件 + task brief（Q1b rule 1 物理验证）。
