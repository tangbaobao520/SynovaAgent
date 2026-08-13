/**
 * src/l3/rule-loader.ts — 诊断规则加载器
 *
 * 从 extensions/rules/ 目录加载规则 JSON 文件。
 * 规则通过 PKB + query_knowledge 工具消费。
 *
 * V3.7 Batch 3 — 规则文件化
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l3/rule-loader');

export interface DiagnosticRule {
  $id?: string;
  name: string;
  type: string;
  domain: string;
  category: string;
  severity: string;
  description: string;
  condition: Record<string, unknown>;
  action?: Record<string, unknown>;
  cooldownMs?: number;
  appliesTo?: string[];
  metadata: { source: string; confidence: number; status: string };
}

export interface SensitivityRule {
  $id?: string;
  name: string;
  type: string;
  domain: string;
  category: string;
  severity: string;
  keywords: string[];
  minPermissionLevel: string;
  defaultAction: string;
  metadata: { source: string; confidence: number; status: string };
}

export interface UpgradeStrategy {
  $id?: string;
  name: string;
  type: string;
  industry: string;
  escalation: Record<string, unknown>;
  signalRouting: Record<string, string[]>;
  metadata: { source: string; confidence: number; status: string };
}

export interface SignalRouting {
  $id?: string;
  name: string;
  type: string;
  routing: Record<string, string[]>;
  crossValidation: Record<string, string>;
  metadata: { source: string; confidence: number; status: string };
}

export interface LoadedRules {
  diagnostic: DiagnosticRule[];
  sensitivity: SensitivityRule[];
  upgradeStrategies: UpgradeStrategy[];
  signalRouting: SignalRouting | null;
}

const RULES_DIR = join(process.cwd(), 'extensions', 'rules');

// ═══ Cache ═══
let cache: LoadedRules | null = null;

/** 读取 JSON 文件，不存在或解析失败返回 null */
function readJSON<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch (err: any) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "规则文件存在检查");
    // JSON 解析失败 — 静默跳过损坏文件，不阻塞加载
    return null;
  }
}

/** 扫描目录下所有 .json 文件 */
function scanDir<T>(dir: string): T[] {
  const results: T[] = [];
  if (!existsSync(dir)) return results;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const item = readJSON<T>(join(dir, file));
    if (item) results.push(item);
  }
  return results;
}

/**
 * 加载所有规则。
 */
export function loadRules(): { rules: LoadedRules; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { rules: cache, degraded: false, errors: [] };

  try {
    const diagnostic = scanDir<DiagnosticRule>(join(RULES_DIR, 'diagnostic'));
    const upgradeStrategies = scanDir<UpgradeStrategy>(join(RULES_DIR, 'upgrade-strategies'));

    const rules: LoadedRules = {
      diagnostic: diagnostic.filter(r => r.type === 'rule'),
      sensitivity: [],
      upgradeStrategies,
      signalRouting: null,
    };

    log.info({ diagnostic: rules.diagnostic.length, strategies: rules.upgradeStrategies.length }, '规则加载完成');
    cache = rules;
    return { rules, degraded: errors.length > 0, errors };
  } catch (err: any) {
    log.error({ err }, '规则加载失败 — degraded');
    errors.push(`规则加载失败: ${err.message}`);
    return { rules: { diagnostic: [], sensitivity: [], upgradeStrategies: [], signalRouting: null }, degraded: true, errors };
  }
}

/**
 * 按行业获取升级策略。
 */
export function getUpgradeStrategy(industry: string): UpgradeStrategy | null {
  const { rules } = loadRules();
  return rules.upgradeStrategies.find(s => s.industry === industry) || null;
}

/**
 * 获取信号→专家路由表。哨兵 manifest 可覆盖此默认路由。
 */
export function getSignalRouting(): SignalRouting | null {
  const { rules } = loadRules();
  return rules.signalRouting;
}

/**
 * 清除缓存（用于热加载）。
 */
export function clearRuleCache(): void {
  cache = null;
  log.info('规则缓存已清除');
}
