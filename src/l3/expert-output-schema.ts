/**
 * l3/expert-output-schema.ts — EC-07: 专家输出 zod Schema 校验
 *
 * 铁律 32: 错误分类强制。校验失败 → degraded 标记，不阻断诊断。
 * 对标 Hermes: 每个 Expert 输出必须通过 Schema 验证才能进入合成阶段。
 *
 * Anthropic 工程标准: safeParse (不抛异常) + 详细错误日志
 */
import { z } from 'zod';

// ═══ Sub-schemas ═══

export const FindingSchema = z.object({
  id: z.string().min(1),
  dimension: z.string().min(1),
  statement: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  suggestedActions: z.array(z.string()),
}).partial({ suggestedActions: true }); // suggestedActions 可选——LLM 可能不提供

export const UncertaintySchema = z.object({
  description: z.string().min(1),
  reason: z.string().min(1),
  suggestedNextStep: z.string(),
}).partial({ suggestedNextStep: true });

export const ConflictingSignalSchema = z.object({
  dimension: z.string().min(1),
  myFinding: z.string().min(1),
  myConfidence: z.number().min(0).max(1),
  potentialOpposingExpert: z.string(),
  reason: z.string(),
});

export const CrossReferenceSchema = z.object({
  dimension: z.string().min(1),
  expertType: z.string().min(1),
  reason: z.string(),
  priority: z.enum(['advisory', 'important', 'critical']),
});

// ═══ Top-level Schema ═══

export const ExpertOutputSchema = z.object({
  findings: z.array(FindingSchema).optional().default([]),
  overallAssessment: z.string().max(500).optional().default(''),
  uncertainties: z.array(UncertaintySchema).optional().default([]),
  conflictingSignals: z.array(ConflictingSignalSchema).optional().default([]),
  crossReferences: z.array(CrossReferenceSchema).optional().default([]),
  ontologyPatches: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

export type ValidatedExpertOutput = z.infer<typeof ExpertOutputSchema>;

// ═══ Validation Result ═══

export interface ExpertValidationResult {
  output: ValidatedExpertOutput;
  valid: boolean;
  errors: string[];
  degraded: boolean;
}

/**
 * Validate expert LLM output against the schema.
 * Uses safeParse — never throws. Returns degraded: true on failure.
 */
export function validateExpertOutput(raw: Record<string, unknown>): ExpertValidationResult {
  const result = ExpertOutputSchema.safeParse(raw);

  if (result.success) {
    return {
      output: result.data,
      valid: true,
      errors: [],
      degraded: false,
    };
  }

  // Build detailed error messages for logging
  const errors = result.error.issues.map(issue =>
    `${issue.path.join('.')}: ${issue.message}`
  );

  // Partial recovery: extract whatever fields ARE valid
  const partial: ValidatedExpertOutput = {
    findings: Array.isArray(raw.findings)
      ? raw.findings.filter((f: unknown) => f && typeof f === 'object')
          .map((f: any) => ({
            id: String(f.id || ''),
            dimension: String(f.dimension || ''),
            statement: String(f.statement || '').slice(0, 300),
            confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
            evidenceRefs: Array.isArray(f.evidenceRefs) ? f.evidenceRefs.map(String) : [],
            severity: (['critical','high','medium','low'].includes(f.severity) ? f.severity : 'medium') as ValidatedExpertOutput['findings'][number]['severity'],
            suggestedActions: Array.isArray(f.suggestedActions) ? f.suggestedActions.map(String) : [],
          }))
      : [],
    overallAssessment: typeof raw.overallAssessment === 'string'
      ? raw.overallAssessment.slice(0, 500)
      : '',
    uncertainties: [],
    conflictingSignals: [],
    crossReferences: [],
    ontologyPatches: [],
  };

  return {
    output: partial,
    valid: false,
    errors,
    degraded: true,
  };
}
