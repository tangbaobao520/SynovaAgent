# Task Brief: RUNTIME Phase 1 — 启动恢复 + 优雅关闭

> 生成: 2026-07-02 09:40 | 分支: feat/prompt-architecture | as any: 0
> 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 1 + OpenClaw active-sessions-shutdown-tracker.ts
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

流程约束: V4.2.9 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合。
数据流: L5 存储 → L4 本体 → L3 洞察 → L2 编排 → L1 交互
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/ (SynovaAgent)
  L3 洞察: l3/ sentinel/ expert-platform/ expert/
  L4 本体: l4/ evidence/ AgentMemoryStore
  L5 存储: store/ cron/
铁律 38: as any 零容忍 | 铁律 39: 五层架构边界 | 铁律 46: 禁止桥接文件 | 铁律 24+31: 异常处理+降级

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于 **基础设施（运行时可靠性 Phase 1）**。涉及：
- **Phase 1.1（启动恢复）** → L2 编排层（synova-agent.ts start()）+ L5 存储层（SessionStore 查询）
- **Phase 1.2（优雅关闭）** → L2 编排层（synova-agent.ts stop()）+ L1 交互层（HTTP server 排干）

现有模块：
- `src/agent/synova-agent.ts` — SynovaAgent 生命周期。start() 有 sentinel 注册/启动；stop() 有 cleanupHandlers。**无** 恢复逻辑，**无** 活跃会话追踪
- `src/store/session-store.ts` — SessionStore。有 saveDiagnosisCheckpoint / getDiagnosisCheckpoint。表 `agent_sessions` 字段：id/org_id/user_id/phase/state_json/created_at/updated_at。**无** status 列（用 state_json IS NOT NULL 判断"活跃"）

参考实现（本地真实代码）：
- OpenClaw `active-sessions-shutdown-tracker.ts`: 模块级 `Map` 追踪活跃会话，`noteActiveSessionForShutdown()` / `forgetActiveSessionForShutdown()` / `listActiveSessionsForShutdown()`
- claw-code `hooks.rs`: HookEvent 枚举 + HookAbortSignal + 超时 + 子进程执行

本任务：**新建** restart-recovery.ts + graceful-shutdown.ts，**扩展** synova-agent.ts。

### b) 文件审计
grep `recoverInterrupted\|restart\|graceful\|drain` 在 src/ 中 → 零结果（本任务首次引入）。
grep `noteActive\|forgetActive\|listActive` 在 src/ 中 → 零结果。
grep `cleanupHandlers\|SIGTERM\|SIGINT` 在 src/agent/synova-agent.ts 中 → 已有简化清理。

### c) 决策
无覆盖。新建。遵循 OpenClaw 的 Map 追踪模式 + 文档的 RestartRecovery 设计。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行：
  ① SPEC / Done 标准 — 本 brief 已定义
  ② 测试 — 先写测试
  ③ 实现 — 满足 Done 标准 + 测试通过 + 接线完整 + 错误有 log + tsc+vitest 零失败
  ④ 接线 — 入口可触达（start()/stop()）
  ⑤ 验证 — 自检 6 问

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 链路完整 + 结果可见
  - 铁律 24+31: 错误处理 + 降级信号（catch 有 log + degraded）
  - 铁律 38: as any 零容忍
  - memory/ 历史教训: [[plan-actual-closure]] — 声明完成须对比文档
  - 参考: OpenClaw `active-sessions-shutdown-tracker.ts` Map 追踪模式

### b) 本任务执行约束
- rule: "restart-recovery 和 graceful-shutdown 必须在 synova-agent.ts 中接线"
  verify: "grep -rn 'restartRecovery\|gracefulShutdown' src/agent/synova-agent.ts"
- rule: "restart-recovery 必须查询 SessionStore 并处理 state_json 非空的会话"
  verify: "grep -rn 'state_json\|getSession\|listSessions' src/services/restart-recovery.ts"
- rule: "graceful-shutdown 必须使用 Map<string, SessionEntry> 追踪活跃会话"
  verify: "grep -rn 'Map.*string.*SessionEntry\|noteActive\|forgetActive' src/services/graceful-shutdown.ts"

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**

Phase 1.1 — 启动恢复（新建 `src/services/restart-recovery.ts`）：
1. `RestartRecovery` 类，构造函数接收 db: Database.Database
2. `recoverInterruptedSessions()`:
   - 查询 SessionStore.listSessions() 过滤有 state_json 的（活跃诊断会话）
   - 读取最后 20 条消息
   - 有用户输入 → 可恢复 → 注入 "服务已恢复，请继续" 系统消息
   - 无用户输入 → 标记为 failed（更新 state_json）
3. 重试最多 3 次，失败后最终标记

Phase 1.2 — 优雅关闭（新建 `src/services/graceful-shutdown.ts`）：
1. `GracefulShutdown` 类（对标 OpenClaw 模式）：
   - 模块级 `activeSessions: Map<string, SessionEntry>` 
   - `noteActive(sessionId, metadata)` — 注册活跃会话
   - `forgetActive(sessionId)` — 移除
   - `async drain(maxWaitMs = 30_000)`:
     - 通知活跃会话 "服务正在重启"
     - 保存诊断检查点到 SessionStore
     - 关闭 LLM 连接 (AbortController)
     - 关闭 Database (WAL checkpoint)
     - 超时 → 紧急检查点 → 强制退出

接线（修改 `src/agent/synova-agent.ts`）：
1. `start()`: registerBuiltinSentinels 之后、sentinelRunner.start 之前 → `new RestartRecovery(db).recoverInterruptedSessions()`
2. `stop()`: 先 `gracefulShutdown.drain()`，再执行已有 cleanup

**不做什么：**
- ❌ 不改 SessionStore schema（不加 status 列，用 state_json 判断）
- ❌ 不改 server.ts（shutdown 已在 Phase 0.1 处理）
- ❌ 不涉及 ExpertDispatcher 恢复（MVP 只恢复会话）
- ❌ 不涉及 packages/engine-core（铁律 46）
- ❌ 不使用 as any（铁律 38）

## Q3: 验收 — 入口 → 交互 → 结果

Phase 1.1 启动恢复：

入口（用户从哪触发）：
  SynovaAgent.start() 中 sentinel 注册后自动执行

处理（中间经过哪些步骤）：
  1. 查询 SessionStore 中有 state_json 的会话
  2. 读取每个会话的最后 20 条消息
  3. 判断是否可恢复
  4. 可恢复 → 添加 "服务已恢复" 系统消息
  5. 不可恢复 → 标记为 failed

结果：
  - 日志显示 "恢复 X 个中断会话" 或 "无可恢复会话"
  - 用户重新打开对话时看到 "服务已恢复" 提示

Phase 1.2 优雅关闭：

入口（用户从哪触发）：
  SynovaAgent.stop() 被调用（或 SIGTERM/SIGINT）

处理（中间经过哪些步骤）：
  1. 遍历活跃会话
  2. 保存诊断检查点
  3. 通知 "服务正在重启"
  4. 关闭资源

结果：
  - 日志显示 "排干 X 个活跃会话"
  - 数据库正常关闭
  - 进程退出

## 本任务在哪一层
L2（src/agent/synova-agent.ts 编排层）+ L5（src/store/session-store.ts 存储层查询）

## Done 标准
- [ ] 入口可触达: restartRecovery.recoverInterruptedSessions 在 start() 中被调用
- [ ] 链路走通: gracefulShutdown.drain 在 stop() 中被调用
- [ ] 结果可见: 日志输出 "恢复 X 个中断会话" 和 "排干 X 个活跃会话"
- [ ] 无 TODO/FIXME: grep 修改文件零结果
- [ ] as any 零存在
- [ ] tsc --noEmit 零错误
- [ ] vitest run 零失败
- [ ] pre-commit 8 组通过
- [ ] CI success
