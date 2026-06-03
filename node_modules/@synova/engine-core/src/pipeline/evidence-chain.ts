/**
 * engine-server/pipeline/evidence-chain.ts — 证据链导出（壁垒四核心）
 *
 * 为 BlueprintDTO 生成可导出的证据追溯链。
 * 每条 mentalModel 的 source → framework-library 条目 → 原始信源出处
 *
 * @date 2026-05-14
 */

import type { PersonaGenomeBlue, MentalModelEntry } from '../types';
import { SEED_FRAMEWORKS, type Framework } from './phase-b/framework-library';
import { AMMO_DEPOT, type AmmoEntry } from './phase-b/ammo-depot';

// ================================================================
// 类型定义
// ================================================================

export interface EvidenceLink {
  /** 心智模型名称 */
  mentalModel: string;
  /** LLM 输出的 source 字段 */
  sourceId: string;
  /** 框架库中的完整条目（如有） */
  framework?: {
    id: string;
    name: string;
    category: string;
    coreInsight: string;
    limitations: string[];
  };
  /** 弹药库中的领域知识（如有） */
  ammoEntry?: {
    id: string;
    industry: string;
    factText: string;
    confidence: string;
    sources?: string[];
  };
  /** 追踪链完整性 */
  traceCompleteness: 'full' | 'partial' | 'none';
}

export interface EvidenceChain {
  roleId: string;
  roleName: string;
  links: EvidenceLink[];
}

// ================================================================
// 构建证据链
// ================================================================

/**
 * 为所有角色构建证据追溯链。
 */
export function buildEvidenceChain(
  personaGenomes: PersonaGenomeBlue[],
  matchedAmmoIds: Set<string>,
): EvidenceChain[] {
  return personaGenomes.map(genome => {
    const links = genome.mentalModels.map(mm => buildLink(mm, matchedAmmoIds));
    return {
      roleId: genome.roleId,
      roleName: genome.roleName,
      links,
    };
  });
}

function buildLink(mm: MentalModelEntry, matchedAmmoIds: Set<string>): EvidenceLink {
  // 查找框架库中的匹配条目
  const framework = SEED_FRAMEWORKS.find(fw => fw.id === mm.source);

  // 查找弹药库中的匹配条目
  const ammoEntry = AMMO_DEPOT.find(
    a => a.id === mm.source || matchedAmmoIds.has(a.id),
  );

  // 追踪完整性
  let traceCompleteness: EvidenceLink['traceCompleteness'] = 'none';
  if (framework && ammoEntry) {
    traceCompleteness = 'full';
  } else if (framework || ammoEntry) {
    traceCompleteness = 'partial';
  }

  return {
    mentalModel: mm.name,
    sourceId: mm.source,
    framework: framework ? {
      id: framework.id,
      name: framework.name,
      category: framework.category,
      coreInsight: framework.coreInsight,
      limitations: framework.limitations,
    } : undefined,
    ammoEntry: ammoEntry ? {
      id: ammoEntry.id,
      industry: ammoEntry.industry,
      factText: ammoEntry.factText,
      confidence: ammoEntry.confidence,
      sources: ammoEntry.sources,
    } : undefined,
    traceCompleteness,
  };
}

/**
 * 统计证据链完整性
 */
export function summarizeEvidenceChain(chains: EvidenceChain[]): {
  totalLinks: number;
  full: number;
  partial: number;
  none: number;
} {
  let full = 0, partial = 0, none = 0;
  for (const chain of chains) {
    for (const link of chain.links) {
      if (link.traceCompleteness === 'full') full++;
      else if (link.traceCompleteness === 'partial') partial++;
      else none++;
    }
  }
  return { totalLinks: full + partial + none, full, partial, none };
}
