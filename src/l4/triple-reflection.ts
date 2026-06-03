/**
 * l4/triple-reflection.ts — 三元组质量反思 (Phase 3b)
 *
 * 诊断完成后，LLM 反思三元组质量，生成"修正/补充/删除"建议。
 */
import type { LLMClient } from '../orchestrator/diagnosis-orchestrator';
import { createLogger } from '../logger';

const log = createLogger('l4/triple-reflection');

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

export interface TripleReflection {
  triple: Triple;
  action: 'keep' | 'correct' | 'remove';
  reason: string;
  suggestedLabel?: string;
}

export interface ReflectionResult {
  reflections: TripleReflection[];
  degraded: boolean;
}

export async function reflectOnTriples(llm: LLMClient, triples: Triple[]): Promise<ReflectionResult> {
  if (triples.length === 0) return { reflections: [], degraded: false };

  try {
    const triplesText = triples.map((t, i) =>
      `${i + 1}. ${t.subject} →[${t.predicate}]→ ${t.object}`,
    ).join('\n');

    const result = await llm.consult(
      `你是组织本体知识图谱的审核专家。审查以下三元组，判断每个三元组是否应保留、修正或删除。只输出 JSON 数组。每个元素: {"action":"keep"|"correct"|"remove", "reason":"...", "suggestedLabel":"..."}。`,
      `三元组:\n${triplesText}`,
      { temperature: 0.1, maxTokens: 1000 },
    );

    const parsed = JSON.parse(result.content) as Array<{
      action: string; reason: string; suggestedLabel?: string;
    }>;

    const reflections: TripleReflection[] = parsed.map((r, i) => ({
      triple: triples[i] || { subject: '?', predicate: '?', object: '?' },
      action: (['keep', 'correct', 'remove'].includes(r.action) ? r.action : 'keep') as TripleReflection['action'],
      reason: r.reason || '',
      suggestedLabel: r.suggestedLabel,
    }));

    log.info({ count: reflections.length, corrected: reflections.filter(r => r.action !== 'keep').length }, 'Triple Reflection 完成');
    return { reflections, degraded: false };
  } catch (err: any) {
    log.warn({ err }, 'Triple Reflection 失败');
    // Degrade: keep all triples as-is
    return {
      reflections: triples.map(t => ({ triple: t, action: 'keep' as const, reason: 'Reflection unavailable' })),
      degraded: true,
    };
  }
}
