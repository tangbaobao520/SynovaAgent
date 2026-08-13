# SYNOVA-AUDIT: Compute 函数存在性验证

**日期**: 2026-07-06 | **审计范围**: extensions/sentinels/ 所有 manifest.json 声明的 compute 函数

---

## 1. 汇总

| 指标 | 数量 |
|------|------|
| 总声明 compute 数 | 81 |
| 文件存在且 export 正常匹配 | 48 |
| 文件存在但命名有差异 (kebab-camel convention) | 21 |
| 文件存在但 export 完全不匹配 (关键异常) | 3 |
| **MISSING — 文件不存在** | **9** |

---

## 2. MISSING 文件 — 文件完全不存在 (9个)

这些 compute 名称在 manifest 中被声明，但在 extensions/sentinels/ 的任何子目录中都找不到对应的 .ts 文件。

| # | compute 名称 | 声明者 (哨兵) | 哨兵 entryPoint |
|---|-------------|-------------|----------------|
| 1 | us-factor | key-person-risk | ./aggregate.ts |
| 2 | cash-runway-months | cash-runway | ./aggregate.ts |
| 3 | cost-per-head | cost-health | (未在 manifest 中) |
| 4 | ixed-variable-ratio | cost-health | (同上) |
| 5 | gross-margin | cost-health | (同上) |
| 6 | margin-vs-benchmark | profit-health | (同上) |
| 7 | profit-margin-change | profit-health | (同上) |
| 8 | 
eceivable-overdue-rate | cash-runway | ./aggregate.ts |
| 9 | 
evenue-growth | revenue-health | (同上) |

### 受影响哨兵

- **cash-runway**: 声明 2 个 compute，均缺失 (cash-runway-months, 
eceivable-overdue-rate)
- **cost-health**: 声明 3 个 compute，全部缺失 (cost-per-head, ixed-variable-ratio, gross-margin)
- **key-person-risk**: 声明 1 个 compute，缺失 (us-factor)
- **profit-health**: 声明 2 个 compute，全部缺失 (margin-vs-benchmark, profit-margin-change)
- **revenue-health**: 声明 2 个 compute，1 缺失 (
evenue-growth); 另一个 customer-concentration 存在

---

## 3. 关键异常 — 文件存在但 export 名称不匹配 (3个)

这些 compute 文件存在，但 export 的函数名称与 manifest 声明不匹配，运行时 lookup 将无法找到它们。

### 3.1 compute-power-rigidity — 函数完全不存在 (P0)

- **Manifest 声明**: compute-power-rigidity
- **文件**: power-rigidity/computes/compute-power-rigidity.ts
- **实际 export**: computeFinkelsteinPowerIndex
- **期望的 export**: computePowerRigidity (不存在)
- **严重度**: 致命。文件存在但 manifest 指向的函数名不存在。
- **修复**: 在文件中添加 export function computePowerRigidity(...) 或别名 export { computeFinkelsteinPowerIndex as computePowerRigidity }

### 3.2 compute-explore-exploit-balance — V2 后缀不匹配 (P1)

- **Manifest 声明**: compute-explore-exploit-balance
- **文件**: explore-exploit-balance/computes/compute-explore-exploit-balance.ts
- **实际 export**: computeExploreExploitBalanceV2
- **期望的 export**: computeExploreExploitBalance (不存在)
- **严重度**: 高。文件从 V1 升级到 V2 但 manifest 未更新。
- **修复**: manifest 改为 compute-explore-exploit-balance-v2，或添加不带 V2 后缀的别名 export

### 3.3 detect — manifest 名称过短 (P1)

- **Manifest 声明**: detect
- **文件**: path-dependency/computes/detect.ts
- **实际 export**: detectPathDependency
- **期望的 export**: detect (不存在)
- **严重度**: 高。manifest 使用了过于简短的名称。
- **修复**: manifest 改为 detect-path-dependency，或添加 export { detectPathDependency as detect }

---

## 4. 常规命名差异 — kebab-case vs camelCase (21个)

以下 compute 遵循标准命名约定：manifest 使用 kebab-case ID，文件 export compute+PascalCase 函数。运行时通过 kebab→camel 转换进行 lookup。这些不是 bug，但需确认运行时 lookup 逻辑正确处理了转换。

| compute 声明 (kebab) | 实际函数名 (camelCase) |
|---------------------|----------------------|
| pi-availability | computeApiAvailability |
| sset-turnover | computeAssetTurnover |
| etweenness-centrality | computeNetworkPower |
| ias | computeSelfAwareness |
| oundary | computeEOB |
| rand-premium | computeBrandPremium |
| capital-turnover | computeCapitalTurnover |
| cash-conversion-rate | computeCashConversionRate |
| competitive-intensity | computeCompetitiveIntensity |
| cornered-resource-score | computeCorneredResource |
| cost | computeTokenCost |
| counter-positioning-slm | computeCounterPositioningSlm |
| cpc | computeCPC |
| customer-churn-risk | computeCustomerChurnRisk |
| customer-concentration | computeCustomerConcentration |
| customer-loyalty | computeCustomerLoyalty |
| data-readiness-score | computeDataReadiness |
| data-silo-score | computeDataSiloScore |
| debt-equity-ratio | computeDebtEquityRatio |
| density | computeHACD |
| dynamics | computeGapDynamics |
| gross-margin-per-unit | computeUnitMargin |
| hhi-index | computeHhiIndex |
| interest-coverage | computeInterestCoverage |
| kz-index | computeKzIndex |
| levins-breadth | computeLevinsBreadth |
| lifecycle-stage | computeLifecycleStage |
| ltv-cac-ratio | computeLtvCac |
| make-or-buy-score | computeMakeOrBuyScore |
| moat-dependency-score | computeMoatDependency |
| model-consistency-score | computeModelCoherence |
| 
etwork | computeHONA |
| 
etwork-effect-score | computeNetworkEffect |
| 
iche-squeeze-index | computeNicheSqueezeIndex |
| opportunity-window-score | computeOpportunityWindowScore |
| organic-growth-pct | computeOrganicGrowthPct |
| process-power-score | computeProcessPower |
| protocol-coverage | computeProtocolCoverage |
| 
eceivable-turnover | computeReceivableTurnover |
| 
ent-dependency-index | computeRentDependencyIndex |
| 
oic-wacc-spread | computeRoicWaccSpread |
| saas-usage-score | computeSaasUsageScore |
| scale-economy-score | computeScaleEconomy |
| score | computeSevenPowers |
| shadow-it-score | computeShadowItScore |
| snapshot | computeFinancialSnapshot |
| structural-change-signal | computeStructuralChangeSignal |
| switching-cost-score | computeSwitchingCost |
| 	ime-penetration-score | computeTimePenetration |
| 	ransaction-cost-trend | computeTransactionCostTrend |
| 	rust | computeHTM |
| alue-capture-score | computeValueCaptureScore |

---

## 5. 完全正常的列表 (48个)

以下 compute 的 manifest 声明与文件 export 完全匹配（包括 compute- 前缀的一致）：

compute-adaptation-velocity, compute-agent-deployment-maturity, compute-ai-ecosystem-fit, compute-ai-investment-return, compute-channel-capacity, compute-connector-coverage, compute-human-agent-boundary, compute-incentive-alignment, compute-info-distortion, compute-knowledge-accessibility, compute-org-repairability, compute-process-ai-readiness, compute-resource-misallocation, compute-routine-diffusion, compute-routine-mutation, compute-strategy-capability-fit, compute-talent-density, counter-positioning-slm, customer-churn-risk, customer-concentration, customer-loyalty, data-silo-score, debt-equity-ratio, hhi-index, interest-coverage, kz-index, levins-breadth, lifecycle-stage, ltv-cac-ratio, make-or-buy-score, moat-dependency-score, model-consistency-score, 
etwork-effect-score, 
iche-squeeze-index, opportunity-window-score, organic-growth-pct, process-power-score, protocol-coverage, 
eceivable-turnover, 
ent-dependency-index, 
oic-wacc-spread, saas-usage-score, scale-economy-score, shadow-it-score, structural-change-signal, switching-cost-score, 	ransaction-cost-trend, alue-capture-score

---

## 6. 修复优先级

| 优先级 | 问题 | 数量 | 影响 |
|--------|------|------|------|
| **P0** | MISSING 文件 | 9 | 5 个哨兵部分或完全无法工作 |
| **P0** | compute-power-rigidity 函数不存在 | 1 | power-rigidity 哨兵无法工作 |
| **P1** | V2 后缀和 manifest 名称过短 | 2 | explore-exploit-balance / path-dependency 哨兵无法工作 |
| **P2** | 常规 kebab-camel 命名差异 | 21 | 需确认运行时 lookup 正确 |

---

*审计范围: 61 个 sentinel 目录的 manifest.json + 递归搜索全部 .ts 文件*
*生成时间: 2026-07-06*
