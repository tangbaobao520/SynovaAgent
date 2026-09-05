# D580 evidence 索引 + DS 对照（D577 evidence 结构先例）

> 任务 D580（8-2 工单入库接线统一 / 8-3 去重键稳定化 / 8-4 状态机 API）| 2026-09-06 | 分支 feat/d580-ticket-slice
> 路径说明: 根级 `evidence/` 被 .gitignore L76 `evidence/` 全局忽略（D577 实测 synova-commit 暂存失败），
> 故落盘本目录（git 跟踪路径，随编码 commit 入库）。
> 基线: main = 7afbb23f（D580 派单 + D579 spec 入库 commit）；本分支 = main + spec/docs 三件套（d48fef5f..a214b83e）。

## 文件清单

| 文件 | 内容 |
|---|---|
| README.md | 本文件 — 总览 + DS1-DS12 对照 + 审计员独立复跑入口 |
| finding-id-consumers-grep-evidence.md | §4.2 七项消费方 grep 复核（铁律 9）+ 43 文件去时间戳清单 + 修改后逐文件 `grep -c` 归零输出 + _extinct 4 文件偏差说明 |
| red-green-evidence.md | 4 新建测试双轮全文（red 实现前 / green 实现后）+ 幂等复跑 + 既有断言修复（threshold-injection/flip）+ DS6 三场景 |
| wiring-and-write-set-evidence.md | §8 接线 grep（6 条逐条实测）+ §5.1 写集对账（11 条目）+ DS9 卫生（as any=0 新增代码 / JSDoc 三要素 / 无死代码）+ tsc 28=28 + 全量 vitest 失败集 diff=空 |

## DS1-DS12 对照（spec §10，S-10 禁重编号/跳号/静默缺项）

| DS | 内容 | 状态 | 证据 |
|---|---|---|---|
| DS1 | 43 aggregate finding.id 全部去时间戳 | ✅ | finding-id-consumers-grep-evidence.md §3（逐文件 grep -c 归零表，仅剩 2 文件 × 2 行非 id 计时行）+ finding-id-stability.test.ts 4/4 绿 |
| DS2 | 通知去重持久化 + TTL + 5min + env 可配 | ✅ | ticket-store.test.ts（重启恢复/env 覆盖/非法回退 6 用例绿）+ dedup-key-stability 窗口口径 + 窗口内命中用例 |
| DS3 | getSentinelTickets 表读同源 + 降级双标记 + status 双路径 | ✅ | ticket-store.test.ts L2 4 用例 + routes test GET 三源用例 |
| DS4 | transitionTicket 状态机（白名单/终态/resolved_at/审计） | ✅ | ticket-transition.test.ts 8 用例绿 |
| DS5 | POST /tickets/:id/transition 注册 + 5 映射 + 文件头注释同步 | ✅ | routes/sentinel-tickets.test.ts 9 用例绿 + routes/sentinel.ts 文件头 |
| DS6 | 三场景验收 | ✅ | ① routes test "DS6 场景①"（critical 注入→落表→GET 可见）② ticket-store "DS6 场景②"（二次 check 不重单不重发）③ routes test "DS6 场景③"（ack→resolve 全链路 + GET 终态）— red-green-evidence.md §4 |
| DS7 | 波及面证据链落盘 | ✅ | 本目录三件（README/consumers-grep/red-green + wiring） |
| DS8 | 回归（26 文件全绿 / tsc 28=28 / 全量失败集 diff=空 / as any=0） | ✅ | wiring-and-write-set-evidence.md §3/§4（tests/sentinel/ 30 文件 223 用例全绿含新增；失败文件集 58=58 逐文件 diff=空） |
| DS9 | 铁律自检（JSDoc 三要素 / catch log+degraded / 无死代码） | ✅ | wiring-and-write-set-evidence.md §5 |
| DS10 | 写集一致（diff vs §5.1 零漂移） | ✅（+1 显式偏差） | wiring-and-write-set-evidence.md §2（11 条目全命中；偏差: extensions/sentinels/_extinct/ 4 文件 id 行 — 生产可达路径，spec §5.1 单层 grep 盲区，§6 已知限制不扩） |
| DS11 | 完成报告 DS 一一对应 + 决策记录 + 已知限制 | ✅ | 本表 + task-state/D580.json impl 段 + memory note（随落地 git mv implemented/） |
| DS12 | 治理（零 VERSION bump / 零 product-lines / note 迁移 / K3 入口） | ✅ | VERSION.md 不在 diff；scripts/product-lines 零触碰；note 随 impl commit git mv；审计入口 = 本目录 |

### 决策记录（spec §5.5 五决策点，S-12，编码阶段零偏离）

| 决策点 | 结论（编码落位） |
|---|---|
| finding.id 稳定键 | A 去时间戳后缀 — 45 文件（43 单层 + 2 补充形态）id 行 `-${now.getTime()}` / `-${Date.now()}` / `-${start}` 全部摘除，前缀保留 |
| 去重载体 | C 独立表 `sentinel_notification_dedup(key TEXT PRIMARY KEY, last_sent_ms INTEGER NOT NULL)` — DDL 在 runner.start() 与 sentinel_tickets 并排；TTL 启动 DELETE 一次 |
| 工单读降级 | B 表空/读失败 → 内存派生 fallback + `source` + `degraded` 双标记；db 失败 log.warn / 表空 log.info |
| resolved_at 语义 | B 仅 resolved 写 `datetime('now')`；dismissed 保持 NULL；不新增列 |
| 状态机严格度 | B 白名单 open→acknowledged / open→dismissed / acknowledged→resolved；终态与同态一律 ILLEGAL_TRANSITION |

### 已知限制（spec §6 前两条，未顺手修）

1. **closeTicket signal_id LIKE 缺口**（runner.ts L1171-1177）: `signal_id LIKE '%sentinelId%'` 匹配不到 auto 工单
   （signal_id = `sig_${entity}` 不含 sentinelId 字面）— spec §5.5 裁决 4: 本单不修，git diff 无 closeTicket 写入值改动。
2. **extractEntityKey title 实体键漂移**（signal-aggregator.ts L177-183，写集外未触碰）: title 含活值无冒号时
   entity 键随值漂移 → sig id 漂移 → auto 工单 id 漂移（同输入双跑不受影响）。
3. **（编码期新增记录）_extinct 其余 8 文件** id 行含时间戳（capital-efficiency 等）— 无任何生产可达路径
   （全仓无 import），留作审计参考，零行为影响；如需清扫应独立任务。

## 审计员独立复跑入口（幂等，无本机假设）

```bash
# ① 新建 4 测试（双跑同 id / 状态机 / 表读 / 路由接线）
npx vitest run tests/sentinel/finding-id-stability.test.ts tests/sentinel/ticket-store.test.ts \
  tests/sentinel/ticket-transition.test.ts tests/routes/sentinel-tickets.test.ts
# ② 回归（26 既有 + 3 新建 = tests/sentinel/ 全量 + routes 配对）
npx vitest run tests/sentinel/ tests/routes/sentinel-tickets.test.ts
# ③ DS1 grep（逐文件 0 命中；仅 forecast-accuracy/pricing-strategy 各 2 行计时残留）
grep -rn 'getTime()\|Date.now()' extensions/sentinels/*/aggregate.ts
# ④ tsc 基线
npx tsc --noEmit   # 28 errors, 全部 extensions/sentinels/_extinct/ 既有
# ⑤ 波及面（消费方 grep 清单见 finding-id-consumers-grep-evidence.md §2）
grep -n "findingById" src/sentinel/runner.ts
```

> 环境注记: ① `tests/acceptance/zero-code-industry.test.ts > 新增行业零 .ts 文件修改` 为工作树自引用用例
> （git diff 含本任务未提交 .ts 时必红；vitest.config.ts CI exclude 名单在案，vitest-after.log.txt 实测），
> commit 后自愈，非回归 — 见 wiring-and-write-set-evidence.md §4。② full vitest 会对
> extensions/industries/*/thresholds.json 产生写测试残留（实测两次），复核写集前先
> `git checkout -- extensions/industries/`。
