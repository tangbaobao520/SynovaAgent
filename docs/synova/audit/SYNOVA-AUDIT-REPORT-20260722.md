# SynovaAgent 代码审计报告 — 2026-07-22

> 基于 SYNOVA-AUDIT-SPEC-代码审计规范-20260722.md 执行
> 15 commits × 5 项检查 + 全量回归测试
> 审计分支: `feat/prompt-architecture`

---

## 审计汇总

| 指标 | 值 |
|------|:--:|
| 审计 Commit 数 | 15 |
| P0 (阻塞) | **17** 项 |
| P1 (重要) | **27** 项 |
| P2 (建议) | **17** 项 |
| 全通过 (零问题) | 2 项 (D18, D20) |
| 存在问题 | 13 项 |
| 回归测试 (agent) | **28 passed, 0 failed** (251 tests) ✅ |
| 回归测试 (其他) | **64 passed, 5 failed** (473 tests) ❌ |

### 每 Commit 检查结果

| Commit | 检查项 | Wiring | Exception | TypeSafety | Test | Contract |
|--------|:------:|:------:|:---------:|:----------:|:----:|:--------:|
| D8a | f0cdf83 | ✅ PASS | 🔴 **P0** | ✅ PASS | ⚠️ **P1** | ✅ PASS |
| D8b | c4152e4 | ✅ PASS | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS |
| D8c | 152dfb7 | ✅ PASS | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS |
| D8d | f7bcbe0 | ✅ PASS | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS |
| D8e | db5251f | 🔴 **P0** | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS |
| D8f | a6a2322 | 🔴 **P0** | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS |
| D102+D103 | 34eeff0 | ✅ PASS | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS |
| D106+D107 | 77059b0 | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| D91 | dfb5429 | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| D94 | 7ee8386 | ✅ PASS | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS |
| D96 | c3f5164 | ✅ PASS | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS |
| D17 | 0cc7ff7 | 🔴 **P0** | ⚠️ **P1** | ✅ PASS | ✅ PASS | ✅ PASS |
| D18 | 31f1152 | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| D19 | 9790414 | 🔴 **P0** | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| D20 | 2d0f699 | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |

---

## P0 修复清单（17 项 — 阻塞级，必须修复才能合并）

### D8a-D8f — 空 catch 块（静默吞异常）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 1 | D8a | [main-agent.ts:183](src/agent/main-agent.ts#L183) | 空 catch 块 — ConvergenceEngine.analyzePrecedents 异常被静默吞没 | 添加 `log.warn({ err, loopId, scale }, '收敛分析降级')` |
| 2 | D8a | [main-agent.ts:303](src/agent/main-agent.ts#L303) | 空 catch 块 — CrossValidationTrigger 异常被静默吞没 | 添加 `log.warn({ err }, '交叉验证异常 — 降级')` |
| 3 | D8a | [bootstrap.ts:908](src/deploy/bootstrap.ts#L908) | 空 catch 块 — CredentialPool JSON.parse 失败静默 | 添加 `log.warn({ credentialId }, '凭证解析失败')` |
| 4 | D8b | [main-agent.ts:183-184](src/agent/main-agent.ts#L183) | `.catch(() => {})` 空 promise rejection handler | 替换为 `.catch((err) => log.warn(...))` |
| 5 | D8b | [main-agent.ts:303](src/agent/main-agent.ts#L303) | 空 catch 块 — 交叉验证异常静默 | 添加 `log.warn({ err }, '交叉验证异常 — 降级')` |
| 6 | D8b | [main-agent.ts:311](src/agent/main-agent.ts#L311) | catch 返回 degraded:true 但无 log.warn/error | 添加 `log.warn(...)` 在 return 前 |
| 7 | D8b | [task-decomposer.ts:255](src/agent/task-decomposer.ts#L255) | runHandlerForDimension catch 无 log 无 degraded:true | 添加 `log.warn` + 返回 `{ degraded: true }` |
| 8 | D8c | [task-decomposer.ts:255](src/agent/task-decomposer.ts#L255) | runHandlerForDimension() catch 静默吞异常 | 添加 `log.warn` + degraded:true |
| 9 | D8d | [main-agent.ts:183](src/agent/main-agent.ts#L183) | 空 catch `catch (_) { /* 收敛分析降级 */ }` 无 log | 添加 `log.warn({}, '收敛分析异常 — 降级')` |
| 10 | D8d | [main-agent.ts:303](src/agent/main-agent.ts#L303) | 空 catch `catch (_) { /* 交叉验证降级 */ }` 无 log | 添加 `log.warn({}, '交叉验证异常 — 降级')` |
| 11 | D8e | [conflict-arbitrator.ts:269](src/agent/conflict-arbitrator.ts#L269) | 空 catch — 收敛引擎异常静默 | 添加 `log.warn({ err }, 'getConvergence 失败')` |

### D8e-D8f — 接线失败（零调用方）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 12 | D8e | [conflict-arbitrator.ts:110](src/agent/conflict-arbitrator.ts#L110) | **ConflictArbitrator 类零调用方** — 整个仲裁子系统未接线 | 在 main-agent.ts 或 bootstrap 中 import 并实例化 |
| 13 | D8f | [conflict-arbitrator.ts:110](src/agent/conflict-arbitrator.ts#L110) | **ConflictArbitrator 零生产调用方** — 任何 src/ 文件未 import | 接线到 main-agent.ts executeLoopScale 中 |

### D106+D107 — UserStore 零调用方

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 14 | D106+D107 | [user-store.ts:54](src/growth/user-store.ts#L54) | **UserStore 所有方法零生产调用方** — 仅在测试中被引用 | 将 UserStore 集成到 auth routes 中，或从本 commit 删除 |

### D17 — ProactivePush 动态属性未注入

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 15 | D17 | [runner.ts:279](src/sentinel/runner.ts#L279) | **`__proactivePush` 动态属性从未被设置** — 整个 P0 推送是死代码 | 添加 `setProactivePush()` 方法并在 bootstrap 中注入 |

### D19 — GAFeedbackHandler 零调用方

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 16 | D19 | [ga-collaboration.ts:50](src/l3/ga-collaboration.ts#L50) | **GAFeedbackHandler 零生产调用方** — D18→D19 反馈链断裂 | 接入手把手决处理管线（routes/sentinel.ts） |
| 17 | D19 | [interactive-card.ts:162](src/agent/interactive-card.ts#L162) | handleAction 返回固定成功消息，**从未调用 GAFeedbackHandler** | 注入 GAFeedbackHandler 并委托 flag/correct/rediagnose |

---

## P1 修复清单（27 项 — 重要，建议修复后再合并）

### Exception 类（13 项 — 缺 log / 缺 degraded）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 1 | D8a | [main-agent.ts:311](src/agent/main-agent.ts#L311) | catch 返回 degraded:true 但无 log.warn | 添加 `log.warn` 在 return 前 |
| 2 | D8a | [bootstrap.ts:867](src/deploy/bootstrap.ts#L867) | catch 有 ctx.addDegraded 但无 log.warn | 添加 `log.warn({ err }, '联邦适配器降级失败')` |
| 3 | D8a | [bootstrap.ts:1099](src/deploy/bootstrap.ts#L1099) | catch 用 `log.debug` 而非 `log.warn/error` | 改为 `log.warn` |
| 4 | D8d | [main-agent.ts:182](src/agent/main-agent.ts#L182) | `.catch(() => {})` 静默吞 promise rejection | 替换为 `.catch((err) => log.warn(...))` |
| 5 | D8d | [main-agent.ts:311](src/agent/main-agent.ts#L311) | catch 返回 degraded:true 但无 log.warn | 添加 `log.warn` 在 return 前 |
| 6 | D8f | [main-agent.ts:182](src/agent/main-agent.ts#L182) | `.catch(() => {})` 静默吞 analyzePrecedents 失败 | 替换为 `.catch((err) => log.warn(...))` |
| 7 | D8f | [main-agent.ts:183](src/agent/main-agent.ts#L183) | 空 catch — 收敛引擎异常静默 | 添加 `log.warn({ err }, '收敛引擎失败 — 降级')` |
| 8 | D8f | [main-agent.ts:303](src/agent/main-agent.ts#L303) | 空 catch — 交叉验证异常静默 | 添加 `log.warn({ err }, '交叉验证失败 — 降级')` |
| 9 | D8f | [main-agent.ts:311](src/agent/main-agent.ts#L311) | catch 返回 degraded:true 但无 log.warn | 添加 `log.warn` 在 return 前 |
| 10 | D8f | [conflict-arbitrator.ts:269](src/agent/conflict-arbitrator.ts#L269) | 空 catch — getConvergence 失败静默 | 添加 `log.warn({ err }, '收敛引擎查询失败')` |
| 11 | D102+D103 | [auth.ts:228](src/routes/auth.ts#L228) | validate endpoint catch 有 degraded:true 但无 log.error | 添加 `log.error({ err }, 'validate 异常')` |
| 12 | D94 | [scheduler.ts:104](src/cron/scheduler.ts#L104) | 空 catch — 事件监听器失败静默 | 添加 `log.warn({ eventType, err }, '监听器执行失败')` |
| 13 | D96 | [server.ts:194](src/server.ts#L194) | `.catch(() => {})` pushToFeishu 失败静默 | 添加 `log.warn({ err }, '飞书推送失败')` |

### Wiring 类（4 项 — 出口未接线）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 14 | D91 | [loop-scheduler.ts:155](src/loops/loop-scheduler.ts#L155) | LoopScheduler.onEvent() 零生产调用方 | 接入事件总线或 MainAgent |
| 15 | D17 | [proactive-push.ts:221](src/agent/proactive-push.ts#L221) | retryFailed 无外部调用方 | 接到 retry 机制或定时任务 |
| 16 | D19 | [interactive-card.ts:162](src/agent/interactive-card.ts#L162) | handleAction 固定占位，不委托 GAFeedbackHandler | 注入并委托 processFeedback() |
| 17 | D19 | [ga-collaboration.ts:56](src/l3/ga-collaboration.ts#L56) | setReDiagnosisEngine/setFeedbackCollector 从未被调用 | 在初始化时注入 |

### Test 类（3 项）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 18 | D8a | [loop-handlers.ts:1](src/agent/loop-handlers.ts#L1) | **无测试文件** — tests/agent/loop-handlers.test.ts 不存在 | 创建测试文件 ≥ 3 expect |
| 19 | D106+D107 | [user-store.ts:102](src/growth/user-store.ts#L102) | createUser catch 重新抛出而非返回 degraded 值 | 改为返回 `{ userId: '', degraded: true }` |
| 20 | D96 | [server.ts:385](src/server.ts#L385) | catch (err) 缺类型标注 → `catch (err: unknown)` | 添加类型标注 |

### Type Safety / 历史模式（4 项）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 21 | D8a | [main-agent.ts:294](src/agent/main-agent.ts#L294) | ExpertType 写为 `'unknown'` 字面量（历史错误模式 #1） | 使用类型级常量或 null + 类型守卫 |
| 22 | D8d | [main-agent.ts:294](src/agent/main-agent.ts#L294) | 同上 — `sr.expertType \|\| 'unknown'` | 同上 |
| 23 | D8d | [cross-validator.ts:187](src/agent/cross-validator.ts#L187) | 同上 — 'unknown' 字面量回退值 | 同上 |
| 24 | D96 | [server.ts:365](src/server.ts#L365) | `catch (err: any)` 违反铁律 38 精神 | 改为 `catch (err: unknown)` |

### Other Exception（3 项 — 空 catch / 无 degraded）

| # | Commit | 文件:行号 | 问题 | 修复方案 |
|:-:|:------:|-----------|------|---------|
| 25 | D94 | [scheduler.ts:172](src/cron/scheduler.ts#L172) | safeParseEventTypes catch 静默返回空数组 | 添加 `log.warn` |
| 26 | D94 | [scheduler.ts:145](src/cron/scheduler.ts#L145) | ALTER TABLE 迁移 catch 静默吞异常 | 添加 `log.debug({ err }, '迁移跳过')` |
| 27 | D17 | [runner.ts:475/486/547/618](src/sentinel/runner.ts#L475) | 4 个空 catch 块 — getThreshold / corrupted data / graphStore 降级 | 各添加 `log.warn` |

---

## P2 建议清单（17 项 — 非阻塞改进）

| # | Commit | 文件:行号 | 问题 |
|:-:|:------:|-----------|------|
| 1 | D8b | [main-agent.ts:181](src/agent/main-agent.ts#L181) | ConvergenceEngine 通过 `new` 内联而非 DI 注入 |
| 2 | D8b | [main-agent.ts:294](src/agent/main-agent.ts#L294) | expertType 字面量 'unknown' |
| 3 | D8b | [main-agent.ts:80](src/agent/main-agent.ts#L80) | TaskDecomposer 从未在 production 中实例化 → executeWithDecomposition 是死代码 |
| 4 | D8d | [cross-validator.ts:187](src/agent/cross-validator.ts#L187) | 'unknown' 字面量回退 |
| 5 | D8d | [main-agent.ts:294](src/agent/main-agent.ts#L294) | 'unknown' 字面量回退 |
| 6 | D8d | [main-agent.ts:181](src/agent/main-agent.ts#L181) | ConvergenceEngine 内联 new |
| 7 | D8d | [cross-validator.ts:124](src/agent/cross-validator.ts#L124) | detectConflicts catch 有 log.warn 但不能返回 degraded（返回类型为 Conflict[]） |
| 8 | D8f | [main-agent.ts:181](src/agent/main-agent.ts#L181) | ConvergenceEngine 内联 new |
| 9 | D8f | [main-agent.ts:294](src/agent/main-agent.ts#L294) | 'unknown' 字面量回退 |
| 10 | D91 | [bootstrap.ts:552](src/deploy/bootstrap.ts#L552) | Phase 2f 获取 scheduler 变量但从不使用 — 死赋值 |
| 11 | D94 | [scheduler.ts:172](src/cron/scheduler.ts#L172) | safeParseEventTypes catch 返回空数组无日志 |
| 12 | D94 | [scheduler.ts:145](src/cron/scheduler.ts#L145) | ALTER TABLE catch 静默吞异常 |
| 13 | D96 | [server.ts:365](src/server.ts#L365) | Connector pipeline 500 响应缺 degraded: true |
| 14 | D18 | [interactive-card.ts:94](src/agent/interactive-card.ts#L94) | buildGACardMessage 导出但零生产调用方（死代码） |
| 15 | D18 | [interactive-card.ts:97](src/agent/interactive-card.ts#L97) | 冗余 `as CardActionType` 类型断言 |
| 16 | D19 | [ga-collaboration.ts:219](src/l3/ga-collaboration.ts#L219) | recordCorrection 使用 `as { id: string }` 非安全类型断言 |
| 17 | D20 | [server.ts:348](src/server.ts#L348) | 注释"// D103"挂载的是 loopRoutes — 复制粘贴错误 |

---

## 回归测试结果

### Agent 测试（D8a-D8f 全量回归 — 他们用了 --no-verify）

```
npx vitest run tests/agent/
结果: 28 passed, 0 failed (251 tests)
状态: ✅ 全部通过
```

### 其他测试套件

```
npx vitest run tests/routes/ tests/growth/ tests/cron/ tests/loops/ tests/l3/
结果: 64 passed, 5 FAILED (473 tests)
状态: ❌ 5 个文件失败
```

#### 失败详情

| 文件 | 问题 | 严重度 |
|------|------|:------:|
| [knowledge-agent-ima.test.ts](tests/l3/knowledge-agent-ima.test.ts) | src/l3/knowledge-agent.ts:516 parse error — 可选字段 `imaClient?` 语法错误 | P0 (编译错误) |
| [feedback-collector.test.ts](tests/growth/feedback-collector.test.ts) | 5 个 SqliteError: `no such table: schema_version` — FEEDBACK_DDL 未建表 | P1 (测试隔离) |
| [graphbridge-wiring.test.ts](tests/l3/graphbridge-wiring.test.ts) | expected 1 graph node got 0 — 图数据库初始化问题 | P1 |
| [ga-evolution.test.ts](tests/routes/ga-evolution.test.ts) | `TypeError: done is not a function` — Express handler 签名不匹配 | P1 |
| [notifications.test.ts](tests/routes/notifications.test.ts) | `Cannot find module '../../src/routes/notifications'` — 模块不存在 | P0 (死引用) |

---

## D20 专项检查（8 点清单）

| # | 检查项 | 状态 | 备注 |
|:-:|--------|:----:|------|
| 1 | 测试文件 tests/routes/loops.test.ts 存在且 ≥ 4 个 it() | ✅ PASS | 修复 commit 544d74c 已补测试 |
| 2 | HTML 使用正确路径 (/app/css/app.css, /app/js/shell.js) | ✅ PASS | loops.html 正确引用 |
| 3 | 使用 `<header id="synova-shell">` + shell.js 共享导航 | ✅ PASS | 已在 loops.html 中实现 |
| 4 | 使用 api.get() 而非裸 fetch() | ✅ PASS | loops.js 使用 api.get() |
| 5 | GET /api/loops/status 有 JWT 认证中间件 | ✅ PASS | 已在 server.ts 中注册认证 |
| 6 | MainAgent 通过 server.ts 注入到 route handler | ✅ PASS | 通过 server.ts 上下文注入 |
| 7 | API response 包含 nextTrigger.nextAt 字段 | ✅ PASS | loops.ts 返回该字段 |
| 8 | lastRunAgoSeconds 改为返回时间戳，前端计算 | ✅ PASS | 修复 commit 已实现 |

**结论**: D20 8 点全部通过 ✅

---

## 核心问题分析

### 问题类型分布

```
P0 total: 17
├── Exception (空 catch 块)     ██████████████ 12 (70%)
├── Wiring (零调用方)           █████ 5 (30%)

P1 total: 27
├── Exception (缺 log/degraded) █████████████ 13 (48%)
├── Wiring (出口未接线)         ████ 4 (15%)
├── Test (缺测试/缺断言)        ███ 3 (11%)
├── Type Safety / 历史模式      ████ 4 (15%)
├── Other                       ███ 3 (11%)
```

### 最严重的三类问题

1. **空 catch 块横行（P0 × 12）** → D8a-D8f 所有 commit 都有空 catch。`main-agent.ts:183` 在 4 个 commit 中反复出现。核心原因是 `--no-verify` 跳过了 pre-commit 的异常检查。

2. **接线断裂（P0 × 5, P1 × 4）** → ConflictArbitrator、UserStore、GAFeedbackHandler、ProactivePush 均有 export 但零生产调用方。4 个独立模块写了代码但从未接入管线。

3. **回归测试 5 个失败** → 编译错误（knowledge-agent.ts 语法）、模块不存在（notifications.ts）、数据库表缺失（feedback-collector）、运行时崩溃（ga-evolution）、集成失败（graphbridge-wiring）。

### 建议优先修复顺序

1. 🚨 `src/l3/knowledge-agent.ts:516` 编译错误 — 整个 L3 不能编译
2. 🚨 `src/routes/notifications.ts` 缺失 — 路由测试崩溃
3. 🚨 `main-agent.ts` 12 个空 catch 统一修复（批量替换模式）
4. 🚨 ConflictArbitrator / GAFeedbackHandler 接线（D8e + D19）
5. ⚠️ UserStore 接线（D106+D107）
6. ⚠️ ProactivePush 注入（D17）
7. ⚠️ 4 个测试失败修复

---

*审计由 Workflow × 16 agents 自动执行，共计 745k tokens，316 次工具调用。*
*报告生成: 2026-07-22 | 审计规范: SYNOVA-AUDIT-SPEC-20260722 v1.0*
