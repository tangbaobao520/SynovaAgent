# Task Brief: D442 GS-03 资本循环场景脚本（诚实 RED）

> 生成: 2026-08-18 | 分支: feat/d442-gs03 | 角色: DeepSeek Harness (Mac)
> 依据: GS-DISPATCH-20260818 + SYNOVA-DESIGN-黄金场景与创始人驾驶舱-v1 §2.2/2.3/2.4
> 创始人裁决（08-18）：写完整 D442 脚本，诚实 RED 直到依赖落地。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
黄金场景 GS-03（资本循环）证据引擎脚本。验证 erp-standard 数据注入 → cash-runway
哨兵阈值告警的端到端链路。复用 D361 common/ 四工具（fresh-db/bootstrap/assert）。

### b) 文件审计（接口从代码 grep 实测，非凭记忆）
- 数据注入: POST /api/data/upload（src/routes/data.ts:16 → ingestBatch → createNode('Financial')）
- 哨兵触发: POST /api/sentinel/run/:id（src/routes/sentinel.ts:58 → runSentinelOnce）
- 阈值: extensions/sentinels/cash-runway/manifest.json cash_runway_months.critical=6
- field-mapping: extensions/ontology/field-mappings/erp-standard.json（现金余额→cashBalance）

### c) 决策（D333 记录，K3 可核）
参考：第一性原理（场景脚本=证据引擎，如实反映产品物理输出）+ Anthropic（机器可验契约：
assert.ts 三态 exit 码，查询失败≠真空）。结论：诚实 RED——脚本是交付物，断言「阈值触发」
当前 RED（依赖未落地），如实记录不造假转绿。

## Q1: 调研 — 决策链 + 历史教训

### a) 阻塞链（grep 实测，非推断）
1. erp-standard `现金余额→cashBalance`(camel) vs financial.json schema `cash`(snake)
   → ingestBatch 字段校验跳过 cashBalance（D355 范畴，Win Claude）
2. compute filter bug `{[teamId]: teamId}` 永不匹配（D355 范畴）
3. runSentinelOnce 传 db:undefined → 哨兵空 store（DSH 领地，待独立修复）

### b) 断言规范（对齐铁律 48）
≥3 断言：正常（数据注入 + 阈值触发）+ 负向（notContains 降级不误报）。断言只认产品物理输出
（文件内容），禁止恒真/空壳。

## Q2: 范围 — 最简方案

做什么：
- scripts/golden-scenarios/GS-03-capital-cycle/run.sh
- scripts/golden-scenarios/GS-03-capital-cycle/fixtures/erp-low-cash.json
- scripts/golden-scenarios/GS-03-capital-cycle/expect.json
- scripts/golden-scenarios/GS-03-capital-cycle/README.md

不做什么：
- 不改 src/routes/sentinel.ts（触发 bug 修复属独立任务）
- 不改 extensions/ontology/field-mappings/erp-standard.json（D355 范畴，Win Claude）
- 不改 extensions/sentinels/cash-runway/aggregate.ts（D356 已交付）
- 不改 scripts/audit/audit-check.py（K3 红线）
- 不改 scripts/golden-scenarios/common/assert.ts（D361 已交付）

## Q3: 验收 — 入口→交互→结果

入口：bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh
处理：fresh-db → bootstrap → inject erp 数据 → 触发 cash-runway → 断言
结果：evidence/GS-03-<date>.json + exit 0/1（阈值触发断言当前 RED，其余 GREEN）

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] run.sh 满足 8 条硬契约（fresh-db 隔离 + bootstrap healthz + 负向断言）
- [ ] 断言 ≥3 条且含负向（notContains），无恒真断言
- [ ] 本地执行 run.sh 产出 evidence/GS-03-<date>.json（exit 1 = 阈值触发 RED，诚实）
- [ ] npx vitest run 全绿（新增场景不影响存量测试）
- [ ] bash scripts/pre-commit-check.sh 13 组全绿
