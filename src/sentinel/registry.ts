/**
 * sentinel/registry.ts — SentinelRegistry 实现 (P1-1)
 *
 * 哨兵注册中心: 管理所有 Sentinel 实例的生命周期。
 * 单例模式, 全局可访问。支持按类别/优先级过滤。
 *
 * @state: real — 生产可用, 与 CronScheduler 集成
 */

import type { Sentinel, SentinelConfig, SentinelCategory, SentinelPriority, SentinelRegistry } from './types';
import { createLogger } from '../logger';

const log = createLogger('sentinel/registry');

// ═══ SentinelRegistryImpl ═══

export class SentinelRegistryImpl implements SentinelRegistry {
  private sentinels = new Map<string, Sentinel>();

  register(sentinel: Sentinel): void {
    const id = sentinel.config.id;
    if (this.sentinels.has(id)) {
      log.warn({ sentinelId: id }, '哨兵已注册 — 覆盖旧实例');
    }
    this.sentinels.set(id, sentinel);
    log.info({ sentinelId: id, name: sentinel.config.name, category: sentinel.config.category },
      '哨兵已注册');
  }

  unregister(id: string): void {
    if (this.sentinels.delete(id)) {
      log.info({ sentinelId: id }, '哨兵已注销');
    }
  }

  get(id: string): Sentinel | undefined {
    return this.sentinels.get(id);
  }

  list(): Sentinel[] {
    return [...this.sentinels.values()];
  }

  listByCategory(category: SentinelCategory): Sentinel[] {
    return this.list().filter(s => s.config.category === category);
  }

  listByPriority(priority: SentinelPriority): Sentinel[] {
    return this.list().filter(s => s.config.priority === priority);
  }

  count(): number {
    return this.sentinels.size;
  }

  /** 获取所有 cron 模式的哨兵 */
  listCronSentinels(): Array<{ sentinel: Sentinel; cron: string }> {
    return this.list()
      .filter(s => s.config.mode === 'cron' && s.config.cron)
      .map(s => ({ sentinel: s, cron: s.config.cron! }));
  }
}

// ═══ Global Singleton ═══

let _globalRegistry: SentinelRegistryImpl | null = null;

/** 获取全局 SentinelRegistry 单例 */
export function getSentinelRegistry(): SentinelRegistryImpl {
  if (!_globalRegistry) {
    _globalRegistry = new SentinelRegistryImpl();
  }
  return _globalRegistry;
}

/** 销毁全局单例 (测试用) */
export function destroySentinelRegistry(): void {
  _globalRegistry = null;
}
