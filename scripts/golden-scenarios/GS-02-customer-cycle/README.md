# GS-02 客户循环场景

> 数据: crm-standard（市场份额/净推荐值/客户满意度/品牌知名度/客户集中度/流失率）| 哨兵: customer-demand-shift | 验收点: S1-1 / S1-4
> 对应 C线标准: S1-1（客户循环收敛）/ S1-4（越阈告警）
> 模式: 对齐 GS-03/GS-05（JWT 自举 + SYNOVA_DB_PATH 隔离 + 后台 bootstrap，D462 修复链）

## 场景

空库触发（负向基线）→ 注入 crm-standard 越阈 fixture（高流失 0.25 + 低 NPS + 高集中度）→ 触发 customer-demand-shift → 断言 critical。

## 运行

```bash
bash scripts/golden-scenarios/GS-02-customer-cycle/run.sh
```

- exit 0 = 全部断言通过（场景绿）
- exit 1 = 有断言失败（证据 JSON 记明细）
- 证据: `scripts/golden-scenarios/evidence/GS-02-<date>.json`

## 断言（3 条）

| # | id | 类型 | 内容 |
|---|----|------|------|
| 1 | no-false-critical-empty | 负向 | 空库触发 → 无 critical（降级不误报） |
| 2 | crm-upload-ok | 正常 | crm-standard 注入 → Client 节点创建（D357 MVP 上传路径可用） |
| 3 | demand-shift-critical-triggered | 正常 | 越阈数据 → customer-demand-shift critical |

## 当前状态：诚实 RED（2026-08-21 实测，evidence/GS-02-2026-08-21.json）

**2/3 通过（verdict=fail，exit 1）**：负向 ✅ + 注入 ✅（Client 节点创建，D357 MVP 上传路径可用）；
断言 3 ❌——注入后触发 findings **空**，无 critical。

**阻塞根因（grep/read 实测 2026-08-21）——映射↔哨兵契约错位（D355 同型）**：

1. `crm-standard` 映射（extensions/ontology/field-mappings/crm-standard.json）提供：
   `market_share / nps / customer_satisfaction / brand_awareness / client_concentration_hhi / churn_rate / period`
2. `customer-demand-shift` 哨兵（extensions/sentinels/customer-demand-shift/aggregate.ts:32-38）的 compute 需要：
   `name / revenue / churn(boolean 或 status='churned') / nps`
3. 交集仅 `nps`——`revenue` 缺失（→ 恒 0 → 集中度 topCustomerShare=0）、`churn` 缺失（→ 恒 false → 流失率 0）→ **即使节点匹配，compute 永不输出越阈 critical**。
4. 次要：`queryNodes('Client', { teamId })` 的 teamId 在 run-once 上下文为 undefined（upload 节点也无 teamId prop）。

**转绿前置（非本任务范围，建议独立任务）**：对齐 crm-standard 映射与 customer-demand-shift compute 契约
（映射补 revenue/churn 字段 或 compute 改读 churn_rate/client_concentration_hhi）——参照 D355 cashBalance↔cash 修复先例。

## 红线

- 断言只认产品物理输出（文件内容），机器判定 exit 0/1，禁止恒真/空壳。
- 证据只入 git（evidence/GS-02-<date>.json），不靠「我记得跑过」。
- 场景脚本 = Harness 代码 → 进 K3 审计范围，无豁免。
