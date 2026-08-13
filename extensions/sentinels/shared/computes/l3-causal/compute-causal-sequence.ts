/**
 * compute-causal-sequence.ts — 因果序列分析
 *
 * 契约ID: COMPUTE-CAUSAL-SEQUENCE-v1
 * 模块: l3-causal
 * 消费边: SIGNAL_TRANSMITS
 * 输入: events: Array<{ id: string; timestamp: number; magnitude: number }>
 * 输出(正常): { value: CausalLink[], confidence:'high', evidence:[], degraded:false }
 * 输出(降级): { value:[], confidence:'low', degraded:true, warnings:['无事件数据'] }
 */
export interface CausalEvent {
  id: string;
  timestamp: number;
  magnitude: number;
}

export interface CausalLink {
  from: string;
  to: string;
  strength: number;
  lag: number;
}

export function computeCausalSequence(events: CausalEvent[]): {
  value: CausalLink[];
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
} {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();

  if (!events || events.length < 2) {
    return { value: [], confidence: 'low', evidence: [], degraded: true, warnings: ['事件数不足2 — 无法计算因果序列', computedAt], computedAt };
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const links: CausalLink[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const lag = sorted[i + 1].timestamp - sorted[i].timestamp;
    if (lag <= 0) continue;
    const magnitudeRatio = sorted[i].magnitude > 0
      ? Math.min(sorted[i + 1].magnitude / sorted[i].magnitude, 1)
      : 0.5;
    links.push({
      from: sorted[i].id,
      to: sorted[i + 1].id,
      strength: Math.round(magnitudeRatio * 10000) / 10000,
      lag,
    });
  }

  if (links.length === 0) {
    return { value: [], confidence: 'medium', evidence: [], degraded: true, warnings: ['时间戳无效 — 无法建立因果链接'], computedAt };
  }

  return {
    value: links,
    confidence: links.length >= 3 ? 'high' : 'medium',
    evidence: [`事件数: ${events.length}`, `因果链数: ${links.length}`],
    degraded: false,
    warnings,
    computedAt,
  };
}
