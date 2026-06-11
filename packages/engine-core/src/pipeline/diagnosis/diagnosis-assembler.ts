/**
 * diagnosis/diagnosis-assembler.ts — Synova 多层诊断组装器
 *
 * 总入口 assembleFullDiagnosis()，将所有诊断层组装为 FullDiagnosis。
 *
 * 组装逻辑：
 *   gaps        → getLatestSnapshot()          总是可用
 *   dynamics    → computeDynamics(teamId)       可能 null（< 3 快照）
 *   attention   → computeAttention(teamId)      总是可用
 *   identity    → extractIdentityMarkers(teamId) 总是可用
 *   pathDep     → detectPathDependency(teamId)  可能空数组
 *   selfAw      → computeSelfAwareness(teamId)  deltas 可能全为 null
 *   blindSpots  → 从以上各层自动标注
 *   narrative   → 基于结构化数据生成可读文本（留空，由消费方 LLM 生成）
 *
 * 设计原则：
 *   每层输出独立可用——dynamics 没算出来不影响其他维度
 *   引擎逻辑不依赖 UI——自评数据可以是永远 null
 */

import type {
  FullDiagnosis,
  FullDiagnosisV2,
  BlindSpotDeclaration,
} from './types';
import { getLatestSnapshot } from './gap-recorder';
import { computeDynamics } from './gap-dynamics';
import { computeAttention } from './attention-allocator';
import { extractIdentityMarkers } from './identity-extractor';
import { detectPathDependency } from './path-dependency';
import { computeSelfAwareness } from './self-awareness';
import { computeHACD } from './hacd';
import { computeCPC } from './cpc';
import { computeIPU } from './ipu-overload';
import { computeHONA } from './hona';
import { computeCapabilitySpectrum } from './capability-spectrum';
import { computeIntentAlignment } from './intent-alignment';
import { computeSevenPowers } from './seven-powers';
import { computeFinancialImpact, loadFinancialBaseline } from './financial-impact';
import { computeTokenEconomics } from './token-economics';
import { computeHTM } from './htm';
import { computeEOB } from './eob';
import { computePositioningConsistency } from './positioning-consistency';
import { computeCategoryClarity } from './category-clarity';
import { validateDifferentiation } from './differentiation-validation';
import { loadMarketingData } from './marketing-data-store';
import { getEngineContext } from '../../engine-context';

// ====================================================================
// Main entry point
// ====================================================================

/**
 * Assemble a complete FullDiagnosis for a team.
 *
 * All computation layers are independently computed and wrapped in try/catch
 * so that failure in one layer doesn't block the others.
 */
export function assembleFullDiagnosis(teamId: string): FullDiagnosis {
  const log = getEngineContext().logger;
  const degradedModules: string[] = [];

  // Layer 1: Current snapshot (always available if recorded)
  const snapshot = getLatestSnapshot(teamId);
  // 快照缺失时，依赖快照的模块跳过而非降级——PDE 首次诊断的正常状态
  const hasSnapshot = snapshot !== null && Object.keys(snapshot.gaps).length > 0;

  // Layer 2: Dynamics (null if not enough snapshots, or if module unavailable)
  let dynamics: FullDiagnosis['dynamics'] = null;
  if (hasSnapshot) {
    try {
      dynamics = computeDynamics(teamId) ?? null;
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler] dynamics 计算失败');
      degradedModules.push('dynamics');
    }
  }

  // Layer 3: Attention
  let attention: FullDiagnosis['attention'];
  try {
    attention = computeAttention(teamId);
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler] attention 计算失败');
    degradedModules.push('attention');
    attention = emptyAttention();
  }

  // Layer 3: Identity
  let identity: FullDiagnosis['identity'];
  try {
    identity = extractIdentityMarkers(teamId);
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler] identity 提取失败');
    degradedModules.push('identity');
    identity = emptyIdentity();
  }

  // Layer 3: Path dependency
  let pathDependency: FullDiagnosis['pathDependency'];
  if (hasSnapshot) {
    try {
      pathDependency = detectPathDependency(teamId);
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler] pathDependency 检测失败');
      degradedModules.push('pathDependency');
      pathDependency = [];
    }
  } else {
    pathDependency = [];
  }

  // Layer 3: Self awareness
  let selfAwareness: FullDiagnosis['selfAwareness'];
  try {
    selfAwareness = computeSelfAwareness(teamId);
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler] selfAwareness 计算失败');
    degradedModules.push('selfAwareness');
    selfAwareness = emptySelfAwareness();
  }

  // Blind spots: auto-labeled from the above layers
  const blindSpots = generateBlindSpots(
    snapshot,
    dynamics,
    attention,
    identity,
    selfAwareness,
  );

  // Narrative: generated asynchronously by assembleFullDiagnosisAsync().
  // Sync version returns empty string for backward compatibility.
  const narrative = '';

  return {
    teamId,
    generatedAt: new Date().toISOString(),
    gaps: snapshot ?? emptySnapshot(teamId),
    dynamics,
    attention,
    identity,
    pathDependency,
    selfAwareness,
    blindSpots,
    narrative,
    degradedModules,
  };
}

// ====================================================================
// Async entry point — generates LLM narrative
// ====================================================================

/**
 * Assemble a complete FullDiagnosis WITH LLM-generated narrative.
 *
 * Calls the sync assembler first, then feeds structured data to LLM
 * for a 200-400 char Chinese natural-language diagnostic narrative.
 * If LLM call fails, narrative falls back to a static summary.
 */
export async function assembleFullDiagnosisAsync(teamId: string): Promise<FullDiagnosis> {
  const diagnosis = assembleFullDiagnosis(teamId);

  try {
    diagnosis.narrative = await generateNarrative(diagnosis);
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/assembler] 叙述生成失败，使用降级文本');
    diagnosis.narrative = buildFallbackNarrative(diagnosis);
  }

  return diagnosis;
}

async function generateNarrative(diagnosis: FullDiagnosis): Promise<string> {
  const { chat } = await import('../../llm-client');

  const summary = {
    teamId: diagnosis.teamId,
    gaps: Object.entries(diagnosis.gaps.gaps).map(([dim, s]) => ({
      dimension: dim,
      score: (s.engineScore * 10).toFixed(1),
      confidence: s.confidence,
    })),
    blindSpots: diagnosis.blindSpots.map(b => b.signal),
    dynamics: diagnosis.dynamics ? {
      overallChangeRate: diagnosis.dynamics.overallChangeRate,
      stickyCount: diagnosis.dynamics.stickyDimensions.length,
    } : null,
    selfAwareness: diagnosis.selfAwareness.interpretation,
  };

  const result = await chat({
    systemPrompt: `你是 Synova 诊断引擎的叙述生成器。基于结构化诊断数据，生成200-400字的中文自然语言诊断叙述。
要求：
- 用产品经理能理解的语言，不使用技术术语
- 先概述团队整体状态，再指出1-3个关键发现
- 如果存在盲区，诚实标注"引擎尚无法观测XX"
- 语气客观、建设性，不誇大也不轻描淡写`,
    userMessage: JSON.stringify(summary, null, 2),
    temperature: 0.3,
    maxTokens: 600,
  });

  return (result.content ?? '').trim().slice(0, 600);
}

function buildFallbackNarrative(diagnosis: FullDiagnosis): string {
  const gapCount = Object.keys(diagnosis.gaps.gaps).length;
  const blindCount = diagnosis.blindSpots.length;
  const lines: string[] = [];

  if (gapCount > 0) {
    lines.push(`引擎已完成 ${gapCount} 个维度的诊断评估。`);
  } else {
    lines.push('引擎尚未采集到足够的诊断数据。');
  }

  if (diagnosis.blindSpots.length > 0) {
    lines.push(`当前存在 ${blindCount} 个盲区：${diagnosis.blindSpots.map(b => b.signal).join('；')}。`);
  }

  if (diagnosis.dynamics?.stickyDimensions?.length) {
    const sticky = diagnosis.dynamics.stickyDimensions.map(d => d.dimension).join('、');
    lines.push(`${sticky} 维度变化缓慢，可能需要外部干预。`);
  }

  lines.push(diagnosis.selfAwareness.interpretation);
  return lines.join('');
}

// ====================================================================
// V2 Assembler — includes hybrid org diagnostic modules (ARCH-07)
// ====================================================================

/**
 * Assemble a FullDiagnosisV2 with all three hybrid org modules.
 *
 * Extends V1 FullDiagnosis with HACD, CPC, and IPU.
 * Each module is independently computed and wrapped in try/catch
 * so that failure in one doesn't block the others.
 *
 * Backward compatible: V1 consumers ignore the new optional fields.
 */
export function assembleFullDiagnosisV2(teamId: string): FullDiagnosisV2 {
  const log = getEngineContext().logger;
  const base = assembleFullDiagnosis(teamId);
  const degradedModules = [...base.degradedModules];

  // 快照数据可用性标记 — 无数据时跳过而非降级
  const hasSnapshot = base.gaps && Object.keys(base.gaps.gaps).length > 0;

  // HACD: Human-Agent Collaboration Depth
  let hacd: FullDiagnosisV2['hacd'] = null;
  if (hasSnapshot) {
    try { hacd = computeHACD(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] HACD 计算失败'); degradedModules.push('hacd');
    }
  }

  // CPC: Collaboration Protocol Completeness
  let cpc: FullDiagnosisV2['cpc'] = null;
  if (hasSnapshot) {
    try { cpc = computeCPC(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] CPC 计算失败'); degradedModules.push('cpc');
    }
  }

  // IPU: Information Processing Overload
  let ipu: FullDiagnosisV2['ipu'] = null;
  if (hasSnapshot) {
    try { ipu = computeIPU(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] IPU 计算失败'); degradedModules.push('ipu');
    }
  }

  // HONA: Heterogeneous Node Network Analysis
  let hona: FullDiagnosisV2['hona'] = null;
  if (hasSnapshot) {
    try { hona = computeHONA(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] HONA 计算失败'); degradedModules.push('hona');
    }
  }

  // Capability Spectrum: Organizational capability coverage
  let capabilitySpectrum: FullDiagnosisV2['capabilitySpectrum'] = null;
  if (hasSnapshot) {
    try { capabilitySpectrum = computeCapabilitySpectrum(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] capabilitySpectrum 计算失败'); degradedModules.push('capabilitySpectrum');
    }
  }

  // Intent Alignment: Three-way alignment gap
  let intentAlignment: FullDiagnosisV2['intentAlignment'] = null;
  if (hasSnapshot) {
    try { intentAlignment = computeIntentAlignment(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] intentAlignment 计算失败'); degradedModules.push('intentAlignment');
    }
  }

  // 7 Powers: Competitive moat assessment
  let sevenPowers: FullDiagnosisV2['sevenPowers'] = null;
  if (hasSnapshot) {
    try { sevenPowers = computeSevenPowers(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] sevenPowers 计算失败'); degradedModules.push('sevenPowers');
    }
  }

  // Assemble base V2 result (before financial layer)
  const result: FullDiagnosisV2 = {
    ...base, hacd, cpc, ipu, hona, capabilitySpectrum, intentAlignment, sevenPowers,
  };

  // HTM: Hybrid Trust Model (ARCH-06 P2) — depends on snapshot data
  let htm: FullDiagnosisV2['htm'] = null;
  if (hasSnapshot) {
    try { htm = computeHTM(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] HTM 计算失败'); degradedModules.push('htm');
    }
  }

  // EOB: Elastic Organizational Boundary (ARCH-06 P2) — depends on snapshot data
  let eob: FullDiagnosisV2['eob'] = null;
  if (hasSnapshot) {
    try { eob = computeEOB(teamId); } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v2] EOB 计算失败'); degradedModules.push('eob');
    }
  }

  // Financial Impact: computed from assembled diagnosis (ARCH-07)
  // Uses default conservative estimates if FinancialBaseline not configured
  let financialImpact: FullDiagnosisV2['financialImpact'] = null;
  try {
    const baseline = loadFinancialBaseline(teamId);
    financialImpact = computeFinancialImpact(result, baseline ?? undefined);
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler-v2] financialImpact 计算失败');
    degradedModules.push('financialImpact');
  }

  // Token Economics: computed from collaboration events (ARCH-07 supplement)
  let tokenEconomics: FullDiagnosisV2['tokenEconomics'] = null;
  try {
    const baseline = loadFinancialBaseline(teamId);
    tokenEconomics = computeTokenEconomics(teamId, baseline ?? undefined);
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler-v2] tokenEconomics 计算失败');
    degradedModules.push('tokenEconomics');
  }

  // ── Marketing Modules (ARCH-19) ──
  // All three require customer interview/survey data. Return null when data unavailable.

  let categoryClarity: FullDiagnosisV2['categoryClarity'] = null;
  try {
    const mktData = loadMarketingData(teamId);
    if (mktData?.customerResponses?.length && mktData.customerResponses.length >= 3) {
      categoryClarity = computeCategoryClarity(mktData.customerResponses);
    }
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler-v2] categoryClarity 计算失败');
    degradedModules.push('category-clarity');
  }

  let positioningConsistency: FullDiagnosisV2['positioningConsistency'] = null;
  try {
    const mktData = loadMarketingData(teamId);
    if (mktData?.externalClaims?.length && mktData?.customerPerceptions?.length) {
      positioningConsistency = computePositioningConsistency({
        externalClaims: mktData.externalClaims,
        internalDescriptions: mktData.internalDescriptions ?? [],
        customerDescriptions: mktData.customerPerceptions,
      });
    }
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler-v2] positioningConsistency 计算失败');
    degradedModules.push('positioning-consistency');
  }

  let differentiationValidation: FullDiagnosisV2['differentiationValidation'] = null;
  try {
    const mktData = loadMarketingData(teamId);
    if (mktData?.claimedDifferentiation && mktData?.customerPerceptions?.length && mktData.customerPerceptions.length >= 2) {
      const latestSnapshot = getLatestSnapshot(teamId);
      differentiationValidation = validateDifferentiation({
        claimed: mktData.claimedDifferentiation,
        customerPerceptions: mktData.customerPerceptions,
        snapshot: latestSnapshot ?? undefined,
      });
    }
  } catch (err) {
    log.warn({ err, teamId }, '[diagnosis/assembler-v2] differentiationValidation 计算失败');
    degradedModules.push('differentiation-validation');
  }

  return {
    ...result, htm, eob, financialImpact, tokenEconomics,
    categoryClarity, positioningConsistency, differentiationValidation,
    degradedModules,
  };
}

/**
 * Async version of V2 assembler — includes LLM-generated narrative.
 */
export async function assembleFullDiagnosisV2Async(teamId: string): Promise<FullDiagnosisV2> {
  const diagnosis = assembleFullDiagnosisV2(teamId);

  try {
    diagnosis.narrative = await generateNarrative(diagnosis);
  } catch (err) {
    getEngineContext().logger.warn({ err, teamId },
      '[diagnosis/assembler-v2] 叙述生成失败，使用降级文本');
    diagnosis.narrative = buildFallbackNarrative(diagnosis);
  }

  return diagnosis;
}

// ====================================================================
// V3 Assembler — includes FDE modules (ARCH-08)
// ====================================================================

/**
 * Assemble a FullDiagnosisV3 with optional FDE modules.
 *
 * Extends V2 with auto-interpreter (multi-role narrative) and auto-action
 * (improvement action plan). Each FDE module is independently gated by
 * AssemblyOptions and wrapped in try/catch.
 *
 * Default: V3 = V2 + all P1 FDE modules enabled.
 */
export async function assembleFullDiagnosisV3Async(
  teamId: string,
  options?: import('./types').AssemblyOptions,
): Promise<import('./types').FullDiagnosisV3> {
  const log = getEngineContext().logger;
  const base = assembleFullDiagnosisV2(teamId);
  const degradedModules = [...base.degradedModules];

  const fdeModules = options?.fdeModules ?? {};
  const enableInterpreter = fdeModules.autoInterpreter !== false; // default true
  const enableAction = fdeModules.autoAction !== false;
  const enableBenchmark = fdeModules.benchmark === true; // default false — expensive cross-team query
  const enableEnricher = fdeModules.dataEnricher === true; // default false — external API calls

  // ── FDE: Auto-Interpreter ──
  let multiRoleNarrative: import('./types').MultiRoleNarrative | null = null;
  if (enableInterpreter) {
    try {
      const { generateMultiRoleNarrative } = await import('./auto-interpreter');
      multiRoleNarrative = await generateMultiRoleNarrative(base);
      if (!multiRoleNarrative) {
        degradedModules.push('auto-interpreter');
      }
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v3] auto-interpreter 失败');
      degradedModules.push('auto-interpreter');
    }
  }

  // ── FDE: Auto-Action ──
  let actionPlan: import('./types').ActionPlan | null = null;
  if (enableAction) {
    try {
      const { generateActionPlan } = await import('./auto-action');
      actionPlan = await generateActionPlan(base, multiRoleNarrative);
      if (actionPlan.degradedModules.length > 0) {
        degradedModules.push(...actionPlan.degradedModules.map(m => `auto-action/${m}`));
      }
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v3] auto-action 失败');
      degradedModules.push('auto-action');
    }
  }

  // ── FDE: Benchmark Engine ──
  let benchmark: import('./types').BenchmarkReport | null = null;
  if (enableBenchmark) {
    try {
      const { computeBenchmark } = await import('./benchmark-engine');
      const result = computeBenchmark(teamId);
      benchmark = result;
      if (!result) {
        degradedModules.push('benchmark');
      }
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v3] benchmark 失败');
      degradedModules.push('benchmark');
    }
  }

  // ── FDE: Data Enricher ──
  let enrichedData: import('./types').EnrichedData | null = null;
  if (enableEnricher) {
    try {
      const { enrichDiagnosis } = await import('./data-enricher');
      enrichedData = await enrichDiagnosis(teamId);
      if (enrichedData.degradedModules.length > 0) {
        degradedModules.push(...enrichedData.degradedModules);
      }
    } catch (err) {
      log.warn({ err, teamId }, '[diagnosis/assembler-v3] data-enricher 失败');
      degradedModules.push('data-enricher');
    }
  }

  return {
    ...base,
    fde: {
      multiRoleNarrative,
      actionPlan,
      benchmark,
      enrichedData,
    },
    degradedModules,
  };
}

// ====================================================================
// Empty/default values (used when a layer is unavailable)
// ====================================================================

function emptySnapshot(teamId: string): FullDiagnosis['gaps'] {
  return {
    teamId,
    observedAt: new Date().toISOString(),
    sourcePipeline: 'periodic_check',
    gaps: {} as Record<string, any>,
  };
}

function emptyAttention(): FullDiagnosis['attention'] {
  return {
    byTopic: {},
    byDecisionType: {},
    selfVsExternal: 0.5,
    internalOpsVsInnovation: 0.5,
    topAttentionConsumers: [],
  };
}

function emptyIdentity(): FullDiagnosis['identity'] {
  return {
    markers: [],
    frequency: {},
    trend: {},
    primaryAnchor: null,
  };
}

function emptySelfAwareness(): FullDiagnosis['selfAwareness'] {
  return {
    deltas: [],
    overallGap: 0,
    significantDimensions: [],
    interpretation: '自评数据未收集',
  };
}

// ====================================================================
// Blind spot generation
// ====================================================================

function generateBlindSpots(
  snapshot: FullDiagnosis['gaps'] | null,
  dynamics: FullDiagnosis['dynamics'],
  attention: FullDiagnosis['attention'],
  identity: FullDiagnosis['identity'],
  selfAwareness: FullDiagnosis['selfAwareness'],
): BlindSpotDeclaration[] {
  const spots: BlindSpotDeclaration[] = [];

  // No snapshot at all → major blind spot
  if (!snapshot || Object.keys(snapshot.gaps).length === 0) {
    spots.push({
      dimension: 'all',
      signal: '引擎尚未采集到任何六缝隙快照',
      coverageEstimate: 0,
      coverableBy: '运行至少一次完整 Phase C 管线',
    });
    return spots;
  }

  // Check each gap dimension for low confidence
  for (const [dim, gapScore] of Object.entries(snapshot.gaps)) {
    if (gapScore.confidence === 'low') {
      spots.push({
        dimension: dim,
        signal: `维度 ${dim} 的引擎置信度为 low`,
        coverageEstimate: 0.3,
        coverableBy: `提供更多 ${dim} 相关的团队协作数据`,
      });
    }
  }

  // No dynamics → blind spot on temporal understanding
  if (!dynamics) {
    spots.push({
      dimension: 'temporal',
      signal: '快照不足（< 3），无法计算时间动态',
      coverageEstimate: 0.2,
      coverableBy: '继续运行引擎，积累至少 3 次 Phase C 快照',
    });
  }

  // No identity markers found
  if (identity.markers.length === 0) {
    spots.push({
      dimension: 'identity',
      signal: '未提取到团队身份标记',
      coverageEstimate: 0.1,
      coverableBy: '在团队对话或 SOUL.md 中提供团队自我描述',
    });
  }

  // No self-assessment data
  if (selfAwareness.deltas.length === 0) {
    spots.push({
      dimension: 'self_awareness',
      signal: '未收集到团队自评数据',
      coverageEstimate: 0,
      coverableBy: '在引擎诊断呈现后嵌入自评入口（一个 click）',
    });
  }

  return spots;
}
