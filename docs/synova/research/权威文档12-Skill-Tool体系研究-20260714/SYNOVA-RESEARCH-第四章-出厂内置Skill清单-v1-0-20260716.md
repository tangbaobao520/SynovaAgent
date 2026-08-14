<!--
  Synova Skill/Tool体系研究 第四章 — 出厂内置Skill清单
  版本: v1.0 | 日期: 2026-07-16
-->

# 第四章：出厂内置Skill清单

> 35个Skill按七层分类。21个出厂内置Playbook。
> 实现源: extensions/skills/builtin/*/manifest.json (41个manifest)

## 一、L1 感知层 (5个) — 数据获取，零推理

| # | skill_id | tier | complexity | expert | tools | edges | status |
|---|----------|------|------------|--------|-------|-------|--------|
| 1 | acquire-financial-data | L1 | atomic | finance | acquire-edge-data | E-1.1, E-1.2, E-5.1, E-5.2 | OK |
| 2 | acquire-customer-data | L1 | atomic | marketing | acquire-edge-data | E-2.x | OK |
| 3 | acquire-competitive-intel | L1 | atomic | strategy | acquire-edge-data | E-4.x | OK |
| 4 | acquire-operational-data | L1 | atomic | tech | acquire-edge-data | E-3.x | OK |
| 5 | acquire-org-health-data | L1 | atomic | org | acquire-edge-data | E-X.x | OK |

## 二、L2 分析层 (7个) — 计算+结构化分析

| # | skill_id | tier | complexity | expert | tools | edges | sentinels | status |
|---|----------|------|------------|--------|-------|-------|-----------|--------|
| 6 | analyze-break-even | L2 | atomic | finance | compute-break-even, acquire-edge-data | E-1.1,E-2.1,E-3.1,E-4.1 | sentinel-breakeven | OK |
| 7 | analyze-operating-leverage | L2 | atomic | finance | compute-dol | E-1.1,E-3.1 | sentinel-operating-leverage | OK |
| 8 | analyze-capital-allocation | L2 | composite | finance | compute-capital-allocation, acquire-edge-data | E-1.x,E-5.x | capital-health | OK |
| 9 | analyze-cost-structure | L2 | composite | finance | compute-cost-structure | E-1.x,E-3.x | margin-health | OK |
| 10 | analyze-competitive-position | L2 | composite | strategy | compute-competitive-positioning,compute-hhi | E-4.7,E-4.4,E-4.5,E-5.4 | competitive-position,competitive-moat | OK |
| 11 | analyze-customer-value | L2 | composite | marketing | compute-customer-ltv,compute-churn-rate | E-2.x | revenue-health | OK |
| 12 | analyze-price-elasticity | L2 | composite | marketing | compute-price-elasticity | E-2.x,E-4.x | unit-economics | OK |

## 三、L3 诊断层 (7个) — 根因定位，专家推理

| # | skill_id | tier | complexity | expert | tools | 依赖子Skill | sentinels | status |
|---|----------|------|------------|--------|-------|------------|-----------|--------|
| 13 | diagnose-cashflow-health | L3 | expert | finance | acquire-edge-data,compute-break-even,compute-dol,compute-capital-allocation,cross-validate,query-graph | analyze-break-even,analyze-operating-leverage,analyze-capital-allocation | capital-health,margin-health,sentinel-breakeven,sentinel-operating-leverage,sentinel-survival-margin | OK |
| 14 | diagnose-margin-erosion | L3 | expert | finance | compute-margin-trend,cross-validate | analyze-cost-structure,analyze-price-elasticity | margin-health,unit-economics | OK |
| 15 | diagnose-competitive-decay | L3 | expert | strategy | compute-competitive-positioning,compute-hhi,cross-validate | analyze-competitive-position | competitive-position,competitive-moat | OK |
| 16 | diagnose-churn-root-cause | L3 | expert | marketing | compute-churn-rate,cross-validate | analyze-customer-value | customer-demand-shift | OK |
| 17 | diagnose-org-health | L3 | expert | org | cross-validate,query-graph | acquire-org-health-data | key-person-risk,talent-density,incentive-alignment | OK |
| 18 | diagnose-agency-cost | L3 | expert | org | cross-validate,query-graph | acquire-org-health-data | internal-transaction-cost,incentive-alignment | OK |
| 19 | enterprise-growth-diagnosis | L3 | expert | multi | cross-validate,query-graph | 19个下级L1-L3 Skill | 全量哨兵 | OK |
## 四、L4 处方层 (4个) — 方案生成

| # | skill_id | tier | complexity | expert | tools | status |
|---|----------|------|------------|--------|-------|--------|
| 20 | prescribe-pricing-strategy | L4 | composite | marketing | compute-optimal-price,compute-two-part-tariff | OK |
| 21 | prescribe-budget-allocation | L4 | composite | finance | compute-marginal-contribution | OK |
| 22 | prescribe-market-entry | L4 | expert | strategy | compute-market-structure,compute-demand-forecast | OK |
| 23 | prescribe-synergy-assessment | L4 | composite | org | compute-synergy-score | OK |

## 五、L5 反馈层 (3个) — 执行追踪

| # | skill_id | tier | complexity | expert | tools | status |
|---|----------|------|------------|--------|-------|--------|
| 24 | track-execution-progress | L5 | composite | action | track-plan-milestones | OK |
| 25 | verify-hypothesis | L5 | composite | action | cross-validate | OK |
| 26 | detect-plan-deviation | L5 | composite | action | compute-deviation | OK |

## 六、L6 学习层 (3个) — 知识沉淀

| # | skill_id | tier | complexity | expert | tools | status |
|---|----------|------|------------|--------|-------|--------|
| 27 | retrieve-industry-benchmark | L6 | atomic | knowledge | query-knowledge | OK |
| 28 | distill-expert-knowledge | L6 | composite | knowledge | knowledge-extractor | OK |
| 29 | match-best-practice | L6 | composite | knowledge | query-knowledge | OK |

## 七、L7 自保层 (4个) — 系统健康

| # | skill_id | tier | complexity | expert | tools | status |
|---|----------|------|------------|--------|-------|--------|
| 30 | check-data-source-health | L7 | atomic | host | sentinel-registry.check | OK |
| 31 | manage-sentinel-config | L7 | atomic | host | sentinel-registry | OK |
| 32 | agent-self-diagnosis | L7 | composite | host | system-health-check | OK |
| 33 | backup-restore | L7 | atomic | host | backup-system | OK |

## 八、协同类 Skill (3个)

| # | skill_id | tier | expert | tools | status |
|---|----------|------|--------|-------|--------|
| 34 | cross-expert-review | L3 | multi | cross-expert-verify | OK |
| 35 | conflict-resolution | L3 | multi | conflict-detector | OK |
| 36 | synthesizer-invoke | L3 | host | format-report | OK |

## 九、工作台类 Skill (3个)

| # | skill_id | tier | expert | tools | status |
|---|----------|------|--------|-------|--------|
| 37 | agent-self-health-dashboard | L7 | host | health-check | OK |
| 38 | knowledge-base-maintenance | L6 | knowledge | knowledge-extractor | OK |
| 39 | diagnosis-calibration | L6 | knowledge | calibration-tool | OK |

## 十、出厂内置剧本清单 (21个)

| # | 剧本ID | 专家 | 触发条件 | 步骤数 | 依赖42边 | 跨专家 |
|---|--------|------|---------|--------|---------|--------|
| 1 | finance-cashflow-crisis | finance | cash-runway P1 | 6 | E-05,E-13,E-37 | 否 |
| 2 | finance-profitability-root-cause | multi | profit-health P1 | 6 | E-23,E-30,E-31,E-34 | 是 |
| 3 | finance-cost-structure-bloat | finance | cost-health P1 | 4 | E-23 | 否 |
| 4 | strategy-competitive-decay | strategy | competitive-position P1 | 5 | E-36,E-30,E-33 | 否 |
| 5 | strategy-market-position-loss | strategy | market-lifecycle P1 | 5 | E-36 | 否 |
| 6 | strategy-niche-squeeze | strategy | niche-squeeze P1 | 4 | E-4.x | 否 |
| 7 | org-collaboration-density | org | channel-capacity P1 | 5 | E-2.x | 否 |
| 8 | org-talent-flight-risk | org | talent-density P1 | 5 | E-5.2 | 否 |
| 9 | org-power-rigidity | org | power-rigidity P1 | 4 | E-2.2 | 否 |
| 10 | marketing-churn-root-cause | marketing | customer-demand-shift P1 | 5 | E-4.2 | 否 |
| 11 | marketing-demand-shift | marketing | customer-demand-shift P1 | 4 | E-4.x | 否 |
| 12 | tech-system-health | tech | software-health P1 | 4 | E-3.7 | 否 |
| 13 | tech-data-quality | tech | data-health P1 | 4 | E-3.x | 否 |
| 14 | business-model-coherence | business_model | business-model-coherence P1 | 5 | E-5.x | 否 |
| 15 | business-model-moat-erosion | business_model | moat-dependency P1 | 4 | E-4.7 | 否 |
| 16 | action-execution-track | action | 方案级哨兵 P0 | 3 | — | 否 |
| 17 | action-hypothesis-verify | action | 方案级哨兵 P1 | 3 | — | 否 |
| 18 | knowledge-industry-benchmark | knowledge | 偏离>2σ | 3 | — | 否 |
| 19 | knowledge-calibration-drift | knowledge | GA误报>=3 | 3 | — | 否 |
| 20 | host-agent-self-health | host | 看门狗告警 | 4 | — | 否 |
| 21 | enterprise-full-diagnosis | multi | Cron每14天 | 20+ | 全42边 | 是 |

## 十一、Skill与compute函数交叉引用矩阵

| Skill | computeBreakEven | computeDOL | computeHHI | computeChurnRate | computeNPV |
|-------|:---:|:---:|:---:|:---:|:---:|
| diagnose-cashflow-health | ✅ | ✅ | — | — | ✅ |
| diagnose-margin-erosion | ✅ | ✅ | — | — | — |
| diagnose-competitive-decay | — | — | ✅ | — | — |
| diagnose-churn-root-cause | — | — | — | ✅ | — |
