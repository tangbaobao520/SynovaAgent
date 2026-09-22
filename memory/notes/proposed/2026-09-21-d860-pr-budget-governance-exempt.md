# Note — D860 PR 预算治理产物豁免口径（proposed）

**日期**: 2026-09-21 ｜ **状态**: proposed ｜ **关联**: D860 / D734 / F9 / F12 / #657 / #693

## 决策
`check-pr-budget.sh` 的 ≤12 文件预算只计**交付文件**；治理产物豁免：
`.claude/task-briefs/**`、`task-state/**`、`memory/notes/**`、`docs/plans/**`、`docs/synova/product-lines/evidence/**`
且扩展名 ∈ {md, json, yaml, yml, txt}。

## 反例防线（防豁免被滥用）
同前缀下的**代码文件**（.ts/.sh/.py 等非治理扩展名）不豁免——伪装成治理产物的代码仍被计数
（夹具: task-state/evil.ts 计数 → 13 > 12 → exit 1）。

## Why
PR 预算（冲突概率 ∝ 改动大小）针对的是**代码冲突面**；brief/卡/Note/规格是流程伴生物，
不产生合并冲突风险。#657（12 交付 + 治理产物）与 #693（14 件其中 5 治理）被算术卡死 = 口径错，不是 PR 错。
裁决轨迹: A（一次性豁免）已否决；B（拆 PR）已用于 #657 解封；C（治本）= 本 Note。

## 影响面
- scripts/control-tower/check-pr-budget.sh（豁免过滤 + 豁免件数显式输出，不静默）
- tests/control-tower/check-pr-budget.test.sh（§9 豁免 / §10 反例，32 项全绿）
- 不动域判定语义（check-ownership.py 未改）；主路径无新增检查组。
