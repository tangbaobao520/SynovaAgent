/**
 * src/services/federated-pipeline.ts — 跨企业联邦知识 (D244)
 *
 * 模块四 §二-§四: 双重审批 + 多企业验证 + 质量降级。
 * 企业知识→anonymized→pending_admin_review→pending_ga_review→>=2家验证→federated
 *
 * 质量降级: <3/5 评分且 >=5 企业反馈 → 降级
 * 过期: >6月未达2家验证→搁置, >12月→归档
 */
import { createLogger } from "@synova/logger";
import { Anonymizer } from "./anonymizer";

const log = createLogger("services/federated-pipeline");

// ═══ 类型 ═══

export type FederatedStatus =
  | "pending_admin"
  | "pending_ga"
  | "federated"
  | "degraded"
  | "stalled"
  | "archived";

export interface FederatedKnowledge {
  /** 原始知识块 ID */
  sourceChunkId: string;
  /** 脱敏后文本 */
  anonymizedText: string;
  /** 原始企业 ID */
  sourceOrgId: string;
  /** 联邦状态 */
  status: FederatedStatus;
  /** 验证企业数 (>=2 → federated) */
  validationCount: number;
  /** 质量评分 (0-5) */
  qualityScore: number;
  /** 企业反馈数 */
  feedbackCount: number;
  /** 审核人 */
  reviewedBy?: string;
  /** 审核时间 */
  reviewedAt?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ═══ FederatedPipeline ═══

export class FederatedPipeline {
  private store: Map<string, FederatedKnowledge> = new Map();
  private anonymizer: Anonymizer;
  private idCounter = 0;

  constructor(anonymizer?: Anonymizer) {
    this.anonymizer = anonymizer || new Anonymizer();
  }

  /**
   * 管理员标记知识为可共享 → 执行脱敏 + 进入 pending_admin 状态。
   */
  markShareable(chunkId: string, text: string, orgId: string): FederatedKnowledge {
    const { anonymizedText, replacedCount } = this.anonymizer.anonymize(text);
    const id = `fed-${++this.idCounter}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const entry: FederatedKnowledge = {
      sourceChunkId: chunkId,
      anonymizedText,
      sourceOrgId: orgId,
      status: "pending_admin",
      validationCount: 0,
      qualityScore: 0,
      feedbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(id, entry);
    log.info({ chunkId, replacedCount, id }, "知识标记为可共享 → pending_admin");
    return entry;
  }

  /**
   * GA 审批: pending_admin → pending_ga ← 等待多企业验证。
   */
  approveByGa(id: string, reviewer: string): boolean {
    const entry = this.store.get(id);
    if (!entry || entry.status !== "pending_admin") return false;

    entry.status = "pending_ga";
    entry.reviewedBy = reviewer;
    entry.reviewedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    log.info({ id, reviewer }, "GA 已审批 → pending_ga");
    return true;
  }

  /**
   * 企业验证: 验证 + 评分。
   * >=2 企业验证 → federated
   */
  validateByEnterprise(id: string, score: number): boolean {
    const entry = this.store.get(id);
    if (!entry || entry.status === "archived") return false;

    entry.validationCount++;
    entry.feedbackCount++;
    entry.qualityScore = (entry.qualityScore * (entry.feedbackCount - 1) + score) / entry.feedbackCount;
    entry.updatedAt = new Date().toISOString();

    if (entry.validationCount >= 2 && entry.status !== "federated") {
      entry.status = "federated";
      log.info({ id, validationCount: entry.validationCount }, "已达成 2 家验证 → federated");
    }

    return true;
  }

  /**
   * 质量降级检查: <3/5 评分且 >=5 企业反馈 → degraded。
   * 在每次 validateByEnterprise 后调用。
   */
  checkQualityDegradation(id: string): boolean {
    const entry = this.store.get(id);
    if (!entry) return false;

    if (entry.qualityScore < 3 && entry.feedbackCount >= 5) {
      entry.status = "degraded";
      entry.updatedAt = new Date().toISOString();
      log.warn({ id, qualityScore: entry.qualityScore, feedbackCount: entry.feedbackCount }, "联邦知识质量降级");
      return true;
    }
    return false;
  }

  /**
   * 检查过期: >6月未达2家验证→搁置, >12月→归档。
   */
  checkExpiry(id: string): boolean {
    const entry = this.store.get(id);
    if (!entry) return false;

    const now = Date.now();
    const created = new Date(entry.createdAt).getTime();
    const monthsElapsed = (now - created) / (1000 * 60 * 60 * 24 * 30);

    if (monthsElapsed > 12 && entry.validationCount < 2) {
      entry.status = "archived";
      entry.updatedAt = new Date().toISOString();
      log.warn({ id, monthsElapsed: Math.round(monthsElapsed) }, "联邦知识超 12 月 → 归档");
      return true;
    }

    if (monthsElapsed > 6 && entry.validationCount < 2) {
      entry.status = "stalled";
      entry.updatedAt = new Date().toISOString();
      log.warn({ id, monthsElapsed: Math.round(monthsElapsed) }, "联邦知识超 6 月 → 搁置");
      return true;
    }

    return false;
  }

  /** 获取联邦知识 */
  get(id: string): FederatedKnowledge | undefined {
    return this.store.get(id);
  }

  /** 按 sourceChunkId 查找联邦 ID */
  findIdBySourceChunk(sourceChunkId: string): string | undefined {
    for (const [id, entry] of this.store) {
      if (entry.sourceChunkId === sourceChunkId) return id;
    }
    return undefined;
  }

  /** 按状态列出 */
  listByStatus(status: FederatedStatus): FederatedKnowledge[] {
    return Array.from(this.store.values()).filter((e) => e.status === status);
  }

  /** 列出所有 */
  listAll(): FederatedKnowledge[] {
    return Array.from(this.store.values());
  }
}
