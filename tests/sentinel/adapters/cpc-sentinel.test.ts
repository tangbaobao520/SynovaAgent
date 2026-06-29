/** tests/sentinel/adapters/cpc-sentinel.test.ts — CPC 哨兵单元测试 */
import { describe, it, expect, beforeEach } from 'vitest';
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/cpc-sentinel')).cpcSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('cpcSentinel', () => {
  beforeEach(async () => { await load(); });
  it('CPC计算已迁移 — 返回空findings (degraded=false)', async () => {
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.degraded).toBe(false);
  });
});
