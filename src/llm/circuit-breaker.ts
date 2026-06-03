/**
 * llm/circuit-breaker.ts — LLM 调用熔断器 (Phase 1.1c)
 *
 * 三态机: CLOSED(正常) → OPEN(熔断) → HALF_OPEN(探测) → CLOSED/OPEN
 *
 * 参考: Hermes mcp_tool.py:1720-1764
 *   CIRCUIT_BREAKER_THRESHOLD = 3
 *   CIRCUIT_BREAKER_COOLDOWN_SEC = 60.0
 *
 * 参考: OpenClaw tool-loop-detection.ts
 *   global_circuit_breaker_threshold = 30
 */
import { createLogger } from '../logger';

const log = createLogger('llm/circuit-breaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  threshold?: number;
  cooldownMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private threshold: number;
  private cooldownMs: number;
  private openedAt: number = 0;

  constructor(config: CircuitBreakerConfig = {}) {
    this.threshold = config.threshold ?? 3;
    this.cooldownMs = config.cooldownMs ?? 60_000;
  }

  /** Get current state */
  getState(): CircuitState {
    return this.state;
  }

  /** Check if circuit is open (calls should be blocked) */
  isOpen(): boolean {
    this.checkCooldown();
    return this.state === 'OPEN';
  }

  /** Record a successful call */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      log.info('熔断器探测成功 → CLOSED');
      this.state = 'CLOSED';
      this.failureCount = 0;
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0; // Reset on success
    }
  }

  /** Record a failed call */
  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      log.warn('熔断器探测失败 → re-OPEN');
      this.state = 'OPEN';
      this.openedAt = Date.now();
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      log.warn({ failures: this.failureCount }, '熔断器触发 → OPEN');
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  /**
   * Check if cooldown has expired and transition OPEN → HALF_OPEN.
   * Called internally by isOpen() and can be called externally for explicit checks.
   */
  checkCooldown(): void {
    if (this.state !== 'OPEN') return;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      log.info('熔断器冷却期满 → HALF_OPEN');
      this.state = 'HALF_OPEN';
    }
  }
}
