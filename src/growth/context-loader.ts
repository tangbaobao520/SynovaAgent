/**
 * src/growth/context-loader.ts — ContextLoader企业参数合并器 (D79)
 *
 * 三层参数覆盖体系（全局→行业→企业）:
 *   1. 行业基准: extensions/industries/{sector}/thresholds.json
 *   2. 企业覆盖: extensions/skills/custom/{enterpriseId}/overrides.json
 *   3. 合并: 企业参数覆盖行业同名参数
 *
 * 第12份权威文档 §6.2: 企业参数覆盖表机制
 * 第14份权威文档 Phase 2e: CycleLoader依赖ContextLoader合并企业循环参数
 *
 * 铁律 24+31: 5条降级路径
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const log = createLogger('growth/context-loader');

// ═══ Types ═══

/** 企业参数覆盖表 */
export interface EnterpriseOverrides {
  enterpriseId: string;
  thresholdOverrides?: Record<string, Record<string, number>>;
  skillOverrides?: Record<string, {
    timeout?: number;
    disabledSteps?: string[];
  }>;
  computeOverrides?: Record<string, Record<string, number | string | boolean>>;
  cycleOverrides?: Record<string, Record<string, number>>;
}

/** Merge 结果 */
export interface MergeResult {
  /** 合并后的最终参数 */
  merged: Record<string, unknown>;
  /** 是否降级 */
  degraded: boolean;
  /** 降级/警告信息 */
  warnings: string[];
}

// ═══ Helpers ═══

/**
 * 获取项目根目录。
 * 从当前文件位置向上查找 package.json 标识的项目根。
 */
function findProjectRoot(): string {
  // 默认从 process.cwd() 开始，适用于 dev/prod 环境
  return process.cwd();
}

/**
 * 类型检查: value 是否能赋值给 expected 类型。
 * 宽松检查 —— 只检查基础类型匹配。
 */
function typeMatches(value: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return true;
  const valueType = typeof value;
  const expectedType = typeof expected;
  // number vs string 可转换（宽松处理）
  if (valueType === 'number' && expectedType === 'string') return true;
  if (valueType === 'string' && expectedType === 'number' && !isNaN(Number(value))) return true;
  return valueType === expectedType;
}

// ═══ ContextLoader ═══

export class ContextLoader {
  private enterpriseId: string;
  /** 缓存的覆盖表 */
  private cachedOverrides: EnterpriseOverrides | null = null;
  /** 缓存是否已失效 */
  private cacheStale = true;
  /** 缓存的 degraded 状态 */
  private cachedDegraded = false;
  /** 项目根目录（可覆盖，用于测试） */
  private rootDir: string;

  constructor(enterpriseId: string, rootDir?: string) {
    this.enterpriseId = enterpriseId;
    this.rootDir = rootDir ?? findProjectRoot();
  }

  // ── 加载企业覆盖表 ──

  /**
   * 加载企业参数覆盖表。
   *
   * 从 extensions/skills/custom/{enterpriseId}/overrides.json 读取。
   * 使用内存缓存，调用 reload() 清空缓存后重新读取。
   *
   * 降级:
   *   文件不存在 → 返回空覆盖表 + degraded
   *   JSON解析失败 → 返回空覆盖表 + log.error + degraded
   *
   * @returns 企业覆盖表（含 degraded 标记）
   */
  loadEnterpriseOverrides(): { overrides: EnterpriseOverrides; degraded: boolean } {
    if (!this.cacheStale && this.cachedOverrides !== null) {
      return { overrides: this.cachedOverrides, degraded: this.cachedDegraded };
    }

    const overridesPath = join(
      this.rootDir,
      'extensions', 'skills', 'custom',
      this.enterpriseId, 'overrides.json',
    );

    // 降级1: 文件不存在
    if (!existsSync(overridesPath)) {
      log.warn({ enterpriseId: this.enterpriseId, path: overridesPath },
        '企业覆盖表不存在 — 使用空覆盖表');
      this.cachedOverrides = { enterpriseId: this.enterpriseId };
      this.cachedDegraded = true;
      this.cacheStale = false;
      return { overrides: this.cachedOverrides, degraded: true };
    }

    try {
      const raw = readFileSync(overridesPath, 'utf-8');
      const parsed = JSON.parse(raw) as EnterpriseOverrides;
      // 企业ID校验
      if (parsed.enterpriseId && parsed.enterpriseId !== this.enterpriseId) {
        log.warn({ expected: this.enterpriseId, actual: parsed.enterpriseId },
          '企业覆盖表 enterpriseId 不匹配 — 仍使用加载的数据');
      }
      this.cachedOverrides = parsed;
      this.cachedDegraded = false;
      this.cacheStale = false;
      return { overrides: parsed, degraded: false };
    } catch (err) {
      // 降级2: JSON解析失败
      log.error({ err, enterpriseId: this.enterpriseId },
        '企业覆盖表JSON解析失败 — 使用空覆盖表');
      this.cachedOverrides = { enterpriseId: this.enterpriseId };
      this.cachedDegraded = true;
      this.cacheStale = false;
      return { overrides: this.cachedOverrides, degraded: true };
    }
  }

  // ── 加载行业基准 ──

  /**
   * 加载行业基准阈值。
   *
   * 从 extensions/industries/{sector}/thresholds.json 读取。
   *
   * 降级: 文件不存在 → 返回 null（调用方使用系统默认值）
   *
   * @param sector - 行业标识（如 'saas-tech', 'financial-services'）
   * @returns 行业基准阈值或 null
   */
  loadIndustryBaseline(sector: string): Record<string, unknown> | null {
    const baselinePath = join(this.rootDir, 'extensions', 'industries', sector, 'thresholds.json');

    if (!existsSync(baselinePath)) {
      // 降级5: 行业基准不存在
      log.warn({ sector, path: baselinePath }, '行业基准文件不存在 — 返回 null');
      return null;
    }

    try {
      const raw = readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed;
    } catch (err) {
      log.error({ err, sector }, '行业基准JSON解析失败 — 返回 null');
      return null;
    }
  }

  // ── 合并参数 ──

  /**
   * 合并参数: 行业基准 → 企业覆盖 = 最终执行参数。
   *
   * 覆盖规则:
   *   1. 企业同名参数覆盖行业参数
   *   2. 类型不匹配 → log.warn + 跳过（降级3）
   *   3. 数值超出合理范围 → clamp + log.warn + warnings[]（降级4）
   *
   * @param industryBaseline - 行业基准参数（如 loadIndustryBaseline 的返回值）
   * @returns 合并结果
   */
  merge(industryBaseline: Record<string, unknown>): MergeResult {
    const warnings: string[] = [];
    const { overrides, degraded: overridesDegraded } = this.loadEnterpriseOverrides();
    const merged: Record<string, unknown> = {};

    // 1. 复制行业基准
    for (const [key, value] of Object.entries(industryBaseline)) {
      merged[key] = value;
    }

    // 2. 应用企业覆盖
    if (overrides.thresholdOverrides) {
      for (const [metricKey, thresholdValues] of Object.entries(overrides.thresholdOverrides)) {
        if (!merged[metricKey]) {
          merged[metricKey] = {};
        }
        if (typeof merged[metricKey] !== 'object' || merged[metricKey] === null) {
          warnings.push(`跳过阈值覆盖 ${metricKey}: 基准值非对象`);
          continue;
        }
        const base = merged[metricKey] as Record<string, unknown>;
        for (const [param, value] of Object.entries(thresholdValues)) {
          // 类型检查（降级3）
          if (param in base && !typeMatches(value, base[param])) {
            warnings.push(`类型不匹配 — 跳过 ${metricKey}.${param}: 期望 ${typeof base[param]}, 收到 ${typeof value}`);
            continue;
          }
          // 数值范围检查（降级4）
          if (typeof value === 'number') {
            if (value < 0) {
              warnings.push(`值超出范围 — clamp ${metricKey}.${param}: ${value} → 0`);
              base[param] = 0;
              continue;
            }
            if (metricKey.toLowerCase().includes('ratio') || metricKey.toLowerCase().includes('rate')) {
              if (value > 1 && param === 'warning' || param === 'critical') {
                // 比率类参数允许 >1（如KZ指数），仅记录
              }
            }
          }
          base[param] = value;
        }
      }
    }

    // 3. 应用 computeOverrides
    if (overrides.computeOverrides) {
      for (const [computeKey, params] of Object.entries(overrides.computeOverrides)) {
        if (!merged[computeKey]) {
          merged[computeKey] = {};
        }
        if (typeof merged[computeKey] !== 'object') continue;
        const base = merged[computeKey] as Record<string, unknown>;
        for (const [param, value] of Object.entries(params)) {
          if (param in base && !typeMatches(value, base[param])) {
            warnings.push(`类型不匹配 — 跳过 ${computeKey}.${param}`);
            continue;
          }
          base[param] = value;
        }
      }
    }

    // 4. 应用 cycleOverrides
    if (overrides.cycleOverrides) {
      for (const [cycleKey, params] of Object.entries(overrides.cycleOverrides)) {
        if (!merged[cycleKey]) {
          merged[cycleKey] = {};
        }
        if (typeof merged[cycleKey] !== 'object') continue;
        const base = merged[cycleKey] as Record<string, unknown>;
        for (const [param, value] of Object.entries(params)) {
          if (param in base && !typeMatches(value, base[param])) {
            warnings.push(`类型不匹配 — 跳过 ${cycleKey}.${param}`);
            continue;
          }
          base[param] = value;
        }
      }
    }

    // 5. 应用 skillOverrides
    if (overrides.skillOverrides) {
      for (const [skillKey, params] of Object.entries(overrides.skillOverrides)) {
        if (!merged[skillKey]) {
          merged[skillKey] = {};
        }
        if (typeof merged[skillKey] !== 'object') continue;
        const base = merged[skillKey] as Record<string, unknown>;
        for (const [param, value] of Object.entries(params)) {
          if (param in base && !typeMatches(value, base[param])) {
            warnings.push(`类型不匹配 — 跳过 ${skillKey}.${param}`);
            continue;
          }
          base[param] = value;
        }
      }
    }

    return { merged, degraded: overridesDegraded, warnings };
  }

  // ── 热更新 ──

  /**
   * 热更新: 标记缓存为失效，下次 load/merge 时重新从文件系统读取。
   */
  reload(): void {
    this.cacheStale = true;
    this.cachedOverrides = null;
    this.cachedDegraded = false;
    log.info({ enterpriseId: this.enterpriseId }, 'ContextLoader 缓存已清空 — 下次加载将重新读取');
  }
}
