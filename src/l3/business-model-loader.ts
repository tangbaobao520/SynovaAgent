/**
 * src/l3/business-model-loader.ts — 商业模式加载器
 * V3.8 Batch 4 — 扫描 extensions/business-models/*.json → PKB 注入。
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l3/business-model-loader');
const BM_DIR = join(process.cwd(), 'extensions', 'business-models');

export interface BusinessModelDef { $id?: string; name: string; canvasType: string; description: string; }
let cache: BusinessModelDef[] | null = null;

export function loadBusinessModels(): { models: BusinessModelDef[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { models: cache, degraded: false, errors: [] };
  const models: BusinessModelDef[] = [];
  try {
    if (!existsSync(BM_DIR)) return { models: [], degraded: true, errors: ['目录不存在'] };
    for (const file of readdirSync(BM_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json')) {
      try { models.push(JSON.parse(readFileSync(join(BM_DIR, file), 'utf-8')) as BusinessModelDef); }
      catch (err: any) { errors.push(`${file}: 解析失败`); }
    }
    log.info({ count: models.length }, '商业模式加载完成');
    cache = models;
    return { models, degraded: errors.length > 0, errors };
  } catch (err: any) { log.error({ err }, '商业模式加载失败'); return { models: [], degraded: true, errors: [err.message] }; }
}
export function clearBusinessModelCache(): void { cache = null; }
