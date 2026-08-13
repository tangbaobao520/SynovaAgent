#!/usr/bin/env npx tsx
/**
 * scripts/run-contract-gate.ts — 契约门禁 CLI 入口 (D217)
 *
 * D215 contract-gate.ts 是纯 import 模块，无 CLI 入口。
 * 此包装脚本提供可执行入口，供 agent-start.sh Step 2 调用。
 *
 * 接线:
 *   agent-start.sh → run-contract-gate.ts → ContractGate.validateAll()
 *
 * 退出码:
 *   0 — 全部通过或优雅降级
 *   1 — 存在未通过项
 */
import { ContractGate } from "../src/contract/contract-gate.js";
import { ContractStore } from "../src/contract/contract-store.js";

const store = new ContractStore();
const gate = new ContractGate(store);

try {
  const result = await gate.validateAll();

  if (result.pass) {
    console.log("[PASS] 全部契约通过");
    console.log("  checkedAt:", result.checkedAt);
    process.exit(0);
  }

  if (result.degraded) {
    console.log("[WARN] 契约门禁降级 — 部分契约未验证");
    console.log("  checkedAt:", result.checkedAt);
    process.exit(0);
  }

  console.error("[FAIL] 契约门禁验证失败");
  for (const f of result.failures) {
    console.error(`  - ${f.contractId}: ${f.name} (${f.type})`);
    console.error(`    ${f.detail}`);
  }
  process.exit(1);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[FAIL] 契约门禁异常:", msg);
  process.exit(1);
}
