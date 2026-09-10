<!--
  SYNOVA-IMPL-D702: 消灭写操作吞错——updateUser/deleteUser 返 {ok,error} + 调用点消费
  状态: dev doc | 2026-09-11 | 优先级 P1（K3 D651 评估 W-2：唯一实质扣分点）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md（W-2）；AGENTS.md 铁律 24/31（降级 log.warn + degraded 传播）
  作者: Codex（Win 线 CTO）| 号段: Win/Codex 侧任务号 ≥ D700（创始人 2026-09-10 定）
  前身: D659（原号落入 Mac 号段，本卡改号 D702；内容校订见 §0）
  依赖: 无
  并行: 可与 D703 / D704 任意一条并行（写集零交集）
-->

# SYNOVA-IMPL-D702：消灭写操作吞错（updateUser/deleteUser 返 {ok,error}）

> 状态：dev doc | 2026-09-11 | 优先级 P1（健壮性）
> 归属：Win 线（src/growth/ + src/services/ + src/routes/）
> 依据：K3 D651 评估 W-2——`updateUser` 内部 catch 吞错返 void，accept 绑定持久化失败仍返 `linked:true`

## 0. 派单前校订（2026-09-11，Codex 复核 @ main 5f5dde25）

| 项 | 前身 D659 原文 | 校订后 | 证据（实测） |
|---|---|---|---|
| 任务号 | D659 | **D702** | Win/Codex 侧任务号 ≥ D700（D700 tools seam、D701 决策来源已用） |
| 测试落点 | `tests/agent/user-store.test.ts`（新建） | **`tests/growth/user-store.test.ts`（扩展，该文件已存在 151 行）** | 映射公式 `scripts/pre-commit-check.sh:547`：`src/x.ts → tests/x.test.ts`；该文件已覆盖 createUser/queryByEmail/getById/updateUser/listByOrg，且已内置 MockGraphStore |
| tsc 基线口径 | 「基线 28」 | 「与基线 worktree 逐条 diff 恒等、零新增」**（不写死数字）** | 本机 `npx tsc --noEmit` = 33 行，其中 5 行是 `src/mcp/index.ts`(:18/:19/:20/:57) + `src/mcp/tool-definitions.ts`(:31) 的 SDK 模块解析（本机 node_modules 未装 @modelcontextprotocol/sdk）→ 33 − 5 = 28 |
| 真实依赖语义（S-15） | 未要求 | §2.3 新增「真实 store 语义对照」，§4 补 1 条 round-trip 断言 | dev-doc 技能 S-15（D701 store-id bug 教训） |

## 1. 权威文档引用

- **Win 侧代码质量提升建议（2026-09-09）W-2 消灭写操作吞错**：副作用写方法禁止 void 返回 + 内部 catch 静默——返回 `{ ok, error? }`，调用点必须消费。
- **AGENTS.md 铁律 24**（catch 必须有 log.warn/error + degraded 传播）；**铁律 31**（降级信号传播，调用方检查）。

## 2. 代码审计——现状（@ main 5f5dde25 实测）

### 2.1 缺陷（逐条实证）

- `src/growth/user-store.ts:218-225` `updateUser(...): void`——catch 仅 `log.warn`（:223）后返回，调用方无法感知持久化失败。
- `src/growth/user-store.ts:230-237` `deleteUser(...): void`——同型缺陷（catch :235）。
- `src/routes/enterprise.ts:239` `store.updateUser(existing.userId, { orgId: inv.orgId, role: inv.role })`（void）→ `:243` 无条件返回 `{ ..., linked: true }`——**orgId 绑定持久化失败仍报成功**（K3 实测扣分点）。
- `src/services/anomaly-detector.ts:86` 接口声明 `updateUser(userId, props): void`（镜像实现，需同步）；调用点 :100 / :110。

### 2.2 调用点清单（grep 实测 = 8 处，全部需消费结果）

| 文件 | 行 | 调用 | 需处理 |
|---|---|---|---|
| src/routes/enterprise.ts | :239 | accept 绑定 `updateUser` | **失败不得返回 linked:true**（核心修复） |
| src/routes/enterprise.ts | :297 | role 更新 `updateUser` | 失败 log.warn + 降级响应 |
| src/routes/enterprise.ts | :314 / :331 | `deleteUser`（软删除） | 失败 log.warn + 降级响应 |
| src/routes/enterprise.ts | :347 / :609 | `updateUser` | 失败 log.warn + 降级响应 |
| src/services/anomaly-detector.ts | :100 / :110 | `updateUser` | 失败 log.warn |

### 2.3 真实依赖语义对照（S-15，实测）

| 依赖 | 真实语义（实测） | 对假 store 的要求 |
|---|---|---|
| SqliteGraphStore.createNode（src/adapters/sqlite-graph-store.ts:139-158） | `const id = node-${uuid()}`——**恒生成 id 并忽略 props.id**；失败 `log.warn` 后 **throw err** | 假 store 若按 props.id 建档即失真（D701 教训：单测绿、真实 store 取不回） |
| SqliteGraphStore.updateNode（src/adapters/sqlite-graph-store.ts:318-332） | `getNode` → props merge → `UPDATE graph_nodes SET props=? WHERE id=? AND graph=?`；失败 `log.warn` 后 **throw err** | **真实 store 失败会 throw**——正是被 user-store catch 吞掉的失败源；假 store 必须可注入 throw |
| 现有 MockGraphStore.updateNode（tests/growth/user-store.test.ts:45-50） | id 不存在时静默 no-op（与真实 UPDATE 命中 0 行同语义）；**不会 throw** | 本卡需扩展它支持「失败注入」 |

### 2.4 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `updateUser`/`deleteUser` 调用点 = 8 处（enterprise 6 + anomaly 2），全部集中在 §2.2 三文件 |
| 施工图可借鉴清单 | 非借鉴卡 |
| 既有层确认 | 底层 `updateNode` 返回 void（失败 throw），需在 user-store 层包一层 `{ok,error}`，不重写底层 |
| 结论 | 只修 2 个写方法 + 3 文件调用点 + 2 个测试文件 |

## 3. 实现方案

### 3.1 写集 (4 修改 + 1 新建)

| 文件 | 操作 | 说明 |
|---|---|---|
| src/growth/user-store.ts | 修改 | `updateUser`(:218)/`deleteUser`(:230) 返回类型 `void` → `{ ok: boolean; error?: string }`；catch：`log.warn` + `return { ok: false, error }`；成功 `return { ok: true }` |
| src/services/anomaly-detector.ts | 修改 | :86 接口签名同步为 `{ ok: boolean; error?: string }`；:100/:110 消费 `.ok`（失败 log.warn） |
| src/routes/enterprise.ts | 修改 | :239/:297/:314/:331/:347/:609 六处消费结果；**:239 绑定失败 → 不返 linked:true**，降级响应（铁律 24/31） |
| tests/growth/user-store.test.ts | 修改 | 扩展现有文件（≥4 用例），含 S-15 round-trip 一条 |
| tests/routes/enterprise.test.ts | 新建 | ≥2 用例（accept 绑定失败不返 linked:true + 正常路径仍 linked:true） |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（返回类型命名、accept 失败响应的具体 HTTP 状态/code、假 store 改造方式、round-trip 断言落点），必须在此节同 commit 回填最终形态。

### 3.3 不做的事

| 项 | 理由 |
|---|---|
| 不改 SqliteGraphStore.updateNode 底层 | 通用 props merge；本卡在 user-store 层包 `{ok,error}` |
| 不做「写方法 void + catch」AST 门禁 | 属 scripts/ 门禁层，另立任务 |
| 不做全仓存量写操作吞错扫描 | 本卡只修 K3 点名的 updateUser/deleteUser |
| 不引 @deepseek-ai | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红，第二步实现跑绿。每用例 ≥3 expect。

| 层 | 文件 | 数量 | 覆盖 |
|---|---|---|---|
| 单测 | tests/growth/user-store.test.ts（扩展） | ≥4 | updateUser 成功 `{ok:true}`；updateNode 抛错 → `{ok:false,error}`；deleteUser 同型；**S-15 round-trip**：更新 orgId 后经假 store 读回可见（注入失败时读回不可见） |
| 单测 | tests/routes/enterprise.test.ts（新建） | ≥2 | accept 绑定 updateUser 失败 → 不返 `linked:true`；正常路径仍 `linked:true` |

- **RED 必须覆盖失败模式（S-5）**：mock `updateNode` 抛错 → 修复前 `updateUser` 返 void（无法断言 `ok:false`）→ red；accept 绑定失败 → 修复前恒返 `linked:true` → red。
- **S-15（真实依赖 round-trip）**：本卡不新增持久化路径，改的是失败信号传播；仍须补 1 条「写入成功 → 读回可见 / 注入失败 → 读回不可见」断言，且假 store 必须镜像 §2.3 真实语义（失败可 throw、id 语义与 createNode 一致）。若实现方判定真实 SQLite round-trip 成本过高，须在 §3.2 显式写明理由 + 替代证据，不得静默省略。

### 4.5 决策参考（S-12）

- **决策点 1（返回类型）**：参考系 = K3 W-2「返回 `{ ok, error? }`」+ 铁律 24/31——采纳 `{ ok: boolean; error?: string }`（不用 throw：写操作失败降级，不炸调用链）。
- **决策点 2（accept 失败响应）**：参考系 = 铁律 31（降级信号传播）——采纳失败返 `500 { ok:false, degraded:true }`，正常路径响应不变。

## 5. 接线要求（生产调用点，S-3）

| 新返回值 | 调用方 | 确认方式 |
|---|---|---|
| updateUser/deleteUser → `{ok,error}` | src/routes/enterprise.ts + src/services/anomaly-detector.ts | `grep -n "updateUser\|deleteUser" src/routes/enterprise.ts src/services/anomaly-detector.ts` → 8/8 调用点消费 `.ok` |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 无 void 写方法**：`grep -n "updateUser.*: void\|deleteUser.*: void" src/growth/user-store.ts src/services/anomaly-detector.ts` 零命中。
- **DS2 返回 {ok,error}**：`grep -n "{ ok: boolean; error?: string }" src/growth/user-store.ts src/services/anomaly-detector.ts` 命中 ≥2。
- **DS3 accept 绑定不再吞错**：`sed -n '235,245p' src/routes/enterprise.ts`——`:239` 之后有 `.ok` 判定，失败路径不返 `linked:true`。
- **DS4 测试 red→green**：`npx vitest run tests/growth/user-store.test.ts tests/routes/enterprise.test.ts` 先 red → green（≥6 用例，非空壳）。
- **DS5 零回归**：`npx vitest run tests/growth/ tests/routes/ tests/services/` 全绿；`npx tsc --noEmit` 报错集与基线 worktree **逐条 diff 恒等（零新增）**——判据是逐条比对而非数字（本机 raw 33 = 28 基线 + 5 条 mcp SDK 模块解析噪声，见 §0）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/growth/user-store.ts src/services/anomaly-detector.ts src/routes/enterprise.ts` 新增行零命中。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 本次零新增；`git push` 后 CI task-relevant jobs 绿（job 级，非汇总态）。

## 7. 自检清单

- [ ] K3 W-2 缺陷（user-store.ts:218/:230、enterprise.ts:239、anomaly-detector.ts:86）grep 实证（file:line 已列）
- [ ] 8 处调用点全部消费结果（§2.2 逐条对照）
- [ ] accept 绑定失败不返 linked:true（铁律 24/31）
- [ ] S-15：假 store 镜像真实 store 语义（updateNode 可抛错 + id 语义与 createNode 一致）
- [ ] AST 门禁 + 全量扫描明确 descope
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 无 void 写方法 | `grep -n "updateUser.*: void\|deleteUser.*: void" src/growth/user-store.ts src/services/anomaly-detector.ts` | 0 命中 |
| 返回 {ok,error} | `grep -n "{ ok: boolean; error?: string }" src/growth/user-store.ts src/services/anomaly-detector.ts` | ≥2 命中 |
| accept 绑定不吞错 | `grep -n "linked: true" src/routes/enterprise.ts` | 所在分支前有 `.ok` 判定 |
| 测试 red→green | `npx vitest run tests/growth/user-store.test.ts tests/routes/enterprise.test.ts` | 全 pass（≥6 用例） |
| 零回归 | `npx vitest run tests/growth/ tests/routes/ tests/services/` + `npx tsc --noEmit` | 全绿 + 报错集逐条恒等 |
| as any=0 | `grep -rn "as any" src/growth/user-store.ts src/services/anomaly-detector.ts src/routes/enterprise.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 本次 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 合并后空 + CI task-relevant jobs 绿 |
