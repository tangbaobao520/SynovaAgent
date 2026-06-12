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
} from './runner';
export type {
  SentinelRunRecord,
  SentinelRunnerStats,
} from './runner';

export {
  registerBuiltinSentinels,
} from './builtins';
