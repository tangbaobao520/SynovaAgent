/**
 * monitoring/data-quality-gate.ts — DataQualityGate (D30)
 *
 * 数据质量门禁：新鲜度判定 + 完整性校验 + 数据气味监控 + 三级降级 + 冷启动。
 *
 * 复用 D35 的 FreshnessTracker + PipelineMonitor。
 * 不阻断写入 — 仅标记和报告（数据层规范核心原则）。
 *
 * 铁律 24: catch + log + degraded
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import type { FreshnessTracker, FreshnessRecord } from './freshness-tracker';
import type { PipelineMonitor, PipelineStats } from './pipeline-monitor';

const log = createLogger('monitoring/data-quality');

// ═══ Types ═══

export interface QualityReport {
  poolName: string;
  dataSourceId: string;
  timestamp: string;
  /** 全局是否通过（freshness + completeness + dataSmell 全部正常） */
  passed: boolean;
  /** 逐项检查清单 */
  checks: QualityCheck[];
  /** 新鲜度判定 */
  freshness: FreshnessCheckResult;
  /** 完整性校验 */
  completeness: CompletenessCheckResult;
  /** 数据气味监测 */
  dataSmell: DataSmellCheckResult;
  /** 三级降级级别 (0=正常 1=软 2=硬 3=完全暂停) */
  degradedLevel: DegradedLevel;
  /** 数据成熟度 */
  dataMaturity: DataMaturity;
  /** 冷启动阶段 */
  coldStartPhase: ColdStartPhase;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  detail: string;
}

export interface FreshnessCheckResult {
  category: string;
  status: 'green' | 'yellow' | 'orange' | 'red';
  delayDays: number;
  lastUpdatedAt: string | null;
  expectedFrequency: string;
}

export interface CompletenessCheckResult {
  passed: boolean;
  missingFields: string[];
  typeErrors: string[];
  totalFields: number;
  completenessRate: number;
}

export interface DataSmellCheckResult {
  hasAnomaly: boolean;
  anomalies: string[];
  mutationRate: number | null;
}

export type DegradedLevel = 0 | 1 | 2 | 3;
export type ColdStartPhase = string;
/** 合法冷启动阶段 */
export const COLD_START_PHASES = ['industry_baseline', 'hybrid', 'self_baseline'] as const;

export interface DataMaturity {
  score: number;
  ageInDays: number;
}

/** 字段描述（可选完整性校验） */
export interface FieldDescriptor {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
}

// ═══ Freshness thresholds ═══

/**
 * D30 五类数据的新鲜度阈值（天数 → green/yellow/orange/red）
 * 与 FreshnessTracker 频率级阈值不同，这里是按数据类别定义。
 */
export const FRESHNESS_THRESHOLDS: Record<string, { label: string; green: number; yellow: number; orange: number }> = {
  'real-time':      { label: '实时信号',     green: 1,   yellow: 3,   orange: 7 },
  'operational':    { label: '经营数据',     green: 7,   yellow: 14,  orange: 30 },
  'financial':      { label: '财务数据',     green: 30,  yellow: 60,  orange: 90 },
  'organizational': { label: '组织数据',     green: 30,  yellow: 90,  orange: 180 },
  'industry':       { label: '行业基准',     green: 90,  yellow: 180, orange: 365 },
};

/** poolName → 数据类别映射 */
export const POOL_CATEGORY: Record<string, string> = {
  'erp':          'financial',
  'crm':          'operational',
  'hr':           'organizational',
  'connector':    'operational',
  'upload':       'operational',
  'competitive':  'industry',
  'external':     'industry',
  'innovation':   'operational',
  'risk':         'financial',
};

// ═══ Cold start phases ═══

/** 冷启动天数阈值 */
export const COLD_START_DAYS = {
  industryPhase:  0,    // 0-90天: 100%行业基准
  hybridPhaseMin:  91,   // 91-180天: 混合
  hybridPhaseMax:  180,  // 180天+: 自身基线
  selfPhaseMin:    181,
};

// ═══ DataQualityGate ═══

export class DataQualityGate {
  private freshnessTracker: FreshnessTracker;
  private pipelineMonitor: PipelineMonitor;

  constructor(freshnessTracker: FreshnessTracker, pipelineMonitor: PipelineMonitor) {
    this.freshnessTracker = freshnessTracker;
    this.pipelineMonitor = pipelineMonitor;
  }

  /**
   * 执行质量门禁评估。
   * @param poolName - 数据池名（如 'erp', 'crm'）
   * @param dataSourceId - 数据源 ID
   * @param fields - 可选字段描述列表（用于完整性校验）
   */
  evaluate(
    poolName: string,
    dataSourceId: string,
    fields?: FieldDescriptor[],
  ): QualityReport {
    try {
      const checks: QualityCheck[] = [];
      const DEFAULT_CAT = 'operational';
      const category = POOL_CATEGORY[poolName] || DEFAULT_CAT;

      // 1. 新鲜度判定
      const freshness = this.checkFreshness(poolName, dataSourceId, category);
      checks.push({
        name: 'freshness',
        passed: freshness.status === 'green' || freshness.status === 'yellow',
        severity: freshness.status === 'red' ? 'error' : freshness.status === 'orange' ? 'warning' : 'info',
        detail: `${freshness.category}: ${freshness.status} (${freshness.delayDays}天)`,
      });

      // 2. 完整性校验
      const completeness = this.checkCompleteness(poolName, dataSourceId, fields);
      checks.push({
        name: 'completeness',
        passed: completeness.passed,
        severity: completeness.passed ? 'info' : 'error',
        detail: `${completeness.completenessRate * 100}% 完整 (缺失 ${completeness.missingFields.length} 字段)`,
      });

      // 3. 数据气味监测
      const dataSmell = this.checkDataSmell(poolName);
      checks.push({
        name: 'data_smell',
        passed: !dataSmell.hasAnomaly,
        severity: dataSmell.hasAnomaly ? 'warning' : 'info',
        detail: dataSmell.hasAnomaly
          ? `检测到 ${dataSmell.anomalies.length} 个异常: ${dataSmell.anomalies.join(', ')}`
          : '无异常',
      });

      // 4. 数据成熟度 + 冷启动
      const dataMaturity = this.calculateDataMaturity(poolName);
      const coldStartPhase = this.determineColdStartPhase(dataMaturity.ageInDays);
      checks.push({
        name: 'cold_start',
        passed: coldStartPhase === 'self_baseline',
        severity: coldStartPhase === 'industry_baseline' ? 'warning' : 'info',
        detail: `冷启动阶段: ${coldStartPhase} (成熟度 ${dataMaturity.ageInDays}天)`,
      });

      // 5. 三级降级
      const degradedLevel = this.calculateDegradedLevel(freshness, completeness, dataSmell);

      return {
        poolName,
        dataSourceId,
        timestamp: new Date().toISOString(),
        passed: checks.every((c) => c.passed || c.severity === 'warning'),
        checks,
        freshness,
        completeness,
        dataSmell,
        degradedLevel,
        dataMaturity,
        coldStartPhase,
      };
    } catch (err: unknown) {
      log.error({ err, poolName, dataSourceId }, 'DataQualityGate.evaluate 异常');
      return {
        poolName,
        dataSourceId,
        timestamp: new Date().toISOString(),
        passed: false,
        checks: [{ name: 'error', passed: false, severity: 'error', detail: '质量门禁异常降级' }],
        freshness: { category: 'unknown', status: 'red', delayDays: -1, lastUpdatedAt: null, expectedFrequency: '' },
        completeness: { passed: false, missingFields: [], typeErrors: [], totalFields: 0, completenessRate: 0 },
        dataSmell: { hasAnomaly: true, anomalies: ['gate_error'], mutationRate: null },
        degradedLevel: 3,
        dataMaturity: { score: 0, ageInDays: 0 },
        coldStartPhase: 'industry_baseline',
      };
    }
  }

  /** 解析 freshnessTracker 数据并映射到 5 类阈值 */
  private checkFreshness(poolName: string, dataSourceId: string, category: string): FreshnessCheckResult {
    try {
      const records = this.freshnessTracker.getStatusByPool(poolName);
      const record = records.find((r) => r.sourceId === dataSourceId);

      if (!record) {
        return {
          category,
          status: 'red',
          delayDays: -1,
          lastUpdatedAt: null,
          expectedFrequency: '',
        };
      }

      const thresholds = FRESHNESS_THRESHOLDS[category];
      if (!thresholds) {
        // 无阈值定义 → 使用 FreshnessTracker 自身状态
        return {
          category,
          status: record.freshnessStatus as FreshnessCheckResult['status'],
          delayDays: record.delayDays,
          lastUpdatedAt: record.lastUpdatedAt,
          expectedFrequency: record.expectedFrequency,
        };
      }

      // 按 D30 阈值重新判定
      const status = this.applyFreshnessThreshold(record.delayDays, thresholds);
      return {
        category,
        status,
        delayDays: record.delayDays,
        lastUpdatedAt: record.lastUpdatedAt,
        expectedFrequency: record.expectedFrequency,
      };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'checkFreshness 降级');
      return { category, status: 'red', delayDays: -1, lastUpdatedAt: null, expectedFrequency: '' };
    }
  }

  private applyFreshnessThreshold(
    delayDays: number,
    t: { green: number; yellow: number; orange: number },
  ): FreshnessCheckResult['status'] {
    if (delayDays < 0) return 'red';
    if (delayDays <= t.green) return 'green';
    if (delayDays <= t.yellow) return 'yellow';
    if (delayDays <= t.orange) return 'orange';
    return 'red';
  }

  /** 完整性校验 — 由调用方提供字段定义 */
  private checkCompleteness(
    _poolName: string,
    _dataSourceId: string,
    fields?: FieldDescriptor[],
  ): CompletenessCheckResult {
    try {
      if (!fields || fields.length === 0) {
        return { passed: true, missingFields: [], typeErrors: [], totalFields: 0, completenessRate: 1 };
      }

      const requiredFields = fields.filter((f) => f.required);
      const missingFields: string[] = [];
      const typeErrors: string[] = [];

      // 当前无法访问实际数据值（不侵入 ingest），仅报告字段定义完整性
      // 实际字段值校验由 ingest 层在写入时完成
      // 这里检查字段定义本身的完备性
      for (const f of requiredFields) {
        if (!f.name || !f.type) {
          missingFields.push(f.name);
        }
      }

      const rate = fields.length > 0 ? (fields.length - missingFields.length) / fields.length : 1;
      return {
        passed: missingFields.length === 0 && typeErrors.length === 0,
        missingFields,
        typeErrors,
        totalFields: fields.length,
        completenessRate: rate,
      };
    } catch (err: unknown) {
      log.warn({ err }, 'checkCompleteness 降级');
      return { passed: false, missingFields: [], typeErrors: [], totalFields: 0, completenessRate: 0 };
    }
  }

  /** 数据气味监测 — 基于 PipelineMonitor 统计 */
  private checkDataSmell(poolName: string): DataSmellCheckResult {
    try {
      const stats = this.pipelineMonitor.getStats();
      const anomalies: string[] = [];

      // 通道统计
      const channelStats = stats.byChannel[poolName] || stats.byChannel['connector'];
      if (!channelStats) {
        return { hasAnomaly: false, anomalies: [], mutationRate: null };
      }

      // 失败率 > 20% → 异常
      const failureRate = channelStats.total > 0
        ? channelStats.failures / channelStats.total
        : 0;
      if (failureRate > 0.2) {
        anomalies.push(`失败率异常: ${(failureRate * 100).toFixed(1)}%`);
      }

      // 全局失败率 > 10% → 异常
      const globalFailureRate = stats.total > 0 ? (stats.total - Math.round(stats.successRate * stats.total)) / stats.total : 0;
      if (globalFailureRate > 0.1) {
        anomalies.push(`全局失败率 ${(globalFailureRate * 100).toFixed(1)}%`);
      }

      return {
        hasAnomaly: anomalies.length > 0,
        anomalies,
        mutationRate: failureRate,
      };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'checkDataSmell 降级');
      return { hasAnomaly: true, anomalies: ['check_error'], mutationRate: null };
    }
  }

  /** 三级降级计算 */
  private calculateDegradedLevel(
    freshness: FreshnessCheckResult,
    completeness: CompletenessCheckResult,
    dataSmell: DataSmellCheckResult,
  ): DegradedLevel {
    // Level 3: 完全暂停 — 新鲜度 red 且 数据气味异常
    if (freshness.status === 'red' && dataSmell.hasAnomaly) return 3;

    // Level 2: 硬降级 — 新鲜度 orange 或 完整率 < 50%
    if (freshness.status === 'orange' || completeness.completenessRate < 0.5) return 2;

    // Level 1: 软降级 — 新鲜度 yellow 或 数据气味异常
    if (freshness.status === 'yellow' || dataSmell.hasAnomaly) return 1;

    return 0;
  }

  /** 数据成熟度计算 — 基于 FreshnessTracker 中该 pool 的最早记录 */
  private calculateDataMaturity(poolName: string): DataMaturity {
    try {
      const records = this.freshnessTracker.getStatusByPool(poolName);
      if (records.length === 0) {
        return { score: 0, ageInDays: 0 };
      }

      // 找到最早的最后更新时间
      let earliest = Infinity;
      for (const r of records) {
        const t = new Date(r.lastUpdatedAt).getTime();
        if (t < earliest) earliest = t;
      }

      const ageInDays = Math.max(0, Math.round((Date.now() - earliest) / 86_400_000));

      // 成熟度 = 新鲜度 × 完整率 × 历史长度因子
      const freshnessScore = records.some((r) => r.freshnessStatus === 'green') ? 1 : 0.5;
      const ageFactor = Math.min(1, ageInDays / 365);
      const score = Math.round(freshnessScore * ageFactor * 100) / 100;

      return { score, ageInDays };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'calculateDataMaturity 降级');
      return { score: 0, ageInDays: 0 };
    }
  }

  /** 冷启动阶段判定 */
  private determineColdStartPhase(ageInDays: number): ColdStartPhase {
    if (ageInDays <= COLD_START_DAYS.hybridPhaseMin) return 'industry_baseline';
    if (ageInDays <= COLD_START_DAYS.hybridPhaseMax) return 'hybrid';
    return 'self_baseline';
  }
}
