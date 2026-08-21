/**
 * tests/control-tower/enterprise-facts.test.ts — D240 企业事实治理测试
 *
 * L1 单元测试 (6 tests):
 *   1. EnterpriseFactStore create/read/list
 *   2. FactApprovalService pending -> active -> rejected
 *   3. ConflictScanner 同 category 数值矛盾检测
 *   4. agent-memory-store enterprise_fact 双写 + status 持久化
 *   5. expert-file-loader 只读 active 事实（loadActiveEnterpriseFacts）
 * 全部使用临时目录（mkdtemp），不污染仓库工作区。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import { EnterpriseFactStore } from "../../scripts/control-tower/enterprise-fact-store";
import { FactApprovalService } from "../../scripts/control-tower/fact-approval-service";
import { ConflictScanner } from "../../scripts/control-tower/conflict-scanner";
import { AgentMemoryStore } from "../../src/l4/agent-memory-store";
import { loadActiveEnterpriseFacts } from "../../src/agent/expert-file-loader";

// ═══ 夹具：临时根目录 ═══

const TEST_CATEGORY = "_test_d240";
let TEST_ROOT: string;
let store: EnterpriseFactStore;

beforeAll(() => {
  TEST_ROOT = mkdtempSync(join(tmpdir(), "d240-facts-"));
  store = new EnterpriseFactStore(TEST_ROOT);
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 1: EnterpriseFactStore CRUD
// ═════════════════════════════════════════════════════════════════════════════

describe("EnterpriseFactStore CRUD", () => {
  it("createFact creates .md file with YAML front matter", () => {
    const path = store.createFact(TEST_CATEGORY, "test_ratio", "Cash ratio is 1.5x", {
      confidence: 0.85,
      source: "diagnosis",
    });

    expect(path).toBeTruthy();
    expect(path).toContain(".md");

    const fact = store.readFact(TEST_CATEGORY, "test_ratio");
    expect(fact).not.toBeNull();
    expect(fact!.metadata.status).toBe("pending");
    expect(fact!.metadata.confidence).toBe(0.85);
    expect(fact!.content).toBe("Cash ratio is 1.5x");
  });

  it("listFacts returns all facts, filtered by status", () => {
    store.createFact(TEST_CATEGORY, "list_a", "Fact A", { source: "manual" });
    store.createFact(TEST_CATEGORY, "list_b", "Fact B", { source: "manual" });

    const all = store.listFacts();
    const pending = store.listFacts("pending");

    const testFacts = all.filter((f) => f.metadata.category === TEST_CATEGORY);
    expect(testFacts.length).toBeGreaterThanOrEqual(3);

    expect(pending.length).toBeGreaterThanOrEqual(3);
  });

  it("updateStatus changes fact status and persists to file", () => {
    store.createFact(TEST_CATEGORY, "status_test", "Test content", { source: "manual" });

    const ok = store.updateStatus(TEST_CATEGORY, "status_test", "active", {
      approvedBy: "admin",
      approvedAt: new Date().toISOString(),
    });
    expect(ok).toBe(true);

    const fact = store.readFact(TEST_CATEGORY, "status_test");
    expect(fact!.metadata.status).toBe("active");
    expect(fact!.metadata.approvedBy).toBe("admin");
  });

  it("listCategories returns available categories", () => {
    const cats = store.listCategories();
    expect(cats).toContain(TEST_CATEGORY);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 2: FactApprovalService
// ═════════════════════════════════════════════════════════════════════════════

describe("FactApprovalService", () => {
  it("approveFact changes pending -> active", () => {
    store.createFact(TEST_CATEGORY, "approve_me", "Revenue growing at 15% YoY", { source: "diagnosis" });
    const svc = new FactApprovalService(store);

    const pending = svc.listPending();
    expect(pending.some((f) => f.metadata.key === "approve_me")).toBe(true);

    const ok = svc.approveFact(TEST_CATEGORY, "approve_me", "ga-admin");
    expect(ok).toBe(true);

    const fact = store.readFact(TEST_CATEGORY, "approve_me");
    expect(fact!.metadata.status).toBe("active");
    expect(fact!.metadata.approvedBy).toBe("ga-admin");
  });

  it("rejectFact changes pending -> rejected", () => {
    store.createFact(TEST_CATEGORY, "reject_me", "Invalid claim: 200% market share", { source: "manual" });
    const svc = new FactApprovalService(store);

    const ok = svc.rejectFact(TEST_CATEGORY, "reject_me", "Market share cannot exceed 100%");
    expect(ok).toBe(true);

    const fact = store.readFact(TEST_CATEGORY, "reject_me");
    expect(fact!.metadata.status).toBe("rejected");
    expect(fact!.metadata.rejectedReason).toContain("100%");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 3: ConflictScanner
// ═════════════════════════════════════════════════════════════════════════════

describe("ConflictScanner", () => {
  it("detects numeric contradictions in same category", () => {
    store.createFact(TEST_CATEGORY, "cashflow_2026_q1", "Cash flow ratio is 1.5x, indicating healthy liquidity", {
      status: "active",
      source: "diagnosis",
    });
    store.updateStatus(TEST_CATEGORY, "cashflow_2026_q1", "active", {
      approvedBy: "admin",
      approvedAt: new Date().toISOString(),
    });

    store.createFact(TEST_CATEGORY, "cashflow_2026_q2", "Cash flow ratio is 2.5x, improved from last quarter", {
      status: "active",
      source: "diagnosis",
    });
    store.updateStatus(TEST_CATEGORY, "cashflow_2026_q2", "active", {
      approvedBy: "admin",
      approvedAt: new Date().toISOString(),
    });

    const scanner = new ConflictScanner(store);
    const report = scanner.scan(TEST_CATEGORY);

    // 1.5 -> 2.5 = 66% 偏差 > 30% 阈值
    expect(report.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(report.conflicts[0].category).toBe(TEST_CATEGORY);
    expect(report.degraded).toBe(false);
    expect(report.scanned).toBeGreaterThanOrEqual(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 4: agent-memory-store 双写 + status 持久化
// ═════════════════════════════════════════════════════════════════════════════

describe("agent-memory-store 双写 + status", () => {
  let memRoot: string;
  let db: Database.Database;
  let mem: AgentMemoryStore;
  let memStore: EnterpriseFactStore;

  beforeAll(() => {
    memRoot = mkdtempSync(join(tmpdir(), "d240-mem-"));
    memStore = new EnterpriseFactStore(memRoot);
    db = new Database(":memory:");
    mem = new AgentMemoryStore(db, 100, memStore);
  });

  afterAll(() => {
    db.close();
    rmSync(memRoot, { recursive: true, force: true });
  });

  it("remember enterprise_fact 双写文件 + status=pending，审批后 list(status=active) 可见", () => {
    const entry = mem.remember({
      orgId: "org-test",
      key: "revenue_yoy",
      value: "Revenue growth is 15% YoY",
      type: "enterprise_fact",
      confidence: 0.8,
      source: "diagnosis",
      tags: ["category:financial"],
    });
    expect(entry.status).toBe("pending");

    // 双写文件存在且 status=pending
    const fact = memStore.readFact("financial", "revenue_yoy");
    expect(fact).not.toBeNull();
    expect(fact!.metadata.status).toBe("pending");

    // SQL 层 status 过滤
    const pendingList = mem.list({ orgId: "org-test", type: "enterprise_fact", status: "pending" });
    expect(pendingList.some((m) => m.key === "revenue_yoy")).toBe(true);
    const activeList = mem.list({ orgId: "org-test", type: "enterprise_fact", status: "active" });
    expect(activeList.some((m) => m.key === "revenue_yoy")).toBe(false);

    // 审批 -> active -> 文件 + SQL 同步可见
    const svc = new FactApprovalService(memStore);
    expect(svc.approveFact("financial", "revenue_yoy", "test-admin")).toBe(true);
    expect(memStore.readFact("financial", "revenue_yoy")!.metadata.status).toBe("active");
    const activeAfter = mem.list({ orgId: "org-test", type: "enterprise_fact", status: "active" });
    expect(activeAfter.some((m) => m.key === "revenue_yoy")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 5: expert-file-loader 只读 active 事实
// ═════════════════════════════════════════════════════════════════════════════

describe("expert-file-loader active-only", () => {
  it("loadActiveEnterpriseFacts 只注入 active，排除 pending", () => {
    const loaderRoot = mkdtempSync(join(tmpdir(), "d240-loader-"));
    try {
      const activeDir = join(loaderRoot, "financial");
      mkdirSync(activeDir, { recursive: true });
      writeFileSync(
        join(activeDir, "active_metric.md"),
        [
          "---",
          "key: active_metric",
          "category: financial",
          "status: active",
          "confidence: 0.8",
          "source: test",
          "version: 1",
          "created_at: 2026-07-27T00:00:00Z",
          "updated_at: 2026-07-27T00:00:00Z",
          "---",
          "",
          "Revenue growth is 15% YoY",
        ].join("\n"),
        "utf-8",
      );

      const pendingDir = join(loaderRoot, "operational");
      mkdirSync(pendingDir, { recursive: true });
      writeFileSync(
        join(pendingDir, "pending_metric.md"),
        [
          "---",
          "key: pending_metric",
          "category: operational",
          "status: pending",
          "confidence: 0.5",
          "source: manual",
          "version: 1",
          "created_at: 2026-07-27T00:00:00Z",
          "updated_at: 2026-07-27T00:00:00Z",
          "---",
          "",
          "Unverified data point",
        ].join("\n"),
        "utf-8",
      );

      const facts = loadActiveEnterpriseFacts(loaderRoot);
      expect(facts).toContain("active_metric");
      expect(facts).toContain("15%");
      expect(facts).not.toContain("pending_metric");
    } finally {
      rmSync(loaderRoot, { recursive: true, force: true });
    }
  });
});
