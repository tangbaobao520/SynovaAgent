/**
 * monitoring/data-quality-gate.ts 鈥?DataQualityGate (D30)
 *
 * 鏁版嵁璐ㄩ噺闂ㄧ锛氭柊椴滃害鍒ゅ畾 + 瀹屾暣鎬ф牎楠?+ 鏁版嵁姘斿懗鐩戞帶 + 涓夌骇闄嶇骇 + 鍐峰惎鍔ㄣ€? *
 * 澶嶇敤 D35 鐨?FreshnessTracker + PipelineMonitor銆? * 涓嶉樆鏂啓鍏?鈥?浠呮爣璁板拰鎶ュ憡锛堟暟鎹眰瑙勮寖鏍稿績鍘熷垯锛夈€? *
 * 閾佸緥 24: catch + log + degraded
 * 閾佸緥 38: 闆?as any
 */
import { createLogger } from '@synova/logger';
 * 閾佸緥 38: zero unsafe type casts
import type { PipelineMonitor, PipelineStats } from './pipeline-monitor';

const log = createLogger('monitoring/data-quality');

// 鈺愨晲鈺?Types 鈺愨晲鈺?
export interface QualityReport {
  poolName: string;
  dataSourceId: string;
  timestamp: string;
  /** 鍏ㄥ眬鏄惁閫氳繃锛坒reshness + completeness + dataSmell 鍏ㄩ儴姝ｅ父锛?*/
  passed: boolean;
  /** 閫愰」妫€鏌ユ竻鍗?*/
  checks: QualityCheck[];
  /** 鏂伴矞搴﹀垽瀹?*/
  freshness: FreshnessCheckResult;
  /** 瀹屾暣鎬ф牎楠?*/
  completeness: CompletenessCheckResult;
  /** 鏁版嵁姘斿懗鐩戞祴 */
  dataSmell: DataSmellCheckResult;
  /** 涓夌骇闄嶇骇绾у埆 (0=姝ｅ父 1=杞?2=纭?3=瀹屽叏鏆傚仠) */
  degradedLevel: DegradedLevel;
  /** 鏁版嵁鎴愮啛搴?*/
  dataMaturity: DataMaturity;
  /** 鍐峰惎鍔ㄩ樁娈?*/
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
/** 鍚堟硶鍐峰惎鍔ㄩ樁娈?*/
export const COLD_START_PHASES = ['industry_baseline', 'hybrid', 'self_baseline'] as const;

export interface DataMaturity {
  score: number;
  ageInDays: number;
}

/** 瀛楁鎻忚堪锛堝彲閫夊畬鏁存€ф牎楠岋級 */
export interface FieldDescriptor {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
}

// 鈺愨晲鈺?Freshness thresholds 鈺愨晲鈺?
/**
 * D30 浜旂被鏁版嵁鐨勬柊椴滃害闃堝€硷紙澶╂暟 鈫?green/yellow/orange/red锛? * 涓?FreshnessTracker 棰戠巼绾ч槇鍊间笉鍚岋紝杩欓噷鏄寜鏁版嵁绫诲埆瀹氫箟銆? */
export const FRESHNESS_THRESHOLDS: Record<string, { label: string; green: number; yellow: number; orange: number }> = {
  'real-time':      { label: '瀹炴椂淇″彿',     green: 1,   yellow: 3,   orange: 7 },
  'operational':    { label: '缁忚惀鏁版嵁',     green: 7,   yellow: 14,  orange: 30 },
  'financial':      { label: '璐㈠姟鏁版嵁',     green: 30,  yellow: 60,  orange: 90 },
  'organizational': { label: '缁勭粐鏁版嵁',     green: 30,  yellow: 90,  orange: 180 },
  'industry':       { label: '琛屼笟鍩哄噯',     green: 90,  yellow: 180, orange: 365 },
};

/** poolName 鈫?鏁版嵁绫诲埆鏄犲皠 */
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

// 鈺愨晲鈺?Cold start phases 鈺愨晲鈺?
/** 鍐峰惎鍔ㄥぉ鏁伴槇鍊?*/
export const COLD_START_DAYS = {
  industryPhase:  0,    // 0-90澶? 100%琛屼笟鍩哄噯
  hybridPhaseMin:  91,   // 91-180澶? 娣峰悎
  hybridPhaseMax:  180,  // 180澶?: 鑷韩鍩虹嚎
  selfPhaseMin:    181,
};

// 鈺愨晲鈺?DataQualityGate 鈺愨晲鈺?
export class DataQualityGate {
  private freshnessTracker: FreshnessTracker;
  private pipelineMonitor: PipelineMonitor;

  constructor(freshnessTracker: FreshnessTracker, pipelineMonitor: PipelineMonitor) {
    this.freshnessTracker = freshnessTracker;
    this.pipelineMonitor = pipelineMonitor;
  }

  /**
   * 鎵ц璐ㄩ噺闂ㄧ璇勪及銆?   * @param poolName - 鏁版嵁姹犲悕锛堝 'erp', 'crm'锛?   * @param dataSourceId - 鏁版嵁婧?ID
   * @param fields - 鍙€夊瓧娈垫弿杩板垪琛紙鐢ㄤ簬瀹屾暣鎬ф牎楠岋級
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

      // 1. 鏂伴矞搴﹀垽瀹?      const freshness = this.checkFreshness(poolName, dataSourceId, category);
      checks.push({
        name: 'freshness',
        passed: freshness.status === 'green' || freshness.status === 'yellow',
        severity: freshness.status === 'red' ? 'error' : freshness.status === 'orange' ? 'warning' : 'info',
        detail: `${freshness.category}: ${freshness.status} (${freshness.delayDays}澶?`,
      });

      // 2. 瀹屾暣鎬ф牎楠?      const completeness = this.checkCompleteness(poolName, dataSourceId, fields);
      checks.push({
        name: 'completeness',
        passed: completeness.passed,
        severity: completeness.passed ? 'info' : 'error',
        detail: `${completeness.completenessRate * 100}% 瀹屾暣 (缂哄け ${completeness.missingFields.length} 瀛楁)`,
      });

      // 3. 鏁版嵁姘斿懗鐩戞祴
      const dataSmell = this.checkDataSmell(poolName);
      checks.push({
        name: 'data_smell',
        passed: !dataSmell.hasAnomaly,
        severity: dataSmell.hasAnomaly ? 'warning' : 'info',
        detail: dataSmell.hasAnomaly
          ? `妫€娴嬪埌 ${dataSmell.anomalies.length} 涓紓甯? ${dataSmell.anomalies.join(', ')}`
          : '鏃犲紓甯?,
      });

      // 4. 鏁版嵁鎴愮啛搴?+ 鍐峰惎鍔?      const dataMaturity = this.calculateDataMaturity(poolName);
      const coldStartPhase = this.determineColdStartPhase(dataMaturity.ageInDays);
      checks.push({
        name: 'cold_start',
        passed: coldStartPhase === 'self_baseline',
        severity: coldStartPhase === 'industry_baseline' ? 'warning' : 'info',
        detail: `鍐峰惎鍔ㄩ樁娈? ${coldStartPhase} (鎴愮啛搴?${dataMaturity.ageInDays}澶?`,
      });

      // 5. 涓夌骇闄嶇骇
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
      log.error({ err, poolName, dataSourceId }, 'DataQualityGate.evaluate 寮傚父');
      return {
        poolName,
        dataSourceId,
        timestamp: new Date().toISOString(),
        passed: false,
        checks: [{ name: 'error', passed: false, severity: 'error', detail: '璐ㄩ噺闂ㄧ寮傚父闄嶇骇' }],
        freshness: { category: 'unknown', status: 'red', delayDays: -1, lastUpdatedAt: null, expectedFrequency: '' },
        completeness: { passed: false, missingFields: [], typeErrors: [], totalFields: 0, completenessRate: 0 },
        dataSmell: { hasAnomaly: true, anomalies: ['gate_error'], mutationRate: null },
        degradedLevel: 3,
        dataMaturity: { score: 0, ageInDays: 0 },
        coldStartPhase: 'industry_baseline',
      };
    }
  }

  /** 瑙ｆ瀽 freshnessTracker 鏁版嵁骞舵槧灏勫埌 5 绫婚槇鍊?*/
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
        // 鏃犻槇鍊煎畾涔?鈫?浣跨敤 FreshnessTracker 鑷韩鐘舵€?        return {
          category,
          status: record.freshnessStatus as FreshnessCheckResult['status'],
          delayDays: record.delayDays,
          lastUpdatedAt: record.lastUpdatedAt,
          expectedFrequency: record.expectedFrequency,
        };
      }

      // 鎸?D30 闃堝€奸噸鏂板垽瀹?      const status = this.applyFreshnessThreshold(record.delayDays, thresholds);
      return {
        category,
        status,
        delayDays: record.delayDays,
        lastUpdatedAt: record.lastUpdatedAt,
        expectedFrequency: record.expectedFrequency,
      };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'checkFreshness 闄嶇骇');
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

  /** 瀹屾暣鎬ф牎楠?鈥?鐢辫皟鐢ㄦ柟鎻愪緵瀛楁瀹氫箟 */
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

      // 褰撳墠鏃犳硶璁块棶瀹為檯鏁版嵁鍊硷紙涓嶄镜鍏?ingest锛夛紝浠呮姤鍛婂瓧娈靛畾涔夊畬鏁存€?      // 瀹為檯瀛楁鍊兼牎楠岀敱 ingest 灞傚湪鍐欏叆鏃跺畬鎴?      // 杩欓噷妫€鏌ュ瓧娈靛畾涔夋湰韬殑瀹屽鎬?      for (const f of requiredFields) {
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
      log.warn({ err }, 'checkCompleteness 闄嶇骇');
      return { passed: false, missingFields: [], typeErrors: [], totalFields: 0, completenessRate: 0 };
    }
  }

  /** 鏁版嵁姘斿懗鐩戞祴 鈥?鍩轰簬 PipelineMonitor 缁熻 */
  private checkDataSmell(poolName: string): DataSmellCheckResult {
    try {
      const stats = this.pipelineMonitor.getStats();
      const anomalies: string[] = [];

      // 閫氶亾缁熻
      const channelStats = stats.byChannel[poolName] || stats.byChannel['connector'];
      if (!channelStats) {
        return { hasAnomaly: false, anomalies: [], mutationRate: null };
      }

      // 澶辫触鐜?> 20% 鈫?寮傚父
      const failureRate = channelStats.total > 0
        ? channelStats.failures / channelStats.total
        : 0;
      if (failureRate > 0.2) {
        anomalies.push(`澶辫触鐜囧紓甯? ${(failureRate * 100).toFixed(1)}%`);
      }

      // 鍏ㄥ眬澶辫触鐜?> 10% 鈫?寮傚父
      const globalFailureRate = stats.total > 0 ? (stats.total - Math.round(stats.successRate * stats.total)) / stats.total : 0;
      if (globalFailureRate > 0.1) {
        anomalies.push(`鍏ㄥ眬澶辫触鐜?${(globalFailureRate * 100).toFixed(1)}%`);
      }

      return {
        hasAnomaly: anomalies.length > 0,
        anomalies,
        mutationRate: failureRate,
      };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'checkDataSmell 闄嶇骇');
      return { hasAnomaly: true, anomalies: ['check_error'], mutationRate: null };
    }
  }

  /** 涓夌骇闄嶇骇璁＄畻 */
  private calculateDegradedLevel(
    freshness: FreshnessCheckResult,
    completeness: CompletenessCheckResult,
    dataSmell: DataSmellCheckResult,
  ): DegradedLevel {
    // Level 3: 瀹屽叏鏆傚仠 鈥?鏂伴矞搴?red 涓?鏁版嵁姘斿懗寮傚父
    if (freshness.status === 'red' && dataSmell.hasAnomaly) return 3;

    // Level 2: 纭檷绾?鈥?鏂伴矞搴?orange 鎴?瀹屾暣鐜?< 50%
    if (freshness.status === 'orange' || completeness.completenessRate < 0.5) return 2;

    // Level 1: 杞檷绾?鈥?鏂伴矞搴?yellow 鎴?鏁版嵁姘斿懗寮傚父
    if (freshness.status === 'yellow' || dataSmell.hasAnomaly) return 1;

    return 0;
  }

  /** 鏁版嵁鎴愮啛搴﹁绠?鈥?鍩轰簬 FreshnessTracker 涓 pool 鐨勬渶鏃╄褰?*/
  private calculateDataMaturity(poolName: string): DataMaturity {
    try {
      const records = this.freshnessTracker.getStatusByPool(poolName);
      if (records.length === 0) {
        return { score: 0, ageInDays: 0 };
      }

      // 鎵惧埌鏈€鏃╃殑鏈€鍚庢洿鏂版椂闂?      let earliest = Infinity;
      for (const r of records) {
        const t = new Date(r.lastUpdatedAt).getTime();
        if (t < earliest) earliest = t;
      }

      const ageInDays = Math.max(0, Math.round((Date.now() - earliest) / 86_400_000));

      // 鎴愮啛搴?= 鏂伴矞搴?脳 瀹屾暣鐜?脳 鍘嗗彶闀垮害鍥犲瓙
      const freshnessScore = records.some((r) => r.freshnessStatus === 'green') ? 1 : 0.5;
      const ageFactor = Math.min(1, ageInDays / 365);
      const score = Math.round(freshnessScore * ageFactor * 100) / 100;

      return { score, ageInDays };
    } catch (err: unknown) {
      log.warn({ err, poolName }, 'calculateDataMaturity 闄嶇骇');
      return { score: 0, ageInDays: 0 };
    }
  }

  /** 鍐峰惎鍔ㄩ樁娈靛垽瀹?*/
  private determineColdStartPhase(ageInDays: number): ColdStartPhase {
    if (ageInDays <= COLD_START_DAYS.hybridPhaseMin) return 'industry_baseline';
    if (ageInDays <= COLD_START_DAYS.hybridPhaseMax) return 'hybrid';
    return 'self_baseline';
  }
}