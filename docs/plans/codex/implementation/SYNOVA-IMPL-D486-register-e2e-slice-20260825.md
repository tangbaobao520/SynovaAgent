<!--
  SYNOVA-IMPL-D486: register 认证闭环 端到端测试切片（A/B 全链路真实 server 验证 + 缺口补充）
  状态: dev doc | 2026-08-25 | 优先级 P1
  切片: AUTH-E2E（register 批次收尾验证）
  权威文档: D483（切片 A 个人注册）/D484（切片 B 企业邀请）交付报告; tests/e2e/customer-flow.e2e.test.ts（真实 server e2e 模式基线，D247）; 创始人决策（2026-08-25 双轨：个人空间不接企业系统）; AGENTS.md 铁律 12（集成测试 cover 真实路由）+ 铁律 1（垂直切片交付）
  依赖: D483/D484（已合并，本切片验证其链路）；**与 D485（切片 C 绑定）可并行**——本切片写集不含 enterprise.ts/user-store.ts（若跑出缺口涉及二者，显式 descope 留 D485）
  并行: 写集=tests/e2e/auth-register-flow.e2e.test.ts（新建）+ 可能 src/ 缺口修复（**不含 enterprise.ts/user-store.ts**，避免与 D485 撞）；与 DSH 线（scripts/、src/sentinel/、electron/）**零交集**；若必须并行先 worktree 隔离
  借鉴: 无 DSH 迁移直接借鉴项（e2e 测试自有；customer-flow D247 为既有模式基线）
-->

# SYNOVA-IMPL-D486 register 认证闭环 端到端测试切片

## 1. 权威文档引用

* **D483/D484 交付报告**（K3 可核）：切片 A 个人注册匿名可达（auth/register 白名单 + 集成测试）；切片 B 企业邀请链路打通（enterprise/register + invite + accept，enterprise.test.ts 17 用例）——本切片在真实 server 上把两轨串成全链路验证。
* **e2e 模式基线**（tests/e2e/customer-flow.e2e.test.ts，D247）：真实 server 模式——探测 localhost PORT（synova.json/env 默认 3000），server 未启动 → `test.skip`；`api()` 助手封装 fetch + JSON 头。本切片沿用该模式（不 mock 管线，铁律 12）。
* **创始人决策（2026-08-25）**：双轨并存——个人轨（auth/register，个人空间不接企业系统）+ 企业轨（enterprise 邀请，接系统）——e2e 断言边界（个人账号调企业 admin 端点被拒）。
* **CI 排除**（实测 ci.yml 无 e2e 引用）：tests/e2e/** 不进 CI——本切片验收 = 本地真实 server 跑绿 + 交付报告留证据（D480 同先例）。

## 2. 代码审计——现状（全部实测 file:line）

### 缺口 A：register 认证闭环无端到端覆盖（只有分片集成测试）
* `tests/e2e/customer-flow.e2e.test.ts` L49-117：仅覆盖 enterprise/register → auth/login → import/csv → sentinel/health → cockpit → admin/knowledge——**无 auth/register（个人注册）、enterprise/invite、enterprise/invitation/accept**。
* `tests/routes/enterprise.test.ts`（D484，17 用例）+ `tests/middleware/auth.integration.test.ts`（D481/D483，10 用例）：均为 express app 内挂载的集成测试（fastify/内存 app），**未走真实 server 进程**——端口/中间件顺序/server.ts 挂载级问题（如 D476 挂载缺位、D483 白名单时序）不在其覆盖内。

### 缺口 B：真实 server 下双轨链路未被验证（注册→邀请→接受→登录→首诊）
* server.ts L290 `app.use(jwtAuthMiddleware)` + L354 `app.use(enterpriseRoutes)`：挂载顺序已在集成测试验证，但**真实进程**（含 sanitizeCheck/rateLimit 等全部中间件链）下双轨链路（个人注册 → 企业注册 → admin 发邀请 → 成员接受 → 登录 → 首诊入口）零覆盖。
* 首诊入口：`POST /api/diagnosis/consult`（GS-01 已验证）——e2e 断言注册后可达（不触发完整诊断，仅健康/入口可达性）。

### 现状确认（实测）
* auth/register 白名单（auth.ts L91）、enterprise 匿名端点白名单（auth.ts L92-93，D484）——真实 server 下匿名可达（D483/D484 已合并验证）。
* requireAdmin（enterprise.ts L78-83）：个人账号（staff）调企业 admin 端点 → 403（边界应保持）。
* e2e 模式：customer-flow 用 `detectPort()` + `api()` + `skipIfServerDown()`——可直接复用模式。

### 无重复造轮子审计（S-14，2026-08-25 实测）
* 认证闭环 e2e：tests/e2e/ 12 文件 grep auth/register|enterprise/invite 仅 customer-flow（且只覆盖 register+login）——无已存在闭环 e2e。
* 集成测试已覆盖分片（enterprise 17 + auth 10）——本切片是**真实 server 端到端**（不同层，非重复）。
* DSH 迁移施工图：认证/e2e 领域零命中（自有业务线）。

## 3. 实现方案

### 3.1 写集 (1 新建 + 0 修改)
| 文件 | 操作 | 说明 |
|------|------|------|
| tests/e2e/auth-register-flow.e2e.test.ts | 新建 | 4 阶段真实 server 全链路（见 §4）；沿用 customer-flow 模式（detectPort/api/skipIfServerDown）；唯一新增文件为必写 |

> 共享资源标注（S-8）：本写集不含 VERSION.md；current-brief / 暂存区共享；**条件写集**——若 e2e 跑出 src 缺口需修复，修复文件**动态追加到本节 + §3.2 同 commit 回填**（S-6 纪律），且不可触碰 D485 写集（enterprise.ts/user-store.ts）；缺口涉及 D485 写集 → 显式 descope 留 D485（不越权）。

### 3.2 最终实现同 commit 回填
若缺口修复涉及 §3.1 未列的 src 文件、或 e2e 阶段设计与方案偏离（如首诊入口改用 /api/diagnosis/consult 健康探测而非 GET status），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* **不碰 enterprise.ts / user-store.ts**（D485 写集）——若 e2e 跑出绑定/账号相关缺口（D485 绑定未实现），显式记录"待 D485"而非本切片修。
* 不触发完整诊断流程（首诊入口仅断言可达性，不跑六阶段——耗时与环境依赖）。
* 不改既有测试（enterprise.test.ts/auth.integration 等——它们已绿）。
* 不碰 Mac 地盘（electron/electron-renderer、scripts/golden-scenarios、scripts/audit）。

## 4. 测试要求（测试优先：e2e 即测试，red→green 以链路覆盖为准）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| E2E | tests/e2e/auth-register-flow.e2e.test.ts（新建） | 4 阶段 ≥10 断言 | ①个人轨：auth/register 201 → login 200 → 受保护端点 200；②企业轨：enterprise/register 200（orgId+admin）→ admin login → invite 200（token）；③接受：accept（新 email）200 → login → 企业端点可达；④边界+入口：个人账号调 admin 端点 403 + 首诊入口（/api/diagnosis/consult 相关）可达 |

**RED 必须覆盖失败模式（S-5）**：本切片 red 基准 = **真实 server 下链路未被验证**（现状无此 e2e）——先写测试（首次跑暴露真实缺口，可能红在未预期处）→ 修复（§3.1 条件写集）→ green。边界用例③（个人调 admin 403）同时验证"个人轨不接企业系统"不削弱（创始人决策）。

## 4.5 决策参考（S-12）
* 决策点 1：e2e 用真实 server（customer-flow 模式）vs 自启 server（beforeAll app.listen）？
  * 参考系：第一性原理——真实 server 验证"部署态"（中间件全链/挂载顺序/端口），自启 app 与集成测试同质；customer-flow 已有真实 server 模式先例（D247）。
  * 结论：真实 server 模式（detectPort + skip 降级），验收在本地 dev server 跑。
* 决策点 2：跑出的缺口涉及 enterprise.ts 怎么办？
  * 参考系：Anthropic——边界清晰：D485 写集专属文件不越权；e2e 缺口若属绑定类 = D485 未实现的预期缺口，记录即可（非本切片 bug）。
  * 结论：显式 descope 留 D485（§3.1 声明），非 enterprise.ts 的缺口本切片修。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| e2e 文件（无新 export） | vitest 本地跑（真实 server） | `npx vitest run tests/e2e/auth-register-flow.e2e.test.ts`（server 运行态） |

> 本切片无生产代码新增 export（e2e 测试文件）；若跑出 src 缺口修复，修复点生产接线由对应 DS 验证（grep 命中）。

## 6. 完成标准

* **DS1 e2e 文件**：`ls tests/e2e/auth-register-flow.e2e.test.ts` 存在（新建）。
* **DS2 4 阶段覆盖**：`grep -c "it(" tests/e2e/auth-register-flow.e2e.test.ts` ≥4（4 阶段）+ 断言 ≥10（expect 计数）。
* **DS3 全链路绿**：本地 dev server 运行态 `npx vitest run tests/e2e/auth-register-flow.e2e.test.ts` 全 pass（真实 server，非 skip——报告附 server 启动证据）。
* **DS4 缺口处理**：跑出缺口——非 enterprise.ts/user-store.ts → 已修复（同 commit）；涉及二者 → §3.2 显式 descope（记录待 D485）+ 交付报告声明。
* **DS5 零回归**：`npx vitest run tests/routes/enterprise.test.ts tests/middleware/auth.integration.test.ts tests/middleware/auth.test.ts` 全绿 + `tsc --noEmit` 零新增（28=28）。
* **DS6 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（e2e 文件 + 已回填的 src 修复），无越界（不碰 D485 写集）。
* **DS7 无绕过 + 推送**：`grep -n "no-verify" .claude/bypass.log` 零命中；push 后 `git log origin/main..HEAD --oneline` 空；CI 非 e2e job 绿（e2e 本身本地验证，交付报告留证据）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试覆盖失败模式（真实 server 链路缺口 + 个人/企业边界 403 不削弱）
* [ ] 接线/边界真实（customer-flow 模式基线 + 不碰 D485 写集）
* [ ] DS verify 命令真实可执行（e2e 本地 server 跑）
* [ ] 版本编排：测试新增，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 e2e 文件 | ls tests/e2e/auth-register-flow.e2e.test.ts | 存在 |
| DS2 4 阶段覆盖 | grep -c "it(" tests/e2e/auth-register-flow.e2e.test.ts | ≥4 |
| DS3 全链路绿 | npx vitest run tests/e2e/auth-register-flow.e2e.test.ts（server 运行态） | 全 pass（非 skip） |
| DS4 缺口处理 | git show --stat（缺口修复或 descope 记录） | 修复或显式声明 |
| DS5 零回归 | vitest run tests/routes/enterprise.test.ts tests/middleware/* + tsc --noEmit | 全绿 + 零新增 |
| DS6 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS7 无绕过 + 推送 | grep -n "no-verify" .claude/bypass.log + git log origin/main..HEAD --oneline | 零命中 + 空 |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**与 D485（切片 C 绑定）可并行**（写集零交集——本切片不碰 enterprise.ts/user-store.ts）；**真实 server 模式**（本地 dev server 跑，server 未启动 → skip 不算 DS3 通过，验收必须真跑）；**边界**：个人账号调企业 admin 端点 403 断言（创始人"个人轨不接企业系统"）；跑出的绑定类缺口显式 descope 留 D485；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
