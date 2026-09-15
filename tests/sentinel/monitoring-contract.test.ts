/**
 * tests/sentinel/monitoring-contract.test.ts — D716 监测契约 loader（L1 单元）
 *
 * 覆盖 spec §7 T1-T6 + T13（SYNOVA-IMPL-DSH-D716-D1 §7 L1 契约）:
 *   T1  无契约文件（ENOENT）→ 全默认 + degraded=false + source='defaults'
 *   T2  合法契约 → 字段逐项生效（metrics[] 覆盖 defaults；sentinel- 前缀剥离）
 *   T3  org_id 不匹配 → 整文件忽略 + degraded + reasons 含 org_id_mismatch（不得应用任何字段）
 *   T4  JSON.parse 失败 / schema_version 非 1 → 整文件忽略 + degraded
 *   T5  单字段非法（cadence 'hourly' / remind_after_hours -1 / channels ['telegram']）
 *       → 丢该字段 + 其余合法字段生效 + degradedReasons 列字段名
 *   T6  mtime 记忆化：文件未变 → readFile 计数不增；mtime 变 → 重读
 *   T13 空文件 / {} / 只有 schema_version → 全默认 + degraded（缺必需字段）
 *
 * red 基线（实现前实测）: 模块不存在（import 失败）→ 全部红。
 * deps 注入缝（对齐 threshold-injection.test.ts 先例）: 无真实 fs / 不碰 data/，K3 可独立重跑。
 * 政策值锚点: DECISION-D1-状态驱动通知模型-20260912.md §三-4（24h 提醒 / 7 天首页 / 周报一页纸 / weekly 回顾）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadMonitoringContract,
  contractForSentinel,
  clearMonitoringContractCache,
  type LoadMonitoringContractDeps,
} from '../../src/sentinel/monitoring-contract';

// ═══ 工具：deps 注入工厂（readFile/statMtimeMs 计数器，无真实 fs） ═══

interface DepsHandle {
  deps: LoadMonitoringContractDeps;
  readCount(): number;
  bumpMtime(): void;
}

function makeDeps(opts: {
  content?: string | null; // null = ENOENT（statMtimeMs 返回 null）
  orgId?: string;
  channels?: string[];
  mtime?: number;
}): DepsHandle {
  let readCount = 0;
  let mtime = opts.mtime ?? 1000;
  const content = opts.content;
  const deps: LoadMonitoringContractDeps = {
    dataDir: '/tmp/test-d716-contract-dir',
    orgId: opts.orgId ?? 'default',
    statMtimeMs: () => (content === null || content === undefined ? null : mtime),
    readFile: () => {
      readCount++;
      if (content === null || content === undefined) throw new Error('ENOENT');
      return content;
    },
    availableChannels: () => opts.channels ?? ['electron', 'email', 'weekly_report'],
  };
  return { deps, readCount: () => readCount, bumpMtime: () => { mtime++; } };
}

/** spec §5.2-A 示例契约（合法完整形态） */
const VALID_CONTRACT = JSON.stringify({
  schema_version: 1,
  org_id: 'default',
  updated_at: '2026-09-13T06:30:00.000Z',
  updated_by: 'boss',
  defaults: {
    cadence: 'monthly',
    format: 'full_report',
    channels: ['email'],
    escalation: { remind_after_hours: 48, front_page_after_days: 14, escalate_to: 'department_head' },
    dismissed_review: 'weekly',
  },
  metrics: [
    {
      sentinel_id: 'cash-runway',
      metric: 'cash_runway_months',
      thresholds: { warning: 12, critical: 6 },
      channels: ['electron', 'email'],
      cadence: 'daily',
      format: 'short_text',
      escalation: { remind_after_hours: 12, front_page_after_days: 3, escalate_to: 'owner' },
      owner: 'ga',
      note: '老板要求现金流每日看一眼',
    },
  ],
});

/** D-1 政策默认值（spec §5.2-A 字段字典"默认"列） */
const POLICY_DEFAULTS = {
  cadence: 'weekly',
  format: 'one_pager',
  channels: ['electron'],
  escalation: { remind_after_hours: 24, front_page_after_days: 7, escalate_to: 'owner' },
  dismissed_review: 'weekly',
} as const;

beforeEach(() => {
  clearMonitoringContractCache();
});

// ═══ T1: ENOENT → 全默认（正常缺省，不告警） ═══

describe('D716 T1 — 无契约文件（ENOENT）→ 全默认', () => {
  it('statMtimeMs 返回 null → source=defaults + degraded=false + D-1 政策默认值', () => {
    const h = makeDeps({ content: null });
    const c = loadMonitoringContract(h.deps);

    expect(c.source).toBe('defaults');
    expect(c.degraded).toBe(false);
    expect(c.degradedReasons).toEqual([]);
    expect(c.org_id).toBe('default');
    expect(c.defaults.cadence).toBe(POLICY_DEFAULTS.cadence);
    expect(c.defaults.format).toBe(POLICY_DEFAULTS.format);
    expect(c.defaults.channels).toEqual(POLICY_DEFAULTS.channels);
    expect(c.defaults.escalation).toEqual(POLICY_DEFAULTS.escalation);
    expect(c.defaults.dismissed_review).toBe(POLICY_DEFAULTS.dismissed_review);
    expect(c.bySentinel.size).toBe(0);
  });
});

// ═══ T2: 合法契约逐项生效 ═══

describe('D716 T2 — 合法契约 → 字段逐项生效', () => {
  it('contractForSentinel 命中 metrics[] 条目 → 与文件一致（含 escalation 字段级覆盖）', () => {
    const h = makeDeps({ content: VALID_CONTRACT });
    const c = loadMonitoringContract(h.deps);

    expect(c.source).toBe('file');
    expect(c.degraded).toBe(false);

    const rc = contractForSentinel(c, 'cash-runway');
    expect(rc.thresholds).toEqual({ warning: 12, critical: 6 });
    expect(rc.channels).toEqual(['electron', 'email']);
    expect(rc.cadence).toBe('daily');
    expect(rc.format).toBe('short_text');
    expect(rc.escalation).toEqual({ remind_after_hours: 12, front_page_after_days: 3, escalate_to: 'owner' });
    expect(rc.owner).toBe('ga');
  });

  it('sentinel- 前缀自动剥离（口径同 resolveThresholds）', () => {
    const h = makeDeps({ content: VALID_CONTRACT });
    const c = loadMonitoringContract(h.deps);
    const rc = contractForSentinel(c, 'sentinel-cash-runway');
    expect(rc.cadence).toBe('daily'); // 命中同一条目，非默认
  });

  it('未声明哨兵 → 继承 defaults（全字段必填，thresholds undefined / owner null）', () => {
    const h = makeDeps({ content: VALID_CONTRACT });
    const c = loadMonitoringContract(h.deps);
    const rc = contractForSentinel(c, 'some-other-sentinel');
    expect(rc.cadence).toBe('monthly'); // defaults.cadence
    expect(rc.format).toBe('full_report');
    expect(rc.channels).toEqual(['email']);
    expect(rc.escalation).toEqual({ remind_after_hours: 48, front_page_after_days: 14, escalate_to: 'department_head' });
    expect(rc.thresholds).toBeUndefined();
    expect(rc.owner).toBeNull();
  });
});

// ═══ T3: org_id 不匹配 → 整文件忽略（防串客户） ═══

describe('D716 T3 — org_id 不匹配 → 整文件忽略', () => {
  it('契约 org_id=other-org ≠ 实例 default → 全默认 + degraded + org_id_mismatch', () => {
    const wrongOrg = JSON.stringify({ ...JSON.parse(VALID_CONTRACT), org_id: 'other-org' });
    const h = makeDeps({ content: wrongOrg });
    const c = loadMonitoringContract(h.deps);

    expect(c.source).toBe('defaults');
    expect(c.degraded).toBe(true);
    expect(c.degradedReasons.some((r) => r.includes('org_id'))).toBe(true);
    // 不得应用任何字段（防串客户铁则）:
    expect(c.defaults.cadence).toBe(POLICY_DEFAULTS.cadence); // 而非文件里的 monthly
    expect(c.bySentinel.size).toBe(0); // metrics 不生效
  });
});

// ═══ T4: 解析失败 / 版本守卫 → 整文件忽略 ═══

describe('D716 T4 — JSON.parse 失败 / schema_version 非 1 → 整文件忽略', () => {
  it('损坏 JSON → 全默认 + degraded + reasons 含 parse 标识', () => {
    const h = makeDeps({ content: '{oops not json' });
    const c = loadMonitoringContract(h.deps);
    expect(c.source).toBe('defaults');
    expect(c.degraded).toBe(true);
    expect(c.degradedReasons.some((r) => r.includes('parse'))).toBe(true);
    expect(c.defaults.cadence).toBe(POLICY_DEFAULTS.cadence);
  });

  it('schema_version=2 → 整文件忽略 + degraded + reasons 含 schema_version', () => {
    const v2 = JSON.stringify({ ...JSON.parse(VALID_CONTRACT), schema_version: 2 });
    const h = makeDeps({ content: v2 });
    const c = loadMonitoringContract(h.deps);
    expect(c.source).toBe('defaults');
    expect(c.degraded).toBe(true);
    expect(c.degradedReasons.some((r) => r.includes('schema_version'))).toBe(true);
    expect(c.defaults.format).toBe(POLICY_DEFAULTS.format); // 文件的 full_report 不生效
  });
});

// ═══ T5: 单字段非法 → 字段级丢弃 + 其余生效 ═══

describe('D716 T5 — 单字段非法 → 丢该字段 + 其余生效 + degradedReasons 列名', () => {
  it('cadence hourly / remind -1 / 未注册渠道 telegram → 各自回落默认, format 合法覆盖保留', () => {
    const bad = JSON.stringify({
      schema_version: 1,
      org_id: 'default',
      updated_at: '2026-09-13T06:30:00.000Z',
      updated_by: 'boss',
      defaults: {
        cadence: 'hourly', // 非法枚举 → 回落 weekly
        format: 'short_text', // 合法 → 生效
        escalation: { remind_after_hours: -1 }, // 非法 → 回落 24（部分对象：其余字段回落默认）
      },
      metrics: [
        {
          sentinel_id: 'cash-runway',
          channels: ['telegram'], // 未注册渠道 → 回落 defaults.channels
          cadence: 'daily',
        },
      ],
    });
    const h = makeDeps({ content: bad });
    const c = loadMonitoringContract(h.deps);

    expect(c.degraded).toBe(true);
    // 字段级丢弃并列出（铁律 31: degradedReasons 列字段名）
    expect(c.degradedReasons.some((r) => r.includes('cadence'))).toBe(true);
    expect(c.degradedReasons.some((r) => r.includes('remind_after_hours'))).toBe(true);
    expect(c.degradedReasons.some((r) => r.includes('telegram') || r.includes('channels'))).toBe(true);
    // 合法字段保留:
    expect(c.defaults.format).toBe('short_text');
    // 非法字段回落默认:
    expect(c.defaults.cadence).toBe(POLICY_DEFAULTS.cadence);
    expect(c.defaults.escalation.remind_after_hours).toBe(POLICY_DEFAULTS.escalation.remind_after_hours);
    // metrics 条目: 非法 channels 回落, 合法 cadence 保留
    const rc = contractForSentinel(c, 'cash-runway');
    expect(rc.channels).toEqual(POLICY_DEFAULTS.channels); // telegram 丢弃 → 默认 ['electron']
    expect(rc.cadence).toBe('daily'); // 合法覆盖生效
  });
});

// ═══ T6: mtime 记忆化 ═══

describe('D716 T6 — mtime 记忆化: 文件未变不重读, mtime 变重读', () => {
  it('同 mtime 两次 load → readFile 调用 1 次; bumpMtime 后第三次 → 2 次', () => {
    const h = makeDeps({ content: VALID_CONTRACT, mtime: 5000 });

    loadMonitoringContract(h.deps);
    expect(h.readCount()).toBe(1);

    const c2 = loadMonitoringContract(h.deps); // 缓存命中
    expect(h.readCount()).toBe(1);
    expect(c2.source).toBe('file'); // 复用解析结果

    h.bumpMtime();
    loadMonitoringContract(h.deps); // mtime 变 → 重读
    expect(h.readCount()).toBe(2);
  });

  it('clearMonitoringContractCache → 强制重读（测试/热更新入口）', () => {
    const h = makeDeps({ content: VALID_CONTRACT });
    loadMonitoringContract(h.deps);
    expect(h.readCount()).toBe(1);
    clearMonitoringContractCache();
    loadMonitoringContract(h.deps);
    expect(h.readCount()).toBe(2);
  });
});

// ═══ T13: 边界 — 缺必需字段 ═══

describe('D716 T13 — 空文件 / {} / 只有 schema_version → 全默认 + degraded', () => {
  it.each([
    ['空字符串（readFile 返回 ""）', ''],
    ['空对象 {}', '{}'],
    ['只有 schema_version（org_id 缺）', JSON.stringify({ schema_version: 1 })],
  ])('%s → 全默认 + degraded', (_label, content) => {
    const h = makeDeps({ content });
    const c = loadMonitoringContract(h.deps);
    expect(c.source).toBe('defaults');
    expect(c.degraded).toBe(true);
    expect(c.defaults).toEqual({
      cadence: POLICY_DEFAULTS.cadence,
      format: POLICY_DEFAULTS.format,
      channels: POLICY_DEFAULTS.channels,
      escalation: POLICY_DEFAULTS.escalation,
      dismissed_review: POLICY_DEFAULTS.dismissed_review,
    });
  });

  it('最小完整文件（四元字段齐）→ source=file + degraded=false + 值为默认', () => {
    const minimal = JSON.stringify({
      schema_version: 1,
      org_id: 'default',
      updated_at: '2026-09-13T06:30:00.000Z',
      updated_by: 'boss',
    });
    const h = makeDeps({ content: minimal });
    const c = loadMonitoringContract(h.deps);
    expect(c.source).toBe('file');
    expect(c.degraded).toBe(false);
    expect(c.defaults.cadence).toBe(POLICY_DEFAULTS.cadence);
  });
});
