/**
 * evidence/types.ts — 证据池类型定义 (Phase 2.1)
 *
 * 证据来源: 访谈 → 文档(ingest) → 连接器 → 历史诊断
 */
export type EvidenceSource = 'interviewee' | 'document' | 'connector' | 'diagnosis' | 'llm';

export interface Evidence {
  id: string;
  /** 来源类型 */
  source: EvidenceSource;
  /** 来源标识 (orgId, 文档ID, 连接器名) */
  sourceId: string;
  /** 证据类型 (维度) */
  type: string;
  /** 证据内容 */
  content: string;
  /** 可信度 0-1 */
  confidence: number;
  /** 采集时间 */
  collectedAt: string;
  /** 过期时间 (可选) */
  expiresAt?: string;
  /** 组织 ID */
  orgId: string;
  /** 关联的诊断会话 ID */
  sessionId?: string;
}

export interface EvidenceFilter {
  source?: EvidenceSource;
  type?: string;
  orgId?: string;
  sessionId?: string;
  minConfidence?: number;
  limit?: number;
}

export interface ContradictionSignal {
  /** 矛盾的两个证据 */
  evidenceA: Evidence;
  evidenceB: Evidence;
  /** 矛盾评分差 */
  scoreDifference: number;
  /** 矛盾描述 */
  description: string;
}

export interface CorroborationResult {
  /** 证据 ID */
  evidenceId: string;
  /** 支持的证据数 */
  corroboratingCount: number;
  /** 矛盾的证据数 */
  contradictingCount: number;
  /** 综合可信度 (考虑交叉验证后) */
  adjustedConfidence: number;
}
