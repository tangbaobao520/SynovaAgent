/**
 * src/l3/report-template-loader.ts — 报告模板加载器
 *
 * 从 extensions/reports/ 目录读取 .hbs 模板文件。
 * 支持简单的 {{key}} 占位符替换（无 Handlebars 依赖）。
 * 客户自定义模板优先级高于默认模板。
 *
 * v3.6 Batch 1 — 报告模板文件化
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l3/report-template-loader');

// ═══ Types ═══

export interface TemplateData {
  [key: string]: unknown;
}

export interface LoadedTemplate {
  name: string;
  source: string;       // 模板来源路径（用于调试）
  render: (data: TemplateData) => string;
}

// ═══ Cache ═══
const cache = new Map<string, LoadedTemplate>();

// ═══ Paths ═══
const REPORTS_DIR = join(process.cwd(), 'extensions', 'reports');
const CUSTOM_DIR = join(process.cwd(), 'knowledge', 'custom');

/**
 * 简单模板引擎 — 替换 {{key}} 和 {{#blocks}}...{{/blocks}} 占位符。
 * 不支持 Handlebars 的完整语法（helpers、partials、条件等）。
 * 仅支持：
 *   - {{key}} → 简单值替换
 *   - {{#array}}...{{/array}} → 数组迭代（块内访问 {{field}}）
 *   - {{^array}}...{{/array}} → 空数组时的 fallback 块
 */
function simpleRender(template: string, data: TemplateData): string {
  let result = template;

  // Phase 1: 处理 {{#array}}...{{/array}} 块（迭代）
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, blockContent) => {
    const arr = data[key];
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.map((item: any) => {
      let rendered = blockContent;
      for (const [k, v] of Object.entries(item)) {
        rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
      }
      return rendered;
    }).join('');
  });

  // Phase 2: 处理 {{^array}}...{{/array}} 空数组 fallback
  result = result.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, blockContent) => {
    const arr = data[key];
    if (Array.isArray(arr) && arr.length > 0) return '';
    return blockContent;
  });

  // Phase 3: 处理 {{key}} 简单替换
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key) => {
    const parts = key.split('.');
    let current: any = data;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return `{{${key}}}`; // 未找到的 key 原样保留
      }
    }
    return String(current ?? '');
  });

  return result;
}

/**
 * 加载报告模板。查找顺序：
 *   1. knowledge/custom/{client_id}/report.hbs（客户自定义）
 *   2. extensions/reports/{name}.hbs（系统默认）
 *   3. 返回 null（调用方使用硬编码 fallback）
 */
export function loadTemplate(name: string, clientId?: string): { template: LoadedTemplate | null; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  const cacheKey = clientId ? `${clientId}/${name}` : name;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached) return { template: cached, degraded: false, errors: [] };

  let source = '';
  let templatePath = '';

  // Priority 1: 客户自定义模板
  if (clientId) {
    const customPath = join(CUSTOM_DIR, clientId, 'report.hbs');
    if (existsSync(customPath)) {
      source = readFileSync(customPath, 'utf-8');
      templatePath = customPath;
      log.info({ clientId, path: customPath }, '使用客户自定义报告模板');
    }
  }

  // Priority 2: 系统默认模板
  if (!source) {
    const defaultPath = join(REPORTS_DIR, `${name}.hbs`);
    if (existsSync(defaultPath)) {
      source = readFileSync(defaultPath, 'utf-8');
      templatePath = defaultPath;
    } else {
      errors.push(`模板文件不存在: ${defaultPath}`);
      return { template: null, degraded: true, errors };
    }
  }

  const template: LoadedTemplate = {
    name,
    source: templatePath,
    render: (data: TemplateData) => simpleRender(source, data),
  };

  cache.set(cacheKey, template);
  return { template, degraded: false, errors };
}

/**
 * 列出所有可用的报告模板名称。
 */
export function listTemplates(): string[] {
  try {
    const manifestPath = join(REPORTS_DIR, 'manifest.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const templates = manifest.templates || {};
      return Object.keys(templates);
    }
  } catch {
    // degraded
  }
  return ['default'];
}

/**
 * 清除模板缓存（用于热加载）。
 */
export function clearTemplateCache(): void {
  cache.clear();
  log.info('报告模板缓存已清除');
}
