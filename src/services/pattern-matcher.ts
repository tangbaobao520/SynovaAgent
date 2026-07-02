/**
 * services/pattern-matcher.ts — 落地模式匹配服务 (Phase 3.2)
 *
 * 读取 extensions/implementation-patterns/*.json, 按 sentinelId 匹配。
 * 供 RightPanel 的"生成落地方案"功能使用。
 */
import { createLogger } from '@synova/logger';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('services/pattern-matcher');

export interface DataDependency {
  field: string;
  description: string;
  coverage: number;
}

export interface Skill {
  name: string;
  duration: string;
  owner: string;
}

export interface ImplementationPattern {
  name: string;
  version: string;
  description: string;
  sentinelIds: string[];
  dataDependencies: DataDependency[];
  skills: Skill[];
  estimatedImpact: { improvement: string; timeline: string };
  prerequisites: string[];
  riskFactors: string[];
}

let _patterns: ImplementationPattern[] | null = null;

/**
 * 加载所有落地模式 JSON 文件。
 */
function loadPatterns(): ImplementationPattern[] {
  if (_patterns) return _patterns;

  const patternsDir = path.resolve(process.cwd(), 'extensions', 'implementation-patterns');
  try {
    if (!fs.existsSync(patternsDir)) {
      log.warn('implementation-patterns 目录不存在');
      return [];
    }

    const files = fs.readdirSync(patternsDir).filter((f) => f.endsWith('.json') && f !== 'pattern-schema.json');
    _patterns = files.map((f) => {
      try {
        const content = fs.readFileSync(path.join(patternsDir, f), 'utf-8');
        return JSON.parse(content) as ImplementationPattern;
      } catch (err) {
        log.warn({ file: f, err }, '解析落地模式失败');
        return null;
      }
    }).filter(Boolean) as ImplementationPattern[];

    log.info({ count: _patterns.length }, '落地模式加载完成');
    return _patterns;
  } catch (err) {
    log.warn({ err }, '加载落地模式失败 — degraded');
    return [];
  }
}

/**
 * 按 sentinelId 匹配落地模式。
 */
export function matchPatterns(sentinelIds: string[]): ImplementationPattern[] {
  try {
    const patterns = loadPatterns();
    return patterns.filter((p) => p.sentinelIds.some((id) => sentinelIds.includes(id)));
  } catch (err) {
    log.warn({ err }, '匹配落地模式失败 — degraded');
    return [];
  }
}

/**
 * 计算数据字段覆盖度。
 */
export function computeCoverage(pattern: ImplementationPattern, availableFields: string[]): number {
  if (pattern.dataDependencies.length === 0) return 0;
  const matched = pattern.dataDependencies.filter((d) => availableFields.includes(d.field)).length;
  return matched / pattern.dataDependencies.length;
}

/**
 * 获取所有加载的模式。
 */
export function getAllPatterns(): ImplementationPattern[] {
  return loadPatterns();
}
