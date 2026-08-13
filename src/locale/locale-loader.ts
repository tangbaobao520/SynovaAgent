/**
 * src/locale/locale-loader.ts — 多语言字符串加载器
 *
 * 从 extensions/locales/{lang}/ 目录加载 JSON locale 文件。
 * 支持 fallback 链：指定语言 → zh-CN（默认）。
 *
 * v3.6 Batch 1 — i18n 基础设施
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('locale/loader');

export interface LocaleStrings {
  language: string;
  ui: Record<string, string>;
  reportLabels: Record<string, unknown>;
  expertPrompts?: Record<string, unknown>;
}

// ═══ Cache ═══
const cache = new Map<string, LocaleStrings>();

// ═══ Default fallback ═══
const DEFAULT_LANG = 'zh-CN';
const LOCALE_DIR = join(process.cwd(), 'extensions', 'locales');

function getLang(): string {
  return process.env.SYNOVA_LOCALE || DEFAULT_LANG;
}

function resolveLang(requested: string): string {
  // Fallback chain: requested → zh-CN
  const manifestPath = join(LOCALE_DIR, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const languages: string[] = manifest.languages || [];
      if (languages.includes(requested)) return requested;
    } catch {
      // degraded — fall through to default
    }
  }
  // Check if directory exists
  if (existsSync(join(LOCALE_DIR, requested))) return requested;
  return DEFAULT_LANG;
}

/**
 * 加载指定语言的 locale 字符串。
 * 结果缓存在内存中，后续调用直接返回缓存。
 */
export function loadLocale(lang?: string): { locale: LocaleStrings; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  const target = resolveLang(lang || getLang());

  // Check cache
  const cached = cache.get(target);
  if (cached) return { locale: cached, degraded: false, errors: [] };

  const result: LocaleStrings = {
    language: target,
    ui: {},
    reportLabels: {},
  };

  try {
    const langDir = join(LOCALE_DIR, target);

    // Load ui-strings.json
    const uiPath = join(langDir, 'ui-strings.json');
    if (existsSync(uiPath)) {
      const uiData = JSON.parse(readFileSync(uiPath, 'utf-8'));
      result.ui = uiData.strings || {};
    } else {
      errors.push(`ui-strings.json 缺失: ${uiPath}`);
    }

    // Load report-labels.json
    const reportPath = join(langDir, 'report-labels.json');
    if (existsSync(reportPath)) {
      result.reportLabels = JSON.parse(readFileSync(reportPath, 'utf-8'));
    } else {
      errors.push(`report-labels.json 缺失: ${reportPath}`);
    }

    // Load expert-prompts.json (optional)
    const promptPath = join(langDir, 'expert-prompts.json');
    if (existsSync(promptPath)) {
      result.expertPrompts = JSON.parse(readFileSync(promptPath, 'utf-8'));
    }

    cache.set(target, result);
    log.info({ lang: target, cacheSize: cache.size }, 'locale 加载完成');
    return { locale: result, degraded: errors.length > 0, errors };
  } catch (err: any) {
    log.error({ err, lang: target }, 'locale 加载失败 — degraded');
    errors.push(`locale 加载失败: ${err.message}`);
    return { locale: result, degraded: true, errors };
  }
}

/**
 * 用 locale 字符串替换模板中的 {{key}} 占位符。
 * 支持双层命名空间：{{expert.field}} → locale.expertPrompts[expert][field]
 */
export function t(key: string, locale: LocaleStrings, fallback?: string): string {
  // Direct UI string lookup
  if (locale.ui[key]) return locale.ui[key];

  // Deep lookup in reportLabels
  const parts = key.split('.');
  let current: any = locale.reportLabels;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return fallback || key;
    }
  }
  if (typeof current === 'string') return current;
  return fallback || key;
}

/**
 * 重新加载 locale（清除缓存后重新加载）。
 * 用于 POST /api/reload 热加载。
 */
export function reloadLocale(lang?: string): ReturnType<typeof loadLocale> {
  const target = lang || getLang();
  cache.delete(target);
  return loadLocale(target);
}
