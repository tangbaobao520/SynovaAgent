/**
 * tests/llm/timeout.test.ts — D593 三层超时原语（DSH 借鉴卡 B-06）
 *
 * 范式锚点: D:/deepseek-harness/packages/util/timeout/lib/index.js（0.1.1-rc.2，逐行读全文自研，零代码依赖）
 *
 * 覆盖（铁律 48: 正常/降级/边界，每用例 ≥3 expect）:
 *   - MAX_TIMER_DELAY_MS = 2^31-1（Node 定时器溢出防护常量）
 *   - clampTimeout: fallback / 透传 / 钳制 / 非法入参 fail-fast
 *   - TimeoutReason: code + timeoutMs 合一消息（`${code} after ${timeoutMs}ms`）
 *   - deadline: 到点触发 / 上游 abort 提前传播 / dispose 取消（幂等）
 *   - idleWatchdog: 空闲到点触发 / pulse 重臂 / 上游 abort 传播 / dispose
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_TIMER_DELAY_MS,
  TOOL_TIMEOUT_CODE,
  TimeoutReason,
  clampTimeout,
  deadline,
  idleWatchdog,
} from '../../src/llm/timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('D593 timeout 原语 — 溢出防护 / 钳制 / deadline / idleWatchdog', () => {
  it('MAX_TIMER_DELAY_MS 常量 = 2^31-1（Node setTimeout 溢出边界）且 TOOL_TIMEOUT_CODE 稳定', () => {
    expect(MAX_TIMER_DELAY_MS).toBe(2_147_483_647);
    expect(MAX_TIMER_DELAY_MS).toBe(Number.parseInt((2 ** 31 - 1).toString(10), 10));
    expect(TOOL_TIMEOUT_CODE).toBe('TOOL_TIMEOUT');
  });

  it('clampTimeout: 缺省回落 fallback / 合法值透传 / 超上限钳制到 MAX_TIMER_DELAY_MS', () => {
    expect(clampTimeout(undefined, 5_000)).toBe(5_000);
    expect(clampTimeout(3_000, 5_000)).toBe(3_000);
    expect(clampTimeout(Number.MAX_SAFE_INTEGER, 5_000)).toBe(MAX_TIMER_DELAY_MS);
    expect(clampTimeout(MAX_TIMER_DELAY_MS + 1, 5_000)).toBe(MAX_TIMER_DELAY_MS);
  });

  it('clampTimeout: 非法入参 fail-fast（负数 / 0 / NaN / Infinity）', () => {
    expect(() => clampTimeout(-1, 5_000)).toThrow(/must be a positive finite/);
    expect(() => clampTimeout(0, 5_000)).toThrow(/must be a positive finite/);
    expect(() => clampTimeout(Number.NaN, 5_000)).toThrow(/must be a positive finite/);
    expect(() => clampTimeout(Number.POSITIVE_INFINITY, 5_000)).toThrow(/must be a positive finite/);
  });

  it('TimeoutReason: Error 子类，消息合一 `${code} after ${timeoutMs}ms`，携带 code/timeoutMs', () => {
    const reason = new TimeoutReason(TOOL_TIMEOUT_CODE, 1_500);
    expect(reason).toBeInstanceOf(Error);
    expect(reason).toBeInstanceOf(TimeoutReason);
    expect(reason.code).toBe('TOOL_TIMEOUT');
    expect(reason.timeoutMs).toBe(1_500);
    expect(reason.message).toBe('TOOL_TIMEOUT after 1500ms');
  });

  it('deadline: 到点触发 abort，reason 为 TimeoutReason（正常路径）', () => {
    vi.useFakeTimers();
    const dl = deadline(undefined, 1_000, TOOL_TIMEOUT_CODE);
    const seen: unknown[] = [];
    dl.signal.addEventListener('abort', () => seen.push(dl.signal.reason));
    expect(dl.signal.aborted).toBe(false);
    vi.advanceTimersByTime(999);
    expect(dl.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(dl.signal.aborted).toBe(true);
    expect(dl.signal.reason).toBeInstanceOf(TimeoutReason);
    expect((dl.signal.reason as TimeoutReason).message).toBe('TOOL_TIMEOUT after 1000ms');
    expect(seen).toHaveLength(1);
    dl.dispose();
  });

  it('deadline: 上游 signal abort 提前传播（不等 timer，reason 透传上游）', () => {
    vi.useFakeTimers();
    const upstream = new AbortController();
    const dl = deadline(upstream.signal, 60_000, TOOL_TIMEOUT_CODE);
    expect(dl.signal.aborted).toBe(false);
    const clientGone = new Error('client gone');
    upstream.abort(clientGone);
    expect(dl.signal.aborted).toBe(true);
    expect(dl.signal.reason).toBe(clientGone);
    dl.dispose();
  });

  it('deadline: dispose 取消定时器（幂等，二次 dispose 不抛）', () => {
    vi.useFakeTimers();
    const dl = deadline(undefined, 1_000, TOOL_TIMEOUT_CODE);
    dl.dispose();
    expect(() => dl.dispose()).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(dl.signal.aborted).toBe(false);
  });

  it('idleWatchdog: 空闲到点触发 abort（正常路径）', () => {
    vi.useFakeTimers();
    const wd = idleWatchdog(undefined, 500, TOOL_TIMEOUT_CODE);
    expect(wd.signal.aborted).toBe(false);
    vi.advanceTimersByTime(499);
    expect(wd.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(wd.signal.aborted).toBe(true);
    expect(wd.signal.reason).toBeInstanceOf(TimeoutReason);
    expect((wd.signal.reason as TimeoutReason).code).toBe('TOOL_TIMEOUT');
    wd.dispose();
  });

  it('idleWatchdog: pulse 重臂看门狗（推进流场景不误杀）', () => {
    vi.useFakeTimers();
    const wd = idleWatchdog(undefined, 500, TOOL_TIMEOUT_CODE);
    vi.advanceTimersByTime(400);
    expect(wd.signal.aborted).toBe(false);
    wd.pulse();
    vi.advanceTimersByTime(400);
    expect(wd.signal.aborted).toBe(false);
    wd.pulse();
    vi.advanceTimersByTime(499);
    expect(wd.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(wd.signal.aborted).toBe(true);
    wd.dispose();
  });

  it('idleWatchdog: 上游 abort 提前传播 + dispose 后 pulse 无害', () => {
    vi.useFakeTimers();
    const upstream = new AbortController();
    const wd = idleWatchdog(upstream.signal, 500, TOOL_TIMEOUT_CODE);
    const upstreamErr = new Error('stream closed');
    upstream.abort(upstreamErr);
    expect(wd.signal.aborted).toBe(true);
    expect(wd.signal.reason).toBe(upstreamErr);
    wd.dispose();
    expect(() => wd.pulse()).not.toThrow();
    const wd2 = idleWatchdog(undefined, 500, TOOL_TIMEOUT_CODE);
    wd2.dispose();
    vi.advanceTimersByTime(10_000);
    expect(wd2.signal.aborted).toBe(false);
    wd2.dispose();
  });
});
