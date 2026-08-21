# GS-04 人才循环场景

> 数据: hr-standard（员工总数/离职率/晋升率/人才密度/eNPS/平均在职月数）| 哨兵: key-person-risk | 验收点: S1-1 / S1-4
> 模式: 对齐 GS-02/GS-03/GS-05（JWT 自举 + SYNOVA_DB_PATH 隔离 + 后台 bootstrap，D462 修复链）

## 场景

空库触发（负向基线）→ 注入 hr-standard fixture（高关键岗位占比）→ 触发 key-person-risk → 断言 critical。

## 运行

```bash
bash scripts/golden-scenarios/GS-04-talent-cycle/run.sh
```
- exit 0 = 全绿 / exit 1 = 有失败（evidence JSON 记明细）

## 断言（3 条）

| # | id | 类型 | 内容 |
|---|----|------|------|
| 1 | no-false-critical-empty | 负向 | 空库触发 → 无 critical（降级不误报） |
| 2 | hr-upload-ok | 正常 | hr-standard 注入 → Person 节点创建（D357 MVP 上传路径） |
| 3 | key-person-risk-triggered | 正常 | 关键人数据 → key-person-risk critical |

## 当前状态：诚实 RED（2026-08-21 实测，evidence/GS-04-2026-08-21.json）

**2/3 通过（verdict=fail，exit 1）**：负向 ✅ + 注入 ✅（Person 节点创建）；断言 3 ❌——触发后 findings 空。

**阻塞根因（grep/read 实测 2026-08-21）——映射↔哨兵契约错位（GS-02/D355 同型）**：

1. `hr-standard` 映射（extensions/ontology/field-mappings/hr-standard.json）提供：
   `headcount / turnover_rate / internal_promotion_rate / talent_density / e_nps / avg_tenure_months / period`
2. `key-person-risk` 哨兵（extensions/sentinels/key-person-risk/aggregate.ts → src/l3/key-person-risk.ts:46-52）从 Person 节点提取
   `name / domains / role` 等（busFactor/orphanedDomains 计算所需）——映射不含这些字段
3. 且 `queryNodes('Person', { teamId })` 的 teamId 在 run-once 上下文为 undefined（upload 节点无 teamId prop）

**转绿前置（非本任务范围，建议独立任务）**：对齐 hr-standard 映射与 key-person-risk compute 契约（参照 D355 先例）。

## 红线

- 断言只认产品物理输出，机器判定 exit 0/1，禁止恒真/空壳；证据只入 git；场景脚本进 K3 审计范围。
