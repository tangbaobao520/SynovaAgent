# Task Brief: D948 切片 A — 身份链补全：服务端签发/接收部门（win 单域，base ef5c8caa）

> 生成: 2026-09-25 | 工作树: `.synova-wt-d948-server` | 分支: `feat/d948-identity-chain-server` | 基线: `ef5c8caa`
> 角色: D948 小队「编码 A」 | 结论口径: 队内自验，**不称审计**；结论标「可提请独立审计」
> 派单件: `docs/synova/dispatch/D948-win-identity-chain-department-20260924.md`（origin tip df9dc5ed）
> 覆盖裁定: CTO R1–R6（R2 新增本文件为第 8 写集；R4 register 不取 body 的 department）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向：属 **中间件层（src/middleware）+ L1 交互层（src/routes）** 的**身份链补全**；不新增层、不新增端点、不新增文件类型。
- 横向：不动 `packages/`、不动 `electron-renderer/`。
- 扩展解耦：不涉及（无新类型注册）。
- 现状断点（实测 ref ef5c8caa）：`JwtPayload`/`AuthRequestContext` 无 `department`；`rbac.ts:127` 写死 `department: undefined`
  ⇒ 部门可见性判据（`rbac.ts:287/:313` 的 `isSameDepartment`）恒不命中 ⇒ 部门工作区对任何非 admin 恒拒绝
  （D947 R5/REV-8 登记的功能回退）。本任务把该回退**还原**，同时**不放松**任何判据。

### b) 文件审计（实测行号，非凭记忆）
| 目标 | 实测 | 结论 |
|---|---|---|
| `src/middleware/auth.ts` `JwtPayload` | :26-33（无 department） | 需加可选字段 |
| `src/middleware/auth.ts` `AuthRequestContext` | :35-39（无 department） | 需加可选字段 |
| `src/middleware/auth.ts` `signJwtToken` | :146-148 `Omit<JwtPayload,'iat'\|'jti'\|'exp'>` | 加字段后**自动**透传 |
| `src/middleware/auth.ts` 必填字段校验 | :217 只查 `sub/role/jti` | 新增可选字段**不被拦** |
| `src/middleware/auth.ts` `extractAuthFromRequest` | :488-511（返回体手写三字段） | **必须显式改**，否则新字段成死字段 |
| `src/middleware/auth.ts` 自报拒绝分支 | :503-508 | **严禁删除**（D947-RULINGS:109） |
| `src/middleware/rbac.ts` JWT 分支入参内联类型 | :122（结构化内联类型，非 JwtPayload） | **必须显式加** `department?`，否则 :127 编不过 |
| `src/middleware/rbac.ts` 断点本体 | :127 `department: undefined` | 改为 `req.auth.department` |
| `src/middleware/rbac.ts` 部门判据 | :231-237 / :287 / :313 | **零改动**（正确性由夹具证明） |
| `src/routes/auth.ts` login 签发 | :134 三字段 | 加 department（取 UserStore 记录，归一空串） |
| `src/routes/auth.ts` refresh 签发 | :191-195 三字段 | 加 department（保留旧载荷值） |
| `src/routes/auth.ts` register 签发 | :97（R4） | **保持 undefined**（不取 body） |
| `src/routes/auth.ts` 本地 `UserRecord` | :25-29（无 department） | 加 `department?`（login 取数所需） |
| `src/routes/workspaces-api.ts` 消费端 | :278 / :285-287 已消费 `rbac.department` | **零改动**（不在写集） |
| `src/server.ts` 挂载序 | :344 jwt → :366 rbac → :380 workspaces | **零改动**（已就绪） |
| `src/growth/user-store.ts` | :37 / :80 / :99 已有 department | **零改动**（数据源已存在） |
| `vitest.config.ts` 全局 `DEV_MODE` | :58-63 = `'true'` | **零改动**；N1 在夹具内就地覆写 |

### c) 决策
- 已有覆盖 → **复用**：`department` 字段（user-store）、部门判据（rbac 的 isSameDepartment）、消费端（workspaces-api）。
- 无覆盖 → **新增**：仅「载荷字段 + 三处签发取值 + 透传 + 夹具」。
- 冲突 → 无（R4 已裁定 register 不取 body；`role` 自报属既有缺口，登记不夹带）。

## Q1: 调研 — 决策链 + 执行约束

### a) 业界/规范基线
JWT 载荷承载**由签发端决定的**授权属性（role/department），接收端只验签不重算；未声明的属性一律按「缺失」处理并 fail-closed —— 与创始人决策②一致。

### b) memory / 历史教训（本轮逐条已被夹具吸收）
- D947-RULINGS **L-14**：变异体基准 = **已提交 SHA**，回退用 `git checkout -- <file>`，禁 `git stash`。
- D947-RULINGS **L-17**：探针/变异体脚本落 `/tmp`，**永不入仓库**。
- D947-RULINGS **L-28**：`/api/workspaces/mine` 被 `/:id` 遮蔽的 ordering **本卡不修**（可达面扩张须另立卡）
  ⇒ A3/A4 用「链式捕获探针」（只绕遮蔽，不绕身份链）。
- D947-RULINGS **L-32 / F-2**：`isSameDepartment` 的非空收窄是**已裁定修复**，本卡不得回改。
- 复核 §18.2 二次更正：A4 反例必须**过宽型**（收窄型对负向断言无效）。

### c) 决策参考系
**参考：Anthropic 工程基线（判据前置于实现）+ 第一性原理（唯一授权来源=签发端）+ DSH 决策镜头（机制最小化）**。
结论：`department` **必须保持 optional** —— 无部门 JWT 是**合法凭证**（决策②拒绝的是部门工作区访问，不是凭证本身）；
代价是 tsc 无法拦「签发漏带」，故判据必须落在**夹具的解码断言**上（派单件决策③原文）。

## Q2: 范围 — 正确的最简方案是什么？

做什么（写集 8 文件）：
- src/middleware/auth.ts
- src/middleware/rbac.ts
- src/routes/auth.ts
- tests/middleware/auth.test.ts
- tests/middleware/rbac.test.ts
- tests/routes/auth.test.ts
- tests/routes/d948-department-visibility.test.ts
- .claude/task-briefs/2026-09-25-D948-slice-a-identity-chain.md

不做什么：
- 不改 src/routes/workspaces-api.ts（消费端已就绪；F-1 遮蔽按 D947/L-28 不修；仅作 A4 变异体临时对象，回退后零残留）
- 不改 src/server.ts（挂载序 344/366/380 已就绪，无第二份白名单）
- 不改 src/growth/user-store.ts（department 字段与 createUser extra 已存在）
- 不改 vitest.config.ts（N1 在夹具 beforeAll 就地覆写并自证）
- 不改 tests/routes/workspace-access-write-endpoint.test.ts（D947 现状锁定断言；其 :236 注释届时失真，已登记未清项 F-3）
- 不改 scripts/pre-commit-check.sh
- 不做：部门赋值入口（R4 裁定另立卡）/ 桌面端通道（切片 B，R5/R6 hold）/ register 的 role 自报缺口（另有卡）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
客户端 `POST /api/auth/login`（或 refresh）→ 服务端签发带 `department` 的 JWT。

处理（中间经过哪些步骤）：
① 签发端取 UserStore 记录 department（归一空串为 undefined）→ ② JWT 载荷含 department →
③ `jwtAuthMiddleware` 验签后注入 req.auth → ④ `rbacMiddleware` → `extractRbacContext` 取真实部门 →
⑤ 部门判据（`isSameDepartment`）决定 `/api/workspaces/:id/context` 与 `/mine` 过滤结果。

结果（最终展示在哪）：
同部门 manager 可见本部门工作区（200 / 列表含目标 id）；异部门 manager 不可见（403 / 列表不含目标 id）；
无部门与空串一律 fail-closed（403 / 不含）；admin/liaison 维持既有全局语义。

## 架构层: L1-L5
L1（src/routes 消费）+ 中间件层（src/middleware 认证/RBAC）。不改层边界、不新增跨层依赖（铁律 39）。

#CRITERIA: A

## Done 标准
- [ ] 入口可触达: `npx vitest run tests/routes/d948-department-visibility.test.ts tests/routes/auth.test.ts tests/middleware/auth.test.ts tests/middleware/rbac.test.ts` 退出码 0（141 用例全绿）
- [ ] 链路走通: 上述套件含 **A1 解码载荷**断言（`payload.department === 'marketing'`）与 **A7 刷新保留**断言
- [ ] 结果可见: A3/A4/A5 每条均有「正路径 + 负路径 + 对照」成对断言，且**真实身份链**在场（`grep -c jwtAuthMiddleware tests/routes/d948-department-visibility.test.ts` ≥ 1 且 `grep -c rbacMiddleware …` ≥ 1），且**无合成 rbac**：`grep -c "syntheticRbac(" tests/routes/d948-department-visibility.test.ts` 输出 0（该串仅出现在解释为何禁用的注释中）
- [ ] 零新增禁用断言: `git diff ef5c8caa..HEAD -- src tests | grep -E "^\+" | grep -vE "^\+[[:space:]]*(/\*|\*|//)" | grep -cE "(as any|as never|as unknown as)"` 输出 0
      （口径同 pre-commit 组 1：**注释行不计**。不加 `-- src tests` 会把本 brief 自身那条 Done 文案也算进去 ⇒ 恒 ≥1）
- [ ] 写集不越界: `git diff --name-only ef5c8caa..HEAD | grep -vc "^.claude/bypass.log$"` 输出 8
      （`.claude/bypass.log` 是 D521 post-commit hook 的**自动登记产物**，每次提交都会 +1 行，非人工写集；不排除它则该数恒为 9）
- [ ] 门禁: `bash scripts/pre-commit-check.sh` 退出码 0
