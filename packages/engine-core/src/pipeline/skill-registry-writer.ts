/**
 * skill-registry-writer.ts — 技能生成→市场回写（BP 壁垒六闭环）
 *
 * 引擎生成的新技能写回文件系统 + SQLite 注册表，
 * 下次其他用户运行时可通过 market skill-mapper 发现并复用。
 *
 * 写入策略:
 *   1. 文件系统: ~/.claworg/skill-registry/generated/{name}.json
 *   2. SQLite: skill_registry 表（通过 marketplace/skill-registry 模块）
 *   3. 可上架判断: securityScore >= 70 → allowAutoSync=true
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SkillCard, SkillSetBlue } from '../types';
import { recordSkillInstalled } from './phase-b/skill-signal-collector';
import { getEngineContext } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/skill-registry-writer');

// ================================================================
// 文件系统持久化
// ================================================================

function getRegistryDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '~';
  const dir = path.join(home, '.claworg', 'skill-registry', 'generated');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export interface RegistryFileEntry {
  id: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  sourceTier: string;
  securityScore: number | null;
  geneSources?: Array<{ kind: string; name: string; mapsTo: string }>;
  steps: string[];
  prerequisites: string[];
  failureModes: string[];
  installedAt: string;
  source: 'engine_pipeline';
  status: 'active';
}

/** 将 SkillCard 转为可持久化的注册表条目 */
function toRegistryEntry(skill: SkillCard): RegistryFileEntry {
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    version: skill.version,
    sourceTier: skill.sourceTier,
    securityScore: skill.securityScore,
    geneSources: skill.geneSources,
    steps: skill.steps,
    prerequisites: skill.prerequisites,
    failureModes: skill.failureModes,
    installedAt: new Date().toISOString(),
    source: 'engine_pipeline',
    status: 'active',
  };
}

function writeEntryToFile(entry: RegistryFileEntry): void {
  const dir = getRegistryDir();
  const slug = slugify(entry.name);
  const filePath = path.join(dir, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}

// ================================================================
// 主入口：从 Phase D 结果批量写入
// ================================================================

export interface WriteResult {
  written: number;
  skipped: number;
  entries: RegistryFileEntry[];
}

/**
 * 将 Pipeline 产出的技能写入注册表。
 *
 * 写入规则:
 *   - 引擎映射的技能（sourceTier = 'verified' | 'inferred'）：写入（已有种子信任）
 *   - LLM 新生成的技能（sourceTier = 'speculative'）：写入但标记 draft
 *   - 所有技能通过文件系统持久化 + SQLite 可选写入
 *
 * @param skillSets Phase D 产出的技能集
 * @param writeToSqlite 是否同时写入 SQLite skill_registry（默认 true，silent fail）
 */
export function writeSkillsToRegistry(
  skillSets: SkillSetBlue[],
  writeToSqlite: boolean = true,
): WriteResult {
  const result: WriteResult = { written: 0, skipped: 0, entries: [] };

  for (const ss of skillSets) {
    for (const skill of ss.skills) {
      // 跳过已经存在的文件（幂等）
      const slug = slugify(skill.name);
      const dir = getRegistryDir();
      if (fs.existsSync(path.join(dir, `${slug}.json`))) {
        result.skipped++;
        continue;
      }

      const entry = toRegistryEntry(skill);
      try {
        writeEntryToFile(entry);
        result.written++;
        result.entries.push(entry);
      } catch (err) {
        log.warn(`[skill-registry-writer] 写入 ${skill.name} 失败: ${(err as Error).message}`);
      }
    }
  }

  // SQLite 写入
  if (writeToSqlite && result.entries.length > 0) {
    try {
      const registryPath = getEngineContext().filePaths.skillRegistryPath || '../marketplace/skill-registry';
      const { skillRegistry } = require(registryPath);
      for (const entry of result.entries) {
        try {
          const autoSync = entry.securityScore != null && entry.securityScore >= 70;
          skillRegistry.register({
            id: entry.id,
            name: entry.name,
            version: entry.version,
            category: entry.category,
            source: 'engine_pipeline',
            installedAt: entry.installedAt,
            updatedAt: entry.installedAt,
            status: 'active',
            allowAutoSync: autoSync,
            agentGenerated: entry.sourceTier === 'speculative',
            generatedBy: entry.sourceTier === 'speculative' ? 'engine-llm' : undefined,
          });
        } catch (sqliteErr) {
          // SQLite 写入失败不影响文件系统部分
          log.warn(`[skill-registry-writer] SQLite 写入 ${entry.name} 失败: ${(sqliteErr as Error).message}`);
        }
      }
    } catch (modErr) {
      // marketplace/skill-registry 模块不可用时静默跳过
      log.info(`[skill-registry-writer] SQLite 模块不可用，仅文件系统写入`);
    }
  }

  if (result.written > 0) {
    const autoSyncCount = result.entries.filter(e => e.securityScore != null && e.securityScore >= 70).length;
    log.info(`[skill-registry-writer] 写入 ${result.written} 新技能（${autoSyncCount} 可上架），跳过 ${result.skipped} 已存在`);
  }
  // P3-15: 反馈信号埋点 — 每个新生成技能记录 installed 事件
  if (result.written > 0) {
    for (const ss of skillSets) {
      for (const skill of ss.skills) {
        recordSkillInstalled({
          skillName: skill.name,
          sourceFrameworkId: skill.sourceFramework || 'phase-a-derived',
          teamId: (skill as unknown as Record<string, unknown>)._teamId as string || 'unknown',
          roleName: ss.roleName || ss.roleId,
          engineRecommended: skill.sourceFramework !== 'marketplace',
        });
      }
    }
  }

  return result;
}

/**
 * 启动时从文件系统加载已有技能条目（供 skill-mapper 初始化市场注册表）。
 */
export function loadRegistryFromDisk(): RegistryFileEntry[] {
  const entries: RegistryFileEntry[] = [];
  try {
    const dir = getRegistryDir();
    if (!fs.existsSync(dir)) return entries;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const entry = JSON.parse(raw) as RegistryFileEntry;
        entries.push(entry);
      } catch (_e) { log.debug('损坏的注册文件跳过: %s', String(_e)); }
    }
  } catch (_e) { log.debug('注册目录读取失败: %s', String(_e)); }
  return entries;
}

// ══════════════════════════════════════════════════════════════════
// Path 2: 云端市场发布（引擎生成技能 → 云端推送）
// ══════════════════════════════════════════════════════════════════

/**
 * 将新生成的技能发布到千面云端市场。
 * 只有 securityScore >= 70 的技能才推送。
 * fire-and-forget — 网络失败不阻塞管线。
 *
 * @returns 成功推送的技能数
 */
export async function publishNewSkillsToCloud(entries: RegistryFileEntry[]): Promise<number> {
  const publishable = entries.filter(e => e.securityScore != null && e.securityScore >= 70);
  if (publishable.length === 0) return 0;

  let published = 0;

  const tasks = publishable.map(async (entry) => {
    try {
      const resp = await getEngineContext().marketplace.publishSkill({
        localId: entry.id,
        name: entry.name,
        summary: entry.summary,
        description: entry.description,
        scenarios: [],
        steps: entry.steps || [],
        tags: entry.tags,
        category: entry.category,
        version: entry.version,
        agentGenerated: entry.sourceTier === 'speculative',
        generatedBy: entry.sourceTier === 'speculative'
          ? { agentId: 'engine-llm', agentRole: 'pipeline', reason: '引擎自动生成填补技能缺口' }
          : undefined,
      });
      if (resp?.success) published++;
    } catch (_e) { log.debug('云端发布技能跳过: %s', String(_e)); }
  });

  await Promise.all(tasks);

  if (published > 0) {
    log.info(`[skill-registry-writer] 云端发布: ${published}/${publishable.length} 技能`);
  }

  return published;
}