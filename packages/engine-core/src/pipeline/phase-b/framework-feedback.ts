/**
 * pipeline/phase-b/framework-feedback.ts — P3-15 框架→技能反馈闭环
 * 产品层：② Synova 引擎
 * Thompson Sampling + 缺口检测 + 跨团队迁移 + alpha 渐进混合
 */

import type { Framework } from './framework-library';
import { loadJSON, saveJSON } from '../../harness/persistence';

export interface SkillFeedbackSignal {
  skillName: string; sourceFrameworkId: string;
  eventType: 'installed' | 'invoked' | 'success' | 'failure' | 'deprecated' | 'uninstalled';
  timestamp: string; teamId: string; roleName: string;
  invocationCount?: number; reason?: string; engineRecommended: boolean;
}

export interface FeedbackBatch {
  signals: SkillFeedbackSignal[]; windowStart: string; windowEnd: string;
  aggregated: SkillUsageStat[];
}

export interface SkillUsageStat {
  skillName: string; sourceFrameworkId: string;
  totalInstalls: number; totalInvocations: number; totalSuccesses: number; totalFailures: number;
  uniqueTeams: number; successRate: number; deprecationRate: number; lastUsed: string;
}

export interface FrameworkSkillWeights {
  frameworkId: string; weights: Record<string, SkillWeight>; lastUpdated: string; totalSamples: number;
}

export interface SkillWeight {
  score: number; confidence: number; sampleCount: number;
  strategy: 'uniform' | 'thompson' | 'decayed'; transferSource?: string;
}

export interface SkillGapReport {
  generatedAt: string; windowStart: string; windowEnd: string; gaps: SkillGap[]; suggestions: SkillGapSuggestion[];
}

export interface SkillGap {
  gapType: 'framework_internal' | 'role_level' | 'cross_framework';
  requestedSkill: string; sourceRole: string; sourceTeam: string; hitCount: number;
  relatedFrameworks?: string[]; relatedConstraints?: string[];
}

export interface SkillGapSuggestion {
  suggestionType: 'add_skill_to_framework' | 'create_new_skill' | 'promote_to_framework';
  targetFrameworkId?: string; skillName: string; summary: string; evidence: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CrossTeamTransferRule {
  ruleId: string; sourceTeamId: string; sourceIndustry: string; sourceTeamScale: number;
  targetIndustry: string; targetTeamScale: number; skillName: string; frameworkId: string;
  transferConfidence: number; conditions: TransferCondition[];
}

export interface TransferCondition {
  field: 'industry' | 'teamScale' | 'constraintOverlap';
  operator: 'eq' | 'within_range' | 'overlap_ratio_gt'; value: string | number;
}

const MIN_SAMPLES = 10; const MIN_CONFIDENCE_DENOM = 50;
const DECAY_THRESHOLD_DAYS = 30; const DECAY_FACTOR = 0.9;
const DEFAULT_ALPHA = 2; const DEFAULT_BETA = 2;
const PERSIST_KEY = 'framework_weights';

function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) return 0.5;
  const g = (s: number): number => { if (s < 1) return g(s + 1) * Math.pow(Math.random(), 1 / s); const d = s - 1 / 3; const c = 1 / Math.sqrt(9 * d); for (;;) { let x: number; for (;;) { x = Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-10))) * Math.cos(2 * Math.PI * Math.random()); if (1 + c * x > 0) break; } const v = Math.pow(1 + c * x, 3); const u = Math.random(); if (u < 1 - 0.0331 * x ** 4) return d * v; if (Math.log(u) < 0.5 * x ** 2 + d * (1 - v + Math.log(v))) return d * v; } };
  const x = g(alpha); const y = g(beta); return x / (x + y);
}

export function updateWeights(weights: FrameworkSkillWeights, signals: SkillFeedbackSignal[]): FrameworkSkillWeights {
  const bySkill = new Map<string, SkillFeedbackSignal[]>();
  for (const s of signals) { if (!bySkill.has(s.skillName)) bySkill.set(s.skillName, []); bySkill.get(s.skillName)!.push(s); }
  for (const [name, ss] of bySkill) {
    const installed = ss.filter(s => s.eventType === 'installed').length;
    const invoked = ss.filter(s => s.eventType === 'invoked').reduce((sum, s) => sum + (s.invocationCount || 1), 0);
    const failures = ss.filter(s => s.eventType === 'failure').length;
    const deprecated = ss.filter(s => s.eventType === 'deprecated').length;
    let alpha = Math.max(installed + invoked - failures - deprecated, 1);
    let beta = Math.max(failures + deprecated, 1);
    let score: number; let confidence: number; let strategy: SkillWeight['strategy'];
    if ((alpha + beta) < MIN_SAMPLES) {
      score = (alpha + DEFAULT_ALPHA) / (alpha + beta + DEFAULT_ALPHA + DEFAULT_BETA);
      confidence = (alpha + beta) / (MIN_SAMPLES + alpha + beta);
      strategy = 'uniform';
    } else {
      score = sampleBeta(alpha, beta);
      confidence = Math.min((alpha + beta) / MIN_CONFIDENCE_DENOM, 1.0);
      strategy = 'thompson';
    }
    const lastTs = ss.reduce((max, s) => s.timestamp > max ? s.timestamp : max, '');
    const days = lastTs ? (Date.now() - new Date(lastTs).getTime()) / 86400000 : 0;
    if (days > DECAY_THRESHOLD_DAYS) { score *= Math.pow(DECAY_FACTOR, days / DECAY_THRESHOLD_DAYS); strategy = 'decayed'; }
    weights.weights[name] = { score, confidence, sampleCount: alpha + beta, strategy };
  }
  weights.lastUpdated = new Date().toISOString();
  weights.totalSamples += signals.length;
  return weights;
}

export function loadWeights(frameworkId: string): FrameworkSkillWeights {
  const all = loadJSON<Record<string, FrameworkSkillWeights>>('framework_feedback', PERSIST_KEY, {});
  return all[frameworkId] || { frameworkId, weights: {}, lastUpdated: new Date().toISOString(), totalSamples: 0 };
}

export function saveWeights(weights: FrameworkSkillWeights): void {
  const all = loadJSON<Record<string, FrameworkSkillWeights>>('framework_feedback', PERSIST_KEY, {});
  all[weights.frameworkId] = weights;
  saveJSON('framework_feedback', PERSIST_KEY, all);
}

export function processFeedbackBatch(batch: FeedbackBatch, frameworks: Framework[]): void {
  const byFw = new Map<string, SkillFeedbackSignal[]>();
  for (const s of batch.signals) { if (!byFw.has(s.sourceFrameworkId)) byFw.set(s.sourceFrameworkId, []); byFw.get(s.sourceFrameworkId)!.push(s); }
  for (const [fid, signals] of byFw) { const w = loadWeights(fid); updateWeights(w, signals); saveWeights(w); }
}

export function detectSkillGaps(signals: SkillFeedbackSignal[], frameworks: Framework[]): SkillGapReport {
  const gaps: SkillGap[] = [];
  for (const fw of frameworks) {
    if (!fw.skillPatterns || fw.skillPatterns.length === 0) {
      const rel = signals.filter(s => s.sourceFrameworkId === fw.id);
      if (rel.length >= 3) gaps.push({ gapType: 'framework_internal', requestedSkill: `framework:${fw.id}`, sourceRole: 'aggregate', sourceTeam: 'aggregate', hitCount: rel.length, relatedFrameworks: [fw.id] });
    }
  }
  const roleReqs = new Map<string, Map<string, number>>();
  for (const s of signals) { if (!roleReqs.has(s.roleName)) roleReqs.set(s.roleName, new Map()); const m = roleReqs.get(s.roleName)!; m.set(s.skillName, (m.get(s.skillName) || 0) + 1); }
  for (const [role, skills] of roleReqs) {
    for (const [sn, cnt] of skills) {
      if (cnt < 5) continue;
      if (!frameworks.some(fw => fw.skillPatterns?.some(sp => sp.name === sn))) gaps.push({ gapType: 'role_level', requestedSkill: sn, sourceRole: role, sourceTeam: 'aggregate', hitCount: cnt });
    }
  }
  const suggestions: SkillGapSuggestion[] = gaps.map(g => ({
    suggestionType: g.gapType === 'framework_internal' ? 'add_skill_to_framework' : 'create_new_skill',
    targetFrameworkId: g.relatedFrameworks?.[0], skillName: g.requestedSkill,
    summary: `缺口: ${g.requestedSkill} (${g.hitCount}次)`, evidence: `角色${g.sourceRole}请求${g.hitCount}次无框架覆盖`,
    priority: g.hitCount >= 10 ? 'high' : g.hitCount >= 5 ? 'medium' : 'low',
  }));
  return { generatedAt: new Date().toISOString(), windowStart: '', windowEnd: '', gaps, suggestions };
}

export function shouldTransfer(
  src: { industry: string; teamScale: number; constraints: string[] },
  tgt: { industry: string; teamScale: number; constraints: string[] },
): { canTransfer: boolean; confidence: number; reason: string } {
  if (src.industry === tgt.industry && src.industry) {
    const r = Math.abs(src.teamScale - tgt.teamScale) / Math.max(src.teamScale, 1);
    return r < 0.5 ? { canTransfer: true, confidence: 0.85, reason: '同行业规模相近' } : { canTransfer: true, confidence: 0.6, reason: '同行业规模差异' };
  }
  const ov = src.constraints.filter(c => tgt.constraints.includes(c)).length;
  if (ov / Math.max(src.constraints.length, 1) > 0.5) return { canTransfer: true, confidence: 0.5, reason: `约束重叠${Math.round(ov / src.constraints.length * 100)}%` };
  if (src.teamScale <= 5 && tgt.teamScale <= 5) return { canTransfer: true, confidence: 0.35, reason: '小规模团队' };
  return { canTransfer: false, confidence: 0, reason: '不匹配' };
}

export const WEIGHT_DOMINANCE_THRESHOLD = 50;

export function computeBlendedScore(frameworkScore: number, relevance: number, skillName: string, frameworkId: string): number {
  const base = frameworkScore * 0.4 + relevance * 100 * 0.6;
  const w = loadWeights(frameworkId);
  const sw = w.weights[skillName];
  if (!sw || sw.sampleCount === 0) return base;
  const alpha = Math.min(w.totalSamples / WEIGHT_DOMINANCE_THRESHOLD, 1.0);
  return (1 - alpha) * base + alpha * sw.score * 100;
}
