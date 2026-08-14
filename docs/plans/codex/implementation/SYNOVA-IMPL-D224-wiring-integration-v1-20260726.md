# SynovaAgent -- D224-WIRING 管线接线 + 端到端集成测试 实施方案 v1.0

> 2026-07-26 | 将 UserStore + LoopScheduler 接入 synova-agent.ts + 端到端集成测试
> Gates 4/5/8/9/10/11/12: 多个 PARTIAL -> PASS
> 此文档为 claude code 的唯一执行依据。

---

## 权威文档原文验证(铁律 0-3)

- [x] Test-Path `src/agent/synova-agent.ts` -> 存在 (32行主启动文件)
- [x] Get-Content `synova-agent.ts:85-87` -> `this.sentinelRunner = new SentinelRunner(this.scheduler, this.db)` + `.start()`
- [x] Get-Content `enterprise.ts` -> `setUserStore()` 由 D106 提供(详见 D106 完成标准)
- [x] Test-Path `src/loops/loop-scheduler.ts:195` -> `registerDefaultLoops()` 存在
- [x] Test-Path `src/growth/user-store.ts:54` -> `UserStore` 类存在
- [x] Select-String `synova-agent.ts` -> `UserStore` 零引用 / `LoopScheduler` 零引用 -- 全部待接线

---

## 构建内容

### 1. synova-agent.ts 接线 -- UserStore + LoopScheduler

在 SentinelRunner 启动之后(约 L88)、ConversationEngine 之前，插入两段接线:

```typescript
// --- UserStore 注入 enterprise 路由 ---
import { UserStore, type GraphStoreLike } from '../growth/user-store';
import { setUserStore } from '../routes/enterprise';

// CRITICAL: this.db 是 Database.Database (better-sqlite3)，不是 GraphStoreLike。
// UserStore 构造函数需要 GraphStoreLike 接口 {createNode, queryNodes, getNode, updateNode}。
// 方案: 创建 SqliteGraphStore 适配器包装 this.db，将 SQLite 操作映射到四个接口方法。
// 长久方案: 复用 engine-core 中的 GraphBridge 实例替代此适配器。
const graphStore = new SqliteGraphStore(this.db);
const userStore = new UserStore(graphStore);
setUserStore(userStore);

// --- LoopScheduler 注册 ---
import { LoopScheduler } from '../loops/loop-scheduler';

const loopScheduler = new LoopScheduler(this.scheduler);
const registered = loopScheduler.registerDefaultLoops();
logger.info({ registered }, '核心循环已注册');
```

### 2. 端到端集成测试 -- 管线全流程

```
哨兵 P0 信号
  -> sentinel-runner.ts: runSentinelForTeam()
  -> SentinelFinding[] (registry.ts: runAll)
  -> SignalAggregator 交叉关联 + 严重度升级
  -> ExpertRouter: routeDiagnosis(finding)
  -> ExpertAutonomy: ReAct 循环 -> AutonomyResult { hypothesis }
  -> proposal-engine.ts: 诊断 -> Goal Proposal
  -> goal-store.ts: createGoal() -> goalId
  -> goal-sentinel.ts: 方案哨兵注册 -> 三因子偏离监测
  -> goal-lifecycle.ts: closeGoal() -> 偏差 6 分类 -> 知识提取
```

| 测试 | 内容 | 验证 Gate |
|------|------|----------|
| Sentinel -> Finding | Mock GraphStore -> runSentinelForTeam 返回 Finding[] | Gate 4 |
| Finding -> Expert | Finding[] -> ExpertRouter -> ExpertAutonomy -> AutonomyResult | Gate 5 |
| Result -> Goal | AutonomyResult -> proposal-engine -> createGoal -> goalId | Gate 8 |
| Goal -> Tracking | createGoal -> goal-sentinel 注册 -> 双因子偏离 -> P2 告警 | Gate 9 |
| P0 -> 再诊断 | 三因子偏离 2 周期持续 -> P0 -> lightweight-diagnosis | Gate 10 |
| closeGoal -> 知识 | closeGoal() -> 6 类偏差分类 -> 知识条目写入 | Gate 11 |
| 循环注册 | loopScheduler.registerDefaultLoops() >= 5 | Gate 12 |

---

## 不做什么

- 不修改任何核心管线模块代码(sentinel/expert/goal 模块只读)
- 不启动真实 HTTP 服务器(集成测试在 vitest 中运行)
- 不执行真实 Cron 触发(CronScheduler mock)
- 不新增业务循环(loop-1~loop-6 已由 D9-LOOPS 验证)

---

## 测试要求(依据权威文档 #6 测试体系规范)

| 层 | 内容 | 数量 |
|----|------|------|
| L2c | Sentinel -> Finding[] (mock GraphStore) | >=1 test |
| L2c | Finding[] -> Expert -> AutonomyResult | >=1 test |
| L2c | AutonomyResult -> createGoal -> goalId | >=1 test |
| L2c | Goal -> goal-sentinel 注册 + P2 告警 | >=1 test |
| L2c | P0 持续 2 周期 -> lightweight-diagnosis | >=1 test |
| L2c | closeGoal 6 分类偏差 -> KnowledgeStore | >=1 test |
| L2c | loopScheduler.registerDefaultLoops() >= 5 | >=1 test |
| 总计 | >=7 tests, 每 test >=3 expect() | |

---

## 完成标准

```
[ ] synova-agent.ts: UserStore 实例化 + SqliteGraphStore 适配器 + setUserStore() 注入企业路由
[ ] synova-agent.ts: LoopScheduler 实例化 + registerDefaultLoops() 调用
[ ] tsc --noEmit 零错误
[ ] >=7 个集成测试通过
[ ] 管线全流程: Sentinel -> Expert -> Goal -> close 至少一条完整路径跑通
[ ] 零 as any
```