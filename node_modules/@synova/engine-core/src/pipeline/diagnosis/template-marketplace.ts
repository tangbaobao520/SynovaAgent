/**
 * template-marketplace.ts — 行业本体模板市场 (Phase C1)
 *
 * 知识手艺人的终极资产: 模板可发布/试用/评分/继承。
 * App Store × GitHub × 咨询方法论。
 */
import type { OntologyTemplate } from './ontology-templates/index';
import { getTemplate } from './ontology-templates/index';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/template-marketplace');

// ═══ Types ═══

export type TemplateStatus = 'draft' | 'published' | 'deprecated';

export interface TemplateListing {
  id: string;
  template: OntologyTemplate;
  author: string;
  authorName: string;
  status: TemplateStatus;
  version: string;
  downloads: number;
  rating: number;       // 0-5
  ratingCount: number;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  description: string;
  /** 继承自哪个模板 */
  parentTemplateId?: string;
  /** 价格 (免费=0) */
  price: number;
}

export interface TemplateReview {
  id: string;
  templateId: string;
  reviewer: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ═══ Marketplace ═══

const listings = new Map<string, TemplateListing>();
const reviews = new Map<string, TemplateReview[]>();
const trials = new Map<string, { templateId: string; orgId: string; startedAt: string; expiresAt: string }[]>();

// Seed built-in templates
function seedMarketplace(): void {
  const builtin = ['general-enterprise', 'saas-tech', 'manufacturing', 'financial-services'];
  const now = new Date().toISOString();
  for (const id of builtin) {
    const tmpl = getTemplate(id);
    if (!tmpl) continue;
    listings.set(id, {
      id, template: tmpl,
      author: 'synova', authorName: 'Synova 官方',
      status: 'published', version: '1.0',
      downloads: 0, rating: 0, ratingCount: 0,
      publishedAt: now, updatedAt: now,
      tags: [tmpl.industry, 'builtin'],
      description: `${tmpl.name} — ${tmpl.nodeTypes.length}节点/${tmpl.edgeTypes.length}边/${tmpl.keyMetrics.length}指标/${tmpl.diagnosticRules.length}规则`,
      price: 0,
    });
  }
}
seedMarketplace();

// ═══ CRUD ═══

export function publishTemplate(listing: Omit<TemplateListing, 'id'|'downloads'|'rating'|'ratingCount'|'publishedAt'|'updatedAt'>): TemplateListing {
  const id = `tpl_${Date.now().toString(36)}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2,6)}`;
  const now = new Date().toISOString();
  const full: TemplateListing = { ...listing, id, downloads: 0, rating: 0, ratingCount: 0, publishedAt: now, updatedAt: now };
  listings.set(id, full);
  log.info({ id, author: listing.author, industry: listing.template.industry }, '[marketplace] Template published');
  return full;
}

export function getListing(id: string): TemplateListing | undefined { return listings.get(id); }

export function listTemplates(filter?: { industry?: string; author?: string; status?: TemplateStatus }): TemplateListing[] {
  let results = [...listings.values()];
  if (filter?.industry) results = results.filter(l => l.template.industry === filter.industry);
  if (filter?.author) results = results.filter(l => l.author === filter.author);
  if (filter?.status) results = results.filter(l => l.status === filter.status);
  return results.sort((a, b) => b.downloads - a.downloads);
}

export function searchTemplates(query: string): TemplateListing[] {
  const q = query.toLowerCase();
  return [...listings.values()].filter(l =>
    l.template.name.toLowerCase().includes(q) ||
    l.template.industry.toLowerCase().includes(q) ||
    l.tags.some(t => t.toLowerCase().includes(q)) ||
    l.description.toLowerCase().includes(q)
  );
}

// ═══ Trial ═══

export function startTrial(templateId: string, orgId: string, trialDays = 14): { ok: boolean; message: string } {
  const listing = listings.get(templateId);
  if (!listing) return { ok: false, message: '模板不存在' };
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + trialDays);

  if (!trials.has(orgId)) trials.set(orgId, []);
  const orgTrials = trials.get(orgId)!;
  const existing = orgTrials.find(t => t.templateId === templateId);
  if (existing) return { ok: false, message: `已试用过该模板, 到期: ${existing.expiresAt}` };

  orgTrials.push({ templateId, orgId, startedAt: now.toISOString(), expiresAt: expires.toISOString() });
  listing.downloads++;
  return { ok: true, message: `试用期 ${trialDays} 天, 至 ${expires.toISOString().slice(0,10)}` };
}

export function isTrialActive(templateId: string, orgId: string): boolean {
  const orgTrials = trials.get(orgId) || [];
  return orgTrials.some(t => t.templateId === templateId && new Date(t.expiresAt) > new Date());
}

// ═══ Review ═══

export function addReview(templateId: string, reviewer: string, rating: number, comment: string): TemplateReview {
  const listing = listings.get(templateId);
  const review: TemplateReview = { id: `rev_${Date.now().toString(36)}`, templateId, reviewer, rating: Math.min(5, Math.max(0, rating)), comment, createdAt: new Date().toISOString() };
  if (!reviews.has(templateId)) reviews.set(templateId, []);
  reviews.get(templateId)!.push(review);
  if (listing) {
    listing.ratingCount++;
    listing.rating = reviews.get(templateId)!.reduce((s, r) => s + r.rating, 0) / listing.ratingCount;
  }
  return review;
}

export function getReviews(templateId: string): TemplateReview[] { return reviews.get(templateId) || []; }

// ═══ Inheritance ═══

export function forkTemplate(templateId: string, author: string, authorName: string, overrides: Partial<OntologyTemplate>): TemplateListing | null {
  const parent = listings.get(templateId);
  if (!parent) return null;
  const forked: OntologyTemplate = { ...parent.template, ...overrides, id: '', name: overrides.name || `${parent.template.name} (定制版)`, version: '1.0' };
  return publishTemplate({ template: forked, author, authorName, status: 'draft', version: '1.0', tags: [...parent.tags, 'forked'], description: `基于 ${parent.template.name} 定制`, parentTemplateId: templateId, price: 0 });
}

// ═══ Payout ═══

export function getParentPayout(templateId: string): { parentAuthor: string; rate: number } | null {
  const listing = listings.get(templateId);
  if (!listing?.parentTemplateId) return null;
  const parent = listings.get(listing.parentTemplateId);
  if (!parent) return null;
  return { parentAuthor: parent.author, rate: 0.3 }; // 原作者分成 30%
}

export function clearMarketplace(): void { listings.clear(); reviews.clear(); trials.clear(); seedMarketplace(); }
