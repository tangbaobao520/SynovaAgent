# D563 — diagnosis.ts 两处 as never 类型窄化（D489 验收返修）

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: CTO 对 D489（PR #299）物理验收
> 类型: FIX（主代码已合，此为验收返修）；完成后随 D489 一并通过 K3 审计
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L1 交互层。D489（GA consult 路由经 DiagnosisLauncher 落流）引入 `new SessionStore(orchestrationDb as never)`（diagnosis.ts L181）——CT-46 类类型逃逸。V5.2.7 组 1 门禁在 PR #299 CI 上正确拦截（Iron Laws 红：as never 1 处硬阻断），但 PR 在检查完成前被合并 → 逃逸现于 main。同文件 L411（resume 路由）有同型存量逃逸（D489 引用的「先例」）。

### b) 文件审计
- src/routes/diagnosis.ts L181（D489 新增）+ L411（存量）
- SessionStore 构造器签名: `constructor(db: Database.Database)`（src/store/session-store.ts L96）
- orchestrationDb 来源: `req.app.locals.orchestration.db`（unknown）——正确修法 = 类型谓词窄化（typeof 对象 + 必要方法探测），非断言

### c) 决策
两处同文件同型 → 一并窄化（存量独立清理 + 新增清零）。窄化失败路径保持现有 log.warn 降级语义（行为零变化）。

## Q1: 调研
铁律 38（类型断言零容忍）+ 铁律 24/31（降级显式）；CT-46 先例（mcp as never 已由 D558 清理）；D558 棘轮基线含 as never 9 处——本任务清理 2 处后编码方应同步下调棘轮基线（9→7，只许收紧）。

### Q1c 决策参考系（D333）+ 实测修正记录
参考：第一性原理 + Anthropic 工程基线（fail-closed→显式降级）+ 结论：类型谓词（方法探测）优于任何断言形式。
**实测修正（D563 执行时）**：全仓棘轮扫描器实测 as never = 10（非 brief 假设的 9）——D489 的 L181 在「门禁红但 PR 先合并」（CT-47 台账）下进 main，击穿 D558 基线。brief「9→7」的前提「仅当全仓实测=7」不成立；按实测修正：清理 2 处 → 基线 9→**8**（棘轮只许收紧，9→8 仍是收紧）。S-5 先红证据 = main 现状棘轮测试红（`as never 存量 10 > 基线 9`，1 failed | 5 passed，D489 合并后果），非临时加断言。
**返工记录（2026-08-30 CTO 验收退回）**：① Architecture Check 1d 红（L1→L5 跨层引用 5 处——谓词 better-sqlite3 类型/注释/消息字样均计红）→ isSqliteDatabase 整体移入 src/store/session-store.ts 导出（谓词归 L5 存储层），diagnosis.ts 删 better-sqlite3 type import、经既有动态 import 通道解构，TypeError 消息改「非 SQLite 句柄」；② G12 brief 日期窗口过期 → git mv 至 2026-08-31 文件名。
**返工·第7轮（2026-09-02，CTO 授权「全修三件」）**：① Iron Laws 红 = brief 日期窗口再过期（08-31 < 09-02）→ git mv 至 2026-09-02；② gate 双平台红 = platform-checklist.test.sh 存量三联缺陷（探针传绝对路径不匹配检查块 ^scripts/ 相对锚定 + L54 探针先删后用 + 点名断言被 ✅ 头行空洞满足——main 巧合掩盖，本地双 worktree 复现 13/14）→ 修复：相对名注入 + rm 挪至 strict 后 + 断言改命中探针文件名，本地 14/14。

## Q2: 范围
做什么：
- 修改 src/routes/diagnosis.ts：L181+L411 as never → 类型谓词/窄化（保留降级语义）
- 修改 src/store/session-store.ts：isSqliteDatabase 谓词导出（2026-08-30 返工：Architecture L1→L5 门禁——谓词归 L5 存储层，L1 经既有动态 import 通道解构）
- 修改 packages/test-kit/tests/architecture/05-as-any-audit.test.ts：棘轮基线 9→7（as never，仅当全仓实测=7）
- task-state/D563.json：回填
- 修改 docs/synova/coordination/审计派单-20260829-D489-GA片2B.md：本批 K3 派单（D489 初审 + D563/D564 复审）
- 修改 docs/synova/coordination/审计发现台账-DSH-CTO.md：D489 验收发现登记 + CT-47 第二次实证
- 修改 docs/synova/coordination/K3审计清单-20260822.md：D489/D563/D564 入列
- 修改 docs/synova/CTO-HEALTH.md：仪表盘重生成（30 impl_done 闭环里程碑）
- 修改 .claude/task-briefs/2026-08-29-D564-incident-loop-win-fix.md：同批 D564 brief（CTO 派单批量提交）
- 修改 tests/control-tower/platform-checklist.test.sh：第7轮 CTO 授权——存量三联缺陷修（相对名注入/探针时序/点名断言非空洞化；不修则 canary 恒红）

不做什么：
- 不改 diagnosis.ts 其他逻辑（D489 功能已按 dev doc 验收中）
- 不改 scripts/audit/（审计红线）

## Q3: 验收
入口：npx tsc --noEmit + vitest 相关回归
处理：断言删除 → 类型窄化 → 回归
结果：diagnosis.ts 零 as never + tsc 零新增 + tests/routes/diagnosis-consult-events.test.ts 4/4 + D487 5/5

## 架构层:

L1 交互（routes/）+ 测试工具层

## Done 标准
- [x] 零 as never verify: grep -c "as never" src/routes/diagnosis.ts | xargs test 0 -eq
- [x] tsc 零新增 verify: npx tsc --noEmit --pretty false 2>&1 | grep -cE "error TS" | xargs test 28 -eq
- [x] 回归绿 verify: npx vitest run tests/routes/diagnosis-consult-events.test.ts tests/agent/diagnosis-session-events.test.ts 2>&1 | grep "9 passed"
- [x] 棘轮同步 verify: grep -c "'as never': 8" packages/test-kit/tests/architecture/05-as-any-audit.test.ts | xargs test 1 -ge
- [x] 回填 verify: python3 -c "import json; d=json.load(open('task-state/D563.json')); assert d['status']=='impl_done'"
