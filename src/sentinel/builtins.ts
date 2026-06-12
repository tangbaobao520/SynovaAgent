/**
 * sentinel/builtins.ts — 内置哨兵注册入口
 *
 * 在 SynovaAgent 启动时调用 registerBuiltinSentinels() 注册全部 7 个内置哨兵。
 * 必须在 SentinelRunner.start() 之前调用，否则 Runner 找不到哨兵。
 *
 * 架构: L2 (synova-agent.ts) → L3 (builtins.ts) → L3 (adapters/*)
 *       零 L1 感知，零 L4/L5 直接依赖。
 */

import { getSentinelRegistry } from './registry';
import { createLogger } from '../logger';

const log = createLogger('sentinel/builtins');

/**
 * 注册全部 7 个内置哨兵。
 * 每个模块独立 try/catch——一个加载失败不影响其他。
 */
export async function registerBuiltinSentinels(): Promise<void> {
  const registry = getSentinelRegistry();

  const modules = [
    { name: 'HTM', loader: () => import('./adapters/htm-sentinel'), key: 'htmSentinel' },
    { name: 'HACD', loader: () => import('./adapters/hacd-sentinel'), key: 'hacdSentinel' },
    { name: 'GapDynamics', loader: () => import('./adapters/gap-dynamics-sentinel'), key: 'gapDynamicsSentinel' },
    { name: 'CPC', loader: () => import('./adapters/cpc-sentinel'), key: 'cpcSentinel' },
    { name: 'PathDependency', loader: () => import('./adapters/path-dependency-sentinel'), key: 'pathDependencySentinel' },
    { name: 'SelfAwareness', loader: () => import('./adapters/self-awareness-sentinel'), key: 'selfAwarenessSentinel' },
    { name: 'SevenPowers', loader: () => import('./adapters/seven-powers-sentinel'), key: 'sevenPowersSentinel' },
    { name: 'EOB', loader: () => import('./adapters/eob-sentinel'), key: 'eobSentinel' },
    { name: 'HONA', loader: () => import('./adapters/hona-sentinel'), key: 'honaSentinel' },
  ];

  let registered = 0;

  for (const { name, loader, key } of modules) {
    try {
      const mod = await loader();
      const sentinel = (mod as Record<string, unknown>)[key];
      if (sentinel && typeof sentinel === 'object' && 'config' in sentinel) {
        registry.register(sentinel as Parameters<typeof registry.register>[0]);
        registered++;
        log.info(`[builtins] ${name} 已注册`);
      } else {
        log.error({ name, key }, `[builtins] ${name} 模块未导出哨兵对象 (key=${key})`);
      }
    } catch (err: unknown) {
      // Iron Law 24: 单个哨兵注册失败打 log.error, 不阻断其他
      log.error({ name, err: (err as Error)?.message || String(err), code: 'SENTINEL_REGISTER_FAILED', phase: 2, retryable: false },
        `[builtins] ${name} 注册失败`);
    }
  }

  const total = registry.count();
  const cronCount = registry.listCronSentinels().length;
  log.info({ registered, total, cronCount }, '[builtins] 内置哨兵注册完成');
}
