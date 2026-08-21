#!/usr/bin/env npx tsx
/**
 * scripts/control-tower/conflict-scanner.ts — 企业事实冲突检测 (D240)
 *
 * 定时扫描同 category 下 active 事实的数值矛盾。
 * 检测逻辑: 同 category 中 key 包含相同前缀的事实，数值之差超过阈值则标记冲突。
 *
 * 契约:
 *   @input  — 扫描范围 (category 可选)
 *   @output — ConflictReport { conflicts: [] }
 *   @degraded — 目录不可读 -> log.warn + 空报告
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createLogger } from "@synova/logger";
import { EnterpriseFactStore, FACTS_ROOT } from "./enterprise-fact-store";

const log = createLogger("ct/conflict-scanner");

export interface Conflict {
  category: string;
  keyA: string;
  keyB: string;
  valueA: number;
  valueB: number;
  deviation: number;  // 百分比偏差
  description: string;
}

export interface ConflictReport {
  conflicts: Conflict[];
  scanned: number;
  degraded: boolean;
  scannedAt: string;
}

/** 从事实内容中提取首个数值 */
function extractFirstNumber(content: string): number | null {
  const match = content.match(/[\d,.]+/);
  if (!match) return null;
  return parseFloat(match[0].replace(/,/g, ""));
}

/** 检查 key 是否属于同一数值系列（前缀相同） */
function sameSeries(keyA: string, keyB: string): boolean {
  const prefixA = keyA.replace(/_\d+$/, "").replace(/\d+$/, "");
  const prefixB = keyB.replace(/_\d+$/, "").replace(/\d+$/, "");
  return prefixA === prefixB && prefixA.length > 0 && keyA !== keyB;
}

export class ConflictScanner {
  private store: EnterpriseFactStore;

  constructor(store?: EnterpriseFactStore) {
    this.store = store || new EnterpriseFactStore();
  }

  /**
   * 扫描指定 category 或全部分类的事实冲突。
   */
  scan(category?: string): ConflictReport {
    const conflicts: Conflict[] = [];
    const scannedAt = new Date().toISOString();
    let scanned = 0;

    try {
      const categories = category ? [category] : this.store.listCategories();

      for (const cat of categories) {
        const facts = this.store.listFacts("active").filter((f) => f.metadata.category === cat);
        scanned += facts.length;

        // 同 category 中寻找数值矛盾
        for (let i = 0; i < facts.length; i++) {
          for (let j = i + 1; j < facts.length; j++) {
            const a = facts[i];
            const b = facts[j];

            if (!sameSeries(a.metadata.key, b.metadata.key)) continue;

            const valA = extractFirstNumber(a.content);
            const valB = extractFirstNumber(b.content);
            if (valA === null || valB === null || valA === 0) continue;

            const deviation = Math.abs((valB - valA) / valA);
            if (deviation > 0.3) {
              conflicts.push({
                category: cat,
                keyA: a.metadata.key,
                keyB: b.metadata.key,
                valueA: valA,
                valueB: valB,
                deviation: Math.round(deviation * 100),
                description: `${a.metadata.key}=${valA} vs ${b.metadata.key}=${valB} (偏差 ${Math.round(deviation * 100)}%)`,
              });
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, "冲突扫描失败 — 降级");
      return { conflicts: [], scanned, degraded: true, scannedAt };
    }

    if (conflicts.length > 0) {
      log.warn({ count: conflicts.length }, "检测到企业事实冲突");
    } else {
      log.info({ scanned }, "冲突扫描完成 — 无冲突");
    }

    return { conflicts, scanned, degraded: false, scannedAt };
  }
}

// ═══ CLI 入口（D240 手动触发 — 铁律 7: 入口→交互→结果）═══
//   npx tsx scripts/control-tower/conflict-scanner.ts [category]
async function cliMain(): Promise<void> {
  const category = process.argv[2] || undefined;
  const scanner = new ConflictScanner();
  const report = scanner.scan(category);
  if (report.conflicts.length > 0) {
    console.log(`发现 ${report.conflicts.length} 处冲突（扫描 ${report.scanned} 条 active 事实）:`);
    for (const c of report.conflicts) console.log(`  ${c.description}`);
    process.exitCode = 1;
  } else {
    console.log(`无冲突（扫描 ${report.scanned} 条 active 事实${report.degraded ? "，部分降级" : ""}）`);
  }
}

if (process.argv[1]?.endsWith("conflict-scanner.ts")) {
  void cliMain().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
