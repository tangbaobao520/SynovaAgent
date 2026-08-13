/**
 * agent/expert-interaction-protocol.ts — 专家间交互原语 (D56)
 *
 * 三个交互原语(RequestValidation/Endorse/Challenge)用于专家间的
 * 结构化通信。返回结构化JSON对象(非自由文本)，确保可机器解析。
 *
 * 第10份权威文档 第四章 4.2: 三个交互原语定义。
 *
 * 约束:
 *  - 零 as any（铁律38）
 *  - 返回结构化输出 — format()产生人类可读字符串
 *  - 纯确定性函数 — 零外部调用
 */
import { createLogger } from '@synova/logger';

const log = createLogger('agent/expert-interaction-protocol');

// ═══ Types ═══

/** RequestValidation: 请求另一专家验证某个发现 */
export interface RequestValidation {
  type: 'RequestValidation';
  /** 被请求的专家类型（如 'strategy'） */
  targetExpert: string;
  /** 需要验证的发现ID */
  targetFinding: string;
  /** 请求验证的原因 */
  reason: string;
  /** 支持请求的证据列表 */
  evidence: string[];
}

/** Endorse: 认可另一专家的发现 */
export interface Endorse {
  type: 'Endorse';
  /** 被认可的专家类型 */
  sourceExpert: string;
  /** 被认可的发现ID */
  sourceFinding: string;
  /** 认可置信度 (0-1) */
  confidence: number;
  /** 认可理由 */
  rationale: string;
}

/** Challenge: 质疑另一专家的发现 */
export interface Challenge {
  type: 'Challenge';
  /** 被质疑的专家类型 */
  targetExpert: string;
  /** 被质疑的发现ID */
  targetFinding: string;
  /** 分歧点描述 */
  disagreePoint: string;
  /** 替代证据列表 */
  alternativeEvidence: string[];
  /** 建议调整后的置信度 (null=不指定) */
  suggestedConfidence: number | null;
}

/** 联合类型 */
export type ExpertInteraction = RequestValidation | Endorse | Challenge;

// ═══ Factory functions ═══

/**
 * RequestValidation: 请求另一专家验证指定发现。
 */
export function requestValidation(
  targetExpert: string,
  targetFinding: string,
  reason: string,
  evidence?: string[],
): RequestValidation {
  return {
    type: 'RequestValidation',
    targetExpert,
    targetFinding,
    reason,
    evidence: evidence ?? [],
  };
}

/**
 * Endorse: 认可另一专家的发现。
 */
export function endorse(
  sourceExpert: string,
  sourceFinding: string,
  confidence: number,
  rationale: string,
): Endorse {
  if (confidence < 0 || confidence > 1) {
    log.warn({ confidence }, 'Endorse: confidence超出[0,1]范围，已裁剪');
  }
  return {
    type: 'Endorse',
    sourceExpert,
    sourceFinding,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale,
  };
}

/**
 * Challenge: 质疑另一专家的发现。
 */
export function challenge(
  targetExpert: string,
  targetFinding: string,
  disagreePoint: string,
  alternativeEvidence?: string[],
  suggestedConfidence?: number | null,
): Challenge {
  const sc = suggestedConfidence ?? null;
  if (sc !== null && (sc < 0 || sc > 1)) {
    log.warn({ suggestedConfidence: sc }, 'Challenge: suggestedConfidence超出[0,1]范围，已裁剪');
  }
  return {
    type: 'Challenge',
    targetExpert,
    targetFinding,
    disagreePoint,
    alternativeEvidence: alternativeEvidence ?? [],
    suggestedConfidence: sc !== null ? Math.max(0, Math.min(1, sc)) : null,
  };
}

// ═══ Formatter ═══

/**
 * 将交互原语格式化为人类可读字符串（适用于注入LLM提示词）。
 */
export function formatInteraction(interaction: ExpertInteraction): string {
  switch (interaction.type) {
    case 'RequestValidation':
      return `[RequestValidation] 请求验证：${interaction.targetExpert}/${interaction.targetFinding}
原因: ${interaction.reason}
证据: ${interaction.evidence.join(', ') || '无'}`;

    case 'Endorse':
      return `[Endorse] 认可：${interaction.sourceExpert}/${interaction.sourceFinding}
置信度: ${interaction.confidence}
理由: ${interaction.rationale}`;

    case 'Challenge':
      return `[Challenge] 质疑：${interaction.targetExpert}/${interaction.targetFinding}
分歧点: ${interaction.disagreePoint}
替代证据: ${interaction.alternativeEvidence.join(', ') || '无'}
建议置信度: ${interaction.suggestedConfidence !== null ? interaction.suggestedConfidence : '不指定'}`;
  }
}
