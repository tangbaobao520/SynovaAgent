/**
 * extensions/registry.ts — Extension Registry (Slice 4.2)
 *
 * 运行时扩展注册中心: register → validate → activate → deactivate → unload。
 * 支持 SOG 节点类型、专家 Agent、诊断模块、工具、技能的运行时注册。
 *
 * 企业部署后可加载扩展，无需改核心代码或重新编译。
 */
import { createLogger } from '@synova/logger';
import type {
  ExtensionManifest,
  ExtensionType,
  ExtensionState,
  ExtensionLifecycleEvent,
  ResolvedExtension,
} from './types';

const log = createLogger('extensions/registry');

// ═══ ExtensionRegistry ═══

export class ExtensionRegistry {
  private extensions = new Map<string, ResolvedExtension>();

  /**
   * Register an extension (with implementation).
   * Transitions: registered → loaded → validated → active
   */
  register<T = unknown>(manifest: ExtensionManifest, implementation: T): ResolvedExtension<T> {
    if (this.extensions.has(manifest.name)) {
      log.warn({ name: manifest.name }, '扩展重复注册，将覆盖旧版本');
    }

    const resolved: ResolvedExtension<T> = {
      manifest,
      implementation,
      state: 'registered',
      lifecycle: [],
      registeredAt: new Date().toISOString(),
    };

    this.transition(resolved, 'registered');

    // Auto-load
    this.transition(resolved, 'loaded');

    // Auto-validate
    try {
      this.validateDependencies(manifest);
      this.transition(resolved, 'validated');
    } catch (err: any) {
      this.transition(resolved, 'error', err.message);
      return resolved;
    }

    // Auto-activate
    this.transition(resolved, 'active');
    resolved.activatedAt = new Date().toISOString();

    this.extensions.set(manifest.name, resolved as ResolvedExtension);
    log.info({ name: manifest.name, version: manifest.version, type: manifest.type }, '扩展已激活');
    return resolved;
  }

  /** Unregister and deactivate */
  unregister(name: string): void {
    const ext = this.extensions.get(name);
    if (!ext) {
      log.warn({ name }, '扩展未找到，无法注销');
      return;
    }
    this.transition(ext, 'deactivated');
    this.extensions.delete(name);
    log.info({ name }, '扩展已注销');
  }

  /** Resolve an extension by name */
  resolve<T = unknown>(name: string): ResolvedExtension<T> | undefined {
    return this.extensions.get(name) as ResolvedExtension<T> | undefined;
  }

  /** List extensions, optionally filtered by type */
  list(type?: ExtensionType): ResolvedExtension[] {
    const all = [...this.extensions.values()];
    if (type) return all.filter(e => e.manifest.type === type);
    return all;
  }

  /** List only active extensions */
  listActive(type?: ExtensionType): ResolvedExtension[] {
    return this.list(type).filter(e => e.state === 'active');
  }

  /** Get count of active extensions by type */
  stats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const ext of this.extensions.values()) {
      const key = `${ext.manifest.type}:${ext.state}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  // ═══ Internal ═══

  private validateDependencies(manifest: ExtensionManifest): void {
    if (!manifest.dependencies || manifest.dependencies.length === 0) return;
    for (const dep of manifest.dependencies) {
      const depExt = this.extensions.get(dep);
      if (!depExt || depExt.state !== 'active') {
        throw new Error(
          `扩展 "${manifest.name}" 依赖 "${dep}"，但 "${dep}" 未激活`,
        );
      }
    }
  }

  private transition(ext: ResolvedExtension, to: ExtensionState, error?: string): void {
    const event: ExtensionLifecycleEvent = {
      extensionName: ext.manifest.name,
      from: ext.state,
      to,
      timestamp: new Date().toISOString(),
      error,
    };
    ext.state = to;
    ext.lifecycle.push(event);
    log.debug({ name: ext.manifest.name, from: event.from, to, error }, '扩展状态转换');
  }
}

// Global singleton
let _globalExtensionRegistry: ExtensionRegistry | null = null;

export function getExtensionRegistry(): ExtensionRegistry {
  if (!_globalExtensionRegistry) _globalExtensionRegistry = new ExtensionRegistry();
  return _globalExtensionRegistry;
}
