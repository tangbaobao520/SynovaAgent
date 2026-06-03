/**
 * diagnosis/marketing-data-store.ts — 营销诊断数据存储
 *
 * 为三个营销模块提供数据加载桥：
 *   - category-clarity        → customerResponses
 *   - positioning-consistency → externalClaims + internalDescriptions + customerPerceptions
 *   - differentiation-validation → claimedDifferentiation + customerPerceptions
 *
 * 存储：内存 Map（Phase A）。Phase B 迁移至 SQLite（与 FinancialBaseline 同模式）。
 *
 * 参照 financial-impact.ts 的 loadFinancialBaseline / saveFinancialBaseline 模式。
 */

export interface MarketingDataRecord {
  teamId: string;
  /** 客户访谈文本 — 对应 category-clarity 的 responses（品类认知词） */
  customerResponses: string[];
  /** 对外声称（官网/PRD/宣传材料） */
  externalClaims: string[];
  /** 内部描述（员工对公司的描述/定位认知） */
  internalDescriptions: string[];
  /** 客户感知（客户对公司差异化的描述） */
  customerPerceptions: string[];
  /** 公司声称的差异化主张（单条文本） */
  claimedDifferentiation: string;
  updatedAt: string;
}

export type MarketingDataInput = Omit<MarketingDataRecord, 'teamId' | 'updatedAt'>;

const store = new Map<string, MarketingDataRecord>();

/** Load marketing data for a team. Returns null if not configured. */
export function loadMarketingData(teamId: string): MarketingDataRecord | null {
  return store.get(teamId) ?? null;
}

/** Save marketing data for a team. */
export function saveMarketingData(teamId: string, data: MarketingDataInput): void {
  store.set(teamId, {
    ...data,
    teamId,
    updatedAt: new Date().toISOString(),
  });
}

/** Delete marketing data for a team. Returns true if data existed. */
export function deleteMarketingData(teamId: string): boolean {
  return store.delete(teamId);
}
