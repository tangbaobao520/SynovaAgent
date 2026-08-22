# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## defaultDiagnosisHandler
| `defaultDiagnosisHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/loop-handlers.ts | `31:export async function defaultDiagnosisHandler(scale: ScaleName): Promise<LoopExecutionResult> {` |
| `defaultDiagnosisHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `20:import { defaultDiagnosisHandler, defaultNavigationHandler, defaultEvolutionHandler, defaultOverflowHandler } from './loop-handlers';` |
| `defaultDiagnosisHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `278:      return defaultDiagnosisHandler;` |
| `defaultDiagnosisHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `290:    return defaultDiagnosisHandler;` |

## defaultNavigationHandler
| `defaultNavigationHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/loop-handlers.ts | `49:export async function defaultNavigationHandler(scale: ScaleName): Promise<LoopExecutionResult> {` |
| `defaultNavigationHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `20:import { defaultDiagnosisHandler, defaultNavigationHandler, defaultEvolutionHandler, defaultOverflowHandler } from './loop-handlers';` |
| `defaultNavigationHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `281:      return defaultNavigationHandler;` |

## defaultOverflowHandler
| `defaultOverflowHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/loop-handlers.ts | `138:export async function defaultOverflowHandler(scale: ScaleName): Promise<LoopExecutionResult> {` |
| `defaultOverflowHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `20:import { defaultDiagnosisHandler, defaultNavigationHandler, defaultEvolutionHandler, defaultOverflowHandler } from './loop-handlers';` |
| `defaultOverflowHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `287:      return defaultOverflowHandler;` |

## defaultEvolutionHandler
| `defaultEvolutionHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/loop-handlers.ts | `4: * D333 起: defaultEvolutionHandler 已真实化 (N13 反馈→规则闭环接线)。` |
| `defaultEvolutionHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/loop-handlers.ts | `79:export async function defaultEvolutionHandler(scale: ScaleName): Promise<LoopExecutionResult> {` |
| `defaultEvolutionHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `20:import { defaultDiagnosisHandler, defaultNavigationHandler, defaultEvolutionHandler, defaultOverflowHandler } from './loop-handlers';` |
| `defaultEvolutionHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `284:      return defaultEvolutionHandler;` |
| `defaultEvolutionHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/loops/middle-evolution-engine.ts | `60: * （src/agent/loop-handlers.ts defaultEvolutionHandler → applyEvolutionActions），` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `7: * red 基准 (修复前): defaultEvolutionHandler 恒 success:true、零引擎调用、无真实计数；` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `28:import { defaultEvolutionHandler } from '../../src/agent/loop-handlers';` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `72:describe('D333 — defaultEvolutionHandler 真实化 (N13 接线)', () => {` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `79:    const result = await defaultEvolutionHandler('fast');` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `93:    const result = await defaultEvolutionHandler('fast');` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `107:    const result = await defaultEvolutionHandler('fast');` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `118:    const result = await defaultEvolutionHandler('fast');` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `132:    const result = await defaultEvolutionHandler('fast');` |
| `defaultEvolutionHandler` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/loop-handlers.test.ts | `146:    const result = await defaultEvolutionHandler('fast');` |

## selectHandler
| `selectHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `181:      const handler = this.selectHandler(loopId);` |
| `selectHandler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/main-agent.ts | `276:  private selectHandler(loopId: string): (scale: ScaleName) => Promise<{ success: boolean; output?: string; error?: string; degraded: boolean }> {` |

## lightweightReDiagnosis
| `lightweightReDiagnosis` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/lightweight-diagnosis.ts | `337:export async function lightweightReDiagnosis(` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/e2e-navigation-loop.integration.test.ts | `139:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/e2e-navigation-loop.integration.test.ts | `140:    const rediagnosisResult = await lightweightReDiagnosis(` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `39:describe('D75: lightweightReDiagnosis — 主流程', () => {` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `41:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `43:    const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual' }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `51:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `58:    const result = await lightweightReDiagnosis({` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `69:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `78:    const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'p0_alert' }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `85:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `89:    const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual' }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `97:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `101:    const result = await lightweightReDiagnosis({ goalId: 'nonexistent', triggeredBy: 'manual' }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `108:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `110:    const result = await lightweightReDiagnosis({` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `121:  it('inferDimensionFromDept 映射正确（通过 lightweightReDiagnosis 验证）', async () => {` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `122:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `124:    let result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 },` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `129:    result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 },` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `134:    result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 },` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `139:  it('selectExpertForDimension 映射正确（通过 lightweightReDiagnosis 验证）', async () => {` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `140:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `145:      const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 },` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `151:  it('selectRelevantCausalEdges 返回 3-5 条边（通过 lightweightReDiagnosis 验证）', async () => {` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `152:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `158:      const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `164:  it('ownerDeptId 大小写不敏感（通过 lightweightReDiagnosis 验证）', async () => {` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `165:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `166:    const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'manual', timeoutMs: 50 },` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `255:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `261:    const result = await lightweightReDiagnosis({ goalId: 'goal-1', triggeredBy: 'p0_alert' }, deps);` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/goal-lifecycle.integration.test.ts | `131:    const { lightweightReDiagnosis } = await import('../../src/growth/lightweight-diagnosis');` |
| `lightweightReDiagnosis` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/goal-lifecycle.integration.test.ts | `132:    const result = await lightweightReDiagnosis(` |

## computeOverflow
| `computeOverflow` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-compute.ts | `78:export function computeOverflow(cycle: CycleConfig, data: EnterpriseTimeSeries): OverflowSnapshot {` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/contract-store.test.ts | `21:    contractId: 'ct-1', type: 'export_function', name: 'computeOverflow',` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/contract-store.test.ts | `22:    signature: 'export function computeOverflow()', confidence: 0.9,` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `5:import { computeOverflow } from '../../src/cycles/overflow-compute';` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `42:describe('computeOverflow', () => {` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `45:    const result = computeOverflow(BASE_CYCLE, data);` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `54:    const result = computeOverflow(BASE_CYCLE, data);` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `61:    const result = computeOverflow(BASE_CYCLE, data);` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `76:    const result = computeOverflow(cycle, data);` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `82:    const result = computeOverflow(BASE_CYCLE, data);` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `87:describe('computeOverflow — 边界', () => {` |
| `computeOverflow` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-compute.test.ts | `94:    const result = computeOverflow(BASE_CYCLE, data);` |

## writeOverflowSnapshot
| `writeOverflowSnapshot` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `58:export function writeOverflowSnapshot(` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `37:  describe('writeOverflowSnapshot', () => {` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `39:      const { writeOverflowSnapshot } = await import('../../src/cycles/overflow-graph-bridge');` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `47:      writeOverflowSnapshot('enterprise-1', 'test-cycle', snapshot, store);` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `54:      const { writeOverflowSnapshot, getCycleSnapshots } = await import('../../src/cycles/overflow-graph-bridge');` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `62:      writeOverflowSnapshot('e1', 'c1', s, store);` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `78:      const { writeOverflowSnapshot, getLatestSnapshot } = await import('../../src/cycles/overflow-graph-bridge');` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `87:      writeOverflowSnapshot('e1', 'c1', s1, store);` |
| `writeOverflowSnapshot` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `88:      writeOverflowSnapshot('e1', 'c1', s2, store);` |

## getOverflowHeatmap
| `getOverflowHeatmap` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `146:export function getOverflowHeatmap(` |

## getCycleSnapshots
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cross-scale-validator.ts | `22:import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/investment-advisor.ts | `15:import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/investment-advisor.ts | `90:  const snapshots = getCycleSnapshots('default', cycleId, store);` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/investment-advisor.ts | `126:    const cSnapshots = getCycleSnapshots('default', c.cycleId, store);` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-dashboard.ts | `19:import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-dashboard.ts | `107:    const snapshots = getCycleSnapshots(enterpriseId, cycle.cycleId, store);` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `87:export function getCycleSnapshots(` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `134:  const snapshots = getCycleSnapshots(enterpriseId, cycleId, store, { limit: 1 });` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `14:import { getCycleSnapshots, getLatestSnapshot } from '../cycles/overflow-graph-bridge';` |
| `getCycleSnapshots` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `90:    const snapshots = getCycleSnapshots(enterpriseId, req.params.cycleId, graphStore, { limit });` |
| `getCycleSnapshots` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `52:  describe('getCycleSnapshots', () => {` |
| `getCycleSnapshots` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `54:      const { writeOverflowSnapshot, getCycleSnapshots } = await import('../../src/cycles/overflow-graph-bridge');` |
| `getCycleSnapshots` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `63:      const snapshots = getCycleSnapshots('e1', 'c1', store);` |
| `getCycleSnapshots` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `69:      const { getCycleSnapshots } = await import('../../src/cycles/overflow-graph-bridge');` |
| `getCycleSnapshots` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `71:      const snapshots = getCycleSnapshots('e1', 'nonexistent', store);` |

## registerLoadedCycles
| `registerLoadedCycles` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cycle-loader.ts | `151:export async function registerLoadedCycles(contextLoader?: ContextLoaderLike): Promise<{ registered: number; errors: string[] }> {` |
| `registerLoadedCycles` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cycle-types.ts | `8: * @wire-target — D83 (Bootstrap) 消费 loadCycles/registerLoadedCycles` |
| `registerLoadedCycles` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/index.ts | `4:export { loadCycles, clearCycleCache, registerLoadedCycles } from './cycle-loader';` |
| `registerLoadedCycles` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `96:  describe('registerLoadedCycles', () => {` |
| `registerLoadedCycles` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `98:      const { loadCycles, clearCycleCache, registerLoadedCycles } = await import('../../src/cycles/cycle-loader');` |
| `registerLoadedCycles` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `103:      await registerLoadedCycles();` |
| `registerLoadedCycles` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `120:      const { loadCycles, clearCycleCache, registerLoadedCycles } = await import('../../src/cycles/cycle-loader');` |
| `registerLoadedCycles` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `125:      await registerLoadedCycles();` |

## cycleRegistry
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cycle-loader.ts | `158:      const { cycleRegistry } = await import('./cycle-registry');` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cycle-loader.ts | `159:      cycleRegistry.register(cycle);` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/cycle-registry.ts | `46:export const cycleRegistry = new CycleRegistry();` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/index.ts | `5:export { cycleRegistry, CycleRegistry } from './cycle-registry';` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `11:import { cycleRegistry } from '../cycles/cycle-registry';` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `37:    const dashboard = generateOverflowDashboard(req.params.enterpriseId, cycleRegistry, graphStore);` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `62:    const cycle = cycleRegistry.get(cycleId);` |
| `cycleRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/overflow.ts | `67:    const allCycles = cycleRegistry.list();` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `99:      const { cycleRegistry } = await import('../../src/cycles/cycle-registry');` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `101:      cycleRegistry.clear();` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `104:      expect(cycleRegistry.list().length).toBeGreaterThanOrEqual(4);` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `105:      expect(cycleRegistry.get('customer-cycle')).toBeDefined();` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `121:      const { cycleRegistry } = await import('../../src/cycles/cycle-registry');` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `123:      cycleRegistry.clear();` |
| `cycleRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cycle-loader.test.ts | `126:      const retail = cycleRegistry.listByIndustry('retail-ecommerce');` |

## getGlobalScheduler
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/builtin-tools.ts | `208:        const { getGlobalScheduler } = await import('../cron/scheduler');` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/builtin-tools.ts | `210:        const scheduler = getGlobalScheduler(getDatabase());` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/builtin-tools.ts | `238:        const { getGlobalScheduler } = await import('../cron/scheduler');` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/builtin-tools.ts | `240:        const scheduler = getGlobalScheduler(getDatabase());` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/synova-agent.ts | `19:import { CronScheduler, getGlobalScheduler, destroyGlobalScheduler } from '../cron/scheduler';` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/synova-agent.ts | `54:    this.scheduler = getGlobalScheduler(this.db);` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cron/scheduler.ts | `406:export function getGlobalScheduler(db?: import('better-sqlite3').Database): CronScheduler {` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cron/scheduler.ts | `408:  if (!db) throw new Error('首次调用 getGlobalScheduler 必须提供 database 实例');` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/deploy/bootstrap.ts | `518:      const { getGlobalScheduler } = await import('../cron/scheduler');` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/deploy/bootstrap.ts | `520:      const scheduler = db ? getGlobalScheduler(db) : undefined;` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/deploy/bootstrap.ts | `1068:          const { getGlobalScheduler } = await import('../cron/scheduler');` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/deploy/bootstrap.ts | `1069:          const scheduler = getGlobalScheduler(db);` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/chat.tsx | `15:import { getGlobalScheduler } from '../cron/scheduler';` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/chat.tsx | `206:    getGlobalScheduler,` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/chat.tsx | `229:    const scheduler = getGlobalScheduler(db);` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/lib/commands.ts | `37:  getGlobalScheduler: (db: Database.Database) => { stop: () => void };` |
| `getGlobalScheduler` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/lib/commands.ts | `50:    const scheduler = ctx.getGlobalScheduler(ctx.db);` |

## getExpertRegistry
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/expert-file-loader.ts | `14:import { getExpertRegistry } from '../l3/expert-registry';` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/expert-file-loader.ts | `171:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-injector.ts | `23:import { getExpertRegistry } from '../l3/expert-registry';` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-injector.ts | `67:    return getExpertRegistry().listTypes().includes(scope.replace('expert:', ''));` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l2/expert-router.ts | `53:  const { getExpertRegistry } = await import('../l3/expert-registry');` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l2/expert-router.ts | `56:  return getExpertRegistry().listTypes().filter(t => !bg.has(t));` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `23:import { getExpertRegistry } from './expert-registry';` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `307:        const prompt = getExpertRegistry().getPrompt(type) \|\| '你是组织诊断专家。';` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `520:    const { getExpertRegistry } = await import('./expert-registry');` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `522:    const allTypes = getExpertRegistry().listTypes();` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-registry.ts | `61:export function getExpertRegistry(inject?: ExpertRegistry): ExpertRegistry {` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/index.ts | `9:export { ExpertRegistry, getExpertRegistry } from './expert-registry';` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/mcp/skill-installer.ts | `126:        const { getExpertRegistry } = await import('../l3/expert-registry');` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/mcp/skill-installer.ts | `127:        getExpertRegistry().register(manifest.expertType, manifest.expertPrompt);` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/orchestrator/subagent-coordinator.ts | `89:    const { getExpertRegistry } = await import('../l3/expert-registry');` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/orchestrator/subagent-coordinator.ts | `92:    const expertTypes = getExpertRegistry().listTypes().filter(t => !BACKGROUND_EXPERTS.has(t));` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/runner.ts | `392:    const { getExpertRegistry } = await import('../l3/expert-registry');` |
| `getExpertRegistry` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/runner.ts | `393:    const VALID_EXPERTS = new Set(getExpertRegistry().listTypes());` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.integration.test.ts | `10:import { getExpertRegistry } from '../../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.integration.test.ts | `54:    const prompt = getExpertRegistry().getPrompt('strategy');` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.integration.test.ts | `65:    const prompt = getExpertRegistry().getPrompt('strategy')!;` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.integration.test.ts | `77:      const prompt = getExpertRegistry().getPrompt(name);` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.test.ts | `6:import { getExpertRegistry } from '../../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.test.ts | `27:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.test.ts | `48:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.test.ts | `81:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/expert-file-loader.test.ts | `135:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/expert-registry.test.ts | `10:import { getExpertRegistry, ExpertRegistry } from '../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/expert-registry.test.ts | `17:    registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/e2e-autonomy.integration.test.ts | `14:import { getExpertRegistry } from '../../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/e2e-autonomy.integration.test.ts | `89:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/l3-wiring.test.ts | `19:import { getExpertRegistry } from '../../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/l3-wiring.test.ts | `111:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/module-subagent.test.ts | `10:import { getExpertRegistry } from '../../src/l3/expert-registry';` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/module-subagent.test.ts | `104:    const registry = getExpertRegistry();` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/phase1-diagnosis-wiring.test.ts | `1:import { getExpertRegistry } from "../../src/l3/expert-registry";` |
| `getExpertRegistry` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/phase1-diagnosis-wiring.test.ts | `131:    const registry = getExpertRegistry();` |

## queryNodes
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/adapters/sqlite-graph-store.ts | `12: *   @output — GraphStore 接口 { createNode, createEdge, queryNodes, queryEdges,` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/adapters/sqlite-graph-store.ts | `191:  queryNodes(` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/diagnosis-launcher.ts | `143:      if (graphStore && typeof graphStore.queryNodes === 'function') {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/post-diagnosis-processor.ts | `22:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/sentinel-service.ts | `197:    if (typeof rawDb === 'object' && rawDb !== null && !('queryNodes' in rawDb)) {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `8: * Upsert 策略: queryNodes({ name, platform }) 查找已有节点 → updateNode / createNode。` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `20:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `57:    const existing = store.queryNodes(NodeType.RESOURCE_AGENT, {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `94:    const nodes = store.queryNodes(SNAPSHOT_NODE_TYPE, {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/cycles/overflow-graph-bridge.ts | `152:    const allNodes = store.queryNodes(SNAPSHOT_NODE_TYPE, {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `40:  private store: { createNode(type: string, props: Record<string, unknown>, graph: string): string; getNode(id: string, graph: string): unknown \| null; updateNode(id: string, props: Record<string, unknown>, graph: string): void; queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> } \| null = null;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `138:      const nodes = this.store.queryNodes('ACTION', { signalId } as Record<string, unknown>, 'growth');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `152:      const nodes = this.store.queryNodes('ACTION', {} as Record<string, unknown>, 'growth');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `168:      const nodes = this.store.queryNodes('ACTION', {} as Record<string, unknown>, 'growth');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-conflict-detector.ts | `125:    const allGoals = store.queryNodes('GOAL', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `4: * 基于 GraphStore 的 GOAL 类型节点存储，复用 createNode/queryNodes/updateNode/getNode。` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `153:    const nodes = store.queryNodes('GOAL', { ownerDeptId: deptId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `167:    const nodes = store.queryNodes('GOAL', { orgId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-types.ts | `187:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/proposal-store.ts | `139:    const nodes = store.queryNodes('PROPOSAL', { department: deptId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/proposal-store.ts | `153:    const nodes = store.queryNodes('PROPOSAL', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/proposal-store.ts | `301:    const nodes = store.queryNodes('PROPOSAL', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `46:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `123:      const results = this.store.queryNodes(NODE_TYPE, { email }, USER_GRAPH);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `157:      const results = this.store.queryNodes(NODE_TYPE, { phone }, USER_GRAPH);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `172:      const results = this.store.queryNodes(NODE_TYPE, { wechatId }, USER_GRAPH);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `240:      return this.store.queryNodes(NODE_TYPE, {}, USER_GRAPH).length;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `254:      const results = this.store.queryNodes(NODE_TYPE, { orgId }, USER_GRAPH);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/workspace-builder.ts | `42:    queryNodes(` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/workspace-builder.ts | `90: *   1. 部门基本信息 — GraphStore.queryNodes('resource/team')` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/workspace-builder.ts | `112:    const teams = deps.graphStore.queryNodes('resource/team', { name: deptId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/workspace-builder.ts | `118:      const teamsById = deps.graphStore.queryNodes('resource/team', undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/workspace-types.ts | `126: * 数据来源: GraphStore.queryNodes('DIAGNOSIS_REPORT') 或 report-graph-adapter。` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/ingest/data-pipeline-monitor.ts | `5: * 封装 D263 queryNodesCreatedAfter() 为 PipelineHealth 接口。` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/ingest/data-pipeline-monitor.ts | `12:import { queryNodesCreatedAfter } from '../l4/diagnosis-graph-query';` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/ingest/data-pipeline-monitor.ts | `33:  const count = queryNodesCreatedAfter(store, graph, days);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/briefing-generator.ts | `35:    queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/briefing-generator.ts | `39:  constructor(store?: { queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>; queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{ from: string; to: string; type: string; props: Record<string, unknown> }> }) {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/briefing-generator.ts | `62:      const goals = this.graphStore.queryNodes('Goal', { status: 'active' }, orgId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/briefing-generator.ts | `73:      const risks = this.graphStore.queryNodes('Risk', { status: 'active' }, orgId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/briefing-generator.ts | `85:      const processes = this.graphStore.queryNodes('Process', undefined, orgId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `97:  const clientNodes = store.queryNodes('Client', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `111:  const goalNodes = store.queryNodes('Goal', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `125:  const processNodes = store.queryNodes('Process', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `149:  const financialNodes = store.queryNodes('Financial', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `169:  const capabilityNodes = store.queryNodes('Capability', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `170:  const toolNodes = store.queryNodes('Tool', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/business-model-canvas.ts | `183:  const teamNodes = store.queryNodes('Team', {}, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `142:  private graphStoreForFirewall: { queryNodes: (type: string, filters?: Record<string, unknown>, graph?: string) => Array<{ id: string }> } \| null = null;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/expert-dispatcher.ts | `164:    graphStore: { queryNodes: (type: string, filters?: Record<string, unknown>, graph?: string) => Array<{ id: string }> },` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/key-person-risk.ts | `19:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/key-person-risk.ts | `71:    const nodes = store.queryNodes('Person', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `245:            const rawNodes = graphStore.queryNodes(resolvedType as unknown as typeof NodeType.RESOURCE_PERSON, undefined, orgId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/quality-firewall.ts | `17:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/quality-firewall.ts | `54:      const found = this.store.queryNodes('Evidence', { id: ref }, this.graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/synova-diagnosis-engine-impl.ts | `258:            const store = this.graphStore as { queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> };` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/community-reports.ts | `18:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/community-reports.ts | `123:        const found = store.queryNodes(ntype, undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/data-exporter.ts | `160:          const nodes = this.graphStore.queryNodes(type, {}, undefined);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/data-purger.ts | `411:        const nodes = this.graphStore.queryNodes(type, {}, undefined);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/decision-capture.ts | `28:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/decision-capture.ts | `37:    const node = store.queryNodes(NodeType.OUTCOME_RISK, { id: decision.nodeId }, graph)` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/decision-capture.ts | `38:      .concat(store.queryNodes(NodeType.ACTIVITY_GOVERNANCE /* ONTOLOGY-MIGRATION: NodeType.ACTIVITY_GOVERNANCE has no direct match. Using activity/governance (strategic alignment). */, { id: decision.nodeId }, graph))` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/decision-capture.ts | `39:      .concat(store.queryNodes(NodeType.OUTCOME_FINANCIAL /* ONTOLOGY-MIGRATION: NodeType.OUTCOME_FINANCIAL -> outcome/financial or resource/money? Context-dependent. */, { id: decision.nodeId }, graph));` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `17:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `55:  const fromNodes = store.queryNodes(fromType, undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `56:  const toNodes = store.queryNodes(toType, undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `96:        const neighbors = store.queryNodes('', undefined, graph)` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `107:  const rootNodes = store.queryNodes('', undefined, graph)` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `139:  const nodes = store.queryNodes('', undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `157:  const nodes = store.queryNodes('', undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `186:  const allNodes = store.queryNodes('', undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `227:// ═══ 6. queryNodesCreatedAfter ═══` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `229:export function queryNodesCreatedAfter(` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/diagnosis-graph-query.ts | `235:  const nodes = store.queryNodes('', undefined, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/entity-resolver.ts | `23:  queryNodes(type: string): Array<{id:string, type:string, props:Record<string,unknown>}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/entity-resolver.ts | `51:    const nodes = store.queryNodes(type).filter(n => n.props);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `33:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `94:      const existing = store.queryNodes(type, { standardKey: standardKey as string }, g);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `177:          const persons = store.queryNodes(NodeType.RESOURCE_PERSON, { name: p.roleId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `269:          const teams = store.queryNodes(NodeType.RESOURCE_TEAM, { name: proc.teamId }, graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-traversal.ts | `14:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-traversal.ts | `139:      const nodes = store.queryNodes(resourcePoolType, undefined);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/report-graph-adapter.ts | `37:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/report-graph-adapter.ts | `66:        const nodes = this.store.queryNodes(type, undefined, this.graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/report-graph-adapter.ts | `84:      const riskNodes = this.store.queryNodes(NodeType.OUTCOME_RISK, undefined, this.graph);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/orchestrator/subagent-coordinator.ts | `73:  enableExpertAutonomy(queryApi: QueryAPI, graphStore: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> }): this {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/chat.ts | `35:    const store = new SqliteGraphStore(db) as unknown as { queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, props:Record<string,unknown>}> };` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/chat.ts | `36:    const summaries = store.queryNodes('Goal', { goalType: 'mission' }, 'default')` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/data-lifecycle.ts | `23:  if (!gs \|\| typeof (gs as Record<string, unknown>).queryNodes !== 'function') {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/diagnosis-upload-v2.ts | `885:      const persons = graphStore.queryNodes('Person', undefined, teamId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/diagnosis-upload-v2.ts | `886:      const teams = graphStore.queryNodes('Team', undefined, teamId);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/diagnosis-upload-v2.ts | `953:    queryNodes(type: string, _f?: any, graph?: string): any[] { return ((graph ? nodes.get(graph) : [...nodes.values()].flat()) \|\| []).filter((n: any) => n.type === type); },` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/ontology.ts | `87:    for (const t of types) nodes.push(...store.queryNodes(t as unknown as Parameters<typeof store.queryNodes>[0], undefined, orgId as string));` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/ontology.ts | `150:      const found = store.queryNodes(t as unknown as Parameters<typeof store.queryNodes>[0], undefined, orgId as string);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/ontology.ts | `182:      nodes: store.queryNodes('', undefined, g).length,` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/workspace-data.ts | `37:      queryNodes: () => [],` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/runner.ts | `887:      // V4.2.9: 构造上下文 — 包装 raw SQLite 为 GraphStore 供哨兵 queryNodes()` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/runner.ts | `889:      if (typeof this.db === 'object' && this.db !== null && 'queryNodes' in this.db) {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/sentinel-loader.ts | `205:            // GraphStore 接口 check: 确保 store 有 queryNodes 方法` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/sentinel-loader.ts | `206:            if (typeof (store as { queryNodes?: unknown }).queryNodes === 'function') {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/sentinel/sentinel-runner.ts | `21:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/store/migrations/001-graph-nodes-props.ts | `5: * 当前代码期望 props 列 → queryNodes SELECT 报 no such column 被 catch 静默吞掉，` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/chat.tsx | `43:      queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/chat.tsx | `45:    const goals = store.queryNodes('Goal', { status: 'active' }, 'default');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/tui-v2/lib/sidebar-aggregator.ts | `7: *   goals:     BriefingGenerator → GraphStore.queryNodes('Goal')` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/agent-deployment-maturity/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/agent-deployment-maturity/aggregate.ts | `13:      const agents = s.queryNodes("Agent",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/agent-deployment-maturity/aggregate.ts | `14:      const tools = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/ai-ecosystem-fit/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/ai-ecosystem-fit/aggregate.ts | `13:      const tools = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/ai-investment-return/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/ai-investment-return/aggregate.ts | `13:      const tools = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/api-coverage/aggregate.ts | `16:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/api-coverage/aggregate.ts | `31:      const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/business-model-coherence/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/business-model-coherence/aggregate.ts | `15:      if (!usedTraversal) { allNodes = (store.queryNodes('Event', { teamId }) \|\| []).concat(store.queryNodes('Tool', { teamId })).concat(store.queryNodes('Client', { teamId })).concat(store.queryNodes('Person', { teamId })).concat(store.queryNodes('Financial', { teamId })); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/capital-health/aggregate.ts | `92:      const finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/cash-runway/computes/compute-cash-runway-months.ts | `60:      const nodes = store.queryNodes('Financial');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate.ts | `7: * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务节点` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate.ts | `46:      const nodes = store.queryNodes('Financial');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/channel-capacity/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/channel-capacity/aggregate.ts | `26:      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); teamNodes = store.queryNodes('Team', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/competitive-moat/aggregate.ts | `15:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/competitive-position/aggregate.ts | `15:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/customer-demand-shift/aggregate.ts | `16:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/customer-demand-shift/aggregate.ts | `31:      const clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `17:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `32:      const allToolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `33:      const allProcessNodes = store.queryNodes('Process', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `34:      const allDocNodes = store.queryNodes('Document', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `73:      const sysToolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/data-health/aggregate.ts | `74:      const sysProcessNodes = store.queryNodes('Process', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/environment-rent-dependency/aggregate.ts | `11:interface GraphStoreReader { queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/environment-rent-dependency/aggregate.ts | `21:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/explore-exploit-balance/aggregate.ts | `6:interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/explore-exploit-balance/aggregate.ts | `14:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/explore-exploit-balance/aggregate.ts | `15:      const docNodes = store.queryNodes('Document', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/explore-exploit-balance/aggregate.ts | `16:      const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/financing-constraint/aggregate.ts | `12:interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/financing-constraint/aggregate.ts | `22:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/growth-quality/aggregate.ts | `11:interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/growth-quality/aggregate.ts | `21:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/human-agent-boundary/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/human-agent-boundary/aggregate.ts | `13:      const tools = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/human-agent-boundary/aggregate.ts | `14:      const processes = s.queryNodes("Process",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/incentive-alignment/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/incentive-alignment/aggregate.ts | `24:      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/info-distortion/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/info-distortion/aggregate.ts | `25:      if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/internal-transaction-cost/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/internal-transaction-cost/aggregate.ts | `17:      if (!usedTraversal) { fin = store.queryNodes('Financial', { teamId }); teams = store.queryNodes('Team', { teamId }); events = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/key-person-risk/aggregate.ts | `14:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/knowledge-accessibility/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/knowledge-accessibility/aggregate.ts | `25:      if (!usedTraversal) { docNodes = store.queryNodes('Document', { teamId }); personNodes = store.queryNodes('Person', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/make-or-buy/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/make-or-buy/aggregate.ts | `13:      const personNodes = store.queryNodes('Person', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/margin-health/aggregate.ts | `62:      const finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/margin-health/aggregate.ts | `159:      const personNodes = store.queryNodes('Person', { teamId })` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/moat-dependency/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/moat-dependency/aggregate.ts | `13:      const finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/moat-dependency/aggregate.ts | `14:      const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/moat-dependency/aggregate.ts | `15:      const clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/network-power/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/network-power/aggregate.ts | `17:      const nodes = [...store.queryNodes('Person', { teamId }), ...store.queryNodes('Agent', { teamId }), ...store.queryNodes('Client', { teamId }), ...store.queryNodes('Agent', { teamId })];` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/niche-breadth/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/niche-breadth/aggregate.ts | `13:      const clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/niche-breadth/aggregate.ts | `14:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/niche-squeeze/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/niche-squeeze/aggregate.ts | `13:      const nodes = [...store.queryNodes('Client', { teamId }), ...store.queryNodes('Agent', { teamId })];` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/opportunity-window/aggregate.ts | `12:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/opportunity-window/aggregate.ts | `26:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/opportunity-window/aggregate.ts | `27:      const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/org-repairability/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/org-repairability/aggregate.ts | `23:      if (!usedTraversal) { eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/path-dependency/computes/detect.ts | `15: *     输入: store — 同步图接口（queryNodes/queryEdges，graph-traversal.ts L13-15 契约）` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/path-dependency/computes/detect.ts | `46: * @param _traversal 图遍历实例（预留，当前算法直接使用 queryNodes/queryEdges）` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/path-dependency/computes/detect.ts | `55:    const nodes = store.queryNodes('', undefined, undefined);` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/power-rigidity/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/power-rigidity/aggregate.ts | `27:    if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/process-ai-readiness/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/process-ai-readiness/aggregate.ts | `13:      const tools = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/process-ai-readiness/aggregate.ts | `14:      const processes = s.queryNodes("Process",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/resource-misallocation/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/resource-misallocation/aggregate.ts | `22:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/resource-misallocation/aggregate.ts | `23:      const personNodes = store.queryNodes('Person', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/resource-misallocation/aggregate.ts | `24:      const finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/revenue-health/aggregate.ts | `36:        const nodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/revenue-health/aggregate.ts | `38:        clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/revenue-health/computes/compute-revenue-growth.ts | `7: * 输入: store: GraphStoreReader — 通过 queryNodes 获取多期收入数据对比` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/revenue-health/computes/compute-revenue-growth.ts | `58:      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-diffusion/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-diffusion/aggregate.ts | `26:      const processNodes = store.queryNodes('Process', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-diffusion/aggregate.ts | `27:      const teamNodes = store.queryNodes('Team', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-mutation/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-mutation/aggregate.ts | `22:      const processNodes = store.queryNodes('Process', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/routine-mutation/aggregate.ts | `23:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/shared/baseline.ts | `12:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/shared/baseline.ts | `64:  const nodes = store.queryNodes('Financial', { financialType, teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/software-health/aggregate.ts | `7: * V4.4.0: 优先使用图遍历，降级到 queryNodes` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/software-health/aggregate.ts | `19:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/software-health/aggregate.ts | `53:      // 降级: queryNodes 旧路径` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/software-health/aggregate.ts | `55:        const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/strategy-capability-fit/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/strategy-capability-fit/aggregate.ts | `23:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/strategy-capability-fit/aggregate.ts | `24:      const personNodes = store.queryNodes('Person', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/talent-density/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/talent-density/aggregate.ts | `26:      const personNodes = store.queryNodes('Person', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/time-penetration/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/time-penetration/aggregate.ts | `16:      const events = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/unit-economics/aggregate.ts | `26:  queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/unit-economics/aggregate.ts | `56:        finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/unit-economics/aggregate.ts | `57:        clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/value-capture/aggregate.ts | `6:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/value-capture/aggregate.ts | `13:      const finNodes = store.queryNodes('Financial', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/adaptation-velocity/aggregate.ts | `9:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/adaptation-velocity/aggregate.ts | `23:      if (!usedTraversal) { eventNodes = store.queryNodes('Event', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `17:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-efficiency/aggregate.ts | `38:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `12:interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-structure/aggregate.ts | `22:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `8:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/capital-turnover/aggregate.ts | `17:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-dynamics/aggregate.ts | `13:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-dynamics/aggregate.ts | `29:      if (!usedTraversal) { marketNodes = store.queryNodes('Event', { teamId }); finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-moat-perceptual/aggregate.ts | `7:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-moat-perceptual/aggregate.ts | `14:      const toolNodes = store.queryNodes('Tool', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-moat-perceptual/aggregate.ts | `15:      const clientNodes = store.queryNodes('Client', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-moat-structural/aggregate.ts | `11:interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/competitive-moat-structural/aggregate.ts | `21:      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); allNodes = store.queryNodes('ALL', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/connector-coverage/aggregate.ts | `6:interface GSR { queryNodes(t:string,f?:Record<string,unknown>,g?:string): Array<{id:string;type:string;props:Record<string,unknown>}> }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/connector-coverage/aggregate.ts | `13:      const nodes = s.queryNodes("Tool",{tid});` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-cost-per-head.ts | `7: * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务和人员数据` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-cost-per-head.ts | `47:      const finNodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-cost-per-head.ts | `48:      const personNodes = store.queryNodes('Person', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-fixed-variable-ratio.ts | `7: * 输入: store: GraphStoreReader — 通过 queryNodes 获取成本节点` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-fixed-variable-ratio.ts | `46:      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/cost-health/computes/compute-gross-margin.ts | `60:      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/market-lifecycle/aggregate.ts | `12:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/market-lifecycle/aggregate.ts | `28:      if (!usedTraversal) { marketNodes = store.queryNodes('Event', { teamId }); finNodes = store.queryNodes('Financial', { teamId }); }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/profit-health/computes/compute-margin-vs-benchmark.ts | `7: * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务节点` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/profit-health/computes/compute-margin-vs-benchmark.ts | `64:      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/profit-health/computes/compute-profit-margin-change.ts | `58:      const nodes = store.queryNodes('Financial', { [input.teamId]: input.teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/structural-change/aggregate.ts | `11:interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/structural-change/aggregate.ts | `22:      const eventNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/extensions/sentinels/_extinct/structural-change/aggregate.ts | `23:      const complianceNodes = store.queryNodes('Event', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/evolution-types.ts | `191:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `419:export function detectBehavioralValidation(store: { queryNodes(t: string, f?: Record<string, unknown>): Array<{ props: Record<string, unknown> }> }, _traversal: unknown, teamId: string): Array<{ signalId: string; originalClassification: string; newEvidence: string; suggestedUpdate: string }> {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `422:    const docs = store.queryNodes('Document', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `432:export function aggregateExternalData(store: { queryNodes(t: string, f?: Record<string, unknown>): Array<{ props: Record<string, unknown> }> }, teamId: string): Array<{ dimension: string; oldValue: number; newValue: number; source: string }> {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `434:    const fins = store.queryNodes('FINANCIAL', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `440:export function detectCostTemplateDrift(store: { queryNodes(t: string, f?: Record<string, unknown>): Array<{ props: Record<string, unknown> }> }, teamId: string): Array<{ industry: string; template: string; actualCost: number; theoreticalMin: number; driftPercent: number; requiresReview: boolean }> {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `442:    const fins = store.queryNodes('FINANCIAL', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `451:export function detectDiagnosisContradiction(store: { queryNodes(t: string, f?: Record<string, unknown>): Array<{ props: Record<string, unknown> }> }, _traversal: unknown, teamId: string): Array<{ contradictionType: string; description: string; severity: string; requiresReview: boolean }> {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `453:    const acts = store.queryNodes('Activity', { teamId });` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/test-kit/fixtures/test-doubles.ts | `53:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): GraphStoreNode[];` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/test-kit/fixtures/test-doubles.ts | `60: * queryNodes 按 type + 可选 filters (AND 匹配) 过滤。` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/test-kit/fixtures/test-doubles.ts | `72:    queryNodes(type: string, filters?: Record<string, unknown>, _g?: string): GraphStoreNode[] {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `107:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `217:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> {` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `239:      log.warn({ err, type }, 'queryNodes 失败');` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/types.ts | `26:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/types.ts | `35:  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `4: * 覆盖: createNode / queryNodes / getNode / updateNode / JSON 属性过滤 / 降级` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `30:  it("queryNodes by type returns all nodes of that type", () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `35:    const typeA = store.queryNodes("TYPE_A");` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `40:  it("queryNodes with graph filter", () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `44:    const x = store.queryNodes("G_TEST", undefined, "graph-x");` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `49:  it("queryNodes with JSON property filter", () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `53:    const admins = store.queryNodes("FILTER_TEST", { role: "admin" });` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/post-diagnosis-processor.test.ts | `42:    queryNodes: vi.fn(() => []),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `27:    queryNodes(type: string, filters?: Record<string, unknown>, _graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `178:      queryNodes() { throw new Error('DB connection lost'); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `195:      queryNodes: m.store.queryNodes.bind(m.store),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `225:      queryNodes(type: string, filters?: Record<string, unknown>, graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `228:        return m.store.queryNodes(type, filters, graph);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `20:      'createNode', 'createNodes', 'queryNodes', 'queryEdges',` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `27:      'createNode', 'createNodes', 'queryNodes', 'queryEdges',` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `37:  it('queryNodes/queryEdges graph 参数在多租户场景下必须传递', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `60:      'createNode', 'queryNodes', 'queryEdges', 'createEdge',` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `67:      queryNodes: (t: string, f?: Record<string, unknown>, g?: string) => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-unify.test.ts | `135:      "createNode", "createEdge", "queryNodes", "queryEdges",` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-unify.test.ts | `149:      const nodes = store.queryNodes("TEST_GOAL", undefined, "default");` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `102:  it('按 crm 映射写 Client 后 queryNodes(Client) 命中', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `110:    const nodes = store.queryNodes('Client', {}, 'enterprise');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `125:    const nodes = store.queryNodes('Financial', {}, 'enterprise');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `140:    const nodes = store.queryNodes('Client');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `167:    const nodes = store.queryNodes('Client');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/contract/l4-contract.test.ts | `183:    const nodes = store.queryNodes('Client');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cross-scale-validator.test.ts | `39:    queryNodes(type, filters) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/investment-advisor.test.ts | `22:    queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-dashboard.test.ts | `22:    queryNodes(type, filters) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `16:    queryNodes(type, filters) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/data-pipeline.feishu.integration.test.ts | `85:      const persons = store.queryNodes('Person', {}, orgId);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/entity-resolution-e2e.test.ts | `13:    queryNodes(_type: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/full-pipeline.integration.test.ts | `290:      queryNodes: vi.fn(() => []),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/full-pipeline.integration.test.ts | `347:      queryNodes: vi.fn(() => []),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/feedback-collector.test.ts | `47:  const ms = { queryNodes: () => [{ id:'d1', type:'Document', props:{ text:'需要重新考虑现金流', teamId:'t1' } }], queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/feedback-collector.test.ts | `49:  it('aggregateExternalData', () => { const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ revenue:5000000 } }], queryEdges: () => [], getNode: () => null }; expect(aggregateExternalData(s, 't1')[0].dimension).toBe('industry_avg_revenue'); });` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/feedback-collector.test.ts | `50:  it('detectCostTemplateDrift', () => { const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ cogs:80000, benchmarkCost:100000 } }], queryEdges: () => [], getNode: () => null }; expect(detectCostTemplateDrift(s, 't1')[0].driftPercent).toBeGreaterThan(0); });` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/feedback-collector.test.ts | `51:  it('detectDiagnosisContradiction', () => { const s = { queryNodes: () => [{ id:'a1', type:'Activity' }], queryEdges: () => [], getNode: () => null }; expect(detectDiagnosisContradiction(s, null, 't1').length).toBeGreaterThanOrEqual(1); });` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/org-adapter.test.ts | `45:    queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/gns/phase0-persistence.test.ts | `20:    queryNodes(type: string, _filters?: Record<string, unknown>, _graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/gns/phase0-persistence.test.ts | `42:    const summaries = store.queryNodes('Goal', { goalType: 'mission' }, orgId)` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/gns/phase0-persistence.test.ts | `59:    const summaries = store.queryNodes('Goal', undefined, orgId)` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/gns/phase0-persistence.test.ts | `84:    const summaries = store.queryNodes('Goal', undefined, orgId)` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/gns/phase0-persistence.test.ts | `100:    const summaries = store.queryNodes('Goal', undefined, orgId)` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/action-store.test.ts | `30:    queryNodes(type: string, filters?: Record<string, unknown>) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/e2e-navigation-loop.integration.test.ts | `36:    queryNodes: vi.fn((type: string, filters?: Record<string, unknown>) => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/effect-verification.test.ts | `45:    queryNodes: (_t: string, _f?: Record<string, unknown>, _g?: string) => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-conflict-detector.test.ts | `67:        queryNodes(type) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-lifecycle.test.ts | `51:    queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-sentinel-lifecycle.test.ts | `36:    queryNodes: vi.fn(() => []),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-sentinel-lifecycle.test.ts | `73:    // 使用 queryNodes 传递 goal` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-store.test.ts | `61:    queryNodes(type, filters) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `241:      queryNodes: vi.fn().mockReturnValue([]),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/proposal-engine.test.ts | `50:    queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/proposal-store.test.ts | `28:    queryNodes(type, filters) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/user-store.test.ts | `23:  queryNodes(type: string, filters?: Record<string, unknown>, _graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/user-store.test.ts | `147:    const results = mock.queryNodes('USER');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/workspace-builder.test.ts | `11:      queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/workspace-builder.test.ts | `22:        queryNodes: (_type, filters) => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/workspace-builder.test.ts | `68:        queryNodes: () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/workspace-builder.test.ts | `106:        queryNodes: () => { throw new Error('GraphStore down'); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/ingest/data-pipeline-monitor.test.ts | `14:    queryNodes(_type: string, _filters?: Record<string, unknown>, _graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/goal-lifecycle.integration.test.ts | `27:  queryNodes(): Array<{ id: string; type: string; props: Record<string, unknown> }> { return []; }` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `220:      queryNodes: (_t: string, _f?: Record<string, unknown>, _g?: string) => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `53:  it("queryNodes 按类型查询", () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `54:    const results = graphStore.queryNodes("USER");` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `76:  it("queryNodes 按 filters 过滤", () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `81:    // 注意: SqliteGraphStore 的 queryNodes 不支持 JSON 属性过滤` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `83:    const all = graphStore.queryNodes("USER");` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `217:      queryNodes: (type: string, filters?: Record<string, unknown>, graph?: string) =>` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `218:        graphStore.queryNodes(type, filters, graph),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/assumption-monitor.test.ts | `13:      queryNodes: () => [{ id: 'gov-001', type: 'activity/governance', props: {} }],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/assumption-monitor.test.ts | `38:      queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/business-model-canvas.test.ts | `11:    queryNodes(type: string, _filters?: Record<string, unknown>, _graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/decision-capture-wiring.test.ts | `14:      queryNodes() { return [{ id:'rc1' }]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/decision-capture-wiring.test.ts | `25:      queryNodes() { return [{ id:'rc2' }]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/decision-capture-wiring.test.ts | `34:    const store = { queryNodes() { return []; }, createEdge() { return ''; } };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/decision-capture-wiring.test.ts | `43:      queryNodes() { return [{ id:'rc3' }]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/e2e-autonomy.integration.test.ts | `55:        queryNodes() { return [{ id:'ev_test' }, { id:'ev1' }, { id:'ev2' }]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/e2e-graphbridge.integration.test.ts | `38:        queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/e2e-report-adapter.integration.test.ts | `23:      queryNodes(type: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/gear1-autonomy.test.ts | `85:      queryNodes() { return existingEvidenceIds.map(id => ({ id })); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/gear1-wiring.test.ts | `23:  private graphStore: { queryNodes: () => Array<{id:string}> };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/gear1-wiring.test.ts | `33:      queryNodes(_type: string, filters?: Record<string,unknown>) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/graph-traversal-adapter.test.ts | `27:      queryNodes: (_type: string) => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/graphbridge-wiring.test.ts | `28:      queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/graphbridge-wiring.test.ts | `58:      queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/graphbridge-wiring.test.ts | `87:      queryNodes() { return [{ id:'p1', type:'Person', props:{}}]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `6:    const store = { queryNodes: () => [] };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `14:      queryNodes: () => [{ id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1' } }],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `23:      queryNodes: () => [` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `39:      queryNodes: () => [` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `53:      queryNodes: () => [` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/key-person-risk.test.ts | `76:    const store = { queryNodes: () => { throw new Error('DB error'); } };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/platform-dependency-check.test.ts | `13:      queryNodes: () => [{ id: 'prod-001', type: 'activity/production', props: {} }],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/platform-dependency-check.test.ts | `36:      queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/report-adapter-wiring.test.ts | `16:      queryNodes(type: string) { return nodes.filter(n => n.type === type).map(n => ({...n})); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-exporter.test.ts | `19:    queryNodes: (type: string) => nodesByType[type] \|\| [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-exporter.test.ts | `165:      queryNodes: () => { throw new Error('store down'); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-purger.test.ts | `35:    queryNodes: (type: string) => nodes.filter((n) => n.type === type).map((n) => ({` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `7:import { findDiagnosticPaths, summarizeSubgraph, getGraphDiff, findCrossDimensionalBrokers, detectAnomalousPatterns, queryNodesCreatedAfter } from '../../src/l4/diagnosis-graph-query';` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `12:    queryNodes(type: string, _filters?: Record<string, unknown>, _graph?: string) { return nodes.filter(n => !type \|\| n.type === type).map(n => ({...n, props: n.props \|\| {}})); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `146:describe('queryNodesCreatedAfter', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `151:  it('Given nodes created within N days, When queryNodesCreatedAfter, Then returns matching count', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `157:    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(2);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `160:  it('Given all nodes older than N days, When queryNodesCreatedAfter, Then returns 0', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `165:    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(0);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `168:  it('Given empty graph, When queryNodesCreatedAfter, Then returns 0', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `169:    expect(queryNodesCreatedAfter(fakeStore(), 'g', 30)).toBe(0);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `172:  it('Given nodes without createdAt, When queryNodesCreatedAfter, Then excludes them', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `177:    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(1);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `180:  it('Given future-dated node, When queryNodesCreatedAfter, Then includes it', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/diagnosis-graph-query.test.ts | `184:    expect(queryNodesCreatedAfter(store, 'g', 7)).toBe(1);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/constrains.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/decision_concentrates.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/depends_on_platform.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/external_assumption.test.ts | `22:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/incentive_binds.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/locks_in.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/metric_binds.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/replenishes.test.ts | `21:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/edges/substitutes.test.ts | `23:    queryNodes: (type: string) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/entity-resolver.test.ts | `16:      queryNodes(_type: string) { return nodes.filter(n => n.type === _type).map(n => ({...n})); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/entity-resolver.test.ts | `92:      queryNodes() { return [{id:'rc1'}]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/entity-resolver.test.ts | `104:      queryNodes() { return [{id:'rc2'}]; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/entity-resolver.test.ts | `113:    const store = { queryNodes() { return []; }, createEdge() { return ''; } };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/graph-bridge.test.ts | `38:  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/graph-traversal.test.ts | `19:    queryNodes: (type: string, _f?: Record<string, unknown>) => nodes.filter(n => n.type === type),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/report-graph-adapter.test.ts | `15:    queryNodes(type: string) { return this.nodes.filter(n => n.type === type); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store-permission.test.ts | `41:    const nodes = store.queryNodes('Person', {}, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store-permission.test.ts | `55:  it('createNode/queryNodes 不受删除影响', () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store-permission.test.ts | `61:    const nodes = store.queryNodes('Person', {}, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store-permission.test.ts | `91:    const nodes = store.queryNodes('Person', {}, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store.test.ts | `20:    const nodes = store.queryNodes('Person', {}, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store.test.ts | `58:    const nodes = store.queryNodes('Person', {}, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store.test.ts | `88:    expect(store.queryNodes('NonExistent', {}, 'default')).toEqual([]);` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/l3-wiring.test.ts | `71:      queryNodes() { return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/orchestrator/l3-wiring.test.ts | `135:      queryNodes(type: string) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/packages/graph-store-wal.test.ts | `39:      const nodes = store.queryNodes('TEST', undefined, 'default');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/capital-health-degraded.test.ts | `27:    queryNodes(_type: string, _filters?: Record<string, unknown>): MockNode[] {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/capital-health-degraded.test.ts | `80:      queryNodes(): MockNode[] {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/dedup-key-stability.test.ts | `56:/** 测试专用 runner: db 提供 queryNodes (executeSentinel 图上下文短路路径), getNode 默认无冲突 */` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/dedup-key-stability.test.ts | `57:function makeRunner(db: unknown = { queryNodes: () => [], getNode: () => null }): SentinelRunner {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/dedup-key-stability.test.ts | `62:function makeConflictDb(): { queryNodes: () => unknown[]; getNode: (id: string) => unknown } {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/dedup-key-stability.test.ts | `68:    queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/graph-traversal-integration.test.ts | `13:      queryNodes: vi.fn().mockReturnValue([]),` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/margin-capital-deextinct.test.ts | `21:/** GraphStoreReader mock: queryNodes 返回注入节点；queryEdges 空（traversal 降级走 queryNodes） */` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/margin-capital-deextinct.test.ts | `24:    queryNodes: (_type: string, _filters?: Record<string, unknown>, _graph?: string) => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/path-dependency-sentinel.test.ts | `39:    queryNodes: (_type?: string, _filters?: Record<string, unknown>, _graph?: string) => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-runner.test.ts | `8:    queryNodes: () => [` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-service-runonce.test.ts | `5: *       带 queryNodes 的 store；GraphStore 构造失败 → 回退原始 db（不静默，非 undefined）。` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-service-runonce.test.ts | `32:    queryNodes() {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-service-runonce.test.ts | `44:  it('正常路径：构造 GraphStore，db 带 queryNodes（非 undefined）', async () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-service-runonce.test.ts | `49:    expect(typeof (capturedCtx!.db as { queryNodes?: unknown }).queryNodes).toBe('function');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-service-runonce.test.ts | `58:    expect(typeof (capturedCtx!.db as { queryNodes?: unknown }).queryNodes).toBe('undefined');` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-threshold-wiring.test.ts | `28:  queryNodes(type: string, filters?: Record<string, unknown>): Array<{ id: string; type: string; props: Record<string, unknown> }>;` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-threshold-wiring.test.ts | `31:    queryNodes(type: string, _filters?: Record<string, unknown>) {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-threshold-wiring.test.ts | `99:    // 复现降级路径: aggregate 的 queryNodes('Financial', {teamId}) 有收入节点（L41 守卫通过），` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/sentinel-threshold-wiring.test.ts | `104:      queryNodes(type: string, filters?: Record<string, unknown>): Array<{ id: string; type: string; props: Record<string, unknown> }> {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-cash-runway-months.test.ts | `7:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-cash-runway-months.test.ts | `49:  it('should fallback to queryNodes when traversal fails', async () => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-cash-runway-months.test.ts | `61:      queryNodes: (type, filter) => { capturedFilter = filter; return []; },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-cash-runway-months.test.ts | `71:      queryNodes: () => { throw new Error('DB down'); },` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-constraint-impact.test.ts | `18:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-receivable-overdue-rate.test.ts | `7:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway/compute-replenish-rate.test.ts | `18:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cash-runway.test.ts | `3:const mockStore = { queryNodes: () => [], queryEdges: () => [] };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/collaboration-health/cpc.test.ts | `5:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cost-health/compute-cost-per-head.test.ts | `9:    queryNodes: (_type: string) => {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cost-health/compute-fixed-variable-ratio.test.ts | `6:  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cost-health/compute-gross-margin.test.ts | `6:  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cost-health/compute-incentive-bind.test.ts | `18:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/cost-health.test.ts | `3:const mockStore = { queryNodes: () => [], queryEdges: () => [] };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/financial-snapshot/snapshot.test.ts | `5:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/hona/network.test.ts | `5:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-incentive-bind.test.ts | `22:    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-incentive-bind.test.ts | `34:    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-incentive-bind.test.ts | `43:    const r = await computeIncentiveBindGap({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-metric-bind-divergence.test.ts | `22:    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-metric-bind-divergence.test.ts | `35:    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/margin-health/compute-metric-bind-divergence.test.ts | `44:    const r = await computeMetricBindDivergence({ queryNodes: () => [] }, {` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/path-dependency/detect.test.ts | `11:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/profit-health/compute-margin-vs-benchmark.test.ts | `6:  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/profit-health/compute-metric-bind-divergence.test.ts | `18:    queryNodes: () => nodes,` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/profit-health/compute-profit-margin-change.test.ts | `6:  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/profit-health.test.ts | `3:const mockStore = { queryNodes: () => [], queryEdges: () => [] };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/revenue-health/compute-revenue-growth.test.ts | `6:  return { queryNodes: () => nodes, queryEdges: () => [], getNode: () => null };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/revenue-health.test.ts | `3:const mockStore = { queryNodes: () => [], queryEdges: () => [] };` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/self-awareness/bias.test.ts | `5:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/seven-powers/score.test.ts | `5:  queryNodes: () => [],` |
| `queryNodes` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinels/token-economics/cost.test.ts | `5:  queryNodes: () => [],` |

## updateNode
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/adapters/sqlite-graph-store.ts | `13: *              queryTriples, getNode, updateNode, deleteNode, deleteEdge }` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/adapters/sqlite-graph-store.ts | `318:  updateNode(` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/post-diagnosis-processor.ts | `27:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `8: * Upsert 策略: queryNodes({ name, platform }) 查找已有节点 → updateNode / createNode。` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `21:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `29: * 匹配到 → updateNode (递增 activityCount)，未匹配 → createNode。` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent-observer/collector.ts | `67:      store.updateNode(node.id, props, graph);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `40:  private store: { createNode(type: string, props: Record<string, unknown>, graph: string): string; getNode(id: string, graph: string): unknown \| null; updateNode(id: string, props: Record<string, unknown>, graph: string): void; queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }> } \| null = null;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/action-store.ts | `122:      this.store.updateNode(actionId, { ...node.props, ...updated } as Record<string, unknown>, 'growth');` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `4: * 基于 GraphStore 的 GOAL 类型节点存储，复用 createNode/queryNodes/updateNode/getNode。` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `198: * 传入 extraProps。所有更新在一次 store.updateNode 中完成，保证原子性。` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-store.ts | `240:    store.updateNode(goalId, updatedProps as unknown as Record<string, unknown>, graph);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-types.ts | `186:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/proposal-store.ts | `203:    store.updateNode(proposalId, updatedProps as unknown as Record<string, unknown>, graph);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `48:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `216:      this.store.updateNode(userId, props as Record<string, unknown>, USER_GRAPH);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/user-store.ts | `228:      this.store.updateNode(userId, { status: 'disabled' } as Record<string, unknown>, USER_GRAPH);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/data-purger.ts | `186:          this.graphStore.updateNode(node.id, { ...node.props, _purgeLocked: true, _purgeJobId: job.id }, '');` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `40:  updateNode(id: string, props: Record<string,unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `76:  // v3.3 20.5: SOG schema 校验 — 包装 createNode/updateNode` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `80:  const _updateNode = store.updateNode?.bind(store);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `107:        store.updateNode(existingNode.id, {` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `123:  if (_updateNode) {` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `124:    store.updateNode = (id: string, props: Record<string,unknown>, g: string): void => {` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `125:      // updateNode 不传 type — 校验跳过（无法在更新时获取节点类型）` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/graph-bridge.ts | `126:      _updateNode(id, props, g);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/diagnosis-upload-v2.ts | `949:    updateNode(id: string, props: Record<string, unknown>, graph: string): void {` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/evolution-types.ts | `190:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/evolution/src/org-adapter.ts | `222:            this.graphStore.updateNode(nodeId, props, orgId);` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `114:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `289:  updateNode(id: string, props: Record<string, unknown>, graph: string): void {` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/graph-store.ts | `295:      log.warn({ err, id }, 'updateNode 失败');` |
| `updateNode` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/_archived/graph-store/src/types.ts | `41:  updateNode(id: string, props: Record<string, unknown>, graph: string): void;` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `4: * 覆盖: createNode / queryNodes / getNode / updateNode / JSON 属性过滤 / 降级` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `71:  it("updateNode merges new properties with existing", () => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/adapters/sqlite-graph-store.test.ts | `73:    store.updateNode(id, { b: 99, c: 3 });` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent/post-diagnosis-processor.test.ts | `47:    updateNode: vi.fn(),` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `46:    updateNode(id: string, props: Record<string, unknown>, _graph: string) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `192:    // 然后让 updateNode 失败` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/agent-observer/collector.test.ts | `196:      updateNode() { throw new Error('write conflict'); },` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `21:      'createEdge', 'createEdges', 'getNode', 'updateNode',` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-compatibility.test.ts | `28:      'createEdge', 'createEdges', 'getNode', 'updateNode',` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-unify.test.ts | `136:      "queryTriples", "getNode", "updateNode",` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/architecture/graphstore-unify.test.ts | `152:      store.updateNode(nodeId, { progress: 0.5 }, "default");` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/cross-scale-validator.test.ts | `44:    getNode: () => null, updateNode: () => {}, createNodes: () => [],` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/investment-advisor.test.ts | `23:    getNode: () => null, updateNode: () => {}, createNodes: () => [],` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-dashboard.test.ts | `27:    getNode: () => null, updateNode: () => {}, createNodes: () => [],` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/cycles/overflow-graph-bridge.test.ts | `29:    getNode: () => null, updateNode: () => {}, createNodes: () => [], createEdge: () => '',` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/full-pipeline.integration.test.ts | `286:      updateNode: vi.fn((id: string, props: Record<string, unknown>) => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/full-pipeline.integration.test.ts | `343:      updateNode: vi.fn((id: string, props: Record<string, unknown>) => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/evolution/org-adapter.test.ts | `41:    updateNode: (id: string, props: Record<string, unknown>, graph: string) => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/action-store.test.ts | `26:    updateNode(id: string, props: Record<string, unknown>) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/e2e-navigation-loop.integration.test.ts | `32:    updateNode: vi.fn((id: string, props: Record<string, unknown>) => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/effect-verification.test.ts | `44:    updateNode: (_id: string, _p: Record<string, unknown>, _g: string) => {},` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-conflict-detector.test.ts | `66:        updateNode: () => {},` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-lifecycle.test.ts | `45:    updateNode(id, props) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-sentinel-lifecycle.test.ts | `35:    updateNode: vi.fn(),` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/goal-store.test.ts | `55:    updateNode(id, props) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/lightweight-diagnosis.test.ts | `243:      updateNode: vi.fn(),` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/proposal-engine.test.ts | `44:    updateNode(id, props) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/proposal-store.test.ts | `24:    updateNode(id, props) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/user-store.test.ts | `45:  updateNode(id: string, props: Record<string, unknown>, _graph: string): void {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/goal-lifecycle.integration.test.ts | `28:  updateNode(id: string, props: Record<string, unknown>, _graph: string): void {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `219:      updateNode: (_id: string, _p: Record<string, unknown>, _g: string) => {},` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `68:  it("updateNode 合并属性", () => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `70:    graphStore.updateNode(id, { role: "admin" });` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `215:      updateNode: (id: string, props: Record<string, unknown>, graph: string) =>` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/wiring-integration.test.ts | `216:        graphStore.updateNode(id, props, graph),` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l3/business-model-canvas.test.ts | `23:    updateNode: () => {},` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-exporter.test.ts | `21:    updateNode: () => {},` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-exporter.test.ts | `167:      updateNode: () => { throw new Error('store down'); },` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/data-purger.test.ts | `39:    updateNode: (id: string, props: Record<string, unknown>) => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/graph-bridge.test.ts | `46:  updateNode(id: string, props: Record<string,unknown>, graph: string) {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/graph-bridge.test.ts | `341:    store.updateNode(nodeId, {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/graph-bridge.test.ts | `364:    store.updateNode(nodeId, { has_conflict: false }, orgId);` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store.test.ts | `38:  it('getNode + updateNode', () => {` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l4/synova-graph-store.test.ts | `47:    store.updateNode(id, { name: '张三', age: 31 }, 'default');` |
| `updateNode` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/sentinel/graph-traversal-integration.test.ts | `20:      updateNode: vi.fn(),` |

## KnowledgeStore
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-bridge-service.ts | `6: * L1 路由通过此服务 import KnowledgeStore 类型和类，不直接 import L4。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-bridge-service.ts | `7: * 路由仍使用 new KnowledgeStore(getDatabase()) 模式——类定义来自 L2 桥接。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-bridge-service.ts | `13:export { KnowledgeStore } from '../l4/knowledge-store';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-conflict-handler.ts | `7: * 铁律 39: L2 编排层——通过 KnowledgeStore(L4) 操作数据。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-file-importer.ts | `4: * 从 FileScanner 索引中读取 knowledge/*.md 文件, 导入到 KnowledgeStore (L4)。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-file-importer.ts | `17:// 不直接 import KnowledgeStore (L4)，而是在此声明所需子集。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-file-importer.ts | `18:interface KnowledgeStoreLike {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-file-importer.ts | `88:  private store: KnowledgeStoreLike;` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-file-importer.ts | `91:  constructor(store: KnowledgeStoreLike, validator?: PreUploadValidator) {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/knowledge-injector.ts | `18: * 铁律 39: L2 编排层——通过 KnowledgeStore(L4) 操作数据。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/synova-agent.ts | `199:        const { KnowledgeStore } = await import('../l4/knowledge-store');` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/agent/synova-agent.ts | `202:        const store = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/connectors/ima-connector.ts | `11: *   → 结果写入 KnowledgeStore` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-lifecycle.ts | `176:    const KnowledgeStore = (await import('../l4/knowledge-store')).KnowledgeStore;` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/goal-lifecycle.ts | `179:    const ks = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `9: *                → writeGoalKnowledge() → KnowledgeStore.insert()` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `90:export interface KnowledgeStoreLike {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `303: * @param store     — KnowledgeStore 实例（DI）` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `308:  store: KnowledgeStoreLike,` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `406: * @param store       — KnowledgeStore 实例` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/knowledge-feedback.ts | `414:  store: KnowledgeStoreLike,` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `8: *   seedSkillKnowledge(store) → 将4个SKILL条目写入KnowledgeStore` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `31:/** KnowledgeStore 最小接口 */` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `32:export interface KnowledgeStoreLike {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `178: * 将 4 个 SKILL 知识条目写入 KnowledgeStore。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `182: * @param store — KnowledgeStore 实例` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/growth/skill-knowledge.ts | `245: * @param store — KnowledgeStore 实例（含 getBySkill 方法）` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l1/qa-router.ts | `11:import { KnowledgeStore } from '../agent/knowledge-bridge-service';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l1/qa-router.ts | `83:    const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/gear6-scheduler.ts | `4: * 定时运行: 扫描新数据 → 提取知识片段 → 写入 KnowledgeStore` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `15:import { KnowledgeStore } from '../l4/knowledge-store';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `67:          const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `112:          const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `159:          const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `203:          const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `288:          const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `485:      const store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/knowledge-agent.ts | `512:        // 2. 扫描长文档 — 通过 KnowledgeStore (L4) 接口` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-lifecycle.ts | `6: * 铁律 39: L3 通过 KnowledgeStore(L4) 操作数据，不直接访问 L5 数据库。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-lifecycle.ts | `8:import { KnowledgeStore } from '../l4/knowledge-store';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-lifecycle.ts | `45:  const store = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-lifecycle.ts | `76:  const store = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-seed.ts | `10:import { KnowledgeStore } from '../l4/knowledge-store';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-seed.ts | `242: * 将种子知识写入 KnowledgeStore — 幂等 (检查已存在则跳过)` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l3/pkb-seed.ts | `245:  const store = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/knowledge-store.ts | `48:export class KnowledgeStore {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/l4/knowledge-store.ts | `140:    log.info('KnowledgeStore schema initialized');` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `17:// 铁律 39: L1 不直接触 L4 — KnowledgeStore 经 L2 桥接 re-export（knowledge.ts 同款先例）` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `18:import { KnowledgeStore } from '../agent/knowledge-bridge-service';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `25:let knowledgeStore: KnowledgeStore \| null = null;` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `28:export function setKnowledgeStore(store: KnowledgeStore): void {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `40: *   @output — KnowledgeStore 实例（注入的 mock/实例优先；否则 knowledgeStore ??= new KnowledgeStore(getDatabase())` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `45:function getStore(): KnowledgeStore {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/admin-knowledge.ts | `46:  return knowledgeStore ??= new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/documents.ts | `9:import { KnowledgeStore } from '../agent/knowledge-bridge-service';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/documents.ts | `16:function getStore(): KnowledgeStore {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/documents.ts | `17:  return new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge-ask.ts | `37:    // 尝试从 KnowledgeStore 搜索` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge-ask.ts | `39:    const { KnowledgeStore } = await import('../l4/knowledge-store');` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge-ask.ts | `42:      const store = new KnowledgeStore(db);` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge-ask.ts | `55:  } catch { /* KnowledgeStore unavailable — degraded to templates */ }` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge.ts | `8: * 铁律 39: L1 交互层，委托 L4 KnowledgeStore 执行查询` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge.ts | `11:import { KnowledgeStore } from '../agent/knowledge-bridge-service';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge.ts | `21:function getStore(): KnowledgeStore {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/knowledge.ts | `22:  return new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/permissions.ts | `9: * 铁律 39: L1 交互层，委托 L4 KnowledgeStore 执行。` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/permissions.ts | `13:import { KnowledgeStore } from '../agent/knowledge-bridge-service';` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/permissions.ts | `21:function getStore(): KnowledgeStore {` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/src/routes/permissions.ts | `22:  return new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | D | /novis-backup-20260526/Novis/synova-wt-d472/packages/test-kit/src/wiring-registry.ts | `264:    moduleName: 'KnowledgeStore',` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `16:import { KnowledgeStore } from '../../src/l4/knowledge-store';` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `22:let store: KnowledgeStore;` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `34:  store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `103:describe('Step 3: IMA 结果写入 KnowledgeStore', () => {` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `186:    // 4. KnowledgeStore 搜索 — admin (无过滤)` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/e2e/ima-knowledge-e2e.test.ts | `190:    // 5. KnowledgeStore 搜索 — employee (受限)` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/knowledge-approval.test.ts | `4: * 直接测试 KnowledgeStore 审批方法，不依赖 better-sqlite3 原生模块。` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/skill-knowledge.test.ts | `85:describe('KnowledgeStore.getBySkill — PKB查询', () => {` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/skill-knowledge.test.ts | `87:    const { KnowledgeStore } = await import('../../src/l4/knowledge-store');` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/growth/skill-knowledge.test.ts | `89:    const proto = Object.getOwnPropertyDescriptor(KnowledgeStore.prototype, 'getBySkill');` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `4: * Gates 15: closeGoal → extractGoalKnowledge → classifyDeviation → KnowledgeStore` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `10: *   3. writeGoalKnowledge → KnowledgeStoreLike.insert (降级)` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `17:import type { KnowledgeStoreLike, DeviationClassifier } from "../../src/growth/knowledge-feedback";` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `56:// ═══ Mock KnowledgeStore ═══` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `58:class MockKnowledgeStore implements KnowledgeStoreLike {` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `74:const knowledgeStore = new MockKnowledgeStore();` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/integration/knowledge-feedback.integration.test.ts | `188:describe("Gate 15: writeGoalKnowledge → KnowledgeStore", () => {` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l1/qa-router.test.ts | `8:import { KnowledgeStore } from '../../src/l4/knowledge-store';` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l1/qa-router.test.ts | `14:let store: KnowledgeStore;` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/l1/qa-router.test.ts | `24:  store = new KnowledgeStore(getDatabase());` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `12: * (KnowledgeStore 内部方法测试在 tests/l4/knowledge-store-approval.test.ts)` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `17:import type { KnowledgeStore } from '../../src/agent/knowledge-bridge-service';` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `44:// D402: KnowledgeStore 构造计数（getStore 惰性单例证明）——子类保持全部真实行为` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `47:  const Orig = actual.KnowledgeStore;` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `48:  class CountingKnowledgeStore extends Orig {` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `54:  return { ...actual, KnowledgeStore: CountingKnowledgeStore };` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `98:    expect(typeof mod.setKnowledgeStore).toBe('function');` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `142:    } as unknown as KnowledgeStore;` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `143:    mod.setKnowledgeStore(store);` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `156:    mod.setKnowledgeStore({ listPendingPkb: vi.fn().mockReturnValue([]) } as unknown as KnowledgeStore);` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `168:    mod.setKnowledgeStore({ approvePkb } as unknown as KnowledgeStore);` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `181:    mod.setKnowledgeStore({ rejectPkb } as unknown as KnowledgeStore);` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `194:    const mod = await loadMod(); // 不调 setKnowledgeStore` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `224:      const mod = await loadMod(); // 不调 setKnowledgeStore → 走 ??= 惰性单例` |
| `KnowledgeStore` | **D** 📋 | /novis-backup-20260526/Novis/synova-wt-d472/tests/routes/admin-knowledge.test.ts | `394:    expect(src).not.toMatch(/\?\? new (FederatedPipeline\|KnowledgeStore)/);` |
