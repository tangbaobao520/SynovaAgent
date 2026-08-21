# GS-05 告警闭环场景

> 数据: 越阈 fixture（erp-standard：现金 3 万 / 月耗 12 万） | 哨兵: cash-runway | 验收点: S0-3
> 对应 C线标准: S0-3（告警闭环——sentinel_tickets 有行 + 推送去重键稳定）
> 依赖: D356（哨兵阈值告警，待合 main）/ D354（N14 去重键，D272 finding.id 已在 main）

## 场景

空库触发（负向基线）→ 注入越阈 fixture → 触发 cash-runway（越阈 → 告警 → 工单落库）→ 同窗口二次触发（去重键稳定，工单不新增）。

预期：现金 3 万 / 月耗 12 万 = runway 0.25 个月 < critical 6 → 触发 critical 告警 → 专家诊断 → `sentinel_tickets` 表有行；二次触发不产生重复工单。

## 运行

```bash
bash scripts/golden-scenarios/GS-05-alert-closure/run.sh
```

- exit 0 = 全部断言通过（场景绿）
- exit 1 = 有断言失败（证据 JSON 记明细）
- 证据: `scripts/golden-scenarios/evidence/GS-05-<date>.json`（calc-progress 消费）

## 断言（3 条）

| # | id | 类型 | 内容 |
|---|----|------|------|
| 1 | no-false-ticket-empty | 负向 | 空库触发 → tickets total == 0（降级不误报工单，真空零显式声明） |
| 2 | ticket-created | 正常 | 越阈触发 → sentinel_tickets 表行数 >= 1（S0-3 告警闭环核心） |
| 3 | dedup-stable | 正常 | 同哨兵二次触发 → 行数不增（INSERT OR REPLACE + 去重窗口，去重键稳定） |

## 当前状态：诚实 RED（2026-08-19 实测，evidence/GS-05-2026-08-19.json）

**实测结果：2/4 断言通过（verdict=fail，exit 1）**——负向全绿、正向诚实 RED。

| # | id | 实测 | 说明 |
|---|----|:---:|------|
| 1 | no-false-critical-empty | ✅ GREEN | 空库触发 → 降级 warning（cr_runway_degraded），无 critical 误报（D453 修复生效） |
| 2 | no-false-ticket-empty | ✅ GREEN | 空库触发 → tickets 空数组（真空零显式声明） |
| 3 | ticket-created | ❌ RED | 越阈**已触发 critical**（现金跑道0.3个月）但 `sentinel_tickets` COUNT=0——工单未落库 |
| 4 | dedup-stable | ❌ RED | 无工单 → DEDUP_VACUOUS（去重键无法验证，诚实声明不空壳） |

**正向 RED 阻塞链（grep/read 实测 2026-08-19，两条独立缺口）**：

1. **runSentinelOnce 绕过工单管线（D356 缺口）**：`POST /api/sentinel/run/:id`（sentinel-service.ts:161）直接调 `sentinel.check()`，不经过 SentinelRunner——不记录 recent results、不做信号聚合/专家调度 → `storeExpertReport`（runner.ts:429，emergency/critical → INSERT OR REPLACE sentinel_tickets）永不触发。tickets 只由 cron 的 `aggregateAndDispatch()`（每小时 :05）从 runner 记录生成；cash-runway cron 为月度（manifest schedule "0 0 1 * *"），测试窗口内不可达。
2. **tickets API 与 DB 表不一致（独立发现）**：`getSentinelTickets()`（sentinel-service.ts:225）读 `runner.getRecentResults()`（内存视图），而工单物理真值在 `sentinel_tickets` 表——两条写入路径互不打通，API 永远读不到 DB 落库的工单。

**隔离加固（本次修复，run.sh 侧，未动 common/）**：GSS README 08-16 已警告"开发者会话常自带 SYNOVA_DB_PATH 指向真实库"——config.ts 的 `SYNOVA_DB_PATH` 优先级高于 `SYNOVA_DATA_DIR`，实测（本机 env 自带 `SYNOVA_DB_PATH=./data/synova.db`）场景曾写真实库。run.sh 现显式 `export SYNOVA_DB_PATH=$DATA_DIR/synova.db`，结构上触达不了真实库。

**转绿前置（非本任务范围）**：把 runSentinelOnce 接入 runner 工单管线（或提供手动 aggregateAndDispatch 触发 API），并打通 tickets API 与 DB 表——建议独立修复任务（D356 合入后复核）。

## 红线

- 断言只认产品物理输出（HTTP 响应 / sqlite 表行数 / 文件内容），机器判定 exit 0/1，禁止恒真/空壳。
- 证据只入 git（evidence/GS-05-<date>.json），不靠「我记得跑过」。
- 场景脚本 = Harness 代码 → 进 K3 审计范围，无豁免。
