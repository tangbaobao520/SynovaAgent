/**
 * src/l4/industry-loader.ts — 行业模板加载器
 * V3.8 Batch 4 — 行业模板文件化。扫描 extensions/industries/* /manifest.json。
 * 支持 extends 继承。冲突不静默 — 生成告警日志。
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/industry-loader');

export interface IndustryManifest {
  name: string; version: string; type: string; displayName: string;
  extends?: string; entryPoint?: string;
}

const INDUSTRIES_DIR = join(process.cwd(), 'extensions', 'industries');
let cache: IndustryManifest[] | null = null;

export function loadIndustries(): { industries: IndustryManifest[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { industries: cache, degraded: false, errors: [] };
  const industries: IndustryManifest[] = [];
  try {
    if (!existsSync(INDUSTRIES_DIR)) return { industries: [], degraded: true, errors: ['目录不存在'] };
    for (const entry of readdirSync(INDUSTRIES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mf = join(INDUSTRIES_DIR, entry.name, 'manifest.json');
      if (!existsSync(mf)) { errors.push(`${entry.name}: 缺 manifest.json`); continue; }
      try { industries.push(JSON.parse(readFileSync(mf, 'utf-8')) as IndustryManifest); }
      catch (err: any) { errors.push(`${entry.name}: JSON 解析失败`); }
    }
    // 检查 extends 引用完整性
    const names = new Set(industries.map(i => i.name));
    for (const ind of industries) {
      if (ind.extends && ind.extends !== 'base' && !names.has(ind.extends)) {
        log.warn({ industry: ind.name, extends: ind.extends }, 'extends 引用断裂 — 父模板不存在');
      }
    }
    log.info({ count: industries.length }, '行业模板加载完成');
    cache = industries;
    return { industries, degraded: errors.length > 0, errors };
  } catch (err: any) { log.error({ err }, '行业加载失败'); return { industries: [], degraded: true, errors: [err.message] }; }
}

export function getIndustry(name: string): IndustryManifest | null {
  const { industries } = loadIndustries();
  return industries.find(i => i.name === name) || null;
}

export function listIndustries(): string[] { return loadIndustries().industries.map(i => i.name); }
export function clearIndustryCache(): void { cache = null; }
