/**
 * judgment-card.ts — Agent 判断卡片生成器 (PRD §5/§9, Slice 3)
 *
 * 将专家诊断发现格式化为结构化判断卡片。
 * Agent 回复从纯文本升级为：根因 + 建议 + 置信度 + 专家标注 + 操作按钮。
 *
 * Iron law #24: 所有 catch 有 log + degraded 标记。
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';

const log = createLogger('pipeline/judgment-card');

// ═══ 类型定义 ═══

export interface JudgmentAction {
  label: string;
  action: 'confirm' | 'discuss';
}

export interface JudgmentCard {
  type: 'judgment_card';
  cardId: string;
  root_cause: string;
  suggestion: string;
  confidence: number;          // 0-1
  experts: string[];           // 专家名列表
  actions: JudgmentAction[];
  /** 来源上下文：哪个维度、哪个阶段 */
  dimension?: string;
  phase?: number;
  /** 原始发现摘要（可选，调试用） */
  sourceSummary?: string;
}

export interface JudgmentCardInput {
  /** 专家发现消息 */
  message?: string;
  /** 发现列表 */
  findings?: Array<{
    moduleId: string;
    summary: string;
    confidence?: number;
  }>;
  /** 全局置信度 */
  confidence?: number;
  /** 事件阶段 */
  phase?: number;
  /** 事件标签 */
  label?: string;
}

// ═══ 置信度等级 ═══

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

// ═══ 专家名推断 ═══

const MODULE_EXPERT_MAP: Record<string, string> = {
  strategy: '战略顾问',
  org: '组织顾问',
  finance: '财务顾问',
  tech: '技术顾问',
  marketing: '营销顾问',
  action: '行动顾问',
  business_model: '商业模式顾问',
  knowledge: '知识顾问',
};

function inferExpert(moduleId: string): string {
  for (const [key, name] of Object.entries(MODULE_EXPERT_MAP)) {
    if (moduleId.toLowerCase().includes(key)) return name;
  }
  return '诊断专家';
}

// ═══ 根因/建议提取 ═══

interface ExtractedInsight {
  root_cause: string;
  suggestion: string;
}

/**
 * 从自由文本中尝试提取根因和建议。
 * 使用启发式规则：识别"根因"/"原因"/"建议"/"方案"等中文关键词。
 * 如果提取失败，返回原文本作为根因，建议为空。
 */
function extractInsight(text: string): ExtractedInsight {
  // 模式 1: 明确的 "根因:... 建议:..." 格式
  const rootPattern = /(?:根因|根本原因|核心问题|Root[_\s]?Cause)[：:]\s*(.+?)(?:\n|$)/i;
  const sugPattern = /(?:建议|方案|对策|推荐|行动|Suggestion)[：:]\s*(.+?)(?:\n|$)/i;

  const rootMatch = text.match(rootPattern);
  const sugMatch = text.match(sugPattern);

  if (rootMatch && sugMatch) {
    return {
      root_cause: rootMatch[1].trim(),
      suggestion: sugMatch[1].trim(),
    };
  }

  // 模式 2: 按句号分句，首句为根因，末句为建议
  const sentences = text.split(/[。.!！?\n]/).filter(s => s.trim().length > 10);
  if (sentences.length >= 2) {
    return {
      root_cause: sentences[0].trim(),
      suggestion: sentences[sentences.length - 1].trim(),
    };
  }

  // 模式 3: 无法解析，全文本作为根因
  return {
    root_cause: text.trim(),
    suggestion: '',
  };
}

// ═══ 核心 API ═══

let cardCounter = 0;

/**
 * 从诊断事件生成判断卡片。
 *
 * @param input - 诊断事件中的结构化/非结构化数据
 * @returns 格式化的 JudgmentCard，或 null（如果数据不足以生成卡片）
 */
export function generateJudgmentCard(input: JudgmentCardInput): JudgmentCard | null {
  try {
    const message = input.message || '';
    const findings = input.findings || [];

    // 至少需要有消息或发现
    if (!message && findings.length === 0) {
      return null;
    }

    // 从消息中提取根因和建议
    const primaryText = message || findings.map(f => f.summary).join('; ');
    const insight = extractInsight(primaryText);

    // 如果根因为空或太短，跳过
    if (!insight.root_cause || insight.root_cause.length < 5) {
      return null;
    }

    // 推断专家
    const expertsFromFindings = findings.map(f => inferExpert(f.moduleId));
    const uniqueExperts = [...new Set(expertsFromFindings)];
    // 如果没有从 findings 推断出专家，使用默认
    const experts = uniqueExperts.length > 0 ? uniqueExperts : ['诊断专家'];

    // 置信度：取 findings 平均值或全局值或默认 0.7
    let confidence: number;
    if (findings.length > 0) {
      const confValues = findings
        .map(f => f.confidence)
        .filter((c): c is number => typeof c === 'number' && !isNaN(c));
      confidence = confValues.length > 0
        ? confValues.reduce((a, b) => a + b, 0) / confValues.length
        : (typeof input.confidence === 'number' ? input.confidence : 0.7);
    } else {
      confidence = typeof input.confidence === 'number' ? input.confidence : 0.7;
    }

    const cardId = `jc_${Date.now().toString(36)}_${(cardCounter++).toString(36)}`;

    const card: JudgmentCard = {
      type: 'judgment_card',
      cardId,
      root_cause: insight.root_cause,
      suggestion: insight.suggestion || '建议进一步分析以确定具体行动方案。',
      confidence: Math.min(1, Math.max(0, confidence)),
      experts,
      actions: [
        { label: '采纳此方案', action: 'confirm' },
        { label: '继续讨论', action: 'discuss' },
      ],
      dimension: findings[0]?.moduleId,
      phase: input.phase,
      sourceSummary: findings.map(f => f.summary).join('; ') || undefined,
    };

    log.info({ cardId, experts, confidence: card.confidence }, '判断卡片已生成');
    return card;
  } catch (err: unknown) {
    log.warn({ err }, '判断卡片生成失败 — degraded');
    return null;
  }
}

/**
 * 将 JudgmentCard 格式化为 SSE-ready 对象。
 * 序列化后的对象可直接传给 sseWrite()。
 */
export function formatForSSE(card: JudgmentCard): Record<string, unknown> {
  return {
    type: 'judgment_card',
    cardId: card.cardId,
    root_cause: card.root_cause,
    suggestion: card.suggestion,
    confidence: card.confidence,
    confidenceLevel: confidenceLevel(card.confidence),
    experts: card.experts,
    actions: card.actions,
    dimension: card.dimension,
    phase: card.phase,
  };
}

// ═══ 批量检测 ═══

/**
 * 从多个诊断事件中检测可生成判断卡片的候选。
 * 返回可生成卡片的输入列表。
 */
function detectCardCandidates(
  events: Array<{ type: string; message?: string; findings?: JudgmentCardInput['findings']; confidence?: number }>,
): JudgmentCardInput[] {
  const candidates: JudgmentCardInput[] = [];

  for (const event of events) {
    // 只处理专家假设和发现类事件
    if (
      event.type === 'expert_hypothesis' ||
      event.type === 'hypothesis_generated' ||
      event.type === 'interim_finding'
    ) {
      const message = event.message || '';
      const hasSubstantiveContent = message.length > 20 ||
        (event.findings && event.findings.length > 0);

      if (hasSubstantiveContent) {
        candidates.push({
          message,
          findings: event.findings,
          confidence: event.confidence,
        });
      }
    }
  }

  return candidates;
}
