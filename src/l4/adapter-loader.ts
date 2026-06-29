/**
 * src/l4/adapter-loader.ts — 连接器适配器加载器
 * 扫描 extensions/adapters/ 目录 → 注册到 ConnectorRegistry。
 * V3.8 Batch 5 — IM 连接器文件化
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l4/adapter-loader');

export interface AdapterManifest {
  name: string; version: string; type: string; platform: string;
  displayName: string; entryPoint: string; exportKey: string;
}

const ADAPTERS_DIR = join(process.cwd(), 'extensions', 'adapters');
let cache: AdapterManifest[] | null = null;

export function loadAdapters(): { adapters: AdapterManifest[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { adapters: cache, degraded: false, errors: [] };
  const adapters: AdapterManifest[] = [];
  try {
    if (!existsSync(ADAPTERS_DIR)) return { adapters: [], degraded: true, errors: ['目录不存在'] };
    for (const entry of readdirSync(ADAPTERS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const mf = join(ADAPTERS_DIR, entry.name, 'manifest.json');
      if (!existsSync(mf)) { errors.push(`${entry.name}: 缺 manifest.json`); continue; }
      try { adapters.push(JSON.parse(readFileSync(mf, 'utf-8')) as AdapterManifest); }
      catch (err: any) { errors.push(`${entry.name}: 解析失败`); }
    }
    log.info({ count: adapters.length }, '适配器加载完成');
    cache = adapters;
    return { adapters, degraded: errors.length > 0, errors };
  } catch (err: any) { log.error({ err }, '适配器加载失败'); return { adapters: [], degraded: true, errors: [err.message] }; }
}

export function clearAdapterCache(): void { cache = null; }
