/**
 * src/cycles/cycle-registry.ts — CycleRegistry 单例
 *
 * 对标 src/sentinel/registry.ts 模式：
 * register/unregister/get/list/listByIndustry
 */
import type { CycleConfig } from './cycle-types';

export class CycleRegistry {
  private cycles = new Map<string, CycleConfig>();

  /** 注册一个循环配置。同名时覆盖。 */
  register(cycle: CycleConfig): void {
    this.cycles.set(cycle.cycleId, cycle);
  }

  /** 按 ID 获取循环配置。不存在时返回 undefined。 */
  get(id: string): CycleConfig | undefined {
    return this.cycles.get(id);
  }

  /** 注销一个循环。返回 true 表示实际删除。 */
  unregister(id: string): boolean {
    return this.cycles.delete(id);
  }

  /** 返回全部已注册循环。 */
  list(): CycleConfig[] {
    return [...this.cycles.values()];
  }

  /** 按行业筛选循环。empty applicableIndustries 表示通用，匹配所有。 */
  listByIndustry(sector: string): CycleConfig[] {
    return this.list().filter(c =>
      c.applicableIndustries.length === 0 || c.applicableIndustries.includes(sector),
    );
  }

  /** 清空注册表。 */
  clear(): void {
    this.cycles.clear();
  }
}

/** 全局单例实例 */
export const cycleRegistry = new CycleRegistry();
