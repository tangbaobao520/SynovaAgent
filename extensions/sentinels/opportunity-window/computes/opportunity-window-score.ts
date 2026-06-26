/**
 * opportunity-window/computes/opportunity-window-score.ts — 结构性机会窗口评分
 *
 * 检测三类结构性变化信号：
 * 1. 技术变革 (新TOOL/工具出现)
 * 2. 法规变化 (Compliance/Event节点)
 * 3. 竞争格局变化 (COMPETES_WITH边变化)
 *
 * 纯函数：输入事件列表，输出机会窗口评分(0-1)。
 */
export interface OpportunityResult {
  score: number;              // 0-1, 越高代表机会窗口越大
  techChangeSignals: number;
  regulatorySignals: number;
  competitiveSignals: number;
  totalEvents: number;
  degraded: boolean;
  signals: string[];
}

export interface EventRecord {
  type: string;
  eventType?: string;
  description?: string;
}

export function computeOpportunityWindowScore(events: EventRecord[]): OpportunityResult {
  if (events.length === 0) {
    return { score: 0.5, techChangeSignals: 0, regulatorySignals: 0, competitiveSignals: 0, totalEvents: 0, degraded: true, signals: ['无事件数据—默认中等机会'] };
  }

  const techChange = events.filter(e =>
    e.eventType?.includes('technology_change') ||
    e.type === 'Tool' || e.type === 'RELEASE'
  );
  const regulatory = events.filter(e =>
    e.eventType?.includes('regulatory_change') ||
    e.type === 'Compliance'
  );
  const competitive = events.filter(e =>
    e.eventType?.includes('competitive_action') ||
    e.type === 'COMPETES_WITH'
  );

  // 加权评分: 技术变革权重0.4, 法规变化0.3, 竞争行动0.3
  const techScore = events.length > 0 ? Math.min(techChange.length / Math.max(events.length * 0.1, 1), 1) : 0;
  const regScore = events.length > 0 ? Math.min(regulatory.length / Math.max(events.length * 0.1, 1), 1) : 0;
  const compScore = events.length > 0 ? Math.min(competitive.length / Math.max(events.length * 0.1, 1), 1) : 0;

  const score = 0.4 * techScore + 0.3 * regScore + 0.3 * compScore;

  const signals: string[] = [];
  if (techChange.length > 0) signals.push(`技术变革信号: ${techChange.length}个`);
  if (regulatory.length > 0) signals.push(`法规变化信号: ${regulatory.length}个`);
  if (competitive.length > 0) signals.push(`竞争行动信号: ${competitive.length}个`);

  return { score, techChangeSignals: techChange.length, regulatorySignals: regulatory.length, competitiveSignals: competitive.length, totalEvents: events.length, degraded: false, signals };
}
