<!--
  SYNOVA-IMPL-D659: 消灭写操作吞错——updateUser/deleteUser 返 {ok,error} + 调用点消费
  状态: dev doc | 2026-09-09 | 优先级 P1（C2 健壮性唯一实质扣分点）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md（K3 D651 评估 W-2）；AGENTS.md 铁律 24/31（降级 log.warn + degraded 传播）
  借鉴: 无
  依赖: 无
  并行: 无（写集 src/growth/user-store.ts + src/services/anomaly-detector.ts + src/routes/enterprise.ts；与在途任务零交集）
-->

# SYNOVA-IMPL-D659：消灭写操作吞错（updateUser/deleteUser 返 {ok,error}）

> 状态：dev doc | 2026-09-09 | 优先级 P1（C2 健壮性）
> 归属：Win 线（src/growth/ + src/services/ + src/routes/）
> 依据：K3 D651 评估 W-2——`updateUser` 内部 catch 吞错返 void，accept 绑定持久化失败仍返 `linked:true`

## 1. 权威文档引用

- **Win 侧代码质量提升建议（2026-09-09）W-2 消灭写操作吞错**：副作用写方法禁止 void 返回 + 内部 catch 静默——返回 `{ ok, error? }`，调用点必须消费。
- **AGENTS.md 铁律 24**（catch 必须有 log.warn/error + degraded 传播）；**铁律 31**（降级信号传播，调用方检查）。

## 2. 代码审计——现状（file:line，实测）

### 2.1 缺陷（K3 引用，逐条实证）

- `src/growth/user-store.ts:218-224` `updateUser(...): void`——内部 `try/catch` 只 `log.warn` 吞错返 void，调用方无法感知持久化失败。
- `src/growth/user-store.ts:230-232` `deleteUser(...): void`——同型缺陷（catch 只 log.warn）。
- `src/routes/enterprise.ts:239` `store.updateUser(existing.userId, { orgId, role })`（void）→ `:243` 无条件 `return { linked: true }`——**orgId 绑定持久化失败仍报成功**（K3 实测扣分点）。
- `src/services/anomaly-detector.ts:86` 接口类型 `updateUser(...): void`（镜像实现，需同步）。

### 2.2 调用点清单（grep 实测，全部需消费结果）

| 文件 | 行 | 调用 | 需处理 |
|---|---|---|---|
| `src/routes/enterprise.ts` | :239 | accept 绑定 `updateUser` | **失败不得返回 linked:true**（核心修复） |
| `src/routes/enterprise.ts` | :297 | role 更新 `updateUser` | 失败 log.warn + 降级响应 |
| `src/routes/enterprise.ts` | :314 / :331 | `deleteUser` | 失败 log.warn + 降级响应 |
| `src/routes/enterprise.ts` | :347 / :609 | `updateUser` | 失败 log.warn + 降级响应 |
| `src/services/anomaly-detector.ts` | :100 / :110 | `updateUser` | 失败 log.warn |

### 2.3 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `updateUser`/`deleteUser` 调用点 8 处（enterprise 6 + anomaly 2），集中在上述 3 文件 |
| 施工图可借鉴清单 | 非借鉴卡 |
| 既有层确认 | `updateUser` 底层 `SqliteGraphStore.updateNode` 返回 void（无 ok 信号），需在 user-store 层包一层 `{ok,error}` |
| 结论 | 只修 2 个写方法 + 3 文件调用点，不重写底层 store |

## 3. 实现方案

### 3.1 写集 (3 修改 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/growth/user-store.ts` | 修改 | `updateUser`/`deleteUser` 返回类型 `void` → `{ ok: boolean; error?: string }`；catch 时 `log.warn` + `return { ok: false, error }`；成功 `return { ok: true }` |
| `src/services/anomaly-detector.ts` | 修改 | :86 接口类型 `updateUser(...): void` → `{ ok: boolean; error?: string }`；:100/:110 调用点消费结果（失败 log.warn） |
| `src/routes/enterprise.ts` | 修改 | 6 处调用点消费结果；**:239 accept 绑定失败 → 不返回 linked:true，降级响应（铁律 24/31）** |
| `tests/agent/user-store.test.ts`（或 `tests/routes/enterprise.test.ts`） | 新建/修改 | 正常：更新成功返 ok:true；降级：持久化失败返 ok:false（mock updateNode 抛错）；边界：accept 绑定 updateUser 失败 → linked:true 不返回 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（返回类型命名、accept 失败响应的具体 HTTP 状态/code、测试落点），必须在此节同 commit 回填最终形态。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不改 `SqliteGraphStore.updateNode` 底层 | 通用 props merge，本卡在 user-store 层包 `{ok,error}` |
| 不做 AST 门禁（检测"写方法 void + catch"） | 属 scripts/ 门禁层（DSH 线），本卡只修代码；AST 门禁另立任务交 DSH |
| 不做全仓存量写操作吞错扫描 | 本卡只修 K3 引用的 updateUser/deleteUser；全量扫描另立任务 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（updateUser 持久化失败仍 void → 无法断言失败 → red），第二步实现跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/agent/user-store.test.ts` | 单测 | ≥3 | updateUser 成功返 {ok:true}、updateNode 抛错返 {ok:false,error}、deleteUser 同型 |
| `tests/routes/enterprise.test.ts` | 单测 | ≥2 | accept 绑定 updateUser 失败 → 不返 linked:true（降级响应）；正常路径仍 linked:true |

RED 必须覆盖失败模式（S-5）：mock `updateNode` 抛错 → `updateUser` 应返 `{ok:false}`（修复前返 void 无法断言 → red）；accept 绑定 updateUser 失败 → 应不返 `linked:true`（修复前恒返 → red）。

### 4.5 决策参考（S-12）

- **决策点 1（返回类型）**：参考系 = K3 W-2「返回 `{ ok, error? }`」+ 铁律 24/31——采纳 `{ ok: boolean; error?: string }`（不用 throw，写操作失败降级不炸调用链）。
- **决策点 2（accept 失败响应）**：参考系 = 铁律 31（降级信号传播）——采纳失败返 `500 {ok:false, degraded:true}`（不返 linked:true），正常路径不变。

## 5. 接线要求（生产调用点，S-3）

| 新 export/返回值 | 调用方 | 确认方式 |
|---|---|---|
| `updateUser`/`deleteUser` 返回 `{ok,error}` | `src/routes/enterprise.ts` + `src/services/anomaly-detector.ts` | `grep -rn "updateUser\|deleteUser" src/routes/enterprise.ts src/services/anomaly-detector.ts` 全部调用点消费 `.ok` |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 无 void 写方法**：`grep -n "updateUser.*: void\|deleteUser.*: void" src/growth/user-store.ts src/services/anomaly-detector.ts` 零命中。
- **DS2 返回 {ok,error}**：`grep -n "{ ok: boolean; error?: string }" src/growth/user-store.ts src/services/anomaly-detector.ts` 命中 ≥2。
- **DS3 accept 绑定不再吞错**：`grep -n "linked: true" src/routes/enterprise.ts` 所在分支前有 `updateUser(...).ok` 检查（失败路径不返 linked:true）。
- **DS4 测试 red→green**：`npx vitest run tests/agent/user-store.test.ts tests/routes/enterprise.test.ts` 先 red → green（≥5 用例，非空壳）。
- **DS5 零回归**：`npx vitest run tests/agent/ tests/routes/ tests/services/` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/growth/user-store.ts src/services/anomaly-detector.ts src/routes/enterprise.ts` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] K3 W-2 缺陷（user-store.ts:218-224 / enterprise.ts:239 / anomaly-detector.ts:86）grep 实证（file:line 已列）
- [ ] updateUser/deleteUser 全部 8 处调用点已列入写集消费结果
- [ ] accept 绑定失败不返 linked:true（铁律 24/31）
- [ ] AST 门禁 + 全量扫描明确 descope（DSH 线 / 后续任务）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 无 void 写方法 | `grep -n "updateUser.*: void\|deleteUser.*: void" src/growth/user-store.ts src/services/anomaly-detector.ts` | 0 命中 |
| 返回 {ok,error} | `grep -n "{ ok: boolean; error?: string }" src/growth/user-store.ts src/services/anomaly-detector.ts` | ≥2 命中 |
| accept 绑定不吞错 | `grep -n "updateUser" src/routes/enterprise.ts` | 调用点消费 .ok |
| 测试 red→green 全绿 | `npx vitest run tests/agent/user-store.test.ts tests/routes/enterprise.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/growth/user-store.ts src/services/anomaly-detector.ts src/routes/enterprise.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
