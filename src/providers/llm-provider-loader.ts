/**
 * src/providers/llm-provider-loader.ts — LLM 提供商加载器
 * V3.8 Batch 4 — 扫描 extensions/llm-providers/* /manifest.json。
 * ProviderType union 保留为 fallback，不删。
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('providers/llm-loader');
const LLM_DIR = join(process.cwd(), 'extensions', 'llm-providers');

export interface LLMProviderManifest {
  name: string; version: string; type: string; displayName: string;
  capabilities: { maxContext: number; functionCalling: boolean; streaming: boolean };
  entryPoint: string; exportKey: string;
}

let cache: LLMProviderManifest[] | null = null;

export function loadLLMProviders(): { providers: LLMProviderManifest[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { providers: cache, degraded: false, errors: [] };
  const providers: LLMProviderManifest[] = [];
  try {
    if (!existsSync(LLM_DIR)) return { providers: [], degraded: true, errors: ['目录不存在'] };
    for (const entry of readdirSync(LLM_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const mf = join(LLM_DIR, entry.name, 'manifest.json');
      if (!existsSync(mf)) { errors.push(`${entry.name}: 缺 manifest.json`); continue; }
      try { providers.push(JSON.parse(readFileSync(mf, 'utf-8')) as LLMProviderManifest); }
      catch (err: any) { errors.push(`${entry.name}: 解析失败`); }
    }
    log.info({ count: providers.length }, 'LLM 提供商加载完成');
    cache = providers;
    return { providers, degraded: errors.length > 0, errors };
  } catch (err: any) { log.error({ err }, 'LLM 提供商加载失败'); return { providers: [], degraded: true, errors: [err.message] }; }
}
export function getLLMProvider(name: string): LLMProviderManifest | null {
  return loadLLMProviders().providers.find(p => p.name === name) || null;
}
export function clearLLMProviderCache(): void { cache = null; }
