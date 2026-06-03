/**
 * circuit-breaker.test.ts — Phase 1.1c: CircuitBreaker 测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 fake
 * 参考 Hermes mcp_tool.py:1720-1764 (3-failure, 60s cooldown)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The CircuitBreaker module doesn't exist yet — TDD step
// We define the expected interface and write tests against it
import { CircuitBreaker, type CircuitState } from '../src/llm/circuit-breaker';

describe('CircuitBreaker — 三态机', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 100 }); // 100ms for fast testing
  });

  // ── Initial state ──

  it('Given new CircuitBreaker, When inspected, Then state is CLOSED', () => {
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.isOpen()).toBe(false);
  });

  // ── CLOSED → OPEN ──

  it('Given 3 consecutive failures, When recordFailure called 3 times, Then state transitions to OPEN', () => {
    // Given: CLOSED state
    // When: 3 consecutive failures
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    // Then: OPEN (熔断)
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.isOpen()).toBe(true);
  });

  it('Given 2 failures then 1 success, When recorded, Then state stays CLOSED (counter reset)', () => {
    // Given: 2 failures
    breaker.recordFailure();
    breaker.recordFailure();

    // When: 1 success resets the counter
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    // Then: still CLOSED (need 3 CONSECUTIVE after reset)
    expect(breaker.getState()).toBe('CLOSED');
  });

  // ── OPEN → HALF_OPEN (after cooldown) ──

  it('Given OPEN state, When cooldown expires, Then state transitions to HALF_OPEN on next check', async () => {
    // Given: OPEN state (triggered by 3 failures)
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    // When: cooldown expires (100ms)
    await new Promise(r => setTimeout(r, 120));

    // Then: next call sees HALF_OPEN
    breaker.checkCooldown();
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  // ── HALF_OPEN → CLOSED (probe succeeds) ──

  it('Given HALF_OPEN state, When probe succeeds, Then state returns to CLOSED', async () => {
    // Given: OPEN, then cooldown expired → HALF_OPEN
    breaker.recordFailure(); breaker.recordFailure(); breaker.recordFailure();
    await new Promise(r => setTimeout(r, 120));
    breaker.checkCooldown();
    expect(breaker.getState()).toBe('HALF_OPEN');

    // When: probe succeeds
    breaker.recordSuccess();

    // Then: back to CLOSED
    expect(breaker.getState()).toBe('CLOSED');
  });

  // ── HALF_OPEN → OPEN (probe fails) ──

  it('Given HALF_OPEN state, When probe fails, Then state returns to OPEN', async () => {
    // Given: HALF_OPEN
    breaker.recordFailure(); breaker.recordFailure(); breaker.recordFailure();
    await new Promise(r => setTimeout(r, 120));
    breaker.checkCooldown();
    expect(breaker.getState()).toBe('HALF_OPEN');

    // When: probe fails
    breaker.recordFailure();

    // Then: back to OPEN (re-armed)
    expect(breaker.getState()).toBe('OPEN');
  });

  // ── isOpen blocks calls ──

  it('Given OPEN state, When isOpen checked, Then returns true (blocks calls)', () => {
    breaker.recordFailure(); breaker.recordFailure(); breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
  });

  // ── Custom threshold ──

  it('Given threshold=5, When 4 failures, Then still CLOSED', () => {
    const b = new CircuitBreaker({ threshold: 5, cooldownMs: 1000 });
    for (let i = 0; i < 4; i++) b.recordFailure();
    expect(b.getState()).toBe('CLOSED');
  });
});
