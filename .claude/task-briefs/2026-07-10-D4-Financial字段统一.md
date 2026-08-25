## Q0: 项目身份 + 审计
SynovaAgent — D4。审计: financial.json(9 optional+1 required) vs erp-standard.json(14映射,camelCase) — 两套不重叠, data-ingest-service 写入无 Schema 校验。
文件路径修正: erp-standard.json → extensions/ontology/field-mappings/, data-ingest-service.ts → src/agent/

## Q1: 调研
a) financial.json: period(required) + 9结果指标(total_revenue/gross_profit/net_profit/ebit/ebitda/operating_cashflow/free_cashflow/roic/eva)
b) erp-standard.json: 14映射(revenue/operatingCashFlow/netPpe/totalDebt/equity/cash/grossMargin/operatingExpense/totalAssets/currentAssets/currentLiabilities/receivables/inventory/period)
c) data-ingest-service.ts: loadFieldMapping()→ingestBatch()→ingestRow()→store.createNode(), 无 Schema 校验

## Q2: 范围
Step 1: financial.json 追加 erp 科目字段(统一 snake_case, 不删现有)
Step 2: erp-standard.json prop 改 snake_case, externalField 不变
Step 3: data-ingest-service.ts 加 Schema 校验(loadFinancialSchema→validProps→skip invalid)
不动: 写入逻辑本身 / routes/data.ts

## Q3: 验收
verify: financial.json optionalProps 字段数≥20
verify: erp-standard.json 零 camelCase prop
verify: data-ingest-service.ts 含 Schema 校验逻辑(grep "financial.json" 或 "validProps" 有结果)

## 架构层
L5(financial.json Schema) + L5(erp-standard.json映射) + L2(data-ingest-service.ts校验)

## Done 标准
- [x] erp-standard.json 零 camelCase: grep "operatingCashFlow\|grossMargin\|netPpe\|totalDebt\|totalAssets\|currentAssets\|currentLiabilities" = 空
- [x] financial.json optionalProps 含 erp 13个科目
- [x] data-ingest-service.ts 含 Schema 校验
- [x] 零 as any
- [x] tsc 零新增错误
