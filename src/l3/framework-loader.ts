/**
 * src/l3/framework-loader.ts — 认知框架加载器
 *
 * 从 extensions/frameworks/{category}/*.json 加载 85 个多元思维模型。
 * 替代 `import { SEED_FRAMEWORKS } from '...framework-library'`。
 *
 * v3.6 Batch 1 — 框架文件化。不碰 engine-core 文件。
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('l3/framework-loader');

export interface SkillPattern {
  name: string;
  summary: string;
  category: string;
  tags: string[];
  isMarketplaceSkill: boolean;
  prerequisites: string[];
  failureModes: string[];
  sourceTier: 'verified' | 'inferred' | 'speculative';
  dependsOn: string[];
  conflictsWith: string[];
  triggers: string[];
}

export interface Framework {
  $id?: string;
  id: string;
  name: string;
  category: 'psychology' | 'economics' | 'math-engineering' | 'medicine' | 'biology-physics' | 'law-governance';
  coreInsight: string;
  applicableDecisionTypes: string[];
  limitations: string[];
  constraintPatterns: string[];
  applicableRoles: string[];
  skillPatterns?: SkillPattern[];
}

const FRAMEWORKS_DIR = join(process.cwd(), 'extensions', 'frameworks');

/** 从 manifest.json 动态读取类别列表，不硬编码 */
function getCategories(): string[] {
  try {
    const manifestPath = join(FRAMEWORKS_DIR, 'manifest.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (manifest.categories && typeof manifest.categories === 'object') {
        return Object.keys(manifest.categories);
      }
    }
  } catch { /* degraded */ }
  // Fallback — 扫描目录
  try {
    return readdirSync(FRAMEWORKS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    // degraded — 返回空数组，后续 loadFrameworks 会记录错误
    return [];
  }
}

// ═══ Cache ═══
let cache: Framework[] | null = null;

/**
 * 加载全部 85 个认知框架。
 * 从 extensions/frameworks/{category}/ 目录读取 JSON 文件。
 * 结果缓存在内存中。
 */
export function loadFrameworks(): { frameworks: Framework[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cache) return { frameworks: cache, degraded: false, errors: [] };

  const frameworks: Framework[] = [];

  try {
    const categories = getCategories();
    for (const category of categories) {
      const catDir = join(FRAMEWORKS_DIR, category);
      if (!existsSync(catDir)) {
        errors.push(`框架类别目录不存在: ${catDir}`);
        continue;
      }

      const files = readdirSync(catDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(catDir, file), 'utf-8'));
          frameworks.push(data as Framework);
        } catch (err: any) {
          errors.push(`框架文件解析失败: ${category}/${file}: ${err.message}`);
        }
      }
    }

    log.info({ count: frameworks.length, categories: [...new Set(frameworks.map(f => f.category))] }, '认知框架加载完成');
    cache = frameworks;
    return { frameworks, degraded: errors.length > 0, errors };
  } catch (err: any) {
    log.error({ err }, '框架加载失败 — degraded');
    errors.push(`框架加载失败: ${err.message}`);
    cache = [];
    return { frameworks: [], degraded: true, errors };
  }
}

/**
 * 按类别筛选框架。
 */
export function getFrameworksByCategory(category: string): Framework[] {
  const { frameworks } = loadFrameworks();
  return frameworks.filter(f => f.category === category);
}

/**
 * 按约束模式匹配框架。返回匹配度排序的框架列表。
 */
export function matchFrameworksByConstraint(constraints: string[]): Framework[] {
  const { frameworks } = loadFrameworks();
  const scored = frameworks.map(f => {
    const matched = f.constraintPatterns.filter(p =>
      constraints.some(c => c.includes(p) || p.includes(c))
    );
    return { framework: f, score: matched.length };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.framework);
}

/**
 * 清除缓存（用于热加载）。
 */
export function clearFrameworkCache(): void {
  cache = null;
  log.info('框架缓存已清除');
}
