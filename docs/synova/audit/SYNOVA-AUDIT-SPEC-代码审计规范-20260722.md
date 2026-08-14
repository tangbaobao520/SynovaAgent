# SynovaAgent 代码审计规范 v1.0

> 2026-07-22 | 基于 AGENTS.md 铁律 + 权威文档 #6 测试规范 + 历史 23 项错误教训
> **此文档是 Codex Agent 和 Claude Code 的共享审计标准。所有代码审计必须按此规范执行。**
> **禁止仅凭"文件名存在 + as any = 0"判断通过。**

---

## 一、审计范围

### 1.1 本次审计目标 Commit

共 15 个 commit，全部位于 `feat/prompt-architecture` 分支。按优先级分三组：

**P0 — 共享基础设施（影响所有上层模块）**

| # | Commit | 修改的核心文件 | 审计重点 |
|:--:|------|------|------|
| 1 | D8a (f0cdf83) | `src/agent/main-agent.ts`, `loop-handlers.ts`, `bootstrap.ts` | MainAgent 类初始化、registerLoop、executeLoop、Phase 2f 接线 |
| 2 | D8b (c4152e4) | `src/agent/task-decomposer.ts`, `main-agent.ts` | TaskDecomposer.decompose、executeSubTask、aggregate，MainAgent 集成 |
| 3 | D8c (152dfb7) | `src/agent/expert-router.ts`, `task-decomposer.ts` | ExpertRouter.dispatch、loadExpertManifest、selectExpert、9 专家映射 |
| 4 | D8d (f7bcbe0) | `src/agent/cross-validator.ts`, `main-agent.ts` | CrossValidationTrigger.detectConflicts、triggerTieBreaker、aggregate |
| 5 | D8e (db5251f) | `src/agent/conflict-arbitrator.ts` | ConflictArbitrator.arbitrate、autoResolve、escalateToGA、recordPrecedent、ConvergenceEngine 实例共享 |
| 6 | D8f (待推送) | `src/agent/convergence-engine.ts`, `conflict-arbitrator.ts`, `main-agent.ts` | ConvergenceEngine.synthesize、analyzePrecedents、getConvergence、与 ConflictArbitrator 的 DI 关系 |
| 7 | D20 (待推送) | `src/routes/loops.ts`, `app/loops.html`, `app/js/loops.js` | GET /api/loops/status 接线、MainAgent 注入、测试文件、HTML 路径、认证中间件 |

**P0 — 生产认证与企业基础设施**

| # | Commit | 修改的核心文件 | 审计重点 |
|:--:|------|------|------|
| 8 | D102+D103 (34eeff0) | `src/routes/auth.ts`, `src/routes/enterprise.ts`, `src/server.ts` | bcrypt login/register、JWT 格式不变、19 个企业端点、降级路径、测试覆盖 |
| 9 | D106+D107 (77059b0) | `src/growth/user-store.ts`, `graph-store.ts` | UserStore.createUser、queryByEmail、SOGNodeType.USER、D102/D103 迁移到 GraphStore |

**P1 — 调度基础设施与前端基础**

| # | Commit | 修改的核心文件 | 审计重点 |
|:--:|------|------|------|
| 10 | D91 (dfb5429) | `src/loops/loop-trigger-config.ts`, `loop-scheduler.ts`, `bootstrap.ts` | 6 循环 x 3 尺度矩阵、LoopScheduler.registerLoop、onEvent、Phase 2e 接线 |
| 11 | D94 (7ee8386) | `src/cron/scheduler.ts` | triggerType hybrid/event/cron、onEvent、resetEventTimer、全局事件总线 emitEvent/onEventType、向后兼容 |
| 12 | D96 (c3f5164) | `src/server.ts` (express.static), `app/js/api-client.js`, `app/js/auth.js`, `app/js/shell.js` | 静态文件服务、JWT token 管理、401 自动刷新、离线检测、共享导航栏 |

**P1 — 交互与仲裁依赖**

| # | Commit | 修改的核心文件 | 审计重点 |
|:--:|------|------|------|
| 13 | D17 (0cc7ff7) | `src/agent/proactive-push.ts`, `src/sentinel/runner.ts` | ProactivePush.onP0Finding、pushToChannel、retryFailed、P0 过滤、SentinelRunner 接线 |
| 14 | D18 (31f1152) | `src/agent/interactive-card.ts`, `src/routes/sentinel.ts`, `proactive-push.ts` | InteractiveCardHandler.buildCardMessage、handleAction、D93 feedback 集成、POST 端点 |
| 15 | D19 (9790414) | `src/l3/ga-collaboration.ts`, `interactive-card.ts` | GAFeedbackHandler.processFeedback、triggerReDiagnosis、D75 集成、D93 集成 |

---

## 二、审计依据

### 2.1 AGENTS.md 铁律（逐条对照）

| 铁律 | 编号 | 审计要求 | 违规判定 |
|------|:--:|------|------|
| 接线验收 | 0-2, 4, 5 | 每个 `export function/class` 必须有 `src/` 下的调用方。`grep -rn` 确认。 | 零调用方 = **P0 bug** |
| 降级信号 | 24, 31 | 每个 `catch { }` 块必须有 `log.warn/error` + 返回 `degraded: true`。 | 空 catch = **P0 bug** |
| 类型安全 | 38 | `src/` 下的 `.ts` 文件中 `as any` = 0。测试文件允许。 | 生产代码 as any = **P1** |
| 契约优先 | 47 | 新增 compute 函数必须有 JSDoc `@input / @output / @degraded`。 | 无契约 = **P1** |
| 测试非空壳 | 48 | 每个新 `src/` 文件必须有对应 `tests/` 文件。每个 `it()` 至少有 1 个 `expect()`。 | 零测试文件 = **P1**。空壳测试（< 3 expect）= **P1** |

### 2.2 权威文档 #6 测试体系规范（逐层对照）

| 测试层 | 适用对象 | 要求 | 违规判定 |
|------|------|------|------|
| L1 单元契约 | 新 compute / service 类 | @input/@output/@degraded JSDoc + 4 组 fixture (normal/boundary/error/temporal)，每组 ≥ 3 expect | 缺 fixture 组 = **P1** |
| L2a 接线测试 | 新 route / 跨模块集成 | 新 export 在生产入口（server.ts / bootstrap.ts）有调用。grep 确认。 | 未注册路由 = **P0**。未接线 = **P0** |
| L2c 循环测试 | 循环基础设施 (D91/D94) | 循环启动、状态转换、断裂恢复。≥ 1 集成测试/循环。 | 无循环测试 = **P1** |

### 2.3 历史错误清单（23 项 — AGENTS.md 铁律 0-5）

审计时必须逐条确认以下错误**没有重复出现**：

1. ExpertType 写死为 'unknown'（D8d）→ 检查所有 expertType/role 赋值是否是常量
2. ConvergenceEngine 每次 new 新实例（D8f）→ 检查是否通过 DI 共享实例
3. setMainAgent 零调用方（D20）→ 检查所有 set* 方法是否有调用方
4. from" 间距损坏 → 检查所有 import 语句
5. healthz 被当业务 API 用（D97）→ 检查数据源是否正确
6. 测试文件缺失 → 检查每个新 src/ 文件是否有 tests/ 配对
7. --no-verify 绕过 → 检查 bypass.log
8. …（其余 15 条完整清单见 AGENTS.md 铁律 0-5）

---

## 三、审计方法

### 3.1 每条 Commit 必须执行的 5 项检查

**检查 1: Wiring（接线）**

```bash
# 对每个新的 export function/class，执行：
grep -rn "functionName" src/ --include="*.ts" | grep -v "\.test\." | grep -v "export.*functionName"

# 判定：
# - 至少 1 个调用方在 src/ 下且非自身文件 → 通过
# - 零调用方 → P0 bug，报告具体文件:行号
# - 只在 tests/ 中被调用 → P1 缺口，报告
```

**检查 2: Exception（降级）**

```bash
# 对每个新的 src/ 文件，执行：
# 找到所有 catch 块，确认每个都有 log.warn/error
grep -n "catch" src/path/to/file.ts | while read line; do
  # 检查 catch 块的上下文是否包含 log. 或 degraded
done

# 判定：
# - 所有 catch 有 log + degraded → 通过
# - 有空 catch → P0 bug，报告文件:行号
```

**检查 3: Type Safety（类型安全）**

```bash
# 对 commit 涉及的所有 src/ 文件：
grep -rn "as any" src/ --include="*.ts" | grep -v "\.test\." | grep -v "\.d\.ts"

# 判定：
# - 零结果 → 通过
# - 非零 → P1，逐条报告文件:行号
```

**检查 4: Test（测试覆盖）**

```bash
# 对 commit 的每个新 src/ 文件：
test_file="tests/${src_file#src/}"
test_file="${test_file%.ts}.test.ts"

if [ -f "$test_file" ]; then
  expect_count=$(grep -c "expect(" "$test_file")
  if [ "$expect_count" -lt 3 ]; then
    echo "P1: $test_file 仅有 $expect_count 个 expect() — 可能为空壳测试"
  fi
else
  echo "P1: $src_file 缺少测试文件 $test_file"
fi
```

**检查 5: Contract（契约）**

```bash
# 对每个新增的 compute 函数：
grep -A 5 "export function compute" src/path/to/file.ts | grep -E "@input|@output|@degraded"

# 判定：
# - 三个标签都有 → 通过
# - 缺失 → P1，报告具体缺失的标签
```

### 3.2 特殊审计项

**D8a-D8f 专项:** 这 6 个 commit 全部用 `--no-verify` 绕过门禁。需要额外执行：

```bash
# 全量回归：对整个 src/agent/ 目录跑 vitest
npx vitest run tests/agent/

# 接线全量：检查所有 agent/ 下的 export 是否有调用方
for f in src/agent/*.ts; do
  exports=$(grep -oP "export (function|class) \K\w+" "$f")
  for name in $exports; do
    callers=$(grep -rn "$name" src/ --include="*.ts" | grep -v "$f" | grep -v "\.test\." | wc -l)
    [ "$callers" -eq 0 ] && echo "P0: $f::$name — 零调用方"
  done
done
```

**D20 专项:** 前次审计发现了 8 个问题。逐条确认修复：

```
[ ] 测试文件 tests/routes/loops.test.ts 存在且 ≥ 4 个 it()
[ ] HTML 使用正确路径 (/app/css/app.css, /app/js/shell.js)
[ ] 使用 <header id="synova-shell"> + shell.js 共享导航
[ ] 使用 api.get() 而非裸 fetch()
[ ] GET /api/loops/status 有 JWT 认证中间件
[ ] MainAgent 通过 server.ts 注入到 route handler
[ ] API response 包含 nextTrigger.nextAt 字段
[ ] lastRunAgoSeconds 改为返回时间戳，前端计算
```

---

## 四、审计输出格式

### 4.1 每条 Commit 的报告格式

```
## Commit {hash} — {任务名}

### 检查结果

| 检查项 | 状态 | 发现 |
|------|:--:|------|
| Wiring | {PASS/P0/P1} | {具体问题} |
| Exception | {PASS/P0/P1} | {具体问题} |
| Type Safety | {PASS/P1} | {as any 位置} |
| Test | {PASS/P1} | {缺失文件或空壳} |
| Contract | {PASS/P1} | {缺失标签} |

### 修复建议

| 优先级 | 文件:行号 | 问题 | 修复方案 |
|:--:|------|------|------|
| P0 | src/agent/foo.ts:42 | function bar() 零调用方 | 在 bootstrap.ts 或 route 中注册调用 |
```

### 4.2 汇总报告格式

```
## 审计汇总 — {日期}

- 审计 Commit 数: 15
- P0 (阻塞): {n} 项
- P1 (重要): {n} 项
- P2 (建议): {n} 项
- 通过 (零问题): {n} 项

### P0 修复清单

| Commit | 文件:行号 | 问题 |
|------|------|------|

### P1 修复清单

| Commit | 文件:行号 | 问题 |
|------|------|------|
```

---

## 五、审计纪律

1. **禁止凭文件名判断通过。** 必须打开文件，阅读代码，确认逻辑正确。
2. **禁止仅看 dev doc 审计。** dev doc 可能包含错误（D26 标签、D108 标签页）。审计对象是代码，不是文档。
3. **禁止跳过接线检查。** 这是历史最高频 bug 区（铁律 4/5 共 4 次事故）。
4. **禁止接受零测试的新文件。** 铁律 48 + G4 硬阻断。
5. **禁止在已有 `--no-verify` 历史的 commit 上跳过全量回归。** 必须先跑一次完整的 pre-commit + pre-push。
6. **所有发现必须有文件:行号引用。** "可能有问题"不算——必须定位到具体代码行。
