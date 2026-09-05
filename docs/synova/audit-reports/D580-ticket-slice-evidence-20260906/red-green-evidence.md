# red→green 双轮全文证据（DS6/DS7，铁律 48；对齐 D577 T1-T10 先例）

> 2026-09-06 | 分支 feat/d580-ticket-slice。全部命令在 worktree 根（worktree = feat/d580-ticket-slice
> checkout）执行；实现 = src/sentinel/runner.ts + src/agent/sentinel-service.ts + src/routes/sentinel.ts
> + extensions/sentinels/ 47 文件 id 行 + 既有测试断言修复。

## 1. red 轮（实现前，4 新建测试全量先跑 — spec §7 "第一步"）

### 1.1 finding-id-stability.test.ts

命令: `npx vitest run tests/sentinel/finding-id-stability.test.ts`

第一轮（探针 v1: 空库 + 抛错库）:

```
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)

 × 每个 aggregate 在探针下产出至少 1 条 finding（防空调通过） 51ms
   AssertionError: 以下 aggregate 两个探针均未产出 finding: key-person-risk, revenue-health
 × 双跑同 id: fake timer 推进 2 分钟后逐元素相等（N14 修复的物理证明）
 ✓ 单轮内 id 互异: Set 尺寸 = 数组长度（回归护栏, spec §5.3 互斥分支兜底）   ← 与 spec §7 预判一致（"已绿"）
 × 降级/error 路径产出的 id 同样稳定（抛错库探针双跑） 1ms
   AssertionError: agent-deployment-maturity 降级路径 id 双跑不一致:
     expected [ 'e-1788689100000' ] to deeply equal [ 'e-1788688800000' ]
```

防空调用例暴露 2 文件探针不足（key-person-risk 需 traversal 才产 id；revenue-health 需 loader 同款
manifest 注入）。补 4 探针（empty/throwing/data/data+traversal）+ manifest 注入后第二轮:

```
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)        ← 红 = 双跑同 id + 降级路径稳定（spec §7 red 列全命中）

 × 双跑同 id: fake timer 推进 2 分钟后逐元素相等（N14 修复的物理证明）
   AssertionError: agent-deployment-maturity 探针[throwing] 双跑 id 不相等（时间戳后缀残留?）:
     expected [ 'e-1788688920000' ] to deeply equal [ 'e-1788688800000' ]
 × 降级/error 路径产出的 id 同样稳定（抛错库探针双跑）
```

> 本轮为「诚实 red」: 测试自身缺陷（探针不足导致的空调风险）修复后才取基准，防空调用例已绿。

### 1.2 ticket-store / ticket-transition / routes 三文件（实现前一次性）

命令: `npx vitest run tests/sentinel/ticket-store.test.ts tests/sentinel/ticket-transition.test.ts tests/routes/sentinel-tickets.test.ts`

```
 Test Files  3 failed (3)
      Tests  28 failed | 1 passed (29)
```

失败根因分类（28 例全量名册见归档 red-store-transition-routes.log.txt）:

| red 根因 | 命中用例 | 实测错误 |
|---|---|---|
| `transitionTicket` 方法不存在（8-4 未实现） | ticket-transition 8 例 | `TypeError: runner.transitionTicket is not a function` |
| `listSentinelTickets` 方法不存在（8-2 未实现） | ticket-store 3 例 | `TypeError: runner.listSentinelTickets is not a function` |
| TicketsResponse 无 source/degraded（旧形状） | ticket-store 4 例 | `AssertionError: expected undefined to be 'table' / 'memory-fallback'` |
| 去重持久化未实现（重启即丢） | ticket-store 5 例 | `expected "vi.fn()" to be called 2 times, but got 1 times` 等 |
| POST /tickets/:id/transition 路由不存在（8-4 未注册） | routes 5 例 | 404 ≠ 200/400/404/409/503 映射 |
| GET /tickets 旧行为（无 source/status 过滤死变量） | routes 4 例 | `expected undefined to be 'table'` |

1 passed = 单轮互异回归护栏（同 §1.1）。

## 2. green 轮（实现后）

实现顺序与对应 green 轮（每步都留了中间轮次输出，归档同名日志）:

### 2.1 43 单层 aggregate id 行去时间戳后 → finding-id-stability 中间轮

```
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
 FAIL ... > 双跑同 id
   AssertionError: competitive-moat 探针[empty] 双跑 id 不相等（时间戳后缀残留?）:
     expected [ 'i4-crit-1788688920000', …(1) ] to deeply equal [ 'i4-crit-1788688800000', …(1) ]
```

> 价值: 该中间红**物理暴露 spec 单层 grep 盲区** — competitive-moat/competitive-position 委托
> _extinct 子哨兵合并 findings（生产可达），其 id 仍含时间戳。处置与依据见
> finding-id-consumers-grep-evidence.md §4（显式偏差，非静默）。

### 2.2 +4 _extinct 可达文件 id 行去时间戳 → finding-id-stability 全绿 + 幂等复跑

```
$ npx vitest run tests/sentinel/finding-id-stability.test.ts   (run 1)
      Tests  4 passed (4)
$ npx vitest run tests/sentinel/finding-id-stability.test.ts   (run 2, 幂等复跑)
      Tests  4 passed (4)
```

### 2.3 runner.ts L3（listSentinelTickets + transitionTicket + 去重持久化）→ 中间轮

```
 Test Files  2 failed (2)
      Tests  5 failed | 15 passed (20)
```
剩余 5 失败 = L2 service 未改造（getSentinelTickets 仍旧形状 source=undefined ×4）+ L2 测试自建表
缺 sentinel_events（用例基础设施，补 createSentinelEventsTable 前置建表修复）。

### 2.4 sentinel-service.ts L2 → ticket-store + ticket-transition 全绿

```
 Test Files  2 passed (2)
      Tests  20 passed (20)
```

### 2.5 routes/sentinel.ts L1 → routes 全绿

```
# 中间轮: 1 例断言预期错（测试期望 diagnosis.title = finding title;
#   实际 createAutoTicket 的 diagnosis.title = 聚合信号 title "1 个哨兵同时指向: 团队A" — 实现正确, 修断言）
 Test Files  1 failed (1)   →   Tests  1 failed | 8 passed (9)
# 修正断言后:
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

## 3. 既有断言修复（写集内 3 文件，DS7）

- threshold-injection.test.ts L134: `startsWith('e4-churn-crit-')` → `startsWith('e4-churn-crit')`
- threshold-manifest-flip.test.ts L50-51: `startsWith('e4-churn-crit-')` / `startsWith('e4-churn-warn-')` → 同款去尾横杠
- dedup-key-stability.test.ts: 文件头 + 用例注释窗口口径 10min → 5min（D339 裁决 A）+ 新增
  「同一 signal 窗口内再次聚合 (间隔 3 分钟 < 5 分钟窗口) → 命中去重, 不重发」用例
  （`expect(dispatchNotificationMock).toHaveBeenCalledTimes(1)`）

验证: tests/sentinel/ 全量 30 文件（26 既有 + 4 新建…含 adapters 目录）223 用例全绿:

```
$ npx vitest run tests/sentinel/ tests/routes/sentinel-tickets.test.ts
 Test Files  30 passed | 1 skipped (31)
      Tests  223 passed | 1 skipped (224)
```

（1 skipped = 既有 D577 flip 独占运行门控 `D577_FLIP_TEST`，基线同状态。）

## 4. DS6 三场景验收（派单 §三-4；以集成用例物理跑通）

| 场景 | 集成用例位置 | 断言链 |
|---|---|---|
| ① customer-demand-shift 注入 churn_rate>critical → 工单落表且 GET 可见 | tests/routes/sentinel-tickets.test.ts "DS6 场景①" | runOnce + aggregateAndDispatch → `ticketCount()==1`（INSERT 落表）→ GET /tickets 200 + `source:'table'` + ticket 含 `status:'open'`/`severity:'critical'`/聚合 title |
| ② 同 finding 二次 check 不重复开单/不重复通知 | tests/sentinel/ticket-store.test.ts "DS6 场景②" | 二次 check 后 `ticketCount()` 仍 1（INSERT OR REPLACE 幂等 = id 稳定）+ dispatchNotification 仍 1 次（5min 窗口内表命中） |
| ③ acknowledge→resolve 全链路后 GET 反映终态 | tests/routes/sentinel-tickets.test.ts "DS6 场景③" | POST acknowledged 200 → POST resolved 200（resolved_at 非空）→ GET ?status=resolved 含该 id、?status=open 不含 |

三场景用例均在真实管线上（真实 router/HTTP、真实 better-sqlite3 :memory:、真实 aggregate→signal→auto-ticket 链路；仅 dispatchNotification 打桩作观测点）。

## 5. 归档日志清单（本目录 logs/，git 跟踪；审计员可要求复现的原样输出）

| 阶段 | 文件 | 结果行 |
|---|---|---|
| red（实现前） | logs/red-finding-id.log.txt / logs/red-finding-id2.log.txt | 3F/1P → 2F/2P |
| red（实现前） | logs/red-store-transition-routes.log.txt | 28F/1P |
| 中间 green | logs/green-finding-id.log.txt（暴露 _extinct 盲区） | 2F/2P |
| green | logs/green-finding-id2.log.txt | 4P |
| 中间 green | logs/green-store-transition.log.txt | 5F/15P |
| green | logs/green-store-transition2.log.txt | 20P |
| 中间 green | logs/green-routes.log.txt | 1F/8P |
| green | logs/green-routes2.log.txt | 9P |
| 幂等 | logs/idem-run1.log.txt / logs/idem-run2.log.txt | 4P / 4P |
| 回归 | logs/regression-sentinel.log.txt | 223P/1skip |
| 基线/回归 | logs/tsc-baseline.log.txt / logs/tsc-after.log.txt | 28 = 28（逐条 diff 相等） |
| 基线/回归 | logs/vitest-baseline-failed-files.txt + logs/vitest-baseline-summary.log.txt / logs/vitest-after-summary.log.txt | 失败文件集 58 = 58 diff=空 |

（logs/ 为编码 session 原样输出拷贝；两条全量 vitest 原始 log 各 1.7-2.0M，摘失败名册与汇总为 summary.log.txt，
全文可按 §"复跑入口"原样重跑取证。）
