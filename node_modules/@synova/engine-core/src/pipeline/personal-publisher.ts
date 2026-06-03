/**
 * pipeline/personal-publisher.ts — SoloHub 个人发布
 *
 * 将 BlueprintDTO 序列化为 Synova.yml 并写入 SoloHub 目录结构。
 * 纯文件 I/O，无 LLM 调用，同步返回。
 *
 * SoloHub 目录结构：
 *   ~/.solohub/
 *   ├── manifest.json
 *   ├── agents/{blueprintId}/
 *   │   ├── synova.yml
 *   │   ├── blueprint.json
 *   │   └── agents/{agentName}/
 *   │       ├── SOUL.md
 *   │       ├── TOOLS.md
 *   │       └── HEARTBEAT.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/personal-publisher');
import * as os from 'os';
import type { BlueprintDTO } from '../types';
import { toSynovaYmlString, type SynovaYml } from './synova-yml-serializer';
import { ENGINE_VERSION } from '../pipeline-config';

// ====================================================================
// Types
// ====================================================================

export interface PublishOptions {
  /** SoloHub 根目录，默认 ~/.solohub */
  solohubDir?: string;
  /** 是否覆盖已有发布 */
  overwrite?: boolean;
}

export interface PublishResult {
  status: 'published' | 'updated';
  blueprintId: string;
  solohubPath: string;
  synovaYml: string;
  agentsCount: number;
}

export interface ManifestEntry {
  blueprintId: string;
  name: string;
  publishedAt: string;
  updatedAt: string;
  agentCount: number;
  agentsDir: string;
}

export interface SoloHubManifest {
  version: string;
  updatedAt: string;
  agents: ManifestEntry[];
}

// ====================================================================
// BlueprintDTO → SynovaYml
// ====================================================================

function blueprintToSynovaYml(blueprint: BlueprintDTO): SynovaYml {
  const constraints = blueprint.taskDef.constraints.map((c) => {
    const type = inferConstraintType(c);
    return { type, detail: c };
  });

  const roles = blueprint.teamStructure.roles.map((role) => {
    const genome = blueprint.personaGenomes.find((g) => g.roleId === role.id);
    const skillSet = blueprint.skillSets.find((s) => s.roleId === role.id);

    return {
      name: role.name,
      id: role.id,
      title: (role as unknown as Record<string, unknown>).title as string || '',
      genome: genome ? {
        cognitiveProfile: {
          primaryMode: inferPrimaryMode(genome),
          decisionStyle: genome.oceanScores.openness > 0.7 ? 'proactive'
            : genome.oceanScores.conscientiousness > 0.7 ? 'analytical' : 'reactive',
        },
        mentalModels: (genome.mentalModels || []).map((m: any) => ({
          name: m.name,
          source: m.source || '通用认知框架',
          application: m.application || '',
          limitation: m.limitation,
        })),
        antiPatterns: genome.antiPatterns || [],
        expressionDNA: {
          communicationStyle: genome.oceanScores.extraversion > 0.6 ? 'direct'
            : genome.oceanScores.agreeableness > 0.7 ? 'narrative' : 'structured',
          proactiveness: genome.oceanScores.openness,
          detailOrientation: genome.oceanScores.conscientiousness,
        },
      } : {
        cognitiveProfile: { primaryMode: 'general', decisionStyle: 'analytical' },
        mentalModels: [],
        antiPatterns: [],
        expressionDNA: { communicationStyle: 'structured', proactiveness: 0.5, detailOrientation: 0.5 },
      },
      skills: skillSet ? skillSet.skills.map((s) => ({
        name: s.name,
        category: s.category,
        geneSources: s.geneSources?.map((gs: any) => ({
          kind: gs.kind,
          name: gs.name,
          mapsTo: gs.mapsTo,
        })),
        applicableScenarios: s.scenarios?.length > 0 ? s.scenarios : undefined,
        steps: s.steps || [],
        notes: s.prerequisites?.length > 0 ? s.prerequisites : undefined,
        antiPatterns: s.failureModes?.length > 0 ? s.failureModes : undefined,
        approvalRequired: s.approvalRequired,
      })) : [],
    };
  });

  return {
    synova: {
      version: '1.0',
      engine: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      metadata: {
        name: blueprint.taskDef.job.substring(0, 40),
        description: blueprint.taskDef.job,
      },
    },
    task: {
      summary: blueprint.taskDef.job,
      constraints,
    },
    team: {
      protocol: {
        mode: blueprint.collaborationMode.mode,
        authorityGovernance: String(
          (blueprint.collaborationMode as unknown as Record<string, unknown>).authorityGovernance || 'hierarchical',
        ),
      },
      roles,
    },
  };
}

// ====================================================================
// Constraint type inference (same logic as synova-yml-serializer)
// ====================================================================

const CONSTRAINT_KEYWORDS: Array<[string, string]> = [
  ['地区', 'geography'], ['越南', 'geography'], ['东盟', 'geography'],
  ['认证', 'regulation'], ['合规', 'regulation'], ['法律', 'regulation'], ['税', 'regulation'],
  ['预算', 'budget'], ['资金', 'budget'], ['成本', 'budget'],
  ['时间', 'timeline'], ['周期', 'timeline'], ['限', 'timeline'],
  ['人', 'scale'], ['团队', 'scale'], ['小', 'scale'],
  ['行业', 'industry'], ['电商', 'industry'], ['跨境', 'industry'],
];

function inferConstraintType(detail: string): string {
  for (const [keyword, type] of CONSTRAINT_KEYWORDS) {
    if (detail.includes(keyword)) return type;
  }
  return 'custom';
}

function inferPrimaryMode(g: any): string {
  const o = g.oceanScores || {};
  const max = Math.max(o.openness || 0, o.conscientiousness || 0, o.extraversion || 0);
  if (max === o.openness) return 'opportunity_sensing';
  if (max === o.conscientiousness) return 'system_thinking';
  return 'first_principles';
}

// ====================================================================
// File I/O helpers
// ====================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSolohubDir(customDir?: string): string {
  return customDir || path.join(os.homedir(), '.solohub');
}

function loadManifest(solohubDir: string): SoloHubManifest {
  const manifestPath = path.join(solohubDir, 'manifest.json');
  try {
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
  } catch { log.debug('[personal-publisher] corrupt manifest, starting fresh'); /* corrupt manifest → start fresh */ }
  return { version: '1.0', updatedAt: '', agents: [] };
}

function saveManifest(solohubDir: string, manifest: SoloHubManifest): void {
  ensureDir(solohubDir);
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(solohubDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
}

// ====================================================================
// Agent file generation (SOUL.md, TOOLS.md, HEARTBEAT.md)
// ====================================================================

function generateSoulMd(blueprint: BlueprintDTO, roleName: string, genome: any): string {
  const lines: string[] = [];
  lines.push(`# ${roleName} — SOUL.md`);
  lines.push('');
  lines.push('## 身份');
  lines.push(`我是 ${blueprint.blueprintId} 团队中的 ${roleName}。`);
  lines.push('');
  lines.push('## 认知画像');
  if (genome) {
    const o = genome.oceanScores || {};
    lines.push(`- 开放性: ${(o.openness || 0.5).toFixed(2)}`);
    lines.push(`- 尽责性: ${(o.conscientiousness || 0.5).toFixed(2)}`);
    lines.push(`- 外向性: ${(o.extraversion || 0.5).toFixed(2)}`);
    lines.push(`- 宜人性: ${(o.agreeableness || 0.5).toFixed(2)}`);
    lines.push(`- 神经质: ${(o.neuroticism || 0.5).toFixed(2)}`);
    lines.push('');
    if (genome.mentalModels?.length > 0) {
      lines.push('## 思维模型');
      for (const m of genome.mentalModels) {
        lines.push(`- **${m.name}**: ${m.application || ''}`);
      }
      lines.push('');
    }
    if (genome.antiPatterns?.length > 0) {
      lines.push('## 已知反模式');
      for (const ap of genome.antiPatterns) {
        lines.push(`- ${ap}`);
      }
      lines.push('');
    }
  }
  lines.push('## 任务上下文');
  lines.push(blueprint.taskDef.job);
  lines.push('');
  lines.push('## 协作协议');
  lines.push(`模式: ${blueprint.collaborationMode.mode}`);
  lines.push('');
  return lines.join('\n');
}

function generateToolsMd(blueprint: BlueprintDTO, roleName: string, skills: any[]): string {
  const lines: string[] = [];
  lines.push(`# ${roleName} — TOOLS.md`);
  lines.push('');
  if (skills.length > 0) {
    lines.push('## 技能');
    for (const skill of skills) {
      lines.push(`### ${skill.name}`);
      lines.push(`- 类别: ${skill.category}`);
      if (skill.steps?.length > 0) {
        lines.push('- 步骤:');
        for (const step of skill.steps) {
          lines.push(`  1. ${step}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('暂无分配技能。');
  }
  lines.push('## 团队约束');
  for (const c of blueprint.taskDef.constraints) {
    lines.push(`- ${c}`);
  }
  lines.push('');
  return lines.join('\n');
}

function generateHeartbeatMd(blueprint: BlueprintDTO, roleName: string): string {
  return [
    `# ${roleName} — HEARTBEAT.md`,
    '',
    '## 生成信息',
    `- 蓝图: ${blueprint.blueprintId}`,
    `- 生成时间: ${blueprint.generatedAt}`,
    `- 引擎版本: ${blueprint.engineVersion}`,
    '',
    '## 任务',
    blueprint.taskDef.job,
    '',
    '## 成功标准',
    ...(blueprint.taskDef.successMetrics || []).map((m: string) => `- ${m}`),
    '',
  ].join('\n');
}

// ====================================================================
// Public API
// ====================================================================

/**
 * Publish a BlueprintDTO to the SoloHub personal directory.
 *
 * Writes:
 *   - synova.yml (human-readable YAML)
 *   - blueprint.json (full machine-readable BlueprintDTO)
 *   - agents/{roleName}/SOUL.md, TOOLS.md, HEARTBEAT.md
 *   - Updates ~/.solohub/manifest.json
 *
 * Idempotent: re-publishing the same blueprintId updates the files in place.
 */
export function publishToPersonal(
  blueprint: BlueprintDTO,
  options?: PublishOptions,
): PublishResult {
  const solohubDir = getSolohubDir(options?.solohubDir);
  const agentsDir = path.join(solohubDir, 'agents', blueprint.blueprintId);

  // Check if already published
  const isUpdate = fs.existsSync(agentsDir);

  // Serialize
  const synovaYmlObj = blueprintToSynovaYml(blueprint);
  const synovaYml = toSynovaYmlString(synovaYmlObj);

  // Write root files
  ensureDir(agentsDir);
  fs.writeFileSync(path.join(agentsDir, 'synova.yml'), synovaYml, 'utf-8');
  fs.writeFileSync(
    path.join(agentsDir, 'blueprint.json'),
    JSON.stringify(blueprint, null, 2),
    'utf-8',
  );

  // Write per-agent files
  let agentCount = 0;
  for (const role of blueprint.teamStructure.roles) {
    const genome = blueprint.personaGenomes.find((g) => g.roleId === role.id);
    const skillSet = blueprint.skillSets.find((s) => s.roleId === role.id);
    const roleDir = path.join(agentsDir, 'agents', role.name);

    ensureDir(roleDir);
    fs.writeFileSync(
      path.join(roleDir, 'SOUL.md'),
      generateSoulMd(blueprint, role.name, genome),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(roleDir, 'TOOLS.md'),
      generateToolsMd(blueprint, role.name, skillSet?.skills || []),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(roleDir, 'HEARTBEAT.md'),
      generateHeartbeatMd(blueprint, role.name),
      'utf-8',
    );
    agentCount++;
  }

  // Update manifest
  const manifest = loadManifest(solohubDir);
  const existingIdx = manifest.agents.findIndex(
    (a) => a.blueprintId === blueprint.blueprintId,
  );
  const entry: ManifestEntry = {
    blueprintId: blueprint.blueprintId,
    name: blueprint.taskDef.job.substring(0, 60),
    publishedAt: isUpdate
      ? (existingIdx >= 0 ? manifest.agents[existingIdx].publishedAt : new Date().toISOString())
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agentCount,
    agentsDir: path.join('agents', blueprint.blueprintId),
  };

  if (existingIdx >= 0) {
    manifest.agents[existingIdx] = entry;
  } else {
    manifest.agents.push(entry);
  }

  saveManifest(solohubDir, manifest);

  return {
    status: isUpdate ? 'updated' : 'published',
    blueprintId: blueprint.blueprintId,
    solohubPath: agentsDir,
    synovaYml,
    agentsCount: agentCount,
  };
}

/**
 * List all agents published to SoloHub.
 */
export function listPublishedAgents(solohubDir?: string): ManifestEntry[] {
  const dir = getSolohubDir(solohubDir);
  const manifest = loadManifest(dir);
  return manifest.agents;
}

/**
 * Get a single published agent by blueprintId.
 */
export function getPublishedAgent(
  blueprintId: string,
  solohubDir?: string,
): { entry: ManifestEntry; synovaYml: string; blueprint: BlueprintDTO } | null {
  const dir = getSolohubDir(solohubDir);
  const manifest = loadManifest(dir);
  const entry = manifest.agents.find((a) => a.blueprintId === blueprintId);
  if (!entry) return null;

  const agentsDir = path.join(dir, entry.agentsDir);
  const synovaYmlPath = path.join(agentsDir, 'synova.yml');
  const blueprintPath = path.join(agentsDir, 'blueprint.json');

  if (!fs.existsSync(synovaYmlPath) || !fs.existsSync(blueprintPath)) return null;

  return {
    entry,
    synovaYml: fs.readFileSync(synovaYmlPath, 'utf-8'),
    blueprint: JSON.parse(fs.readFileSync(blueprintPath, 'utf-8')),
  };
}
