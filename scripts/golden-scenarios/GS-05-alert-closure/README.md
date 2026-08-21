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

## 当前状态：✅ 全绿（2026-08-21 实测，evidence/GS-05-2026-08-21.json，verdict=pass，exit 0）

**4/4 断言通过**：负向 ×2（空库无 critical / 空库时刻 DB 0 行快照）+ ticket-created（越阈 → critical → DB 工单落库）+ dedup-stable（同窗口二次触发工单不增）。

**转绿修复链（2026-08-21，D463 告警闭环 + D354 去重键）**：

1. **D463 告警闭环（选项 A，创始人批准）**：
   - `runSentinelOnce`（sentinel-service.ts）接线 runner 管线：runner 可用 → `runOnce`（记录）+ `aggregateAndDispatch`（信号聚合 → 工单闭环）；runner 不可用 → 降级直连（D453 行为保持）。
   - `dispatchSignalsToExperts`（runner.ts）对 critical/emergency 信号**按严重度自动建工单**（`createAutoTicket`，id `ticket-{signalId}-auto`，诊断 = finding 摘要）——**不依赖 ExpertDispatcher/LLM**（此前 ExpertDispatcher 未初始化 → 工单永不落库）。专家可用时 enrich（原有 storeExpertReport 路径不变）。
2. **D354 去重键稳定化（已合 main）**：信号 id 去时间戳（`sig_{entity}`）→ 同信号重复触发 id 稳定 → INSERT OR REPLACE 幂等 → dedup-stable 成立。

**断言修正**：负向"空库无工单"改为**空库时刻 DB 快照**（assert 在末尾运行时触发#1 已建工单——负向必须在负向时刻采样，否则断言失真）。

## 红线

- 断言只认产品物理输出（HTTP 响应 / sqlite 表行数 / 文件内容），机器判定 exit 0/1，禁止恒真/空壳。
- 证据只入 git（evidence/GS-05-<date>.json），不靠「我记得跑过」。
- 场景脚本 = Harness 代码 → 进 K3 审计范围，无豁免。
