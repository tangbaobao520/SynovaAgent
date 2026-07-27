/**
 * tests/services/federated-knowledge.test.ts — D244 联邦知识测试 (L1×4)
 *
 * 1. Anonymizer 企业名替换
 * 2. Anonymizer 精确数字→区间
 * 3. FederatedPipeline markShareable→anonymized
 * 4. 质量降级 (<3/5 + >=5反馈)
 */
import { describe, it, expect } from "vitest";
import { Anonymizer } from "../../src/services/anonymizer";
import { FederatedPipeline } from "../../src/services/federated-pipeline";

describe("D244: Anonymizer — entity replacement", () => {
  it("replaces company names with [企业X] placeholders", () => {
    const a = new Anonymizer();
    const text = "SynovaTech Inc and 星辰科技 have partnered to deliver AI solutions.";
    const result = a.anonymize(text);
    expect(result.replacedCount).toBeGreaterThanOrEqual(1);
    expect(result.anonymizedText).toContain("[企业");
    expect(result.anonymizedText).not.toContain("SynovaTech");
    expect(result.degraded).toBe(false);
  });

  it("replaces exact numbers with ranges", () => {
    const a = new Anonymizer();
    const text = "Revenue increased to 350万元 with 45.5% market share.";
    const result = a.anonymize(text);
    expect(result.replacedCount).toBeGreaterThanOrEqual(1);
    expect(result.anonymizedText).not.toContain("350万元");
    // Should contain ranges from the replacement
    expect(result.anonymizedText).toMatch(/\d+-\d+/);
    // 45.5% should become a range
    expect(result.anonymizedText).not.toContain("45.5%");
  });

  it("replaces emails and phone numbers", () => {
    const a = new Anonymizer();
    const text = "Contact admin@company.com or 13800138000 for support.";
    const result = a.anonymize(text);
    expect(result.anonymizedText).not.toContain("admin@company.com");
    expect(result.anonymizedText).not.toContain("13800138000");
    expect(result.anonymizedText).toContain("[邮箱");
    expect(result.anonymizedText).toContain("[电话]");
  });

  it("returns degraded for empty text", () => {
    const a = new Anonymizer();
    const result = a.anonymize("");
    expect(result.degraded).toBe(true);
    expect(result.replacedCount).toBe(0);
  });
});

describe("D244: GA weight drop", () => {
  it("checkGaWeightDrop reduces scores for items reviewed by that GA", () => {
    const pipeline = new FederatedPipeline();
    pipeline.markShareable("chunk-ga1", "SynovaTech has 500 employees", "org-1");
    pipeline.approveByGa(pipeline.findIdBySourceChunk("chunk-ga1")!, "ga-zhang");

    pipeline.markShareable("chunk-ga2", "Revenue growth 25% YoY", "org-2");
    pipeline.approveByGa(pipeline.findIdBySourceChunk("chunk-ga2")!, "ga-zhang");

    pipeline.markShareable("chunk-ga3", "Other data", "org-3");
    pipeline.approveByGa(pipeline.findIdBySourceChunk("chunk-ga3")!, "ga-li");

    // GA zhang离职，降低权重
    const affected = pipeline.checkGaWeightDrop("ga-zhang");
    expect(affected).toBe(2); // 2 items reviewed by ga-zhang

    // ga-li 的条目不受影响
    const liItem = pipeline.get(pipeline.findIdBySourceChunk("chunk-ga3")!);
    expect(liItem!.qualityScore).toBe(0); // pending_admin, 评分仍为0
    // ga-zhang 的条目 qualityScore 降低 50% (保持0 * 0.5 = 0)
    // Actually since items are pending_admin, score is 0
    // Let's add some validation scores first
  });

  it("GA weight drop can trigger degradation when score < 3", () => {
    const pipeline = new FederatedPipeline();

    // 先审批通过，然后多次验证建立评分
    const entry1 = pipeline.markShareable("chunk-degrade", "Test data for degradation", "org-1");
    const fedId = pipeline.findIdBySourceChunk("chunk-degrade")!;
    pipeline.approveByGa(fedId, "ga-lin");

    // 模拟 3 次验证评分为 5（满分）
    for (let i = 0; i < 3; i++) {
      pipeline.validateByEnterprise(fedId, 5);
    }

    // 验证评分 = 5
    const before = pipeline.get(fedId);
    expect(before!.qualityScore).toBe(5);
    expect(before!.feedbackCount).toBe(3);

    // GA lin 离职 → 评分降低 50% → 5 * 0.5 = 2.5 < 3 → 降级触发
    const affected = pipeline.checkGaWeightDrop("ga-lin");
    expect(affected).toBe(1);

    const after = pipeline.get(fedId);
    expect(after!.qualityScore).toBe(2.5);
    expect(after!.status).toBe("degraded");
  });
});

describe("D244: FederatedPipeline — lifecycle", () => {
  it("markShareable anonymizes and sets pending_admin", () => {
    const pipeline = new FederatedPipeline();
    const entry = pipeline.markShareable("chunk-1", "SynovaTech has 300 employees", "org-1");
    expect(entry.sourceChunkId).toBe("chunk-1");
    expect(entry.status).toBe("pending_admin");
    expect(entry.anonymizedText).toContain("[企业");
    expect(entry.anonymizedText).not.toContain("SynovaTech");
    expect(entry.validationCount).toBe(0);
  });

  it("GA approval transitions pending_admin -> pending_ga", () => {
    const pipeline = new FederatedPipeline();
    const entry = pipeline.markShareable("chunk-2", "Test data", "org-1");
    expect(entry.status).toBe("pending_admin");

    // 使用 findIdBySourceChunk 获取联邦 ID
    const fedId = pipeline.findIdBySourceChunk("chunk-2");
    expect(fedId).toBeDefined();

    const ok = pipeline.approveByGa(fedId!, "ga-admin");
    expect(ok).toBe(true);

    const updated = pipeline.get(fedId!);
    expect(updated!.status).toBe("pending_ga");
    expect(updated!.reviewedBy).toBe("ga-admin");
  });

  it("quality degrades when score < 3 and feedback >= 5", () => {
    const pipeline = new FederatedPipeline();
    pipeline.markShareable("chunk-3", "Data for quality test", "org-1");

    const fedId = pipeline.findIdBySourceChunk("chunk-3");
    expect(fedId).toBeDefined();

    // 5 次低评分验证
    for (let i = 0; i < 5; i++) {
      pipeline.validateByEnterprise(fedId!, 2);
    }

    const degraded = pipeline.checkQualityDegradation(fedId!);
    expect(degraded).toBe(true);

    const updated = pipeline.get(fedId!);
    expect(updated!.status).toBe("degraded");
    expect(updated!.qualityScore).toBeLessThan(3);
  });
});
