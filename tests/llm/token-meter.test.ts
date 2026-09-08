/**
 * tests/llm/token-meter.test.ts — D598 (DSH 借鉴卡 B-03): token 四桶计量单测
 *
 * 覆盖（spec §4；导出面经组 4 收窄——estimateTextTokens/sumBuckets/usageTokens/密度常量
 * 为模块内部函数，其取值与行为经导出函数 estimateMessageTokens/TokenMeter.totalTokens
 * 的精确算术断言锁定）:
 *   ① bucketsFrom 四桶归一（DeepSeek cacheRead 从 promptTokens 减出，disjoint）
 *   ② bucketsFrom 无 cache 字段（OpenAI 形）+ cacheWrite 原样保留
 *   ③ 非法入参降级不抛（NaN/负数 → 0，cacheRead>prompt 截断不越界）
 *   ④ disjoint 求和不双计（经 TokenMeter 聚合：cache 命中重复上报不翻倍）
 *   ⑤ 固定密度估算码点计数（中文/emoji 代理对不拆，经 estimateMessageTokens 锁定
 *      estimateTextTokens 行为与 CHARS_PER_TOKEN/BLOCK_OVERHEAD/ROLE_OVERHEAD 取值）
 *   ⑥ estimateMessageTokens role 开销（role 不影响定价，仅内容密度 + 结构开销）
 *   ⑦ checkBudget 正常/warn(0.8)/exceed(1.0) 三态
 *   ⑧ checkBudget projectedTokens 外推 + 非法 budget 降级
 *   ⑨ buildCostFinding severity 按 overage 映射 + evidence + 载荷形状
 *   ⑩ TokenMeter record/snapshot byModel 聚合
 *   ⑪ TokenMeter 缺 usage 降级（degraded 显式传播，铁律 31）
 */
import { describe, it, expect } from 'vitest';
import {
  estimateMessageTokens,
  bucketsFrom,
  TokenMeter,
  checkBudget,
  buildCostFinding,
  type TokenUsageBuckets,
} from '../../src/llm/token-meter';

const buckets = (u: number, o: number, r: number, w: number): TokenUsageBuckets => ({
  uncachedInputTokens: u,
  outputTokens: o,
  cacheReadTokens: r,
  cacheWriteTokens: w,
});

describe('D598: bucketsFrom 四桶归一', () => {
  it('① DeepSeek cache 命中拆出 cacheRead，uncachedInput 为差值（disjoint 不双计）', () => {
    const b = bucketsFrom({ promptTokens: 1000, completionTokens: 200, cacheReadTokens: 400 });
    expect(b.uncachedInputTokens).toBe(600);
    expect(b.cacheReadTokens).toBe(400);
    expect(b.outputTokens).toBe(200);
    expect(b.cacheWriteTokens).toBe(0);
  });

  it('② 无 cache 字段（OpenAI 形）整 prompt 归 uncached；cacheWrite 原样保留', () => {
    const b = bucketsFrom({ promptTokens: 500, completionTokens: 50, cacheWriteTokens: 30 });
    expect(b.uncachedInputTokens).toBe(500);
    expect(b.cacheReadTokens).toBe(0);
    expect(b.cacheWriteTokens).toBe(30);
  });

  it('③ 非法入参降级不抛：NaN/负数 → 0，cacheRead>prompt 截断不越界', () => {
    expect(() => bucketsFrom({ promptTokens: Number.NaN, completionTokens: Number.NaN })).not.toThrow();
    const nan = bucketsFrom({ promptTokens: Number.NaN, completionTokens: -5 });
    expect(nan.uncachedInputTokens).toBe(0);
    expect(nan.outputTokens).toBe(0);
    const hostile = bucketsFrom({ promptTokens: 100, completionTokens: 10, cacheReadTokens: 800 });
    expect(hostile.cacheReadTokens).toBe(100);
    expect(hostile.uncachedInputTokens).toBe(0);
    const neg = bucketsFrom({ promptTokens: -100, completionTokens: 10, cacheReadTokens: -50 });
    expect(neg.uncachedInputTokens).toBe(0);
    expect(neg.cacheReadTokens).toBe(0);
    expect(neg.outputTokens).toBe(10);
  });
});

describe('D598: disjoint 求和（经 TokenMeter 聚合）', () => {
  it('④ cache 命中逐次上报不双计：totals 四桶各自累加，totalTokens 为四桶总和', () => {
    // 两次同一请求（prompt 100 全命中 cache）：disjoint 口径下 cacheRead=200、uncached=0，
    // 总消耗 200；若实现误把 promptTokens 与 cacheRead 并行累加会得到 400。
    const meter = new TokenMeter({ budgetTokens: 500_000 });
    meter.record({ promptTokens: 100, completionTokens: 0, cacheReadTokens: 100 }, 'm');
    meter.record({ promptTokens: 100, completionTokens: 0, cacheReadTokens: 100 }, 'm');
    const snap = meter.snapshot();
    expect(snap.totals).toEqual(buckets(0, 0, 200, 0));
    expect(snap.totalTokens).toBe(200);
    expect(snap.requestCount).toBe(2);
    // 混合桶逐桶累加
    meter.record({ promptTokens: 300, completionTokens: 50, cacheWriteTokens: 10 }, 'm');
    expect(meter.snapshot().totals).toEqual(buckets(300, 50, 200, 10));
  });
});

describe('D598: 固定密度启发式估算（码点计数）', () => {
  it('⑤ estimateTextTokens 行为经 estimateMessageTokens 锁定：中文/emoji 代理对不拆（非 UTF-16 length）', () => {
    // 空内容: ceil(0/4)=0 + BLOCK_OVERHEAD(4) + ROLE_OVERHEAD(4) = 8 —— 锁定两级结构开销取值
    expect(estimateMessageTokens({ role: 'user', content: '' })).toBe(8);
    // 'abcd': ceil(4/4)=1 + 4 + 4 = 9 —— 锁定 CHARS_PER_TOKEN=4
    expect(estimateMessageTokens({ role: 'user', content: 'abcd' })).toBe(9);
    // 4 个 emoji = 4 码点（8 个 UTF-16 单元）: 若实现误用 .length 会得 ceil(8/4)=2 → 2+4+4=10 ≠ 9
    expect(estimateMessageTokens({ role: 'assistant', content: '😀😀😀😀' })).toBe(9);
    // 8 个汉字（BMP，码点 = UTF-16 单元 = 8）: ceil(8/4)=2 + 4 + 4 = 10
    expect(estimateMessageTokens({ role: 'system', content: '你好世界早晨下午' })).toBe(10);
    // 中英混排码点计数: 'ab你好' = 4 码点 → 1 + 8 = 9
    expect(estimateMessageTokens({ role: 'user', content: 'ab你好' })).toBe(9);
  });

  it('⑥ role 不影响定价（仅内容密度 + 结构开销）', () => {
    const user = estimateMessageTokens({ role: 'user', content: 'abcd' });
    const assistant = estimateMessageTokens({ role: 'assistant', content: 'abcd' });
    const tool = estimateMessageTokens({ role: 'tool', content: 'abcd' });
    expect(user).toBe(9);
    expect(assistant).toBe(user);
    expect(tool).toBe(user);
  });
});

describe('D598: checkBudget 预算判定', () => {
  it('⑦ 正常 / warn(0.8) / exceed(1.0) 三态', () => {
    const ok = checkBudget({ totals: buckets(100, 0, 0, 0), budgetTokens: 1000 });
    expect(ok.warn).toBe(false);
    expect(ok.exceeded).toBe(false);
    expect(ok.projectedTokens).toBe(100);
    const warn = checkBudget({ totals: buckets(850, 0, 0, 0), budgetTokens: 1000 });
    expect(warn.warn).toBe(true);
    expect(warn.exceeded).toBe(false);
    const exceed = checkBudget({ totals: buckets(1000, 50, 0, 0), budgetTokens: 1000 });
    expect(exceed.exceeded).toBe(true);
    expect(exceed.warn).toBe(false);
    expect(exceed.spentTokens).toBe(1050);
  });

  it('⑧ projectedTokens 外推增量可提前触发 exceed；非法 budget 降级 degraded 不抛', () => {
    const projected = checkBudget({ totals: buckets(900, 0, 0, 0), budgetTokens: 1000, projectedAdditionalTokens: 150 });
    expect(projected.projectedTokens).toBe(1050);
    expect(projected.exceeded).toBe(true);
    expect(projected.budgetTokens).toBe(1000);
    expect(() => checkBudget({ totals: buckets(10_000_000, 0, 0, 0), budgetTokens: 0 })).not.toThrow();
    const degraded = checkBudget({ totals: buckets(10_000_000, 0, 0, 0), budgetTokens: 0 });
    expect(degraded.exceeded).toBe(false);
    expect(degraded.degraded).toBe(true);
  });
});

describe('D598: buildCostFinding 告警构造', () => {
  it('⑨ severity 按 overage 映射（≥9 emergency / ≥7 critical / 其余 warning），载荷形状完整', () => {
    const critical = buildCostFinding({
      teamId: 'org-d598', totals: buckets(601_000, 0, 0, 0), totalTokens: 601_000,
      budgetTokens: 500_000, consultId: 'diag-x',
    });
    expect(critical.signalType).toBe('成本预算超限');
    expect(critical.severity).toBe(7);
    expect(critical.severityLabel).toBe('critical');
    expect(critical.orgId).toBe('org-d598');
    expect(critical.evidence.join(' ')).toContain('uncachedInputTokens=601000');
    expect(critical.evidence.join(' ')).toContain('budgetTokens=500000');
    expect(critical.confidence).toBe(100);
    expect(typeof critical.title).toBe('string');
    expect(critical.title.length).toBeGreaterThan(0);
    expect(critical.relatedNodes).toEqual(['diag-x']);

    const emergency = buildCostFinding({
      teamId: 'org-d598', totals: buckets(900_000, 0, 0, 0), totalTokens: 900_000, budgetTokens: 500_000,
    });
    expect(emergency.severity).toBeGreaterThanOrEqual(9);
    expect(emergency.severityLabel).toBe('emergency');

    const warning = buildCostFinding({
      teamId: 'org-d598', totals: buckets(510_000, 0, 0, 0), totalTokens: 510_000, budgetTokens: 500_000,
    });
    expect(warning.severity).toBeLessThan(7);
    expect(warning.severityLabel).toBe('warning');
    // 外推成分诚实标注: projected=true → confidence 90
    expect(buildCostFinding({
      teamId: 'org-d598', totals: buckets(600_000, 0, 0, 0), totalTokens: 600_000,
      budgetTokens: 500_000, projected: true,
    }).confidence).toBe(90);
  });
});

describe('D598: TokenMeter 聚合', () => {
  it('⑩ record/snapshot 按 model 聚合四桶报表，byModel 分桶与 totals 一致', () => {
    const meter = new TokenMeter({ budgetTokens: 500_000 });
    expect(meter.budgetTokens).toBe(500_000);
    meter.record({ promptTokens: 1000, completionTokens: 200, cacheReadTokens: 400 }, 'model-a');
    meter.record({ promptTokens: 300, completionTokens: 100 }, 'model-b');
    const snap = meter.snapshot();
    expect(snap.totals).toEqual(buckets(900, 300, 400, 0));
    expect(snap.totalTokens).toBe(1600);
    expect(snap.requestCount).toBe(2);
    expect(snap.missingUsageCount).toBe(0);
    expect(snap.degraded).toBe(false);
    expect(snap.byModel['model-a']).toEqual(buckets(600, 200, 400, 0));
    expect(snap.byModel['model-b']).toEqual(buckets(300, 100, 0, 0));
  });

  it('⑪ 缺 usage 降级：missingUsageCount 计数 + degraded 显式传播（铁律 31）', () => {
    const meter = new TokenMeter();
    meter.record(undefined, 'model-a');
    const snap = meter.snapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.missingUsageCount).toBe(1);
    expect(snap.degraded).toBe(true);
    expect(snap.totals).toEqual(buckets(0, 0, 0, 0));
    expect(snap.totalTokens).toBe(0);
  });
});
