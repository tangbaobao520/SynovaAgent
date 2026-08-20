# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## marginHealthSentinel
| `marginHealthSentinel` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/margin-health/aggregate.ts | `20:export const marginHealthSentinel = {` |
| `marginHealthSentinel` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/margin-health/manifest.json | `59:  "exportKey": "marginHealthSentinel",` |
| `marginHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/sentinel-merge-d15a.test.ts | `82:        'margin-health': 'marginHealthSentinel',` |

## capitalHealthSentinel
| `capitalHealthSentinel` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/capital-health/aggregate.ts | `20:export const capitalHealthSentinel = {` |
| `capitalHealthSentinel` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/capital-health/manifest.json | `63:  "exportKey": "capitalHealthSentinel",` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `15:import { capitalHealthSentinel } from '../../extensions/sentinels/capital-health/aggregate';` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `50:    const findings = await capitalHealthSentinel.check(partialFinancial(), 't1');` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `64:    const findings = await capitalHealthSentinel.check(completeFinancial(), 't1');` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `72:    const findings = await capitalHealthSentinel.check(storeWith([]), 't1');` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `83:    const findings = await capitalHealthSentinel.check(broken, 't1');` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/capital-health-degraded.test.ts | `103:    const findings = await capitalHealthSentinel.check(zeroValued, 't1');` |
| `capitalHealthSentinel` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinel/sentinel-merge-d15a.test.ts | `79:        'capital-health': 'capitalHealthSentinel',` |

## computeGrossMargin
| `computeGrossMargin` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `13:import { computeGrossMargin } from './computes/compute-gross-margin';` |
| `computeGrossMargin` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `28:        computeGrossMargin(store, { teamId, traversal }),` |
| `computeGrossMargin` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/computes/compute-gross-margin.ts | `33:export async function computeGrossMargin(` |
| `computeGrossMargin` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-gross-margin.test.ts | `2:import { computeGrossMargin } from '../../../extensions/sentinels/cost-health/computes/compute-gross-margin';` |
| `computeGrossMargin` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-gross-margin.test.ts | `9:describe('computeGrossMargin', () => {` |
| `computeGrossMargin` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-gross-margin.test.ts | `15:    const r = await computeGrossMargin(store, { teamId: 't1' });` |
| `computeGrossMargin` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-gross-margin.test.ts | `22:    const r = await computeGrossMargin(store, { teamId: 't1' });` |
| `computeGrossMargin` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-gross-margin.test.ts | `32:    const r = await computeGrossMargin(store, { teamId: 't1' });` |

## computeFixedVariableRatio
| `computeFixedVariableRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `14:import { computeFixedVariableRatio } from './computes/compute-fixed-variable-ratio';` |
| `computeFixedVariableRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `29:        computeFixedVariableRatio(store, { teamId, traversal }),` |
| `computeFixedVariableRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/computes/compute-fixed-variable-ratio.ts | `20:export async function computeFixedVariableRatio(` |
| `computeFixedVariableRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `2:import { computeFixedVariableRatio } from '../../../extensions/sentinels/cost-health/computes/compute-fixed-variable-ratio';` |
| `computeFixedVariableRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `9:describe('computeFixedVariableRatio', () => {` |
| `computeFixedVariableRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `14:    const r = await computeFixedVariableRatio(store, { teamId: 't1' });` |
| `computeFixedVariableRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `21:    const r = await computeFixedVariableRatio(store, { teamId: 't1' });` |
| `computeFixedVariableRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `29:    const r = await computeFixedVariableRatio(store, { teamId: 't1' });` |

## computeCostPerHead
| `computeCostPerHead` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `15:import { computeCostPerHead } from './computes/compute-cost-per-head';` |
| `computeCostPerHead` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `57:        const costPerHeadResult = await computeCostPerHead(store, { teamId, traversal });` |
| `computeCostPerHead` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/computes/compute-cost-per-head.ts | `20:export async function computeCostPerHead(` |
| `computeCostPerHead` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `2:import { computeCostPerHead } from '../../../extensions/sentinels/cost-health/computes/compute-cost-per-head';` |
| `computeCostPerHead` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `19:describe('computeCostPerHead', () => {` |
| `computeCostPerHead` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `25:    const r = await computeCostPerHead(store, { teamId: 't1' });` |
| `computeCostPerHead` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `32:    const r = await computeCostPerHead(store, { teamId: 't1' });` |
| `computeCostPerHead` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `41:    const r = await computeCostPerHead(store, { teamId: 't1' });` |

## computeIncentiveBindGap
| `computeIncentiveBindGap` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `16:import { computeIncentiveBindGap } from './computes/compute-incentive-bind';` |
| `computeIncentiveBindGap` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/aggregate.ts | `30:        computeIncentiveBindGap(store, { teamId, traversal }),` |
| `computeIncentiveBindGap` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/cost-health/computes/compute-incentive-bind.ts | `31:export async function computeIncentiveBindGap(` |
| `computeIncentiveBindGap` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-incentive-bind.test.ts | `8:import { computeIncentiveBindGap } from '../../../extensions/sentinels/cost-health/computes/compute-incentive-bind';` |
| `computeIncentiveBindGap` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-incentive-bind.test.ts | `27:describe('computeIncentiveBindGap', () => {` |
| `computeIncentiveBindGap` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-incentive-bind.test.ts | `40:    const result = await computeIncentiveBindGap(store, { teamId: 't1', traversal });` |
| `computeIncentiveBindGap` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/cost-health/compute-incentive-bind.test.ts | `48:    const result = await computeIncentiveBindGap(store, { teamId: 't1' });` |

## computeProfitMarginChange
| `computeProfitMarginChange` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `6:import { computeProfitMarginChange } from './computes/compute-profit-margin-change';` |
| `computeProfitMarginChange` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `18:        computeProfitMarginChange(store, { teamId, traversal }),` |
| `computeProfitMarginChange` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/computes/compute-profit-margin-change.ts | `33:export async function computeProfitMarginChange(` |
| `computeProfitMarginChange` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `2:import { computeProfitMarginChange } from '../../../extensions/sentinels/profit-health/computes/compute-profit-margin-change';` |
| `computeProfitMarginChange` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `9:describe('computeProfitMarginChange', () => {` |
| `computeProfitMarginChange` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `15:    const r = await computeProfitMarginChange(store, { teamId: 't1' });` |
| `computeProfitMarginChange` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `22:    const r = await computeProfitMarginChange(store, { teamId: 't1' });` |
| `computeProfitMarginChange` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `32:    const r = await computeProfitMarginChange(store, { teamId: 't1' });` |

## computeMarginVsBenchmark
| `computeMarginVsBenchmark` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `7:import { computeMarginVsBenchmark } from './computes/compute-margin-vs-benchmark';` |
| `computeMarginVsBenchmark` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `19:        computeMarginVsBenchmark(store, { teamId, traversal }),` |
| `computeMarginVsBenchmark` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/computes/compute-margin-vs-benchmark.ts | `38:export async function computeMarginVsBenchmark(` |
| `computeMarginVsBenchmark` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `2:import { computeMarginVsBenchmark } from '../../../extensions/sentinels/profit-health/computes/compute-margin-vs-benchmark';` |
| `computeMarginVsBenchmark` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `9:describe('computeMarginVsBenchmark', () => {` |
| `computeMarginVsBenchmark` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `15:    const r = await computeMarginVsBenchmark(store, { teamId: 't1' });` |
| `computeMarginVsBenchmark` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `26:    const r = await computeMarginVsBenchmark(store, { teamId: 't1', benchmark: 0.15 });` |
| `computeMarginVsBenchmark` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `34:    const r = await computeMarginVsBenchmark(store, { teamId: 't1' });` |

## computeMetricBindDivergence
| `computeMetricBindDivergence` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `8:import { computeMetricBindDivergence } from './computes/compute-metric-bind-divergence';` |
| `computeMetricBindDivergence` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/aggregate.ts | `20:        computeMetricBindDivergence(store, { teamId, traversal }),` |
| `computeMetricBindDivergence` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/profit-health/computes/compute-metric-bind-divergence.ts | `31:export async function computeMetricBindDivergence(` |
| `computeMetricBindDivergence` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts | `8:import { computeMetricBindDivergence } from '../../../extensions/sentinels/profit-health/computes/compute-metric-bind-divergence';` |
| `computeMetricBindDivergence` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts | `27:describe('computeMetricBindDivergence', () => {` |
| `computeMetricBindDivergence` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts | `40:    const result = await computeMetricBindDivergence(store, { teamId: 't1', traversal });` |
| `computeMetricBindDivergence` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts | `48:    const result = await computeMetricBindDivergence(store, { teamId: 't1' });` |

## computeRoicWaccSpread
| `computeRoicWaccSpread` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `189:import type { computeRoicWaccSpread as _roicCheck } from '../../extensions/sentinels/_extinct/capital-efficiency/computes/roic-wacc-spread';` |
| `computeRoicWaccSpread` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `4: * 综合 computeRoicWaccSpread + computeCapitalTurnover + computeWacc 结果，` |
| `computeRoicWaccSpread` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `9:import { computeRoicWaccSpread } from './computes/roic-wacc-spread';` |
| `computeRoicWaccSpread` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `64:      const spreadResult = computeRoicWaccSpread(financialsForSpread);` |
| `computeRoicWaccSpread` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/computes/roic-wacc-spread.ts | `27:export function computeRoicWaccSpread(financials: FinancialRecord[]): RoicWaccResult {` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `2:import { computeRoicWaccSpread } from '../../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `5:describe('computeRoicWaccSpread', () => {` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `7:    expect(computeRoicWaccSpread([]).degraded).toBe(true);` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `11:    const r = computeRoicWaccSpread([` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `19:    const r = computeRoicWaccSpread([` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/roic-wacc-spread.test.ts | `2:import { computeRoicWaccSpread } from '../../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/roic-wacc-spread.test.ts | `4:describe('computeRoicWaccSpread', () => {` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/roic-wacc-spread.test.ts | `6:    expect(computeRoicWaccSpread([]).degraded).toBe(true);` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/roic-wacc-spread.test.ts | `9:    const r = computeRoicWaccSpread([{ revenue: 500, cost: 200, operatingExpenses: 100 }]);` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `2:import { computeRoicWaccSpread } from '../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `5:describe('computeRoicWaccSpread', () => {` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `7:    expect(computeRoicWaccSpread([]).degraded).toBe(true);` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `11:    const r = computeRoicWaccSpread([` |
| `computeRoicWaccSpread` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `19:    const r = computeRoicWaccSpread([` |

## computeWacc
| `computeWacc` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `212:import type { computeWacc as _waccCheck } from "../../extensions/sentinels/_extinct/capital-efficiency/computes/wacc";` |
| `computeWacc` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `4: * 综合 computeRoicWaccSpread + computeCapitalTurnover + computeWacc 结果，` |
| `computeWacc` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `11:import { computeWacc } from './computes/wacc';` |
| `computeWacc` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `57:        const waccResult = computeWacc(financials);` |
| `computeWacc` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/computes/wacc.ts | `31:export function computeWacc(` |
| `computeWacc` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/wacc.test.ts | `2:import { computeWacc } from '../../../extensions/sentinels/capital-efficiency/computes/wacc';` |
| `computeWacc` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/wacc.test.ts | `4:describe('computeWacc', () => {` |
| `computeWacc` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/wacc.test.ts | `6:    const r = computeWacc([{ equity: 5000000, totalDebt: 3000000, taxRate: 0.25 }]);` |
| `computeWacc` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/wacc.test.ts | `13:    const r = computeWacc([]);` |
| `computeWacc` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/wacc.test.ts | `18:    const r = computeWacc([{ equity: 10000000, totalDebt: 0, taxRate: 0.25 }], { riskFree: 0.05, marketReturn: 0.12, beta: 1.2 });` |

## computeCapitalTurnover
| `computeCapitalTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `194:import type { computeCapitalTurnover as _capTurnCheck } from '../../extensions/sentinels/_extinct/capital-efficiency/computes/capital-turnover';` |
| `computeCapitalTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `4: * 综合 computeRoicWaccSpread + computeCapitalTurnover + computeWacc 结果，` |
| `computeCapitalTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `10:import { computeCapitalTurnover } from './computes/capital-turnover';` |
| `computeCapitalTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `79:      const turnoverResult = computeCapitalTurnover(financials);` |
| `computeCapitalTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-efficiency/computes/capital-turnover.ts | `14:export function computeCapitalTurnover(financials: Array<{` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `3:import { computeCapitalTurnover } from '../../../extensions/sentinels/capital-efficiency/computes/capital-turnover';` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `26:describe('computeCapitalTurnover', () => {` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `28:    expect(computeCapitalTurnover([]).degraded).toBe(true);` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-efficiency.test.ts | `32:    const r = computeCapitalTurnover([` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-turnover.test.ts | `2:import { computeCapitalTurnover } from '../../../extensions/sentinels/capital-efficiency/computes/capital-turnover';` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-turnover.test.ts | `4:describe('computeCapitalTurnover', () => {` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-turnover.test.ts | `6:    expect(computeCapitalTurnover([]).degraded).toBe(true);` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency/capital-turnover.test.ts | `9:    const r = computeCapitalTurnover([{ revenue: 500, totalDebt: 100, equity: 150 }]);` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `3:import { computeCapitalTurnover } from '../../extensions/sentinels/capital-efficiency/computes/capital-turnover';` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `26:describe('computeCapitalTurnover', () => {` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `28:    expect(computeCapitalTurnover([]).degraded).toBe(true);` |
| `computeCapitalTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-efficiency.test.ts | `32:    const r = computeCapitalTurnover([` |

## computeDebtEquityRatio
| `computeDebtEquityRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `202:import type { computeDebtEquityRatio as _deCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/debt-equity-ratio";` |
| `computeDebtEquityRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `6:import { computeDebtEquityRatio } from './computes/debt-equity-ratio';` |
| `computeDebtEquityRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `32:      const de = computeDebtEquityRatio(financials);` |
| `computeDebtEquityRatio` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/computes/debt-equity-ratio.ts | `12:export function computeDebtEquityRatio(financials: Array<{` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `2:import { computeDebtEquityRatio } from '../../../extensions/sentinels/capital-structure/computes/debt-equity-ratio';` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `4:describe('computeDebtEquityRatio', () => {` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `5:  it('空degraded', () => { expect(computeDebtEquityRatio([]).degraded).toBe(true); });` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `7:    const r = computeDebtEquityRatio([{ totalDebt: 200, longTermDebt: 100, equity: 100 }]);` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `12:    const r = computeDebtEquityRatio([{ totalDebt: 300, longTermDebt: 150, equity: 200 }]);` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `2:import { computeDebtEquityRatio } from '../../../extensions/sentinels/capital-structure/computes/debt-equity-ratio';` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `4:describe('computeDebtEquityRatio', () => {` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `5:  it('空degraded', () => { expect(computeDebtEquityRatio([]).degraded).toBe(true); });` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `7:    const r = computeDebtEquityRatio([{ totalDebt: 200, longTermDebt: 100, equity: 100 }]);` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `12:    const r = computeDebtEquityRatio([{ totalDebt: 300, longTermDebt: 150, equity: 200 }]);` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `2:import { computeDebtEquityRatio } from '../../extensions/sentinels/capital-structure/computes/debt-equity-ratio';` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `4:describe('computeDebtEquityRatio', () => {` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `5:  it('空degraded', () => { expect(computeDebtEquityRatio([]).degraded).toBe(true); });` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `7:    const r = computeDebtEquityRatio([{ totalDebt: 200, longTermDebt: 100, equity: 100 }]);` |
| `computeDebtEquityRatio` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `12:    const r = computeDebtEquityRatio([{ totalDebt: 300, longTermDebt: 150, equity: 200 }]);` |

## computeInterestCoverage
| `computeInterestCoverage` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `203:import type { computeInterestCoverage as _icCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/interest-coverage";` |
| `computeInterestCoverage` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `7:import { computeInterestCoverage } from './computes/interest-coverage';` |
| `computeInterestCoverage` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `33:      const ic = computeInterestCoverage(financials);` |
| `computeInterestCoverage` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/computes/interest-coverage.ts | `11:export function computeInterestCoverage(financials: Array<{` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `3:import { computeInterestCoverage } from '../../../extensions/sentinels/capital-structure/computes/interest-coverage';` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `16:describe('computeInterestCoverage', () => {` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `17:  it('空degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-equity-ratio.test.ts | `19:    const r = computeInterestCoverage([{ operatingIncome: 100, interestExpense: 20 }]);` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `3:import { computeInterestCoverage } from '../../../extensions/sentinels/capital-structure/computes/interest-coverage';` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `16:describe('computeInterestCoverage', () => {` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `17:  it('空degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/interest-coverage.test.ts | `19:    const r = computeInterestCoverage([{ operatingIncome: 100, interestExpense: 20 }]);` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `3:import { computeInterestCoverage } from '../../extensions/sentinels/capital-structure/computes/interest-coverage';` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `16:describe('computeInterestCoverage', () => {` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `17:  it('空degraded', () => { expect(computeInterestCoverage([]).degraded).toBe(true); });` |
| `computeInterestCoverage` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure.test.ts | `19:    const r = computeInterestCoverage([{ operatingIncome: 100, interestExpense: 20 }]);` |

## computeDebtStructure
| `computeDebtStructure` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `207:import type { computeDebtStructure as _dsCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/debt-structure";` |
| `computeDebtStructure` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `8:import { computeDebtStructure } from './computes/debt-structure';` |
| `computeDebtStructure` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `40:        const ds = computeDebtStructure({ shortTermDebt, totalDebt: totalDebtAvg });` |
| `computeDebtStructure` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-structure/computes/debt-structure.ts | `15:export function computeDebtStructure(fin: {` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `2: * debt-structure.test.ts — F2 computeDebtStructure 测试` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `5:import { computeDebtStructure } from '../../../extensions/sentinels/capital-structure/computes/debt-structure';` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `7:describe('computeDebtStructure', () => {` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `9:    const r = computeDebtStructure({ shortTermDebt: 800000, totalDebt: 1000000 });` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `16:    const r = computeDebtStructure({ shortTermDebt: 600000, totalDebt: 1000000 });` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `22:    const r = computeDebtStructure({ shortTermDebt: 200000, totalDebt: 1000000 });` |
| `computeDebtStructure` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-structure/debt-structure.test.ts | `28:    const r = computeDebtStructure({ shortTermDebt: 0, totalDebt: 0 });` |

## computeAssetTurnover
| `computeAssetTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `209:import type { computeAssetTurnover as _atCheck } from "../../extensions/sentinels/_extinct/capital-turnover/computes/asset-turnover";` |
| `computeAssetTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `3:import { computeAssetTurnover } from './computes/asset-turnover';` |
| `computeAssetTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `19:      const at = computeAssetTurnover(f); const rt = computeReceivableTurnover(f); const r: SentinelFinding[] = [];` |
| `computeAssetTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/computes/asset-turnover.ts | `9:export function computeAssetTurnover(financials: Array<{ revenue: number; totalAssets: number; currentAssets: number }>): AssetTurnoverResult {` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `2:import { computeAssetTurnover } from '../../../extensions/sentinels/capital-turnover/computes/asset-turnover';` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `4:describe('computeAssetTurnover', () => {` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `5:  it('空degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `6:  it('正常', () => { const r = computeAssetTurnover([{revenue:500,totalAssets:400,currentAssets:200}]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `2:import { computeAssetTurnover } from '../../../extensions/sentinels/capital-turnover/computes/asset-turnover';` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `4:describe('computeAssetTurnover', () => {` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `5:  it('空degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `6:  it('正常', () => { const r = computeAssetTurnover([{revenue:500,totalAssets:400,currentAssets:200}]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `2:import { computeAssetTurnover } from '../../extensions/sentinels/capital-turnover/computes/asset-turnover';` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `4:describe('computeAssetTurnover', () => {` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `5:  it('空degraded', () => { expect(computeAssetTurnover([]).degraded).toBe(true); });` |
| `computeAssetTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `6:  it('正常', () => { const r = computeAssetTurnover([{revenue:500,totalAssets:400,currentAssets:200}]); expect(r.totalTurnover).toBe(1.25); expect(r.degraded).toBe(false); });` |

## computeReceivableTurnover
| `computeReceivableTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `4:import { computeReceivableTurnover } from './computes/receivable-turnover';` |
| `computeReceivableTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `19:      const at = computeAssetTurnover(f); const rt = computeReceivableTurnover(f); const r: SentinelFinding[] = [];` |
| `computeReceivableTurnover` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/computes/receivable-turnover.ts | `12:export function computeReceivableTurnover(financials: Array<{ revenue: number; accountsReceivable: number }>): ReceivableTurnoverResult {` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `3:import { computeReceivableTurnover } from '../../../extensions/sentinels/capital-turnover/computes/receivable-turnover';` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `8:describe('computeReceivableTurnover', () => {` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `9:  it('空degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/asset-turnover.test.ts | `10:  it('天数', () => { const r = computeReceivableTurnover([{revenue:365,accountsReceivable:100}]); expect(r.daysOutstanding).toBe(100); });` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `3:import { computeReceivableTurnover } from '../../../extensions/sentinels/capital-turnover/computes/receivable-turnover';` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `8:describe('computeReceivableTurnover', () => {` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `9:  it('空degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/receivable-turnover.test.ts | `10:  it('天数', () => { const r = computeReceivableTurnover([{revenue:365,accountsReceivable:100}]); expect(r.daysOutstanding).toBe(100); });` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `3:import { computeReceivableTurnover } from '../../extensions/sentinels/capital-turnover/computes/receivable-turnover';` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `8:describe('computeReceivableTurnover', () => {` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `9:  it('空degraded', () => { expect(computeReceivableTurnover([]).degraded).toBe(true); });` |
| `computeReceivableTurnover` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover.test.ts | `10:  it('天数', () => { const r = computeReceivableTurnover([{revenue:365,accountsReceivable:100}]); expect(r.daysOutstanding).toBe(100); });` |

## computeCashConversionCycle
| `computeCashConversionCycle` | D | /novis-backup-20260526/Novis/synova-wt-d358/src/sentinel/types.ts | `210:import type { computeCashConversionCycle as _cccCheck } from "../../extensions/sentinels/_extinct/capital-turnover/computes/cash-conversion-cycle";` |
| `computeCashConversionCycle` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `5:import { computeCashConversionCycle } from './computes/cash-conversion-cycle';` |
| `computeCashConversionCycle` | D | /novis-backup-20260526/Novis/synova-wt-d358/extensions/sentinels/_extinct/capital-turnover/computes/cash-conversion-cycle.ts | `25:export function computeCashConversionCycle(fin: {` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/e2e/p0-wane-baby.test.ts | `17:import { computeCashConversionCycle } from '../../extensions/sentinels/capital-turnover/computes/cash-conversion-cycle';` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/e2e/p0-wane-baby.test.ts | `58:    const r = computeCashConversionCycle({` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/cash-conversion-cycle.test.ts | `2:import { computeCashConversionCycle } from '../../../extensions/sentinels/capital-turnover/computes/cash-conversion-cycle';` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/cash-conversion-cycle.test.ts | `4:describe('computeCashConversionCycle', () => {` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/cash-conversion-cycle.test.ts | `6:    const r = computeCashConversionCycle({ cogs: 1000000, inventory: 200000, accountsReceivable: 150000, accountsPayable: 100000, revenue: 2000000 });` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/cash-conversion-cycle.test.ts | `15:    const r = computeCashConversionCycle({ cogs: 0, inventory: 0, accountsReceivable: 0, accountsPayable: 0, revenue: 0 });` |
| `computeCashConversionCycle` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d358/tests/sentinels/capital-turnover/cash-conversion-cycle.test.ts | `20:    const r = computeCashConversionCycle({ cogs: 100000, inventory: 80000, accountsReceivable: 70000, accountsPayable: 10000, revenue: 200000 });` |
