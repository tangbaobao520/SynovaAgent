# §8 接线 grep + 写集对账 + 卫生自检（DS5/DS8/DS9/DS10）

> 2026-09-06 | 分支 feat/d580-ticket-slice | worktree 根执行。

## 1. §8 接线验证（6 条逐条实测 — 生产调用点, 测试调用不计, S-3）

```bash
$ grep -n "listSentinelTickets" src/agent/sentinel-service.ts src/sentinel/runner.ts   # (≥2 生产点)
src/sentinel/runner.ts:1058:  listSentinelTickets(status?: TicketStatus): TicketRow[] {        # L3 定义
src/agent/sentinel-service.ts:354:    const rows = runner.listSentinelTickets(status);          # L2 表读分支（生产调用点）

$ grep -n "transitionTicket" src/agent/sentinel-service.ts
src/agent/sentinel-service.ts:396:  return runner.transitionTicket(ticketId, to as TicketTransitionTarget);   # L2 透传（生产）

$ grep -n "transitionSentinelTicket" src/routes/sentinel.ts
src/routes/sentinel.ts:22:  transitionSentinelTicket,            # L2 import
src/routes/sentinel.ts:123:    const result = transitionSentinelTicket(id, body.to);   # L1 handler（生产）

$ grep -n "tickets/:id/transition" src/routes/sentinel.ts | grep -v "^\s*\*" | grep -v "#"
src/routes/sentinel.ts:108:(注释) ...  src/routes/sentinel.ts:115:  router.post('/tickets/:id/transition', ...)   # 注册
$ grep -n "routes/sentinel" src/server.ts
src/server.ts:56:import sentinelRoutes from './routes/sentinel';
$ grep -n "app.use('/api/sentinel'" src/server.ts
src/server.ts:350:  app.use('/api/sentinel', sentinelRoutes);        # 挂载链闭合（/api/sentinel 前缀, 既有）

$ grep -n "getSentinelTickets" src/routes/sentinel.ts
src/routes/sentinel.ts:21:  getSentinelTickets,                    # import（不变）
src/routes/sentinel.ts:100:    const result = getSentinelTickets(status);   # 既有调用点, 行为改造（status 接通）

# 稳定 finding id → 持久化链
$ npx vitest run tests/sentinel/finding-id-stability.test.ts   # 4/4 绿（双跑同 id + 单轮互异 + 降级稳定）
$ grep -rc 'getTime()\|Date.now()' extensions/sentinels/*/aggregate.ts   # 42 文件 0; 2 文件各 2（非 id 计时行）
```

架构自检: L1 routes 只 import L2 sentinel-service（import 块 L13-22, 新增 transitionSentinelTicket 同块）+
`import type { TicketStatus } from '../sentinel/runner'`（**type-only** import, 编译期擦除, 零运行时跨层）;
L2 只 import L3 runner（既有）+ signal-aggregator（既有）。零新增跨层运行时依赖（铁律 39）。runner 直 SQL
有 L677/L787/L1176 既有先例且不在 check-architecture.sh 拦截面（spec §3 Q0-a 实测）。

## 2. 写集对账（DS10 — git diff vs spec §5.1 表 11 条目）

`git diff --name-only`（commit 前终态）分类:

| §5.1 条目 | diff 命中 | 数量 |
|---|---|---|
| src/sentinel/runner.ts | ✓ | 1 |
| src/agent/sentinel-service.ts | ✓ | 1 |
| src/routes/sentinel.ts | ✓ | 1 |
| extensions/sentinels/（43 aggregate 仅 id 行） | ✓（43 全命中） | 43 |
| tests/sentinel/dedup-key-stability.test.ts | ✓ | 1 |
| tests/sentinel/threshold-injection.test.ts | ✓ | 1 |
| tests/sentinel/threshold-manifest-flip.test.ts | ✓ | 1 |
| tests/sentinel/finding-id-stability.test.ts（新建） | ✓ untracked→add | 1 |
| tests/sentinel/ticket-store.test.ts（新建） | ✓ untracked→add | 1 |
| tests/sentinel/ticket-transition.test.ts（新建） | ✓ untracked→add | 1 |
| tests/routes/sentinel-tickets.test.ts（新建） | ✓ untracked→add | 1 |

- 11/11 条目全命中, 零缺项。
- **显式偏差 1 项**: extensions/sentinels/_extinct/{competitive-moat-perceptual, competitive-moat-structural,
  competitive-dynamics, market-lifecycle}/aggregate.ts（4 文件, 仅 id 行）— 生产可达路径的 spec 单层 grep 盲区,
  依据与 red 实证见 finding-id-consumers-grep-evidence.md §4; 不修则 spec §7 规定的 finding-id-stability
  「双跑同 id」物理不可 green。
- Q2 排除项核验: diff 无 src/sentinel/signal-aggregator.ts、src/server.ts、src/config.ts、VERSION.md、
  scripts/product-lines/、scripts/desktop/、scripts/audit/、electron-renderer/、docs/authority/ ✓
- 流程工件（豁免登记, spec §5.1 注）: task-state/D580.json、.claude/task-briefs/（已在库）、memory/notes/、
  本 evidence 目录、spec 文件（spec 阶段已入库, 随编码 commit 同批到达 main）。

## 3. tsc 28=28 基线（DS8）

```
$ npx tsc --noEmit; grep -c "error TS" tsc-after.log.txt
28
$ diff <(grep "error TS" tsc-baseline.log.txt | sed 's/([0-9]*,[0-9]*)//' | sort) \
       <(grep "error TS" tsc-after.log.txt  | sed 's/([0-9]*,[0-9]*)//' | sort) && echo IDENTICAL
TSC-28-28-IDENTICAL
```

28 条基线错误全部为 extensions/sentinels/_extinct/ 既有 import 解析错误（main 同状态, 逐条相等 —
logs/tsc-baseline.log.txt vs logs/tsc-after.log.txt）。新增/修改代码 0 类型错误。

## 4. 全量 vitest 失败集对账（DS8 — 失败集与 main 基线 diff=空）

```
基线（实现前, 同 worktree 同 commit 态）: Test Files 58 failed | 520 passed | 3 skipped (581)
                                          Tests  39 failed | 3901 passed | 13 skipped (3953)
实现后:                                   Test Files 58 failed | 524 passed | 3 skipped (585)
                                          Tests  40 failed | 3934 passed | 13 skipped (3987)
失败文件集逐文件 diff: 58 → 58, 新增 0, 消失 0（scripts 对账输出留档）
```

测试用例级 +1: `tests/acceptance/zero-code-industry.test.ts > 新增行业零 .ts 文件修改` —
**工作树自引用用例**（断言 `git diff --name-only` 无 .ts 文件）: 编码期 diff 必含本任务 .ts → 必红;
vitest.config.ts `exclude`（CI 名单）在案注释「"零 .ts 文件修改" depends on uncommitted state」→
commit 后自愈（提交后实测见下）, 非回归。

> 提交后复跑记录（此节随 commit 回填）: 见文末「提交后验证」。

## 5. DS9 铁律自检

### 5.1 新契约 JSDoc 三要素在场（@input/@output/@degraded/@error, 铁律 47）

- runner.ts `listSentinelTickets`（spec §5.2 契约锚, 逐字落地）
- runner.ts `transitionTicket`（spec §5.4 契约锚, 逐字落地 + 白名单/resolved_at/审计注释）
- runner.ts `resolveNotificationDedupMs`（env 解析降级契约）
- sentinel-service.ts `getSentinelTickets`（spec §5.2 契约锚, 逐字落地）
- sentinel-service.ts `transitionSentinelTicket`（spec §5.4 L2 契约）
- routes/sentinel.ts POST handler 头注释（5 映射表）

### 5.2 catch 全部 log + degraded 分类（铁律 24/31）

| 位置 | 降级行为 |
|---|---|
| runner.transitionTicket db 失败 | log.warn + `{ok:false, degraded:true, error}`（测试: db 失败用例断言非抛 + log） |
| runner.transitionTicket 审计事件失败 | log.warn 不阻断（对齐既有 L745-750 先例） |
| runner.isNotificationDuplicate 表读失败 | log.warn + 内存 Map 回退（dedup-key-stability 既有用例仍绿 = 兜底有效） |
| runner.markNotificationSent 表写失败 | log.warn + 内存兜底（行为与改造前一致, 不静默） |
| runner.start() dedup DDL/TTL 失败 | log.warn 非阻断 |
| sentinel-service.getSentinelTickets db 失败 | log.warn + memory-fallback + degraded:true（测试断言 log 非静默） |
| sentinel-service.getSentinelTickets 表空 | log.info（区别于 warn）+ memory-fallback + degraded:true |
| sentinel-service.getSentinelTickets diagnosis JSON 损坏 | log.warn + signal_id 兜底 |
| sentinel-service.transitionSentinelTicket runner 缺失 | log.warn + degraded:'SENTINEL_RUNNER_UNAVAILABLE' → 503 |
| routes GET/POST | 500 catch 保留 + degraded 形状（GET: memory-fallback+degraded; POST: degraded:true） |

### 5.3 类型安全（铁律 38）

```
$ grep -n ": any\b\|as any\b" src/sentinel/runner.ts src/agent/sentinel-service.ts src/routes/sentinel.ts \
    tests/sentinel/finding-id-stability.test.ts tests/sentinel/ticket-store.test.ts \
    tests/sentinel/ticket-transition.test.ts tests/routes/sentinel-tickets.test.ts
src/sentinel/runner.ts:685:  (src: any, i: number) => ...     # 既有（HEAD 已在, dispatchSignalsToExperts）
src/sentinel/runner.ts:1436: catch (baselineErr: any)      # 既有（HEAD 已在）
$ git diff src/sentinel/runner.ts | grep -c "^+.*: any\b\|^+.*as any\b"
0                                                          # 新增代码 as any / : any = 0
```

### 5.4 无死代码残留（复核清单 ⑥）

```
$ grep -rn "getSentinelTickets" src/ | grep -v "sentinel-service.ts\|routes/sentinel.ts"   → 无命中
旧 getSentinelTickets 主读路径派生逻辑（原 L259-277 for-loop）已替换为 deriveTicketsFromMemory
兜底 helper — 内存派生全仓唯一引用点 = sentinel-service.ts L309-331（降级路径, 裁决 3 保留）;
`${sentinelId}_${f.id}` 伪工单 id 仅存在于该 helper（finding-id-consumers-grep-evidence.md §2 #6）。
```

### 5.5 INSERT OR REPLACE 重复触发重置 status='open'（spec §5.5 裁决 1 / 环境坑 ④）

D463 既有语义: 复现重开单合理, 保留并文档化 — 测试未当 bug 修（ticket-store DS6 场景② 在窗口内
二次 check 断言行数不增; status 重置语义由 spec §5.5 裁决 1 覆盖, 不在断言域）。

## 6. 提交后验证（commit 后回填）

- [ ] `git stash list` 为空（铁律 0-3 禁 git stash）
- [ ] zero-code-industry 自引用用例自愈复跑
- [ ] pre-commit 13 组全过（无 --no-verify）+ synova-commit 流程
