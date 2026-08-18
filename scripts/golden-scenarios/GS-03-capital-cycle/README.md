# GS-03 资本循环场景

> 数据: erp-standard | 哨兵: cash-runway | 验收点: 4-5 / 5-2 / 4-7
> 对应 C线标准: S1-1 / S1-4（财务循环）

## 场景

注入 erp-standard 财务数据（低现金 + 高月耗）→ 触发 cash-runway 哨兵 → 断言阈值告警。

预期（依赖落地后）：`现金余额 3万 / 月消耗 12万 = 0.25 个月 < critical 6` → 触发 critical「现金流危急」。

## 运行

```bash
bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh
```

- exit 0 = 全部断言通过（场景绿）
- exit 1 = 有断言失败（证据 JSON 记明细）

## 断言（3 条）

| # | id | 类型 | 内容 |
|---|----|------|------|
| 1 | erp-upload-ok | 正常 | 上传响应含 Financial（数据注入成功） |
| 2 | cash-runway-critical-triggered | 正常 | 触发响应含「现金流危急」（阈值告警） |
| 3 | no-false-critical-zero-runway | 负向 | 触发响应不含「跑道0.0个月」（降级不误报） |

## 当前状态：诚实 RED（2026-08-18）

断言 2（阈值触发）**当前 RED**，阻塞链（grep 实测）：

1. **D355（Win Claude）**：erp-standard `现金余额→cashBalance`(camel) vs financial.json schema
   `cash`(snake) → ingestBatch 字段校验跳过 cashBalance；compute filter bug
   `{[teamId]: teamId}` 永不匹配。
2. **触发 bug（DSH 领地，待独立修复）**：`runSentinelOnce`（src/agent/sentinel-service.ts:173）
   传 `db: undefined` → 哨兵拿空 store → 恒 degraded，读不到注入数据。

断言 1（注入）与断言 3（负向）当前 GREEN：注入链路可用，D356 的 degraded 守卫阻止了
「跑道0.0个月」误报。

## 红线

- 断言只认产品物理输出（文件内容），机器判定 exit 0/1，禁止恒真/空壳。
- 证据只入 git（evidence/GS-03-<date>.json），不靠「我记得跑过」。
- 场景脚本 = Harness 代码 → 进 K3 审计范围，无豁免。
