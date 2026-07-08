/**
 * ga-annotations-types.ts — GA哨兵标注工具 API类型定义
 *
 * T3: GA在诊断报告审查时标注哨兵Finding质量。
 * 标注数据是哨兵可信度基线（T9）的数据来源。
 *
 * 铁律 47: 契约优先。新增 compute 函数必须先定义输入/输出/降级契约。
 * 本文件定义 API 契约——先于任何实现。
 *
 * @module routes/ga-annotations-types
 */

// ═══ 请求类型 ═══

/** POST /api/ga/annotations 请求体 */
export interface CreateAnnotationRequest {
  /** SentinelFinding.id */
  findingId: string;
  /** 标注类型: confirmed(确认) | false_alarm(误报) | uncertain(不确定) */
  annotation: 'confirmed' | 'false_alarm' | 'uncertain';
  /** 纠错说明，可选，上限2000字符 */
  correctionNote?: string;
}

/** GET /api/ga/annotations 查询参数 */
export interface ListAnnotationsQuery {
  /** 按Finding ID筛选 */
  findingId?: string;
  /** 按哨兵ID筛选 */
  sentinelId?: string;
  /** 按标注类型筛选 */
  annotation?: 'confirmed' | 'false_alarm' | 'uncertain';
  /** 每页条数，默认50，最大200 */
  limit?: number;
  /** 偏移量，默认0 */
  offset?: number;
}

// ═══ 响应类型 ═══

/** 单条标注记录 */
export interface AnnotationRecord {
  /** annotation ID (格式: sentinel_annotation:{findingId}:{timestamp}) */
  id: string;
  /** 关联的Finding ID */
  findingId: string;
  /** 哨兵ID */
  sentinelId: string;
  /** Finding原始severity */
  severity: string;
  /** Finding原始title */
  title: string;
  /** 标注类型 */
  annotation: 'confirmed' | 'false_alarm' | 'uncertain';
  /** 纠错说明 */
  correctionNote?: string;
  /** GA用户ID */
  gaId: string;
  /** 企业ID */
  orgId: string;
  /** 标注时间 ISO-8601 */
  annotatedAt: string;
}

/** POST /api/ga/annotations 响应 */
export interface CreateAnnotationResponse {
  ok: true;
  /** 新创建的标注ID */
  annotationId: string;
}

/** GET /api/ga/annotations 响应 */
export interface ListAnnotationsResponse {
  ok: true;
  /** 标注记录列表 */
  annotations: AnnotationRecord[];
  /** 符合条件的总条数 */
  total: number;
}

// ═══ 存储类型 ═══

/** AgentMemoryStore中存储的标注数据（value字段的JSON结构） */
export interface SentinelAnnotation {
  findingId: string;
  sentinelId: string;
  severity: string;
  title: string;
  annotation: 'confirmed' | 'false_alarm' | 'uncertain';
  correctionNote?: string;
  gaId: string;
  orgId: string;
  annotatedAt: string;
}

// ═══ 统计类型 ═══

/** 单哨兵标注统计 */
export interface SentinelAnnotationStats {
  total: number;
  confirmed: number;
  falseAlarm: number;
  uncertain: number;
}

/** GET /api/ga/annotations/stats 响应 */
export interface AnnotationStatsResponse {
  ok: true;
  /** 按哨兵ID分组的统计 */
  bySentinel: Record<string, SentinelAnnotationStats>;
  /** 总体统计 */
  overall: {
    totalAnnotations: number;
    confirmedRate: number;
    falseAlarmRate: number;
    uncertainRate: number;
  };
}
