/**
 * tests/sentinel/threshold-injection.test.ts — D577 哨兵阈值配置真实挂载
 *
 * 覆盖 spec §7 T1-T9（T10 = 既有三文件回归，见 verify 命令映射，不在本文件）:
 *   T1  L1  注入生效: aggregate 第 4 参阈值替换硬编码判定源（red: 参数被忽略）
 *   T2  L1  蓝绿: 注入 manifest 现值 → findings 与无注入旧行为逐一相同
 *   T3  L1  fallback: 注入缺 key / 未注入 → 内置默认（行为 = T2）
 *   T4  L2a registry 全链路: loader wrapper 注入 ctx.thresholds + 判定用 manifest 值
 *   T5  L2b resolveThresholds: memStore 覆写合并（主指标）+ 基线保留
 *   T6  L2b memStore 值非法（JSON.parse 失败 / NaN）→ 基线不变 + 降级不 throw（铁律 24）
 *   T7  L2b DEPLOYS 无边（经 registry check）→ result.degraded === true（DS6 + 缺陷 C 双修）
 *   T8  L2c 阈值卫生扫描: §4.2 A/B 组 14 个 aggregate 零裸阈值比较（显式 ALLOWLIST 豁免单）
 *   T9  L2b resolveThresholds 双键兼容: threshold_${name} null → threshold_sentinel-${name} 命中
 *
 * red 基线（实现前实测）: T1/T4/T5/T6/T7/T8/T9 红（硬编码忽略注入 / resolveThresholds 不存在 /
 *   degraded 丢弃 / 39 处裸阈值）。green 基线: 实现后全部通过（蓝绿 T2 证明行为不变）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadSentinels, registerLoadedSentinels } from '../../src/sentinel/sentinel-loader';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { customerDemandShiftSentinel } from '../../extensions/sentinels/customer-demand-shift/aggregate';
import type { SentinelFinding, SentinelThresholdPair, SentinelAggregateResult } from '../../src/sentinel/types';

// ═══ 工具 ═══

/** findings 归一（id 去时间戳尾缀）: 供蓝绿"逐一相同"断言 */
function sig(fs: SentinelFinding[]): string[] {
  return fs.map(f => `${f.id.replace(/-\d+$/, '')}:${f.severity}:${f.title}`);
}

/** 兼容两种返回形态（D577: 数组 = 纯 findings；对象 = 可携带 degraded） */
function findingsOf(r: SentinelFinding[] | SentinelAggregateResult): SentinelFinding[] {
  return Array.isArray(r) ? r : r.findings;
}

interface MockNode { id: string; type: string; props: Record<string, unknown> }
interface MockEdge { id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }

interface MockStore {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): MockNode[];
  queryEdges(type?: string, from?: string, to?: string, graph?: string): MockEdge[];
  getNode(id: string, graph: string): Record<string, unknown> | null;
}

/**
 * churnRate=0.25 fixture: 8 客户 / 2 流失 / 等额营收。
 * → churnRate 0.25（旧 critical 0.2 与 T1 新 0.9 之间，spec §7 T1）
 * → revenueChurnRate 0.25、topCustomerShare 1/6 ≈ 0.167 < 0.3（无集中度 finding，信号纯净）
 */
function churnStore(churnedCount = 2, total = 8, withDeploys = true): MockStore {
  const clients: MockNode[] = Array.from({ length: total }, (_, i) => ({
    id: `client-${i}`,
    type: 'Client',
    props: {
      name: `客户${i}`,
      revenue: 100,
      status: i < churnedCount ? 'churned' : 'active',
    },
  }));
  const deploysEdge: MockEdge = { id: 'dep-1', type: 'DEPLOYS', from: 't1', to: 'sys-1', weight: 1, props: {} };
  return {
    queryNodes(type) { return type === 'Client' ? clients : []; },
    queryEdges(_type, from) { return withDeploys && from === 't1' ? [deploysEdge] : []; },
    getNode(id) { return { id, type: 'TOOL', props: { name: `sys:${id}` } }; },
  };
}

/** 直调（绕过 loader wrapper）: aggregate 第 4 参注入 */
function directCheck(store: MockStore, thresholds?: Record<string, SentinelThresholdPair>) {
  return customerDemandShiftSentinel.check(store, 't1', undefined, thresholds) as
    Promise<SentinelFinding[] | SentinelAggregateResult>;
}

const MANIFEST_VALUES: Record<string, SentinelThresholdPair> = {
  churn_rate: { warning: 0.1, critical: 0.2 },
  top_customer_concentration: { warning: 0.3, critical: 0.4 },
};

// ═══ T1-T3: L1 aggregate 直调 ═══

describe('D577 T1-T3: aggregate 第 4 参阈值注入（customer-demand-shift）', () => {
  it('T1 注入生效: churn_rate.critical 0.2→0.9 后 e4-churn-crit 消失（red: 旧代码忽略参数仍产 crit）', async () => {
    const r = await directCheck(churnStore(), {
      churn_rate: { warning: 0.1, critical: 0.9 },
      top_customer_concentration: { warning: 0.3, critical: 0.4 },
    });
    const ids = sig(findingsOf(r));
    expect(ids.some(s => s.startsWith('e4-churn-crit:'))).toBe(false);
    // 注入 warning 0.1 仍生效 → warn finding 保留（检查确实执行了）
    expect(ids.some(s => s.startsWith('e4-churn-warn:'))).toBe(true);
  });

  it('T2 蓝绿: 注入 manifest 现值 → findings 与无注入旧行为逐一相同', async () => {
    const injected = await directCheck(churnStore(), MANIFEST_VALUES);
    const baseline = await directCheck(churnStore());
    expect(sig(findingsOf(injected))).toEqual(sig(findingsOf(baseline)));
    // 旧行为（churnRate 0.25 > 0.2）必须产 crit — 蓝绿基准锚点
    expect(sig(findingsOf(injected))).toContain('e4-churn-crit:critical:客户流失率过高 (数量25% / 营收25%)');
  });

  it('T3 fallback: 注入 {} (参数在、key 缺) → 内置默认，行为 = 未注入', async () => {
    const emptyInjection = await directCheck(churnStore(), {});
    const noParam = await directCheck(churnStore());
    expect(sig(findingsOf(emptyInjection))).toEqual(sig(findingsOf(noParam)));
    expect(sig(findingsOf(emptyInjection))).toContain('e4-churn-crit:critical:客户流失率过高 (数量25% / 营收25%)');
  });
});

// ═══ T4/T7: L2a registry 全链路（loader wrapper） ═══

describe('D577 T4/T7: registry 全链路（wrapper 注入 + degraded 传播）', () => {
  beforeEach(() => {
    destroySentinelRegistry();
  });

  it('T4 wrapper 注入 ctx.thresholds + 判定用 manifest 值', async () => {
    const { registered } = await registerLoadedSentinels();
    expect(registered).toBeGreaterThan(0);
    const sentinel = getSentinelRegistry().get('sentinel-customer-demand-shift');
    expect(sentinel).toBeTruthy();

    const ctx = { db: churnStore() as unknown, now: new Date(), teamId: 't1' };
    const result = await sentinel!.check(ctx);

    expect(result.ok).toBe(true);
    // wrapper 注入契约: ctx.thresholds 非空且等于 manifest 基线
    const ctxThresholds = (ctx as { thresholds?: Record<string, SentinelThresholdPair> }).thresholds;
    expect(ctxThresholds).toBeTruthy();
    expect(ctxThresholds?.churn_rate).toEqual(MANIFEST_VALUES.churn_rate);
    expect(ctxThresholds?.top_customer_concentration).toEqual(MANIFEST_VALUES.top_customer_concentration);
    // 判定用 manifest 值: churnRate 0.25 > manifest critical 0.2 → crit（硬编码解除前的唯一判定源等价）
    expect(result.findings.some(f => f.id.startsWith('e4-churn-crit'))).toBe(true);
  });

  it('T7 DEPLOYS 无边经 registry check → result.degraded === true（red: 旧代码静默 [] 且 degraded 丢失）', async () => {
    await registerLoadedSentinels();
    const sentinel = getSentinelRegistry().get('sentinel-customer-demand-shift');
    expect(sentinel).toBeTruthy();

    const result = await sentinel!.check({ db: churnStore(2, 8, false) as unknown, now: new Date(), teamId: 't1' });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.degraded).toBe(true);
  });
});

// ═══ T5/T6/T9: L2b resolveThresholds（deps 注入缝，无 DB 依赖） ═══

interface FakeMemoryStore {
  recall(orgId: string, key: string): { value: string } | null;
}

describe('D577 T5/T6/T9: resolveThresholds（manifest 基线 + memStore 覆写）', () => {
  it('T5 memStore 覆写合并: 主指标被覆写、其余 key 保留基线', async () => {
    const { resolveThresholds } = await import('../../src/sentinel/sentinel-loader');
    const memStore: FakeMemoryStore = {
      recall: () => ({ value: JSON.stringify({ newThreshold: { warning: 0.9, critical: 0.9 } }) }),
    };
    const r = await resolveThresholds('customer-demand-shift', 'org-a', { memoryStore: memStore });
    expect(r.overrideApplied).toBe(true);
    expect(r.overrideMetric).toBe('churn_rate'); // manifest.thresholds 首个 key = 主指标
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.9, critical: 0.9 });
    expect(r.thresholds.top_customer_concentration).toEqual(MANIFEST_VALUES.top_customer_concentration);
  });

  it('T6 降级路径: memStore 值 JSON.parse 失败 / NaN → 基线不变 + overrideApplied=false（不 throw）', async () => {
    const { resolveThresholds } = await import('../../src/sentinel/sentinel-loader');

    const badJson: FakeMemoryStore = { recall: () => ({ value: 'not-valid-json{{{' }) };
    const r1 = await resolveThresholds('customer-demand-shift', 'org-a', { memoryStore: badJson });
    expect(r1.overrideApplied).toBe(false);
    expect(r1.thresholds.churn_rate).toEqual(MANIFEST_VALUES.churn_rate);

    const nanValue: FakeMemoryStore = {
      recall: () => ({ value: JSON.stringify({ newThreshold: { warning: NaN, critical: 0.9 } }) }),
    };
    const r2 = await resolveThresholds('customer-demand-shift', 'org-a', { memoryStore: nanValue });
    expect(r2.overrideApplied).toBe(false);
    expect(r2.thresholds.churn_rate).toEqual(MANIFEST_VALUES.churn_rate);

    // 边界: 哨兵不存在 → 空表降级（契约 @degraded）
    const r3 = await resolveThresholds('no-such-sentinel', 'org-a', { memoryStore: badJson });
    expect(r3.thresholds).toEqual({});
    expect(r3.overrideApplied).toBe(false);
  });

  it('T9 双键兼容: 第一键 null、第二键 threshold_sentinel-${name} 命中 → 覆写生效', async () => {
    const { resolveThresholds } = await import('../../src/sentinel/sentinel-loader');
    const probedKeys: string[] = [];
    const memStore: FakeMemoryStore = {
      recall: (_orgId, key) => {
        probedKeys.push(key);
        return key === 'threshold_sentinel-customer-demand-shift'
          ? { value: JSON.stringify({ newThreshold: { warning: 0.7, critical: 0.8 } }) }
          : null;
      },
    };
    const r = await resolveThresholds('customer-demand-shift', 'org-a', { memoryStore: memStore });
    expect(probedKeys).toContain('threshold_customer-demand-shift');
    expect(probedKeys).toContain('threshold_sentinel-customer-demand-shift');
    expect(r.overrideApplied).toBe(true);
    expect(r.thresholds.churn_rate).toEqual({ warning: 0.7, critical: 0.8 });
  });
});

// ═══ T8: L2c 阈值卫生扫描（DS9 常驻断言） ═══

/** §4.2 A/B 组 14 个 aggregate（判定点接线全列） */
const WIRED_AGGREGATES = [
  'api-coverage',
  'customer-demand-shift',
  'data-health',
  'environment-rent-dependency',
  'financing-constraint',
  'growth-quality',
  'network-power',
  'niche-breadth',
  'opportunity-window',
  'software-health',
  'margin-health',
  'key-person-risk',
  'resource-misallocation',
  'strategy-capability-fit',
] as const;

/**
 * 显式 ALLOWLIST 豁免单（spec §7 T8: 逐条注释理由）。
 * match 为豁免行必须包含的代码片段（strip 后仍保留的真实代码）。
 */
const ALLOWLIST: Array<{ file: string; match: string; reason: string }> = [
  // —— 存在性守卫（计数 > 0 / 结构下限），非告警阈值 ——
  { file: 'api-coverage', match: 'apiResult.totalTools > 0', reason: '存在性守卫: 无 TOOL 节点时跳过判定（非阈值）' },
  { file: 'api-coverage', match: 'protoResult.totalTools > 0', reason: '存在性守卫: 无 TOOL 节点时跳过判定（非阈值）' },
  { file: 'data-health', match: 'readiness.totalNodes > 0', reason: '存在性守卫: 无节点时跳过判定（非阈值）' },
  { file: 'data-health', match: 'piiHitCount > 0', reason: 'PII 存在性守卫（计数），非告警阈值（spec §7 T8 点名豁免）' },
  { file: 'data-health', match: 'siloResult.totalSystems >= 2', reason: '结构下限: 孤岛率分析需 ≥2 系统（分母语义，非阈值）' },
  { file: 'customer-demand-shift', match: 'churn.highValueAtRisk.length > 0', reason: '存在性守卫: 有高价值风险客户才发 finding（非阈值）' },
  { file: 'software-health', match: 'usage.totalTools > 0', reason: '存在性守卫: 无 TOOL 节点时跳过判定（非阈值）' },
  { file: 'software-health', match: 'shadow.totalTools > 0', reason: '存在性守卫: 无 TOOL 节点时跳过判定（非阈值）' },
  { file: 'software-health', match: 'ih.totalSystems > 0', reason: '存在性守卫: 无系统时跳过判定（非阈值）' },
  { file: 'key-person-risk', match: 'dcResult.edges.length > 0', reason: '存在性守卫: 有 DECISION_CONCENTRATES 边才检查（非阈值）' },
  { file: 'margin-health', match: 'findings.length > 0', reason: '日志守卫: 有 finding 才记 info 日志（非阈值）' },
  { file: 'margin-health', match: 'missingGroups.length > 0', reason: '存在性守卫: 缺必填字段组才发 degraded finding（D358 语义，非阈值）' },
  { file: 'strategy-capability-fit', match: 'result.alignmentGaps.length > 0', reason: '存在性守卫: 有差距才发 info finding（非阈值）' },
  { file: 'customer-demand-shift', match: 'clients.length > 0', reason: '存在性守卫: 有活跃客户才发健康 info finding（非阈值）' },
  { file: 'opportunity-window', match: 'result.signals.length > 0', reason: '证据三元守卫: 有信号用信号做 evidence（非阈值）' },
  { file: 'software-health', match: 'allTools.length > 0', reason: '存在性守卫: queryNodes 降级路径有数据标志（非阈值）' },
  // —— 非告警阈值 ——
  { file: 'opportunity-window', match: 'result.score > 0.7', reason: '正向 info 发现（机会窗口打开），非告警阈值；manifest 无对应 key，spec §6 明示不接线' },
];

/** 剥离注释/字符串/模板字面量，仅留真实代码（保留换行供行号对齐） */
function stripNonCode(src: string): string {
  type Mode = 'code' | 'tpl' | 'sq' | 'dq' | 'line' | 'block';
  const stack: Mode[] = ['code'];
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    const n = i + 1 < src.length ? src.charAt(i + 1) : '';
    const m = stack[stack.length - 1]!;
    if (m === 'code') {
      if (c === '/' && n === '/') { stack.push('line'); out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { stack.push('block'); out += '  '; i += 2; continue; }
      if (c === "'") { stack.push('sq'); out += ' '; i++; continue; }
      if (c === '"') { stack.push('dq'); out += ' '; i++; continue; }
      if (c === '`') { stack.push('tpl'); out += ' '; i++; continue; }
      // 模板 ${...} 表达式闭合（这些文件的表达式内无嵌套花括号对象字面量）
      if (c === '}' && stack.length > 1 && stack[stack.length - 2] === 'tpl') { stack.pop(); out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (m === 'line') {
      if (c === '\n') { stack.pop(); out += '\n'; } else { out += ' '; }
      i++; continue;
    }
    if (m === 'block') {
      if (c === '*' && n === '/') { stack.pop(); out += '  '; i += 2; }
      else { out += c === '\n' ? '\n' : ' '; i++; }
      continue;
    }
    if (m === 'sq' || m === 'dq') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if ((m === 'sq' && c === "'") || (m === 'dq' && c === '"')) { stack.pop(); out += ' '; i++; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // m === 'tpl'
    if (c === '\\') { out += '  '; i += 2; continue; }
    if (c === '`') { stack.pop(); out += ' '; i++; continue; }
    if (c === '$' && n === '{') { stack.push('code'); out += '  '; i += 2; continue; }
    out += c === '\n' ? '\n' : ' '; i++;
  }
  return out;
}

describe('D577 T8: 阈值卫生扫描（14 aggregate 零裸阈值比较，DS9）', () => {
  it('A/B 组 14 个 aggregate.ts 源码零裸阈值字面量（豁免单外的比较全部违规）', () => {
    const violations: string[] = [];
    for (const name of WIRED_AGGREGATES) {
      const path = join(process.cwd(), 'extensions', 'sentinels', name, 'aggregate.ts');
      const raw = readFileSync(path, 'utf-8');
      const code = stripNonCode(raw);
      const lines = code.split('\n');
      const rawLines = raw.split('\n');
      lines.forEach((line, idx) => {
        const m = line.match(/[<>]=?\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[<>]=?/g);
        if (!m) return;
        const rawLine = rawLines[idx] ?? '';
        for (const hit of m) {
          const allowed = ALLOWLIST.find(a => a.file === name && (line.includes(a.match) || rawLine.includes(a.match)));
          if (!allowed) {
            violations.push(`${name}/aggregate.ts:${idx + 1} 裸阈值 "${hit.trim()}" → ${rawLine.trim().slice(0, 90)}`);
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('ALLOWLIST 自检: 每条豁免仍能在对应文件命中（防陈旧豁免条目）', () => {
    const stale: string[] = [];
    for (const a of ALLOWLIST) {
      const path = join(process.cwd(), 'extensions', 'sentinels', a.file, 'aggregate.ts');
      const raw = readFileSync(path, 'utf-8');
      const code = stripNonCode(raw);
      const hit = code.split('\n').some(l => l.includes(a.match)) || raw.includes(a.match);
      if (!hit) stale.push(`${a.file} "${a.match}" (${a.reason})`);
    }
    expect(stale).toEqual([]);
  });
});
