# Task Brief: D500 事件溯源 session log（Stage1-D1）

> 生成: 2026-08-22 | 任务: D500（原 D471，撞号改号）| 认领: DeepSeek Harness（编码）
> 权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D500-session-event-sourcing-20260822.md
> 依赖: 无（地基卡）；⚠️ src/store 归 Win，已核对无在途冲突（见 Q1c）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属 L5 存储层 → L2 编排：会话/诊断过程目前是"存下来的快照"（agent_messages 关系表 + SessionManager 内存数组），无可回放真相流。借鉴 dsh-session 范式（B1：append-only 事件流 + deriveMessages + model-visible⟺logged），自研事件日志层，不引 DSH 包（R1 红线）。
### b) 文件审计
- src/store/session-store.ts:314 行——无 session_events 表；addMessage:198 单写 agent_messages；getMessages:205 直接查表
- src/orchestrator/session-manager.ts:237 行——addMessage:57 只 push 内存数组（重启即丢）
- src/agent/conversation-engine.ts:616——sessionManager.addMessage 无 sessionId 实参（已有 this.sessionId 字段 :358）
- src/deploy/bootstrap.ts:679——new SessionManager() 无注入
- SessionStore.addMessage 直连生产调用方 8 处（cli/im-inbound/graceful-shutdown/stuck-session-detector/restart-recovery）——双写下沉决策依据
### c) 决策
双写下沉到 SessionStore.addMessage 内部（8 处直连调用方自动受益）；session_events 表 UNIQUE(session_id,seq) 防并发 seq 重复；appendEvent 基于持久化 MAX(seq) 续写防内存回退。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考 dsh-session README + 源码精读（本机 node_modules）：Session 是 append-only 唯一事实源，deriveMessages 增量投影 surface 事件，model-visible⟺logged。2026-08-22 并发写缺陷研究（DSH rc.8 实测）：seq 回退/双流冲突/事件交错三层根因 → 四条防线：① seq 单调（UNIQUE 约束）② 崩溃恢复基于持久化 lastSeq（禁内存回滚）③ 并发写 per-session 串行 ④ tool_call↔tool/result 顺序校验。
决策：① 事件表 schema（UNIQUE 防重）② addMessage 双写下沉（8 处调用方受益）③ deriveMessages 按 seq 投影 surface 事件 ④ SessionManager 注入 + degraded 断言。
历史教训：D473 TS2322 类型违规（vitest 不查类型）→ 本任务必须 tsc 验证；D474 main 入口误绿 → 测试覆盖真实入口；D472 CT-34 豁免绕过 → 门禁接线全面。
参考：Anthropic 工程基线（fail-closed + 结构化错误）+ DeepSeek dsh-session 源码（B1）+ 第一性原理（会话真相 = 可回放事件流）+ 结论：事件表 + 双写下沉 + 派生投影三件套。

## Q2: 范围 — 正确的最简方案
做什么：
- src/store/session-store.ts
- src/orchestrator/session-manager.ts
- src/agent/conversation-engine.ts
- tests/store/session-event-log.test.ts
- tests/orchestrator/session-manager-eventlog.test.ts
不做什么：
- 不改 src/store/session-store.ts 的 FTS5 搜索与诊断检查点（已有功能不碰）
- 不改 src/agent/conversation-engine.ts 其他逻辑（只改 :616 一行传 sessionId）
- 不改 src/deploy/bootstrap.ts（SessionManager 注入可选参数，bootstrap 现状兼容）
- 不改 src/l1/im-inbound.ts 及 cli.ts 等 8 处直连调用方（双写下沉，无需改）
- 不删 agent_messages 表（迁移期兼容，删除归 Stage 4）
- 不引 DSH 包（R1 红线：Stage 3 前零 DSH 代码依赖）

## Q3: 验收 — 入口 → 交互 → 结果
入口：生产链路一次真实对话（SessionStore.addMessage 直连或 SessionManager 注入路径）
处理：addMessage 双写 agent_messages + session_events；deriveMessages 从事件流投影消息历史
结果：回放重建的消息历史与实际一致（测试断言）；model-visible 输入未落 log 时断言报警（degraded）

## 架构层:
L5 存储层（session-store.ts）+ L2 编排（session-manager.ts / conversation-engine.ts），铁律 39 相邻层

## Done 标准
- [x] verify: npx vitest run tests/store/session-event-log.test.ts tests/orchestrator/session-manager-eventlog.test.ts 全过（≥12 用例）
- [x] verify: grep -n "session_events" src/store/session-store.ts 命中建表 + UNIQUE(session_id, seq)
- [x] verify: grep -n "appendEvent" src/store/session-store.ts 命中定义 + addMessage 内部调用
- [x] verify: grep -n "deriveMessages" src/store/session-store.ts 命中定义
- [x] verify: grep -n "addMessage" src/agent/conversation-engine.ts 命中（含 sessionId 实参）
- [x] verify: npx tsc --noEmit 对 src/store/session-store.ts + src/orchestrator/session-manager.ts + src/agent/conversation-engine.ts 零错误
- [x] verify: bash scripts/control-tower/baseline-check.sh 无新增失败
