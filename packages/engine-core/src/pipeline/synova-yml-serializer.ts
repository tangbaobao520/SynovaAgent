/**
 * synova-yml-serializer.ts — Synova.yml 标准化序列化/反序列化
 *
 * AR-16 落地：将 Pipeline 全量产出转为标准 Synova.yml 格式（自包含、人类可读、版本向前兼容）。
 *
 * 输入: TaskDefinitionDTO + Phase A/B/C/D/E 结果
 * 输出: SynovaYml 对象 + YAML 字符串
 */

import type {
  TaskDefinitionDTO,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  PhaseDResult,
  SkillCard,
  RoleBlue,
  PersonaGenomeBlue,
} from '../types';
import { ENGINE_VERSION } from '../pipeline-config';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/synova-yml-serializer');

// ================================================================
// SynovaYml 类型定义（照搬 AR-16 Schema）
// ================================================================

export interface SynovaYml {
  synova: {
    version: string;
    engine: string;
    generatedAt: string;
    metadata: {
      name: string;
      description?: string;
      author?: string;
      tags?: string[];
      category?: string;
    };
  };
  task: {
    summary: string;
    constraints: Array<{
      type: string;
      detail: string;
    }>;
    failureModes?: Array<{
      risk: string;
      severity?: 'low' | 'medium' | 'high';
    }>;
  };
  team: {
    protocol: {
      mode: string;
      authorityGovernance: string;
      decisionRules?: Array<{
        scope: string;
        scopeType?: 'strategic' | 'operational' | 'execution';
        rule: string;
      }>;
      safetyBaselines?: string[];
    };
    roles: SynovaRole[];
  };
}

export interface SynovaRole {
  name: string;
  id: string;
  title?: string;
  genome: {
    cognitiveProfile: {
      primaryMode: string;
      secondaryMode?: string;
      decisionStyle: string;
      biasVulnerabilities?: string[];
    };
    mentalModels: Array<{
      name: string;
      source: string;
      application: string;
      limitation?: string;
    }>;
    antiPatterns: string[];
    expressionDNA: {
      communicationStyle: string;
      proactiveness: number;
      detailOrientation: number;
    };
  };
  skills: SynovaSkill[];
}

export interface SynovaSkill {
  name: string;
  category: string;
  geneSources?: Array<{
    kind: string;
    name: string;
    mapsTo: string;
  }>;
  applicableScenarios?: string[];
  steps: string[];
  notes?: string[];
  antiPatterns?: string[];
  approvalRequired?: string[];
}

// ================================================================
// 约束类型推断
// ================================================================

const CONSTRAINT_TYPE_KEYWORDS: Array<[string, string]> = [
  ['地区', 'geography'], ['越南', 'geography'], ['东盟', 'geography'],
  ['认证', 'regulation'], ['合规', 'regulation'], ['法律', 'regulation'], ['税', 'regulation'],
  ['预算', 'budget'], ['资金', 'budget'], ['成本', 'budget'],
  ['时间', 'timeline'], ['周期', 'timeline'], ['限', 'timeline'],
  ['人', 'scale'], ['团队', 'scale'], ['小', 'scale'],
  ['行业', 'industry'], ['电商', 'industry'], ['跨境', 'industry'],
];

function inferConstraintType(detail: string): string {
  for (const [keyword, type] of CONSTRAINT_TYPE_KEYWORDS) {
    if (detail.includes(keyword)) return type;
  }
  return 'custom';
}

// ================================================================
// toSynovaYml: Pipeline 产物 → SynovaYml 对象
// ================================================================

export function toSynovaYml(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  phaseD: PhaseDResult,
  metadata?: {
    author?: string;
    tags?: string[];
    category?: string;
  },
): SynovaYml {
  const constraints = taskDef.constraints.map((c) => ({
    type: inferConstraintType(c),
    detail: c,
  }));

  const failureModes = taskDef.failureModes.map((f) => ({
    risk: f,
    severity: 'medium' as const,
  }));

  const roles: SynovaRole[] = phaseA.teamStructure.roles.map((role) => {
    const genome = phaseB.personaGenomes.find((g) => g.roleId === role.id);
    const skillSet = phaseD.skillSets.find((s) => s.roleId === role.id);

    return {
      name: role.name,
      id: role.id,
      title: (role as { title?: string }).title || '',
      genome: genome ? personToSynovaGenome(genome) : emptySynovaGenome(),
      skills: skillSet ? skillsToSynovaSkills(skillSet.skills) : [],
    };
  });

  return {
    synova: {
      version: '1.0',
      engine: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      metadata: {
        name: taskDef.job.substring(0, 40),
        description: taskDef.job,
        author: metadata?.author,
        tags: metadata?.tags || [],
        category: metadata?.category,
      },
    },
    task: {
      summary: taskDef.job,
      constraints,
      failureModes: failureModes.length > 0 ? failureModes : undefined,
    },
    team: {
      protocol: {
        mode: phaseC.collaborationMode.mode,
        authorityGovernance: String(phaseC.collaborationMode.authorityGovernance || 'hierarchical'),
        decisionRules: (phaseC.collaborationMode as unknown as Record<string, unknown>).decisionRules as unknown as Array<{ scope: string; scopeType?: 'strategic' | 'operational' | 'execution'; rule: string }>,
        safetyBaselines: (phaseC.collaborationMode as unknown as Record<string, unknown>).safetyBaselines as unknown as string[],
      },
      roles,
    },
  };
}

function personToSynovaGenome(g: PersonaGenomeBlue): SynovaRole['genome'] {
  // PersonaGenomeBlue 的字段: oceanScores, mentalModels, honestBoundaries, antiPatterns, confidence
  // 映射到 SynovaYml 的 genome 结构（cognitiveProfile + mentalModels + antiPatterns + expressionDNA）
  return {
    cognitiveProfile: {
      primaryMode: inferPrimaryMode(g),
      secondaryMode: undefined,
      decisionStyle: g.oceanScores.openness > 0.7 ? 'proactive' : g.oceanScores.conscientiousness > 0.7 ? 'analytical' : 'reactive',
      biasVulnerabilities: (g as unknown as Record<string, unknown>).biasVulnerabilities as unknown as string[],
    },
    mentalModels: (g.mentalModels || []).map((m) => ({
      name: m.name,
      source: m.source || '通用认知框架',
      application: m.application || '',
      limitation: m.limitation,
    })),
    antiPatterns: g.antiPatterns || [],
    expressionDNA: {
      communicationStyle: g.oceanScores.extraversion > 0.6 ? 'direct' : g.oceanScores.agreeableness > 0.7 ? 'narrative' : 'structured',
      proactiveness: g.oceanScores.openness,
      detailOrientation: g.oceanScores.conscientiousness,
    },
  };
}

function inferPrimaryMode(g: PersonaGenomeBlue): string {
  const o = g.oceanScores;
  const max = Math.max(o.openness, o.conscientiousness, o.extraversion);
  if (max === o.openness) return 'opportunity_sensing';
  if (max === o.conscientiousness) return 'system_thinking';
  return 'first_principles';
}

function emptySynovaGenome(): SynovaRole['genome'] {
  return {
    cognitiveProfile: { primaryMode: 'general', decisionStyle: 'analytical' },
    mentalModels: [],
    antiPatterns: [],
    expressionDNA: { communicationStyle: 'structured', proactiveness: 0.5, detailOrientation: 0.5 },
  };
}

function skillsToSynovaSkills(cards: SkillCard[]): SynovaSkill[] {
  return cards.map((s) => ({
    name: s.name,
    category: s.category,
    geneSources: s.geneSources?.map((gs) => ({
      kind: gs.kind,
      name: gs.name,
      mapsTo: gs.mapsTo,
    })),
    applicableScenarios: s.scenarios.length > 0 ? s.scenarios : undefined,
    steps: s.steps,
    notes: s.prerequisites && s.prerequisites.length > 0 ? s.prerequisites : undefined,
    antiPatterns: s.failureModes && s.failureModes.length > 0 ? s.failureModes : undefined,
    approvalRequired: s.approvalRequired,
  }));
}

// ================================================================
// toSynovaYmlString: SynovaYml → YAML 字符串（手工拼接，无依赖）
// ================================================================

function indent(text: string, level: number): string {
  const prefix = '  '.repeat(level);
  return text.split('\n').map((l) => (l.trim() ? prefix + l : l)).join('\n');
}

function yamlValue(val: string): string {
  // 特殊字符检测
  if (/[#&*!|>{}\[\]%@`'"\\]/.test(val) || val.includes(':') && val.indexOf(':') < 20) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

export function toSynovaYmlString(yml: SynovaYml): string {
  const lines: string[] = [];

  // ── synova 段 ──
  lines.push('# Synova.yml — 团队基因配置');
  lines.push('# Synova Engine v3.1');
  lines.push('');
  lines.push('synova:');
  lines.push(`  version: "${yml.synova.version}"`);
  lines.push(`  engine: "${yml.synova.engine}"`);
  lines.push(`  generatedAt: "${yml.synova.generatedAt}"`);
  lines.push('  metadata:');
  lines.push(`    name: "${yml.synova.metadata.name}"`);
  if (yml.synova.metadata.description) lines.push(`    description: "${yml.synova.metadata.description}"`);
  if (yml.synova.metadata.author) lines.push(`    author: "${yml.synova.metadata.author}"`);
  if (yml.synova.metadata.tags && yml.synova.metadata.tags.length > 0) {
    lines.push('    tags:');
    for (const t of yml.synova.metadata.tags) lines.push(`      - ${t}`);
  }
  if (yml.synova.metadata.category) lines.push(`    category: "${yml.synova.metadata.category}"`);
  lines.push('');

  // ── task 段 ──
  lines.push('task:');
  lines.push(`  summary: "${yml.task.summary}"`);
  lines.push('  constraints:');
  for (const c of yml.task.constraints) {
    lines.push(`    - type: ${c.type}`);
    lines.push(`      detail: "${c.detail}"`);
  }
  if (yml.task.failureModes && yml.task.failureModes.length > 0) {
    lines.push('  failureModes:');
    for (const f of yml.task.failureModes) {
      lines.push(`    - risk: "${f.risk}"`);
      if (f.severity) lines.push(`      severity: ${f.severity}`);
    }
  }
  lines.push('');

  // ── team.protocol 段 ──
  lines.push('team:');
  lines.push('  protocol:');
  lines.push(`    mode: "${yml.team.protocol.mode}"`);
  lines.push(`    authorityGovernance: "${yml.team.protocol.authorityGovernance}"`);
  if (yml.team.protocol.decisionRules && yml.team.protocol.decisionRules.length > 0) {
    lines.push('    decisionRules:');
    for (const dr of yml.team.protocol.decisionRules) {
      lines.push(`      - scope: "${dr.scope}"`);
      if (dr.scopeType) lines.push(`        scopeType: "${dr.scopeType}"`);
      lines.push(`        rule: "${dr.rule}"`);
    }
  }
  if (yml.team.protocol.safetyBaselines && yml.team.protocol.safetyBaselines.length > 0) {
    lines.push('    safetyBaselines:');
    for (const sb of yml.team.protocol.safetyBaselines) lines.push(`      - "${sb}"`);
  }
  lines.push('');

  // ── team.roles 段 ──
  lines.push('  roles:');
  for (const role of yml.team.roles) {
    lines.push(`    - name: "${role.name}"`);
    lines.push(`      id: "${role.id}"`);
    if (role.title) lines.push(`      title: "${role.title}"`);
    lines.push('');
    lines.push('      genome:');
    lines.push('        cognitiveProfile:');
    lines.push(`          primaryMode: "${role.genome.cognitiveProfile.primaryMode}"`);
    if (role.genome.cognitiveProfile.secondaryMode) lines.push(`          secondaryMode: "${role.genome.cognitiveProfile.secondaryMode}"`);
    lines.push(`          decisionStyle: "${role.genome.cognitiveProfile.decisionStyle}"`);
    if (role.genome.cognitiveProfile.biasVulnerabilities?.length) {
      lines.push('          biasVulnerabilities:');
      for (const b of role.genome.cognitiveProfile.biasVulnerabilities) lines.push(`            - "${b}"`);
    }
    lines.push('');
    lines.push('        mentalModels:');
    if (role.genome.mentalModels.length > 0) {
      for (const mm of role.genome.mentalModels) {
        lines.push(`          - name: "${mm.name}"`);
        lines.push(`            source: "${mm.source}"`);
        lines.push(`            application: "${mm.application}"`);
        if (mm.limitation) lines.push(`            limitation: "${mm.limitation}"`);
      }
    } else {
      lines.push('          []');
    }
    lines.push('');
    lines.push('        antiPatterns:');
    if (role.genome.antiPatterns.length > 0) {
      for (const ap of role.genome.antiPatterns) lines.push(`          - "${ap}"`);
    } else {
      lines.push('          []');
    }
    lines.push('');
    lines.push('        expressionDNA:');
    lines.push(`          communicationStyle: "${role.genome.expressionDNA.communicationStyle}"`);
    lines.push(`          proactiveness: ${role.genome.expressionDNA.proactiveness}`);
    lines.push(`          detailOrientation: ${role.genome.expressionDNA.detailOrientation}`);
    lines.push('');
    lines.push('      skills:');
    if (role.skills.length > 0) {
      for (const skill of role.skills) {
        lines.push(`        - name: "${skill.name}"`);
        lines.push(`          category: "${skill.category}"`);
        if (skill.geneSources?.length) {
          lines.push('          geneSources:');
          for (const gs of skill.geneSources) {
            lines.push(`            - kind: "${gs.kind}"`);
            lines.push(`              name: "${gs.name}"`);
            lines.push(`              mapsTo: "${gs.mapsTo}"`);
          }
        }
        if (skill.applicableScenarios?.length) {
          lines.push('          applicableScenarios:');
          for (const s of skill.applicableScenarios) lines.push(`            - "${s}"`);
        }
        lines.push('          steps:');
        for (const s of skill.steps) lines.push(`            - "${s}"`);
        if (skill.notes?.length) {
          lines.push('          notes:');
          for (const n of skill.notes) lines.push(`            - "${n}"`);
        }
        if (skill.antiPatterns?.length) {
          lines.push('          antiPatterns:');
          for (const ap of skill.antiPatterns) lines.push(`            - "${ap}"`);
        }
        if (skill.approvalRequired?.length) {
          lines.push('          approvalRequired:');
          for (const ar of skill.approvalRequired) lines.push(`            - "${ar}"`);
        }
      }
    } else {
      lines.push('        []');
    }
  }

  return lines.join('\n') + '\n';
}

// ================================================================
// fromSynovaYml: YAML 字符串 → 结构化对象（基础版）
// ================================================================

export function fromSynovaYml(ymlString: string): SynovaYml | null {
  try {
    // 简易 YAML 解析：只处理 Synova.yml 标准格式
    const lines = ymlString.split('\n');
    const result: any = {};

    // 只做基础解析：提取顶层结构
    const synovaMatch = ymlString.match(/synova:\s*\n([\s\S]*?)(?=\ntask:|\n$)/);
    const taskMatch = ymlString.match(/task:\s*\n([\s\S]*?)(?=\nteam:|\n$)/);
    const teamMatch = ymlString.match(/team:\s*\n([\s\S]*?)$/);

    if (!synovaMatch || !taskMatch || !teamMatch) return null;

    // 基础结构重建
    const versionMatch = synovaMatch[1].match(/version:\s*"([^"]+)"/);
    const engineMatch = synovaMatch[1].match(/engine:\s*"([^"]+)"/);
    const nameMatch = synovaMatch[1].match(/name:\s*"([^"]+)"/);
    const summaryMatch = taskMatch[1].match(/summary:\s*"([^"]+)"/);
    const modeMatch = teamMatch[1].match(/mode:\s*"([^"]+)"/);

    return {
      synova: {
        version: versionMatch?.[1] || '1.0',
        engine: engineMatch?.[1] || 'unknown',
        generatedAt: new Date().toISOString(),
        metadata: { name: nameMatch?.[1] || 'Untitled' },
      },
      task: {
        summary: summaryMatch?.[1] || '',
        constraints: [],
      },
      team: {
        protocol: {
          mode: modeMatch?.[1] || 'iron_captain',
          authorityGovernance: 'hierarchical',
        },
        roles: [],
      },
    };
  } catch {
    log.debug('[synova-yml-serializer] YAML parsing failed, returning null');
    return null;
  }
}