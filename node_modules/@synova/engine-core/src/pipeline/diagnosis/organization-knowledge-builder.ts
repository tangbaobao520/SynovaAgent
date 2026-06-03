/**
 * organization-knowledge-builder.ts — 组织知识库构建器
 *
 * 从诊断报告中提取可复用的组织知识：
 *   - 团队协作模式指纹
 *   - 最佳实践沉淀
 *   - 反模式识别
 *   - 跨团队知识迁移
 *
 * 知识类型：
 *   - pattern       — 协作模式（可复用的结构）
 *   - antipattern   — 反模式（应避免的结构）
 *   - benchmark     — 基准数据（供同行业对比）
 *   - insight       — 洞察（非结构化经验）
 */

// ====================================================================
// 类型定义
// ====================================================================

export type KnowledgeType = 'pattern' | 'antipattern' | 'benchmark' | 'insight';

export interface OrgKnowledgeEntry {
  id: string;
  type: KnowledgeType;
  /** 知识标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 来源团队 ID */
  sourceTeamId: string;
  /** 关联的缝隙维度 */
  dimensions: string[];
  /** 标签 */
  tags: string[];
  /** 证据强度 0-1 */
  evidenceStrength: number;
  /** 适用范围 */
  applicableTo: ('startup' | 'sme' | 'enterprise' | 'tech' | 'non-tech')[];
  /** 创建时间 */
  createdAt: string;
  /** 引用次数（跨团队复用计数） */
  citationCount: number;
  /** 版本（更新时递增） */
  version: number;
}

export interface KnowledgeQuery {
  type?: KnowledgeType;
  dimensions?: string[];
  tags?: string[];
  applicableTo?: OrgKnowledgeEntry['applicableTo'][number];
  keyword?: string;
  minEvidenceStrength?: number;
  limit?: number;
}

export interface KnowledgeStats {
  totalEntries: number;
  byType: Record<KnowledgeType, number>;
  byDimension: Record<string, number>;
  topCited: OrgKnowledgeEntry[];
}

// ====================================================================
// 知识库存储
// ====================================================================

class KnowledgeStore {
  private entries: Map<string, OrgKnowledgeEntry> = new Map();
  private idCounter = 0;

  add(entry: Omit<OrgKnowledgeEntry, 'id' | 'citationCount' | 'version' | 'createdAt'>): OrgKnowledgeEntry {
    const id = `ok-${++this.idCounter}`;
    const full: OrgKnowledgeEntry = {
      ...entry,
      id,
      citationCount: 0,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    this.entries.set(id, full);
    return full;
  }

  upsert(id: string, entry: Omit<OrgKnowledgeEntry, 'id' | 'citationCount' | 'version' | 'createdAt'>): OrgKnowledgeEntry {
    const existing = this.entries.get(id);
    if (existing) {
      const updated: OrgKnowledgeEntry = {
        ...entry,
        id,
        citationCount: existing.citationCount,
        version: existing.version + 1,
        createdAt: existing.createdAt,
      };
      this.entries.set(id, updated);
      return updated;
    }
    const full: OrgKnowledgeEntry = {
      ...entry,
      id,
      citationCount: 0,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    this.entries.set(id, full);
    return full;
  }

  get(id: string): OrgKnowledgeEntry | null {
    return this.entries.get(id) ?? null;
  }

  query(q: KnowledgeQuery = {}): OrgKnowledgeEntry[] {
    let results = [...this.entries.values()];

    if (q.type) {
      results = results.filter(e => e.type === q.type);
    }
    if (q.dimensions && q.dimensions.length > 0) {
      results = results.filter(e => q.dimensions!.some(d => e.dimensions.includes(d)));
    }
    if (q.tags && q.tags.length > 0) {
      results = results.filter(e => q.tags!.some(t => e.tags.includes(t)));
    }
    if (q.applicableTo) {
      results = results.filter(e => e.applicableTo.includes(q.applicableTo!));
    }
    if (q.keyword) {
      const kw = q.keyword.toLowerCase();
      results = results.filter(e =>
        e.title.toLowerCase().includes(kw) ||
        e.description.toLowerCase().includes(kw) ||
        e.tags.some(t => t.toLowerCase().includes(kw)),
      );
    }
    if (q.minEvidenceStrength !== undefined) {
      results = results.filter(e => e.evidenceStrength >= q.minEvidenceStrength!);
    }

    results.sort((a, b) => b.citationCount - a.citationCount);
    if (q.limit && q.limit > 0) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  incrementCitation(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.citationCount++;
    return true;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  stats(): KnowledgeStats {
    const all = [...this.entries.values()];
    const byType: Record<KnowledgeType, number> = { pattern: 0, antipattern: 0, benchmark: 0, insight: 0 };
    const byDimension: Record<string, number> = {};

    for (const e of all) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      for (const d of e.dimensions) {
        byDimension[d] = (byDimension[d] ?? 0) + 1;
      }
    }

    const topCited = [...all].sort((a, b) => b.citationCount - a.citationCount).slice(0, 10);

    return {
      totalEntries: all.length,
      byType,
      byDimension,
      topCited,
    };
  }

  clear(): void {
    this.entries.clear();
    this.idCounter = 0;
  }
}

let store: KnowledgeStore | null = null;

function getStore(): KnowledgeStore {
  if (!store) store = new KnowledgeStore();
  return store;
}

// ====================================================================
// 公开 API
// ====================================================================

/** 添加组织知识 */
export function addKnowledge(
  entry: Omit<OrgKnowledgeEntry, 'id' | 'citationCount' | 'version' | 'createdAt'>,
): OrgKnowledgeEntry {
  return getStore().add(entry);
}

/** 更新或插入知识 */
export function upsertKnowledge(
  id: string,
  entry: Omit<OrgKnowledgeEntry, 'id' | 'citationCount' | 'version' | 'createdAt'>,
): OrgKnowledgeEntry {
  return getStore().upsert(id, entry);
}

/** 获取知识条目 */
export function getKnowledge(id: string): OrgKnowledgeEntry | null {
  return getStore().get(id);
}

/** 查询知识库 */
export function queryKnowledge(q: KnowledgeQuery = {}): OrgKnowledgeEntry[] {
  return getStore().query(q);
}

/** 引用知识（增加引用计数） */
export function citeKnowledge(id: string): boolean {
  return getStore().incrementCitation(id);
}

/** 删除知识 */
export function deleteKnowledge(id: string): boolean {
  return getStore().delete(id);
}

/** 知识库统计 */
export function getKnowledgeStats(): KnowledgeStats {
  return getStore().stats();
}

/** 重置知识库（测试用） */
export function resetKnowledge(): void {
  store?.clear();
  store = null;
}

// ====================================================================
// 知识提取器：从诊断报告中自动提取知识
// ====================================================================

interface ExtractionInput {
  teamId: string;
  /** 基于诊断发现的维度得分映射 */
  dimensionScores: Record<string, number>;
  /** 关键发现 */
  keyFindings: string[];
  /** 行动建议 */
  recommendations: string[];
  /** 团队规模和类型 */
  teamContext: {
    size: number;
    industry: string;
    stage: 'startup' | 'sme' | 'enterprise';
    isTech: boolean;
  };
}

/** 从诊断结果中自动提取可复用知识 */
export function extractFromDiagnosis(input: ExtractionInput): OrgKnowledgeEntry[] {
  const entries: OrgKnowledgeEntry[] = [];
  const applicability: OrgKnowledgeEntry['applicableTo'] = [
    input.teamContext.stage,
    input.teamContext.isTech ? 'tech' : 'non-tech',
  ];

  // 提取模式（得分 >= 0.7 的维度——做得好，值得沉淀）
  for (const [dim, score] of Object.entries(input.dimensionScores)) {
    if (score >= 0.7) {
      entries.push(getStore().add({
        type: 'pattern',
        title: `高效「${dim}」模式 — ${input.teamContext.industry}`,
        description: `来自${input.teamContext.stage}阶段${input.teamContext.industry}团队的「${dim}」成功实践。团队规模：${input.teamContext.size}人。该维度得分为 ${(score * 100).toFixed(0)}%，表明其协作模式具有参考价值。`,
        sourceTeamId: input.teamId,
        dimensions: [dim],
        tags: ['成功模式', dim, input.teamContext.industry],
        evidenceStrength: score,
        applicableTo: applicability,
      }));
    }
  }

  // 提取反模式（得分 <= 0.3 的维度——做得差，值得警示）
  for (const [dim, score] of Object.entries(input.dimensionScores)) {
    if (score <= 0.3) {
      entries.push(getStore().add({
        type: 'antipattern',
        title: `「${dim}」低效模式 — ${input.teamContext.industry}`,
        description: `${input.teamContext.stage}阶段${input.teamContext.industry}团队在「${dim}」维度得分仅 ${(score * 100).toFixed(0)}%。相似规模和行业的团队应审视本团队在该维度的状态。`,
        sourceTeamId: input.teamId,
        dimensions: [dim],
        tags: ['反模式', '警示', dim, input.teamContext.industry],
        evidenceStrength: 1 - score,
        applicableTo: applicability,
      }));
    }
  }

  // 提取基准数据
  entries.push(getStore().add({
    type: 'benchmark',
    title: `${input.teamContext.stage}·${input.teamContext.industry}·${input.teamContext.size}人 诊断基准`,
    description: `行业：${input.teamContext.industry} | 阶段：${input.teamContext.stage} | 规模：${input.teamContext.size}人`,
    sourceTeamId: input.teamId,
    dimensions: Object.keys(input.dimensionScores),
    tags: ['基准数据', input.teamContext.industry, input.teamContext.stage],
    evidenceStrength: 0.8,
    applicableTo: applicability,
  }));

  // 提取关键洞察
  for (const finding of input.keyFindings.slice(0, 3)) {
    entries.push(getStore().add({
      type: 'insight',
      title: `洞察：${finding.slice(0, 50)}${finding.length > 50 ? '...' : ''}`,
      description: finding,
      sourceTeamId: input.teamId,
      dimensions: Object.keys(input.dimensionScores),
      tags: ['洞察', input.teamContext.industry],
      evidenceStrength: 0.6,
      applicableTo: applicability,
    }));
  }

  return entries;
}
