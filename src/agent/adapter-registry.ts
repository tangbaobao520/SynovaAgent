/**
 * adapter-registry.ts — 适配器注册中心 (L2)
 *
 * 管理适配器生命周期: register / unregister / list。
 * 单例模式，对标 SentinelRegistry。
 *
 * 铁律24: catch + log + degraded。
 * 铁律31: 降级信号传播。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('agent/adapter-registry');

export interface AdapterEntry {
  name: string;
  label: string;
  targetNodeType: string;
  registeredAt: string;
  /** 适配器配置全文（用于 loadFieldMapping 按名称加载） */
  config: Record<string, unknown> | null;
}

export interface RegistryState {
  adapters: AdapterEntry[];
  count: number;
  degraded: boolean;
  errors: string[];
}

/**
 * AdapterRegistry — 适配器注册中心（单例）
 */
export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapterMap = new Map<string, AdapterEntry>();

  private constructor() {}

  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  register(entry: AdapterEntry): void {
    if (this.adapterMap.has(entry.name)) {
      log.warn({ name: entry.name }, '适配器已存在 — 覆盖注册');
    }
    this.adapterMap.set(entry.name, {
      ...entry,
      registeredAt: entry.registeredAt || new Date().toISOString(),
    });
    log.debug({ name: entry.name }, '适配器已注册');
  }

  unregister(name: string): boolean {
    const existed = this.adapterMap.delete(name);
    if (existed) log.debug({ name }, '适配器已注销');
    return existed;
  }

  list(): AdapterEntry[] {
    return Array.from(this.adapterMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): AdapterEntry | undefined {
    return this.adapterMap.get(name);
  }

  clear(): void {
    this.adapterMap.clear();
    log.debug('适配器注册表已清空');
  }

  state(): RegistryState {
    const list = this.list();
    return { adapters: list, count: list.length, degraded: false, errors: [] };
  }

  registerFromScan(
    scanned: Array<{ name: string; label: string; targetNodeType: string }>,
  ): { registered: number; errors: string[] } {
    let registered = 0;
    const errors: string[] = [];
    for (const item of scanned) {
      try {
        this.register({
          name: item.name,
          label: item.label,
          targetNodeType: item.targetNodeType,
          registeredAt: new Date().toISOString(),
          config: null,
        });
        registered++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`适配器 ${item.name} 注册失败: ${msg}`);
      }
    }
    log.info({ registered, errors: errors.length }, '批量适配器注册完成');
    return { registered, errors };
  }
}
