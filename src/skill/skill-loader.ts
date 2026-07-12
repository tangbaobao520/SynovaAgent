/**
 * src/skill/skill-loader.ts — D65 Skill 加载器
 *
 * 对标 sentinel-loader.ts 的文件驱动模式：
 *   目录扫描 → manifest.json 解析 → 优先级覆盖 → 缓存
 *
 * 从 extensions/skills/{custom,industry,builtin} 目录加载 Skill，
 * 按 custom > industry > builtin 优先级覆盖同名 Skill。
 *
 * 设计原则:
 *   - 空目录不崩溃，返回 { skills: [], degraded: false, errors: [] }
 *   - 缓存结果直到 clearSkillCache() 调用
 *   - 单个 manifest 解析失败仅记录 errors，不影响其他 Skill
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('skill/loader');

// ═══ Types ═══

export interface SkillManifest {
  name: string;
  version: string;
  type: 'skill';
  displayName: string;
  description: string;
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
  complexity: 'atomic' | 'composite' | 'expert';
  expert: string;
  tools: string[];
  entryPoint: string;
  exportKey: string;
  permissions: {
    dataAccess: { dimensions: string[]; sensitiveAccess: string };
    crossExpert: string[];
  };
}

export interface LoadedSkill {
  manifest: SkillManifest;
  dir: string;
}

// ═══ 扫描路径（按优先级排列：custom > industry > builtin） ═══

const SKILL_ROOTS = [
  join(process.cwd(), 'extensions', 'skills', 'custom'),
  join(process.cwd(), 'extensions', 'skills', 'industry'),
  join(process.cwd(), 'extensions', 'skills', 'builtin'),
];

// ═══ Cache ═══

let cache: LoadedSkill[] | null = null;

/**
 * 扫描 extensions/skills/ 目录，加载所有 Skill manifest。
 *
 * 按 custom > industry > builtin 优先级扫描：后扫描到的同名 Skill
 * 覆盖先扫描到的（builtin 最先扫描，custom 最后覆盖）。
 *
 * @returns { skills: LoadedSkill[], degraded: boolean, errors: string[] }
 *
 * - 空目录 → { skills: [], degraded: false, errors: [] }
 * - 缺少 manifest.json → errors[]，继续扫描
 * - manifest.json 解析失败 → errors[]，继续扫描
 * - 同级目录下同名校验不做（由目录结构保证）
 */
export function loadSkills(): { skills: LoadedSkill[]; degraded: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cache) return { skills: cache, degraded: false, errors: [] };

  const skills: LoadedSkill[] = [];
  const seen = new Set<string>(); // 追踪同名 skill，高优先级覆盖

  for (const root of SKILL_ROOTS) {
    try {
      if (!existsSync(root)) {
        // 目录不存在不是错误（extensions/skills/custom 可能尚未创建）
        continue;
      }

      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // 跳过模板目录
        if (entry.name.startsWith('_')) continue;

        const manifestPath = join(root, entry.name, 'manifest.json');
        if (!existsSync(manifestPath)) {
          errors.push(`Skill ${entry.name} 缺少 manifest.json`);
          continue;
        }

        try {
          const raw = readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw) as SkillManifest;

          // 基本校验：name 不能为空
          if (!manifest.name) {
            errors.push(`Skill ${entry.name} manifest name 为空`);
            continue;
          }

          const loaded: LoadedSkill = {
            manifest,
            dir: join(root, entry.name),
          };

          // 优先级覆盖：后扫描到的（higher priority）覆盖先扫描到的
          if (seen.has(manifest.name)) {
            const idx = skills.findIndex(s => s.manifest.name === manifest.name);
            if (idx !== -1) {
              skills[idx] = loaded;
            }
          } else {
            skills.push(loaded);
            seen.add(manifest.name);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Skill ${entry.name} manifest 解析失败: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Skill 加载失败 (root: ${root}): ${msg}`);
    }
  }

  log.info({ count: skills.length, errors: errors.length }, 'Skill 加载完成');
  cache = skills;
  return { skills, degraded: errors.length > 0, errors };
}

/**
 * 清除缓存（用于热加载或测试重置）。
 */
export function clearSkillCache(): void {
  cache = null;
  log.info('Skill 缓存已清除');
}

/**
 * 将已加载的 Skill 注册到全局 SkillRegistry。
 * 返回注册结果统计。
 */
export async function registerLoadedSkills(): Promise<{ registered: number; errors: string[] }> {
  const { skills, errors: loadErrors } = loadSkills();
  const errors = [...loadErrors];
  let registered = 0;

  for (const skill of skills) {
    try {
      // 动态导入 skill-registry 避免循环依赖
      const { skillRegistry } = await import('./skill-registry');
      skillRegistry.register(skill);
      registered++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Skill ${skill.manifest.name} 注册失败: ${msg}`);
    }
  }

  if (registered > 0) log.info({ registered, errors: errors.length }, '文件驱动 Skill 已注册');
  return { registered, errors };
}
