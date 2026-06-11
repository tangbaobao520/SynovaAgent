/**
 * diagnosis/capability-gap.ts — 组织能力缺口检测（SOG 图分析）
 *
 * Replaces capability-spectrum.ts: instead of keyword-matching on Blueprint
 * roles, this module analyzes the SOG ontology graph directly:
 *   1. Scan CAPABILITY nodes + PROVIDES edges → build capability-provider matrix
 *   2. Scan DEPENDS_ON edges → identify declared dependency needs
 *   3. Compare: dependency targets lacking formal CAPABILITY declaration → gaps
 *   4. Output ontologyPatches: suggested new CAPABILITY nodes + DEPENDS_ON edges
 *   5. Overall capability coverage score (0-1)
 *
 * Pure computation — zero LLM calls. Consumes lightweight graph subsets.
 */

import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import type { DiagnosticModule } from './module-registry';

// ====================================================================
// Exported Types
// ====================================================================

/** A single capability gap found in the organization graph */
export interface CapabilityGap {
  /** Human-readable name of the missing capability */
  name: string;
  /** Category of the missing capability */
  category: 'technical' | 'domain' | 'compliance' | 'leadership';
  /** Node IDs that depend on this missing capability (DEPENDS_ON edge sources) */
  requiredBy: string[];
  /** Gap severity 0-1 (derived from dependency count and criticality) */
  severity: number;
  /** Suggested remediation action */
  suggestion: string;
}

/** Full capability gap analysis report */
export interface CapabilityGapReport {
  /** Total existing CAPABILITY nodes found */
  totalCapabilities: number;
  /** Categories covered by existing capabilities */
  coveredCategories: string[];
  /** Identified capability gaps */
  gaps: CapabilityGap[];
  /** Coverage score 0-1 (capabilities with PROVIDES / total capability needs) */
  coverageScore: number;
  /** Ontology patches: suggested CAPABILITY node creation + edge wiring */
  ontologyPatches: OntologyCapabilityPatch[];
}

/** A suggested ontology patch to bridge a capability gap */
export interface OntologyCapabilityPatch {
  action: 'create';
  nodeType: 'Capability';
  props: {
    name: string;
    category: CapabilityGap['category'];
    proficiencyLevel?: number;
    status: 'required';
  };
  /** Edges to establish connecting the new capability to dependents */
  connectTo: Array<{ targetId: string; edgeType: 'DEPENDS_ON' | 'PROVIDES' }>;
}

// ====================================================================
// Lightweight Graph Subset Types (for pure-function input)
// ====================================================================

/** A lightweight Capability node for gap analysis */
export interface CapNode {
  id: string;
  name: string;
  category: 'technical' | 'domain' | 'compliance' | 'leadership';
  proficiencyLevel?: number;
}

/** A lightweight edge record for gap analysis */
export interface CapEdge {
  from: string;
  to: string;
  type: SOGEdgeType;
}

// ====================================================================
// Core Computation
// ====================================================================

/**
 * Analyze capability gaps from a SOG graph subset.
 *
 * This is a pure function — takes lightweight node/edge data, returns a
 * structured gap report. No DB, no LLM, no side effects.
 *
 * @param capabilities — Existing CAPABILITY nodes in the graph
 * @param allEdges      — All edges (PROVIDES + DEPENDS_ON used; others ignored)
 * @param allNodeIds    — All node IDs in scope (for contextual inference)
 * @returns CapabilityGapReport
 */
export function analyzeCapabilityGaps(
  capabilities: CapNode[],
  allEdges: CapEdge[],
  allNodeIds: string[],
): CapabilityGapReport {
  // ── Index capabilities by id ──
  const capMap = new Map<string, CapNode>();
  for (const c of capabilities) {
    capMap.set(c.id, c);
  }

  // ── Partition edges ──
  const providesEdges = allEdges.filter(e => e.type === SOGEdgeType.PROVIDES);
  const dependsEdges = allEdges.filter(e => e.type === SOGEdgeType.DEPENDS_ON);

  // ── Build capability → providers matrix ──
  //   PROVIDES: from (Person|Team|Tool|Agent) → to (CAPABILITY)
  const capProviders = new Map<string, Set<string>>();
  for (const e of providesEdges) {
    if (capMap.has(e.to)) {
      if (!capProviders.has(e.to)) capProviders.set(e.to, new Set());
      capProviders.get(e.to)!.add(e.from);
    }
  }

  // ── Covered categories ──
  const coveredCategories = new Set<string>();
  for (const c of capabilities) {
    coveredCategories.add(c.category);
  }

  // ── Phase 1: Identify gaps from DEPENDS_ON edges ──
  //   A DEPENDS_ON edge (A → B) means A depends on B.
  //   If B is NOT a CAPABILITY node AND B has no outgoing PROVIDES edges,
  //   then B's role/capability is not formally modeled → gap.
  const gaps: CapabilityGap[] = [];
  const gapPatterns = new Map<string, { requiredBy: Set<string>; category: CapabilityGap['category'] }>();

  for (const e of dependsEdges) {
    const targetId = e.to;

    // Skip if target IS a CAPABILITY node (explicit capability declaration)
    if (capMap.has(targetId)) continue;

    // Check if target has outgoing PROVIDES edges to any CAPABILITY node
    const hasProvider = providesEdges.some(
      pe => pe.from === targetId && capMap.has(pe.to),
    );

    if (!hasProvider) {
      // Gap: something depends on targetId, but targetId doesn't provide
      // any formally declared capability.
      const gapKey = targetId;
      if (!gapPatterns.has(gapKey)) {
        gapPatterns.set(gapKey, {
          requiredBy: new Set(),
          category: inferCapabilityCategory(targetId, allNodeIds),
        });
      }
      gapPatterns.get(gapKey)!.requiredBy.add(e.from);
    }
  }

  // ── Phase 2: Detect unprovided capabilities ──
  //   A CAPABILITY node exists but has zero PROVIDES edges → orphan capability
  for (const c of capabilities) {
    if (!capProviders.has(c.id) || capProviders.get(c.id)!.size === 0) {
      const gapKey = `unprovided:${c.name}`;
      if (!gapPatterns.has(gapKey)) {
        gapPatterns.set(gapKey, {
          requiredBy: new Set([c.id]), // the capability node itself
          category: c.category,
        });
      }
    }
  }

  // Track which gap names are "unprovided" type (for filtering later)
  const unprovidedGapNames = new Set<string>();

  // ── Build gap list from patterns ──
  for (const [key, pattern] of gapPatterns) {
    const reqCount = pattern.requiredBy.size;
    const isUnprovided = key.startsWith('unprovided:');
    const gapName = isUnprovided ? key.slice('unprovided:'.length) : key;
    if (isUnprovided) {
      unprovidedGapNames.add(gapName);
    }
    gaps.push({
      name: gapName,
      category: pattern.category,
      requiredBy: [...pattern.requiredBy],
      severity: Math.min(1, reqCount * 0.3),
      suggestion: generateGapSuggestion(key, pattern.category, reqCount),
    });
  }

  // ── Compute coverage score ──
  //   Coverage = provided capabilities / total capability needs
  //   "Provided" = CAPABILITY nodes with at least one PROVIDES edge
  //   "Total needs" = existing CAPABILITY nodes + DEPENDS_ON gaps (not unprovided)
  //   Unprovided capabilities still count in the denominator (they exist)
  //   but don't boost the numerator (they aren't covered).
  const providedCount = capabilities.filter(
    c => capProviders.has(c.id) && (capProviders.get(c.id)?.size ?? 0) > 0,
  ).length;
  const dependsOnGapCount = gaps.filter(g => !unprovidedGapNames.has(g.name)).length;
  const totalNeeds = capabilities.length + dependsOnGapCount;
  const coverageScore = totalNeeds > 0
    ? Math.round((providedCount / totalNeeds) * 1000) / 1000
    : 1; // empty graph → fully covered

  // ── Build ontology patches (only for DEPENDS_ON gaps, not unprovided ones) ──
  //   Unprovided capabilities already exist — they need PROVIDES edges, not new nodes.
  const ontologyPatches: OntologyCapabilityPatch[] = gaps
    .filter(g => !unprovidedGapNames.has(g.name))
    .map(g => ({
      action: 'create' as const,
      nodeType: 'Capability' as const,
      props: {
        name: g.name,
        category: g.category,
        status: 'required' as const,
      },
      connectTo: g.requiredBy
        .filter(id => id !== '(none)')
        .map(reqId => ({
          targetId: reqId,
          edgeType: 'DEPENDS_ON' as const,
        })),
    }));

  // Sort gaps by severity descending
  gaps.sort((a, b) => b.severity - a.severity);

  return {
    totalCapabilities: capabilities.length,
    coveredCategories: [...coveredCategories],
    gaps,
    coverageScore,
    ontologyPatches,
  };
}

// ====================================================================
// Helpers
// ====================================================================

/** Infer capability category from a node name using keyword heuristics */
function inferCapabilityCategory(
  name: string,
  _allNodeIds: string[],
): CapabilityGap['category'] {
  const lower = name.toLowerCase();
  if (lower.match(/compliance|regulatory|audit|gdpr|soc2|iso|合规|审计|监管|法规/)) {
    return 'compliance';
  }
  if (lower.match(/leader|management|strategy|decision|ceo|cto|vp|head|director|管理|战略|决策|领导/)) {
    return 'leadership';
  }
  if (lower.match(/domain|industry|market|business|product|ux|design|产品|市场|业务|设计/)) {
    return 'domain';
  }
  return 'technical';
}

/** Generate a human-readable suggestion for a given gap */
function generateGapSuggestion(
  key: string,
  category: CapabilityGap['category'],
  dependencyCount: number,
): string {
  if (key.startsWith('unprovided:')) {
    const name = key.slice('unprovided:'.length);
    return `能力 "${name}" 存在但无提供者（无 PROVIDES 边），建议指派负责人或团队。`;
  }
  const categoryLabel: Record<string, string> = {
    technical: '技术能力',
    domain: '领域知识',
    compliance: '合规能力',
    leadership: '领导力',
  };
  return `${dependencyCount} 个实体依赖此能力但图谱中缺失。建议新建${categoryLabel[category] || '能力'}节点并建立 PROVIDES 关系。`;
}

// ====================================================================
// DiagnosticModule Interface
// ====================================================================

export const capabilityGapModule: DiagnosticModule = {
  id: 'capability-gap',
  version: '1.0.0',
  priority: 'P1',
  requiredDataSources: {},
  confidenceModel: 'deterministic',
  label: '能力缺口分析',
  description: 'SOG v1.0: 基于 Capability/PROVIDES/DEPENDS_ON 的能力覆盖与缺口识别',
  ontologyRole: 'observer',
  compute: async (_teamId: string) => {
    // Requires graph data injected via orchestrator at runtime.
    // The orchestrator calls analyzeCapabilityGaps() directly with
    // the loaded graph subset, bypassing this no-op wrapper.
    // See diagnosis-orchestrator.ts for the integration point.
    return null;
  },
};
