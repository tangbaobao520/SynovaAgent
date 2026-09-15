/**
 * tests/sentinel/notification-policy.test.ts — D716 状态驱动通知决策（L1 单元，纯函数）
 *
 * 覆盖 spec §7 T14/T15/T16/T17（SYNOVA-IMPL-DSH-D716-D1 §5.2-D/H）:
 *   T16 六态映射八断言（§5.2-H 八行表 → 8 个物理判据）
 *   T14 阈值边界: now - first_notified_ms 恰等于 remind_after_hours*3600e3 → 触发（≥ 语义）; -1ms → 不触发
 *   T15 幂等: reminded_at_ms 已落账 → 不再 remind; front_page_at_ms 已落账 → 不再 front_page
 *   T17 已认领 + 无变化 + 超抖动窗口 → silent/acknowledged（现状会推 — D-1 裁定核心差异）
 *
 * red 基线（实现前实测）: 模块不存在（import 失败）→ 全部红。
 * 纯函数无 IO（注入 nowMs 时钟确定性）; 六态锚点: DECISION-D1-状态驱动通知模型-20260912.md §二。
 */
import { describe, it, expect } from 'vitest';
import {
  decideNotification,
  type DecideNotificationInput,
  type NotificationStateRow,
  type ResolvedContractInput,
} from '../../src/sentinel/notification-policy';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 全默认契约（D-1 政策值: 24h 提醒 / 7 天首页） */
function makeContract(over: Partial<ResolvedContractInput> = {}): ResolvedContractInput {
  return {
    channels: ['electron'],
    cadence: 'weekly',
    format: 'one_pager',
    escalation: { remind_after_hours: 24, front_page_after_days: 7, escalate_to: 'owner' },
    owner: null,
    ...over,
  };
}

function makeState(over: Partial<NotificationStateRow> = {}): NotificationStateRow {
  return {
    signal_id: 'sig_teamA',
    sentinel_id: 'sentinel-cash-runway',
    first_notified_ms: NOW - HOUR_MS,
    last_notified_ms: NOW - HOUR_MS,
    last_notified_severity: 'warning',
    entities: '[]',
    notified_count: 1,
    reminded_at_ms: null,
    front_page_at_ms: null,
    resolved_at_ms: null,
    ...over,
  };
}

function makeInput(over: Partial<DecideNotificationInput> = {}): DecideNotificationInput {
  return {
    sentinelId: 'sentinel-cash-runway',
    signalId: 'sig_teamA',
    severity: 'warning',
    entities: [],
    nowMs: NOW,
    ...over,
  };
}

// ═══ T16: 六态映射（§5.2-H 八行 → 8 断言） ═══

describe('D716 T16 — 六态映射八断言（§5.2-H）', () => {
  it('行 1 新发现: state=null + 工单 open → notify/first（立刻; Win 侧挂沟通请求的锚点）', () => {
    const a = decideNotification(
      makeInput({ ticket: { status: 'open', created_at: new Date(NOW - 60_000).toISOString(), resolved_at: null } }),
      makeContract(),
    );
    expect(a).toEqual({
      action: 'notify',
      kind: 'first',
      channels: ['electron'],
      reason: expect.any(String),
    });
  });

  it('行 2 已告知待回应: state 1h 前通知过 + 工单 open + 无变化 + < 24h → silent/no_change（不重复轰炸）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState(),
        ticket: { status: 'open', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'no_change' });
  });

  it('行 3 未回应超时: > 24h 且未提醒过 → remind/no_response（一次）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({ first_notified_ms: NOW - 25 * HOUR_MS, last_notified_ms: NOW - 25 * HOUR_MS }),
        ticket: { status: 'open', created_at: new Date(NOW - 26 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a.action).toBe('remind');
    expect(a).toMatchObject({ action: 'remind', kind: 'no_response', channels: ['electron'] });
    if (a.action === 'remind') expect(a.hoursSinceFirstNotify).toBe(25);
  });

  it('行 4 已认领/处理中: 工单 acknowledged + 无变化 → silent/acknowledged（转 cadence 汇总）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState(),
        ticket: { status: 'acknowledged', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'acknowledged' });
  });

  it('行 5a 有实质变化—档位上升: last=warning, now=critical → notify/change（立刻, 即使已认领）', () => {
    const a = decideNotification(
      makeInput({
        severity: 'critical',
        state: makeState({ last_notified_severity: 'warning' }),
        ticket: { status: 'acknowledged', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toMatchObject({ action: 'notify', kind: 'change' });
  });

  it('行 5b 有实质变化—实体新增: entities 出现新增 → notify/change', () => {
    const a = decideNotification(
      makeInput({
        entities: ['teamA', 'teamB'],
        state: makeState({ entities: '["teamA"]' }),
        ticket: { status: 'open', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toMatchObject({ action: 'notify', kind: 'change' });
  });

  it('行 6 停滞超期: 工单 open + created 8 天前 + 已提醒过 + 未进过首页 → front_page（stalledDays=8）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({
          first_notified_ms: NOW - 8 * DAY_MS,
          last_notified_ms: NOW - 7 * DAY_MS,
          reminded_at_ms: NOW - 7 * DAY_MS, // 提醒已发过（不与行 3 抢占）
        }),
        ticket: { status: 'open', created_at: new Date(NOW - 8 * DAY_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'front_page', stalledDays: 8, reason: expect.any(String) });
  });

  it('行 7 已解决: 工单 resolved → silent/resolved（不再推送）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState(),
        ticket: { status: 'resolved', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: new Date(NOW - HOUR_MS).toISOString() },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'resolved' });
  });

  it('行 8 明确不处理: 工单 dismissed → silent/dismissed（沉默 ≠ 消失, 进每周回顾清单）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState(),
        ticket: { status: 'dismissed', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'dismissed' });
  });
});

// ═══ T14: 24h 阈值边界（≥ 语义, ±1ms） ═══

describe('D716 T14 — remind_after_hours 边界: 恰等于触发, 差 1ms 不触发', () => {
  const ticket = { status: 'open' as const, created_at: new Date(NOW - 30 * HOUR_MS).toISOString(), resolved_at: null };

  it('now - first_notified_ms === 24h 整 → remind（≥ 语义）', () => {
    const a = decideNotification(
      makeInput({ state: makeState({ first_notified_ms: NOW - 24 * HOUR_MS, last_notified_ms: NOW - 24 * HOUR_MS }), ticket }),
      makeContract(),
    );
    expect(a.action).toBe('remind');
  });

  it('now - first_notified_ms === 24h - 1ms → silent（未到阈值）', () => {
    const a = decideNotification(
      makeInput({ state: makeState({ first_notified_ms: NOW - 24 * HOUR_MS + 1, last_notified_ms: NOW - 24 * HOUR_MS + 1 }), ticket }),
      makeContract(),
    );
    expect(a.action).toBe('silent');
  });
});

// ═══ T15: 幂等（提醒一次 / 首页一次） ═══

describe('D716 T15 — 幂等: 落账后不再 remind / front_page', () => {
  const ticket = { status: 'open' as const, created_at: new Date(NOW - 30 * HOUR_MS).toISOString(), resolved_at: null };

  it('reminded_at_ms 已落账 → 第二次决策不再 remind', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({
          first_notified_ms: NOW - 30 * HOUR_MS,
          last_notified_ms: NOW - 25 * HOUR_MS,
          reminded_at_ms: NOW - 6 * HOUR_MS, // 已提醒过
        }),
        ticket,
      }),
      makeContract(),
    );
    expect(a.action).toBe('silent'); // 不重复提醒（"提醒一次"政策值）
  });

  it('front_page_at_ms 已落账 → 不再 front_page', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({
          first_notified_ms: NOW - 30 * DAY_MS,
          last_notified_ms: NOW - 20 * DAY_MS,
          reminded_at_ms: NOW - 29 * DAY_MS,
          front_page_at_ms: NOW - 23 * DAY_MS, // 已进过首页
        }),
        ticket: { ...ticket, created_at: new Date(NOW - 30 * DAY_MS).toISOString() },
      }),
      makeContract(),
    );
    expect(a.action).toBe('silent');
  });
});

// ═══ T17: 已认领不即时推（即使超抖动窗口） ═══

describe('D716 T17 — acknowledged + 无变化 + 超抖动窗口 → silent（现状会推）', () => {
  it('last_notified 1h 前（远超 5min 抖动窗）+ acknowledged → silent/acknowledged', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({ last_notified_ms: NOW - HOUR_MS }),
        ticket: { status: 'acknowledged', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'acknowledged' });
  });
});

// ═══ 补充: 抖动合并器语义（jitter_merge）与 first 无工单路径 ═══

describe('D716 补充 — 抖动合并器 + 无工单路径', () => {
  it('已通知 + 无变化 + 窗口内（< jitterWindowMs）→ silent/jitter_merge（降级为抖动合并器, D-1 裁定 1）', () => {
    const a = decideNotification(
      makeInput({
        state: makeState({ last_notified_ms: NOW - 60_000 }), // 1min 前
        ticket: { status: 'open', created_at: new Date(NOW - 2 * HOUR_MS).toISOString(), resolved_at: null },
      }),
      makeContract(),
    );
    expect(a).toEqual({ action: 'silent', reason: 'jitter_merge' });
  });

  it('无工单 + 无状态行 → notify/first（与今天首次推送等价 — 行为等价性声明）', () => {
    const a = decideNotification(makeInput(), makeContract());
    expect(a).toMatchObject({ action: 'notify', kind: 'first' });
  });

  it('无工单 + 已通知 + 无变化 → silent/no_change', () => {
    const a = decideNotification(makeInput({ state: makeState() }), makeContract());
    expect(a).toEqual({ action: 'silent', reason: 'no_change' });
  });
});
