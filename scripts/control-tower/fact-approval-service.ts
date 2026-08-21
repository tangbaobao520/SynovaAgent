#!/usr/bin/env npx tsx
/**
 * scripts/control-tower/fact-approval-service.ts — 企业事实审批服务 (D240)
 *
 * 模块二 §四: 事实生命周期 pending -> 管理员审核 -> active -> 注入专家提示词
 *
 * 契约:
 *   @input  — pending 事实文件
 *   @output — status=active/rejected 的 .md 文件
 *   @degraded — 文件不可读 -> log.warn + 跳过
 */
import { createLogger } from "@synova/logger";
import { EnterpriseFactStore, type FactMetadata } from "./enterprise-fact-store";

const log = createLogger("ct/fact-approval-service");

export interface ApprovalResult {
  approved: number;
  rejected: number;
  errors: string[];
}

export class FactApprovalService {
  private store: EnterpriseFactStore;

  constructor(store?: EnterpriseFactStore) {
    this.store = store || new EnterpriseFactStore();
  }

  /** 列出所有待审批事实 */
  listPending() {
    return this.store.listFacts("pending");
  }

  /**
   * 审批一条事实: pending -> active
   * 审批后的事实将进入 expert-file-loader 的注入管线。
   */
  approveFact(category: string, key: string, approvedBy: string): boolean {
    try {
      const fact = this.store.readFact(category, key);
      if (!fact) {
        log.warn({ category, key }, "待审批事实不存在");
        return false;
      }
      if (fact.metadata.status !== "pending") {
        log.warn({ category, key, status: fact.metadata.status }, "事实不在待审批状态");
        return false;
      }

      this.store.updateStatus(category, key, "active", {
        approvedBy,
        approvedAt: new Date().toISOString(),
      });
      log.info({ category, key, approvedBy }, "企业事实已审批 -> active");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, category, key }, "审批企业事实失败 — 降级");
      return false;
    }
  }

  /**
   * 驳回一条事实: pending -> rejected
   */
  rejectFact(category: string, key: string, reason: string): boolean {
    try {
      const fact = this.store.readFact(category, key);
      if (!fact) {
        log.warn({ category, key }, "待驳回事实不存在");
        return false;
      }
      if (fact.metadata.status !== "pending") {
        log.warn({ category, key, status: fact.metadata.status }, "事实不在待审批状态");
        return false;
      }

      this.store.updateStatus(category, key, "rejected", { rejectedReason: reason });
      log.info({ category, key, reason }, "企业事实已驳回 -> rejected");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, category, key }, "驳回企业事实失败 — 降级");
      return false;
    }
  }

  /**
   * 批量审批所有 pending 事实。
   */
  approveAllPending(approvedBy: string): ApprovalResult {
    const pending = this.listPending();
    const result: ApprovalResult = { approved: 0, rejected: 0, errors: [] };

    for (const fact of pending) {
      const ok = this.approveFact(fact.metadata.category, fact.metadata.key, approvedBy);
      if (ok) result.approved++;
      else result.errors.push(`${fact.metadata.category}/${fact.metadata.key}`);
    }

    log.info({ approved: result.approved, errors: result.errors.length }, "批量审批完成");
    return result;
  }
}

// ═══ CLI 入口（D240 管理员入口 — 铁律 7: 入口→交互→结果）═══
//   npx tsx scripts/control-tower/fact-approval-service.ts list
//   npx tsx scripts/control-tower/fact-approval-service.ts approve <category> <key> <approvedBy>
//   npx tsx scripts/control-tower/fact-approval-service.ts reject <category> <key> <reason>
//   npx tsx scripts/control-tower/fact-approval-service.ts approve-all <approvedBy>
async function cliMain(): Promise<void> {
  const [cmd, a, b, c] = process.argv.slice(2);
  const svc = new FactApprovalService();
  switch (cmd) {
    case "list": {
      const pending = svc.listPending();
      for (const f of pending) {
        const firstLine = f.content.split("\n")[0].trim();
        console.log(`${f.metadata.category}/${f.metadata.key} [conf=${f.metadata.confidence}] ${firstLine}`);
      }
      console.log(`共 ${pending.length} 条待审批`);
      break;
    }
    case "approve": {
      if (!a || !b) throw new Error("用法: approve <category> <key> <approvedBy>");
      const ok = svc.approveFact(a, b, c || "admin");
      console.log(ok ? `✅ ${a}/${b} -> active` : "❌ 审批失败（不存在或非 pending）");
      break;
    }
    case "reject": {
      if (!a || !b) throw new Error("用法: reject <category> <key> <reason>");
      const ok = svc.rejectFact(a, b, c || "no reason");
      console.log(ok ? `✅ ${a}/${b} -> rejected` : "❌ 驳回失败");
      break;
    }
    case "approve-all": {
      const r = svc.approveAllPending(a || "admin");
      console.log(`批准 ${r.approved} 条，失败 ${r.errors.length} 条`);
      break;
    }
    default:
      console.log("用法: list | approve <cat> <key> <by> | reject <cat> <key> <reason> | approve-all <by>");
      process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("fact-approval-service.ts")) {
  void cliMain().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
