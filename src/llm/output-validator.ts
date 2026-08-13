/**
 * llm/output-validator.ts — LLM 输出 Schema 验证 (Phase 1.2a)
 *
 * 参考: OpenClaw 15 个 zod-schema.*.ts 文件的 .strict() 模式
 *
 * 所有 LLM 输出点必须过 zod schema:
 *   - ExpertTemplate (extractor.ts 输出)
 *   - JSON.parse 失败 → 自动重试 1 次
 */
import { z } from 'zod/v4';
import { createLogger } from '@synova/logger';

const log = createLogger('llm/output-validator');

// ═══ Schemas ═══

/** Expert Template schema — extractor.ts 输出验证 */
export const ExpertTemplateSchema = z.object({
  symptom: z.string().min(1).max(40),
  rootCause: z.string().min(1).max(40),
  edgeType: z.enum(['TRIGGERS', 'AFFECTS', 'DEPENDS_ON', 'PROVIDES']),
  industry: z.string().min(1),
  scenario: z.string().min(1),
  confidence: z.number().min(0).max(1),
  principle: z.string().max(500).optional(),
  solution: z.string().max(500).optional(),
}).strict();

/** LLM JSON 输出通用 schema */
export const LLMJsonOutputSchema = z.object({
  content: z.string(),
}).passthrough(); // allow extra fields from LLM

// ═══ Validator ═══

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
  retried: boolean;
}

/**
 * Validate LLM output against a zod schema.
 * On failure: retry parse once, then return error.
 */
export async function validateLLMOutput<T>(
  rawJson: string,
  schema: z.ZodSchema<T>,
  retryParse = true,
): Promise<ValidationResult<T>> {
  // First attempt
  try {
    const parsed = JSON.parse(rawJson);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { valid: true, data: result.data, retried: false };
    }
    log.warn({ errors: result.error.issues }, 'LLM 输出 schema 验证失败');
  } catch (err: any) {
    log.warn({ err: err.message }, 'LLM 输出 JSON.parse 失败');
  }

  // Retry: try to extract JSON from markdown code blocks
  if (retryParse) {
    const extracted = extractJsonFromText(rawJson);
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted);
        const result = schema.safeParse(parsed);
        if (result.success) {
          log.info('LLM 输出重试解析成功 (从 markdown 提取)');
          return { valid: true, data: result.data, retried: true };
        }
      } catch (err) {
        log.warn({ err }, 'LLM 输出校验失败');
      }
    }
  }

  return { valid: false, error: 'LLM 输出格式不符合预期', retried: retryParse };
}

/**
 * Extract JSON from markdown code blocks or plain text.
 * Handles: ```json {...} ```, ``` {...} ```, raw {...}
 */
function extractJsonFromText(text: string): string | null {
  // Try to find JSON in markdown code blocks
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // Try to find a bare JSON object
  const bareJson = text.match(/\{[\s\S]*\}/);
  if (bareJson) return bareJson[0];

  return null;
}
