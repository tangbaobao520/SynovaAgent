/**
 * sentinel/index.ts — Sentinel 哨兵系统公共 API (P1-1)
 *
 * @state: real — P1-1 哨兵接口骨架
 */

export type {
  Sentinel,
  SentinelConfig,
  SentinelRegistry,
  SentinelContext,
  SentinelCategory,
  SentinelPriority,
  SentinelMode,
  SentinelFinding,
  SentinelCheckResult,
} from './types';

export {
  SentinelRegistryImpl,
  getSentinelRegistry,
  destroySentinelRegistry,
} from './registry';

export {
  SentinelRunner,
  getGlobalSentinelRunner,
  setGlobalSentinelRunner,
} from './runner';
export type {
  SentinelRunRecord,
  SentinelRunnerStats,
} from './runner';

export {
  registerBuiltinSentinels,
} from './builtins';

// 信号聚合引擎 (B1)
export {
  aggregateSignals,
} from './signal-aggregator';
export type {
  AggregatedSignal,
  SignalAggregatorStats,
} from './signal-aggregator';

// 基线管理 (B2)
export {
  BaselineStore,
  getBaselineStore,
  destroyBaselineStore,
} from './baseline-store';
export type {
  BaselineRecord,
  BaselineStats,
  BaselineComparison,
} from './baseline-store';
