/**
 * tests/sentinel/threshold-manifest-flip.test.ts — D577 DS8 物理验证（改配置即改行为）
 *
 * 物理链路: 改盘 extensions/sentinels/customer-demand-shift/manifest.json 的
 *   churn_rate.critical 0.2→0.9 → clearSentinelCache() → 重新 registerLoadedSentinels()
 *   → 经 registry check → e4-churn-crit 消失 → 改回 → critical 恢复（恢复后断言）。
 *
 * 运行纪律（spec §7 / 编码指令 §三-7）:
 *   - 仅 D577_FLIP_TEST=1 时运行（fs 改 manifest 会污染并发读 manifest 的测试，禁止混入全量并行）:
 *       D577_FLIP_TEST=1 npx vitest run tests/sentinel/threshold-manifest-flip.test.ts
 *   - fs 改动 try/finally 等价恢复（afterEach 无条件回写原始字节 + clearSentinelCache）
 *   - 幂等: 重复运行结果一致（恢复写回原始字节，非重建序列化）
 *
 * red 基线（实现前实测）: 改盘后 critical 不消失（aggregate 硬编码 0.2 忽略 manifest）→ red。
 * green: flip 生效 + 恢复回归。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { registerLoadedSentinels, clearSentinelCache } from '../../src/sentinel/sentinel-loader';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';

const MANIFEST_PATH = join(process.cwd(), 'extensions', 'sentinels', 'customer-demand-shift', 'manifest.json');
const RUN_FLIP = process.env.D577_FLIP_TEST === '1';

interface MockNode { id: string; type: string; props: Record<string, unknown> }
interface MockEdge { id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }

/** churnRate=0.25 fixture（8 客户 / 2 流失 / 等额营收，含 DEPLOYS 边过门控） */
function churnStore(): { queryNodes: (t: string) => MockNode[]; queryEdges: (t?: string, f?: string) => MockEdge[]; getNode: (id: string) => Record<string, unknown> | null } {
  const clients: MockNode[] = Array.from({ length: 8 }, (_, i) => ({
    id: `client-${i}`,
    type: 'Client',
    props: { name: `客户${i}`, revenue: 100, status: i < 2 ? 'churned' : 'active' },
  }));
  const deploysEdge: MockEdge = { id: 'dep-1', type: 'DEPLOYS', from: 't1', to: 'sys-1', weight: 1, props: {} };
  return {
    queryNodes: (type: string) => (type === 'Client' ? clients : []),
    queryEdges: (_type?: string, from?: string) => (from === 't1' ? [deploysEdge] : []),
    getNode: (id: string) => ({ id, type: 'TOOL', props: { name: `sys:${id}` } }),
  };
}

async function checkCustomerDemandShift(): Promise<{ critPresent: boolean; warnPresent: boolean }> {
  const sentinel = getSentinelRegistry().get('sentinel-customer-demand-shift');
  expect(sentinel).toBeTruthy();
  const result = await sentinel!.check({ db: churnStore() as unknown, now: new Date(), teamId: 't1' });
  expect(result.ok).toBe(true);
  return {
    critPresent: result.findings.some(f => f.id.startsWith('e4-churn-crit-')),
    warnPresent: result.findings.some(f => f.id.startsWith('e4-churn-warn-')),
  };
}

async function reregister(): Promise<void> {
  clearSentinelCache();
  destroySentinelRegistry();
  await registerLoadedSentinels();
}

describe.skipIf(!RUN_FLIP)('D577 DS8: manifest flip 物理验证（D577_FLIP_TEST=1 独占运行）', () => {
  let original: string | null = null;

  afterEach(() => {
    // 无条件恢复原始字节（try/finally 等价: it 内断言失败也回滚）+ 清缓存防污染
    if (original !== null) {
      writeFileSync(MANIFEST_PATH, original);
      original = null;
    }
    clearSentinelCache();
    destroySentinelRegistry();
  });

  it('改盘 churn_rate.critical 0.2→0.9 → e4-churn-crit 消失 → 改回 → 恢复（幂等可复现）', async () => {
    original = readFileSync(MANIFEST_PATH, 'utf-8');
    const useCrlf = original.includes('\r\n');
    const parsed = JSON.parse(original) as {
      thresholds: { churn_rate: { warning: number; critical: number } };
    };
    // 基线 sanity: 盘上现值 = manifest 权威值 0.2
    expect(parsed.thresholds.churn_rate.critical).toBe(0.2);

    // 步骤 1 — 基线: 现值 0.2 → critical 存在
    await reregister();
    const baseline = await checkCustomerDemandShift();
    expect(baseline.critPresent).toBe(true);

    // 步骤 2 — flip: 0.2→0.9（保持原文件换行风格）→ critical 消失、warning 仍在
    parsed.thresholds.churn_rate.critical = 0.9;
    const flipped = JSON.stringify(parsed, null, 2) + (useCrlf ? '\r\n' : '\n');
    writeFileSync(MANIFEST_PATH, useCrlf ? flipped.replace(/\n/g, '\r\n') : flipped);
    await reregister();
    const flippedResult = await checkCustomerDemandShift();
    expect(flippedResult.critPresent).toBe(false);
    expect(flippedResult.warnPresent).toBe(true);

    // 步骤 3 — 恢复: 改回 0.2 → critical 回归（恢复后断言）。
    // 注意: 判定为 else-if 互斥链 — churnRate 0.25 > critical 0.2 命中 crit 档后不再评估 warn 档
    // （与 T2 基线一致: 仅 e4-churn-crit，无 e4-churn-warn）。
    writeFileSync(MANIFEST_PATH, original);
    await reregister();
    const restored = await checkCustomerDemandShift();
    expect(restored.critPresent).toBe(true);
    expect(restored.warnPresent).toBe(false);
  });
});
