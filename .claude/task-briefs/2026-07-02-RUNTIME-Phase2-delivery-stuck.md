# Task Brief: RUNTIME Phase 2 — 持久投递队列 + 卡住会话检测

> 生成: 2026-07-02 | 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 2
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

### a) 项目拼图
本任务属于**纵向（基础设施）**。

- **Phase 2.1（持久投递队列）** → L4 本体层（delivery-queue-store.ts）+ 横切服务（delivery-queue.ts）
- **Phase 2.2（卡住会话检测）** → L2 编排层（synova-agent.ts start() 注册 cron）

现有模块：
- `src/cron/scheduler.ts` — CronScheduler，支持 `schedule(id, cron, handler)`。Phase 1 已有 ontology-monitor cron
- `src/l4/agent-memory-store.ts` — `remember()` / `recall()`，用于存储 stuck_session 记录
- `src/store/session-store.ts` — SessionStore，可用于查询活跃会话的最后更新时间
- `src/agent/synova-agent.ts` — 已有 scheduler 属性，通过 `getGlobalScheduler(db)` 获取

参考实现：无 — 全新模块。

### b) 文件审计
grep `DeliveryQueue\|delivery_queue\|stuck.*session\|StuckSession` → 零结果。全新。

### c) 决策
新建 3 个文件 + 修改 1 个文件。无冲突。

## Q1: 调研

决策链: SPEC → 测试 → 实现 → 接线 → 验证
引用: 铁律 0-2(spec→test→impl), 铁律 7(入口→链路→结果), 铁律 24(log), 铁律 31(degraded), 铁律 38(零 as any)

执行约束:
- rule: "delivery-queue-store 必须使用 SQLite 持久化"
  verify: "grep -n 'CREATE TABLE.*delivery_queue' src/l4/delivery-queue-store.ts"
- rule: "delivery-queue 退避必须是 [5s, 25s, 120s, 600s]"
  verify: "grep -n '5000\|25000\|120000\|600000' src/services/delivery-queue.ts"
- rule: "stuck-detector 必须在 synova-agent.ts start() 中注册 cron"
  verify: "grep -n 'stuck-detector' src/agent/synova-agent.ts"

## Q2: 范围

Phase 2.1 — 持久投递队列：
1. `src/l4/delivery-queue-store.ts`：SQLite 表 + enqueue/dequeue/markDelivered/markFailed/peekPending
2. `src/services/delivery-queue.ts`：DeliveryQueue 类
   - enqueue(entry)：写入队列，per-entry 去重
   - drain()：启动时处理 pending 条目，60 秒时间预算
   - 退避序列 [5s, 25s, 120s, 600s]，5 次后标记 failed
   - 崩溃重启后首次无退避（next_retry_at 已过时直接执行）
3. `src/agent/synova-agent.ts`：启动时 `deliveryQueue.drain()`

Phase 2.2 — 卡住会话检测：
1. `src/services/stuck-session-detector.ts`：StuckSessionDetector 类
   - detect()：查询 SessionStore，运行时间 > 5min 无新消息 → 判定卡住
   - 写入 AgentMemoryStore (type: 'stuck_session')
   - 通知用户（注入系统消息 "分析超时，请重试"）
2. `src/agent/synova-agent.ts`：start() 中注册 cron `*/1 * * * *`

不做什么：
- ❌ 不实现 LLM 调用级卡住检测（需要 AbortController 基础设施）
- ❌ 不实现 AbortController.abort()（需要全局 LLM 调用追踪）
- ❌ 不涉及 server.ts 或路由层
- ❌ 不使用 as any

## Q3: 验收

Phase 2.1 投递队列：
入口: 其他模块调用 deliveryQueue.enqueue()
处理: 写入 SQLite → 启动时 drain → 退避重试
结果: 崩溃重启后 pending 条目自动投递

Phase 2.2 卡住检测：
入口: Cron `*/1 * * * *` 触发
处理: SessionStore 查询活跃会话 → 超时判定 → 写入 memory
结果: AgentMemoryStore 中 type:'stuck_session' 记录存在

## 本任务在哪一层
L4（src/l4/delivery-queue-store.ts）+ L2（src/agent/synova-agent.ts 编排层）+ 横切（src/services/）

## Done 标准
- [ ] 入口可触达: delivery-queue-store 表创建 + enqueue/dequeue API
- [ ] 链路走通: enqueue → 模拟崩溃 → drain 恢复
- [ ] 结果可见: stuck-detector → AgentMemoryStore 写入
- [ ] as any 零存在
- [ ] tsc --noEmit 零错误
- [ ] vitest run 零失败
- [ ] pre-commit 8 组通过
- [ ] CI success
