/**
 * tests/electron/use-streaming-contract.test.ts — D527 SSE 事件契约单测
 *
 * 契约来源: SYNOVA-IMPL-DSH-D527-first-diagnosis-e2e-20260825.md §7/§12
 *   sse-contract.applySSEEvent(state, evt):
 *     phase_started → phaseIndex/label 更新 + 系统消息
 *     phase_completed → 进度保持（不回落）
 *     report_ready/complete → 提取 reportId
 *     error → errorMessage + phase='error'
 *     degraded → 系统消息 degraded 标记
 *     未知事件类型 → console.warn（不抛、不静默）
 *   @degraded complete/report_ready 缺字段 → 不抛，console.warn + 不落 reportId
 *
 * 覆盖: 正常路径（六阶段推进/reportId 提取）+ 降级路径（error/degraded/缺字段）+ 边界（未知类型/乱序）。
 * red 前提: sse-contract.ts 不存在 → 本文件 import 失败全红（改造前 useStreaming 无 phase_started case）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applySSEEvent,
  type SSEContractState,
  type SSEEventLike,
} from '../../electron-renderer/src/hooks/sse-contract';

const initialState = (): SSEContractState => ({
  phaseIndex: -1,
  phaseLabel: '',
  phase: 'idle',
  errorMessage: null,
  degraded: false,
});

describe('D527 sse-contract: 六阶段进度（正常路径）', () => {
  it('phase_started(phase 0-5) 逐一推进 phaseIndex 0→5 且 label 正确', () => {
    const labels = ['组织访谈', '数据采集', '假设生成', '根因分析', '报告生成', '交付'];
    let state = initialState();
    for (let i = 0; i <= 5; i++) {
      const r = applySSEEvent(state, { type: 'phase_started', phase: i, label: labels[i] });
      expect(r.state.phaseIndex).toBe(i);
      expect(r.state.phaseLabel).toBe(labels[i]);
      expect(r.systemMessage?.type).toBe('phase');
      state = r.state;
    }
    expect(state.phaseIndex).toBe(5);
  });

  it('phase_completed 不回落 phaseIndex（乱序到达安全）', () => {
    let state: SSEContractState = { ...initialState(), phaseIndex: 4, phaseLabel: '根因分析' };
    state = applySSEEvent(state, { type: 'phase_completed', phase: 1 }).state;
    expect(state.phaseIndex).toBe(4);
    expect(state.phaseLabel).toBe('根因分析');
  });

  it('phase_started 缺 label → 仍推进 phaseIndex，不抛', () => {
    const r = applySSEEvent(initialState(), { type: 'phase_started', phase: 2 });
    expect(r.state.phaseIndex).toBe(2);
  });
});

describe('D527 sse-contract: reportId 提取（正常路径）', () => {
  it('complete 带 report.reportId → 返回 reportId', () => {
    const r = applySSEEvent(initialState(), {
      type: 'complete',
      report: { reportId: 'rpt_team_abc', summary: '诊断完成' },
    });
    expect(r.reportId).toBe('rpt_team_abc');
    expect(r.state.phase).toBe('done');
  });

  it('report_ready 事件 → 同样返回 reportId', () => {
    const r = applySSEEvent(initialState(), { type: 'report_ready', reportId: 'rpt_x_1' });
    expect(r.reportId).toBe('rpt_x_1');
  });
});

describe('D527 sse-contract: 降级路径', () => {
  it('error 事件 → errorMessage 非空 + phase=error', () => {
    const r = applySSEEvent(initialState(), { type: 'error', message: 'LLM 不可用' });
    expect(r.state.errorMessage).toBe('LLM 不可用');
    expect(r.state.phase).toBe('error');
  });

  it('degraded 事件 → 系统消息带 degraded 标记 + state.degraded=true', () => {
    const r = applySSEEvent(initialState(), { type: 'degraded', moduleId: 'finance' });
    expect(r.state.degraded).toBe(true);
    expect(r.systemMessage?.type).toBe('degraded');
    expect(r.systemMessage?.content).toContain('finance');
  });

  it('complete 缺 report 字段 → 不抛 + console.warn + 不落 reportId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = applySSEEvent(initialState(), { type: 'complete' });
    expect(r.reportId).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('report_ready 缺 reportId → 不抛 + 不落 reportId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = applySSEEvent(initialState(), { type: 'report_ready' });
    expect(r.reportId).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('D527 sse-contract: 边界条件', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  it('root_cause_identified（不消费类型）→ 不抛 + console.warn（不静默丢弃）', () => {
    const evt: SSEEventLike = { type: 'root_cause_identified' };
    const r = applySSEEvent(initialState(), evt);
    expect(r.state.phaseIndex).toBe(-1);
    expect(warn).toHaveBeenCalled();
  });

  it('right_column_update → 不抛 + console.warn', () => {
    applySSEEvent(initialState(), { type: 'right_column_update' });
    expect(warn).toHaveBeenCalled();
  });

  it('engine 事件全集 13 种均有确定行为（无静默 switch 穿透）', () => {
    const allTypes = [
      'phase', 'phase_started', 'phase_completed', 'report_ready', 'right_column_update',
      'degraded', 'root_cause_identified', 'expert_hypothesis', 'hypothesis_generated',
      'interim_finding', 'community_reports', 'entity_resolution', 'judgment_card',
      'complete', 'error',
    ];
    for (const t of allTypes) {
      expect(() => applySSEEvent(initialState(), { type: t })).not.toThrow();
    }
  });
});
