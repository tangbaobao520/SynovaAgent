/**
 * data-health/computes/data-readiness-score.ts — 数据就绪度计算
 *
 * 评估本体层数据质量：缺失字段率、结构化比例、PII 风险。
 * 纯函数: 输入节点列表，输出就绪度指标。
 */
const PII_PATTERNS = [
  /身份证|id_card|ssn|护照|passport/i,
  /手机|电话|phone|mobile/i,
  /邮箱|email/i,
  /地址|address/i,
  /薪资|salary|工资|payroll/i,
  /银行|bank.*account/i,
];

export interface DataReadinessResult {
  readiness: number;         // 0-1, 越高越好
  missingFieldRate: number;  // 缺失字段比例
  structuredRate: number;    // 结构化数据比例
  piiHitCount: number;       // 潜在 PII 命中数
  totalNodes: number;
  degraded: boolean;
}

export function computeDataReadiness(
  nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>
): DataReadinessResult {
  if (nodes.length === 0) {
    return { readiness: 1, missingFieldRate: 0, structuredRate: 0, piiHitCount: 0, totalNodes: 0, degraded: true };
  }

  let missingProps = 0;
  let structuredNodes = 0;
  let piiHits = 0;

  for (const n of nodes) {
    if (!n.props || typeof n.props !== 'object') { missingProps++; continue; }
    const keys = Object.keys(n.props).filter(k => k !== 'name' && k !== 'type');
    if (keys.length === 0) {
      missingProps++;
    } else {
      structuredNodes++;
    }
    const propsStr = JSON.stringify(n.props);
    for (const pat of PII_PATTERNS) {
      if (pat.test(propsStr)) { piiHits++; break; }
    }
  }

  const missingFieldRate = nodes.length > 0 ? missingProps / nodes.length : 0;
  const structuredRate = nodes.length > 0 ? structuredNodes / nodes.length : 0;
  // readiness = 综合加权：结构化率权重0.6，缺失率反向权重0.4
  const readiness = 0.6 * structuredRate + 0.4 * (1 - missingFieldRate);

  return { readiness, missingFieldRate, structuredRate, piiHitCount: piiHits, totalNodes: nodes.length, degraded: false };
}
