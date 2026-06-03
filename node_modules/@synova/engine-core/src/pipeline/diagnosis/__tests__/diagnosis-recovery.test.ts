/**
 * diagnosis-recovery.test.ts — 故障恢复配方测试
 *
 * 对标 Claw-Code recovery_recipes.rs 的 16 个测试
 */

import {
  DiagnosisFailureScenario,
  RecoveryContext,
  RecoveryExecutor,
  RecoveryRecipe,
  createDefaultRecipes,
  createDefaultRecoveryExecutor,
} from '../diagnosis-recovery';

// ====================================================================
// 测试辅助：创建简单的成功/失败步骤
// ====================================================================

const passStep = (desc: string) => ({
  description: desc,
  execute: async () => true,
});

const failStep = (desc: string) => ({
  description: desc,
  execute: async () => false,
});

// ====================================================================
// RecoveryResult 三态覆盖
// ====================================================================

describe('RecoveryExecutor', () => {
  let executor: RecoveryExecutor;

  beforeEach(() => {
    executor = new RecoveryExecutor();
  });

  it('returns "recovered" when all steps pass on first attempt', async () => {
    // Given: a single-step recipe
    executor.register({
      scenario: DiagnosisFailureScenario.EVIDENCE_CORRUPTION,
      maxAttempts: 2,
      steps: [passStep('validate evidence integrity')],
    });

    // When: attempting recovery
    const result = await executor.attempt(DiagnosisFailureScenario.EVIDENCE_CORRUPTION);

    // Then: recovered on first attempt
    expect(result.outcome).toBe('recovered');
    if (result.outcome === 'recovered') {
      expect(result.attempts).toBe(1);
    }
  });

  it('retries up to maxAttempts before giving up', async () => {
    // Given: a recipe where every step fails
    executor.register({
      scenario: DiagnosisFailureScenario.LLM_TIMEOUT,
      maxAttempts: 3,
      steps: [failStep('retry LLM call')],
    });

    // When: attempting recovery
    const result = await executor.attempt(DiagnosisFailureScenario.LLM_TIMEOUT);

    // Then: degraded (LLM_TIMEOUT is degradable) after 3 attempts
    expect(result.outcome).toBe('degraded');
    expect(result.attempts).toBe(3);
  });

  it('returns "failed" for unregistered scenario', async () => {
    // Given: no recipes registered
    // When: attempting an unknown scenario
    const result = await executor.attempt(DiagnosisFailureScenario.SESSION_DESYNC);

    // Then: failed immediately
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.reason).toContain('未注册');
      expect(result.attempts).toBe(0);
    }
  });

  it('LLM_TIMEOUT: can degrade to rule-based fallback', async () => {
    // Given: LLM_TIMEOUT recipe where all steps fail
    executor.register({
      scenario: DiagnosisFailureScenario.LLM_TIMEOUT,
      maxAttempts: 2,
      steps: [failStep('retry with reduced tokens')],
    });

    // When: recovery exhausted
    const result = await executor.attempt(DiagnosisFailureScenario.LLM_TIMEOUT);

    // Then: degraded (not failed) — LLM timeout allows degradation
    expect(result.outcome).toBe('degraded');
  });

  it('MODULE_COMPUTE_FAILED: degrades gracefully', async () => {
    // Given: module failure recipe, all steps fail
    executor.register({
      scenario: DiagnosisFailureScenario.MODULE_COMPUTE_FAILED,
      maxAttempts: 2,
      steps: [failStep('retry module')],
    });

    // When: exhausted
    const result = await executor.attempt(DiagnosisFailureScenario.MODULE_COMPUTE_FAILED);

    // Then: degraded
    expect(result.outcome).toBe('degraded');
  });

  it('EVIDENCE_CORRUPTION: recovers by removing corrupt entries', async () => {
    // Given: evidence corruption recipe with a pass step
    executor.register({
      scenario: DiagnosisFailureScenario.EVIDENCE_CORRUPTION,
      maxAttempts: 1,
      steps: [passStep('remove corrupted entries')],
    });

    // When: attempting recovery
    const result = await executor.attempt(DiagnosisFailureScenario.EVIDENCE_CORRUPTION);

    // Then: recovered
    expect(result.outcome).toBe('recovered');
  });

  it('GATE_CHECK_STALL: fails (not degradable) when exhausted', async () => {
    // Given: gate check stall is NOT in the degradable list
    executor.register({
      scenario: DiagnosisFailureScenario.GATE_CHECK_STALL,
      maxAttempts: 2,
      steps: [failStep('re-collect missing data')],
    });

    // When: exhausted
    const result = await executor.attempt(DiagnosisFailureScenario.GATE_CHECK_STALL);

    // Then: failed (gate check must pass)
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.reason).toContain('gate_check_stall');
    }
  });

  it('SESSION_DESYNC: recovers from checkpoint', async () => {
    // Given: session desync with a pass step
    executor.register({
      scenario: DiagnosisFailureScenario.SESSION_DESYNC,
      maxAttempts: 1,
      steps: [passStep('restore from SQLite checkpoint')],
    });

    // When: recovering
    const result = await executor.attempt(DiagnosisFailureScenario.SESSION_DESYNC);

    // Then: recovered
    expect(result.outcome).toBe('recovered');
  });

  it('SUBAGENT_ORPHANED: cleans up orphaned sub-agents', async () => {
    // Given: subagent orphaned recipe
    executor.register({
      scenario: DiagnosisFailureScenario.SUBAGENT_ORPHANED,
      maxAttempts: 2,
      steps: [passStep('cancel orphaned subagent')],
    });

    // When: recovering
    const result = await executor.attempt(DiagnosisFailureScenario.SUBAGENT_ORPHANED);

    // Then: recovered
    expect(result.outcome).toBe('recovered');
  });

  it('PARTIAL_PLUGIN_STARTUP: degrades with surviving plugins', async () => {
    // Given: partial plugin startup, some fail
    executor.register({
      scenario: DiagnosisFailureScenario.PARTIAL_PLUGIN_STARTUP,
      maxAttempts: 2,
      steps: [failStep('restart failed plugin')],
    });

    // When: exhausted
    const result = await executor.attempt(DiagnosisFailureScenario.PARTIAL_PLUGIN_STARTUP);

    // Then: degraded
    expect(result.outcome).toBe('degraded');
  });
});

// ====================================================================
// RecoveryContext — 故障注入
// ====================================================================

describe('RecoveryContext', () => {
  it('withFailAtStep injects failure at specified step', () => {
    // Given: a context with failAtStep = 1 (0-indexed: second step)
    const ctx = new RecoveryContext().withFailAtStep(1);

    // When: checking shouldFail at each step
    const step0 = ctx.shouldFail(); // index 0
    ctx.advanceStep();
    const step1 = ctx.shouldFail(); // index 1

    // Then: only step 1 fails
    expect(step0).toBe(false);
    expect(step1).toBe(true);
  });

  it('shouldFail returns false when no failure injected', () => {
    // Given: a fresh context (no failure injection)
    const ctx = new RecoveryContext();

    // When/Then: never fails
    expect(ctx.shouldFail()).toBe(false);
    ctx.advanceStep();
    expect(ctx.shouldFail()).toBe(false);
  });

  it('reset preserves failAtStep for cross-retry fault injection', () => {
    // Given: a context with failAtStep = 0
    const ctx = new RecoveryContext().withFailAtStep(0);

    // When: resetting
    ctx.reset();

    // Then: failAtStep preserved (so injection persists across retries), stepIndex back to 0
    expect(ctx.failAtStep).toBe(0);
    expect(ctx.shouldFail()).toBe(true); // stepIndex 0 === failAtStep 0
  });

  it('fault injection causes recovery to exhaust attempts', async () => {
    // Given: a recipe that normally succeeds, but context injects failure at step 0
    const executor = new RecoveryExecutor();
    executor.register({
      scenario: DiagnosisFailureScenario.EVIDENCE_CORRUPTION,
      maxAttempts: 2,
      steps: [passStep('would pass without injection')],
    });

    const ctx = new RecoveryContext().withFailAtStep(0);

    // When: attempting with fault injection
    const result = await executor.attempt(DiagnosisFailureScenario.EVIDENCE_CORRUPTION, ctx);

    // Then: recovery fails (EVIDENCE_CORRUPTION not in degradable list)
    expect(result.outcome).toBe('failed');
    expect(result.attempts).toBe(2);
  });
});

// ====================================================================
// 默认配方
// ====================================================================

describe('createDefaultRecipes', () => {
  it('provides recipes for all 7 failure scenarios', () => {
    // Given: default recipes
    const recipes = createDefaultRecipes();

    // When: checking coverage
    const scenarios = recipes.map(r => r.scenario);
    const unique = new Set(scenarios);

    // Then: all 7 scenarios covered
    expect(unique.size).toBe(7);
    expect(scenarios).toContain(DiagnosisFailureScenario.LLM_TIMEOUT);
    expect(scenarios).toContain(DiagnosisFailureScenario.MODULE_COMPUTE_FAILED);
    expect(scenarios).toContain(DiagnosisFailureScenario.EVIDENCE_CORRUPTION);
    expect(scenarios).toContain(DiagnosisFailureScenario.SESSION_DESYNC);
    expect(scenarios).toContain(DiagnosisFailureScenario.GATE_CHECK_STALL);
    expect(scenarios).toContain(DiagnosisFailureScenario.SUBAGENT_ORPHANED);
    expect(scenarios).toContain(DiagnosisFailureScenario.PARTIAL_PLUGIN_STARTUP);
  });

  it('each recipe has at least 1 step', () => {
    // Given: all default recipes
    const recipes = createDefaultRecipes();

    // When/Then: every recipe has steps
    for (const r of recipes) {
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });

  it('createDefaultRecoveryExecutor registers all recipes', async () => {
    // Given: default executor
    const executor = createDefaultRecoveryExecutor();

    // When: attempting every scenario
    const results = await Promise.all(
      Object.values(DiagnosisFailureScenario).map(s => executor.attempt(s)),
    );

    // Then: no 'failed' due to unregistered (all scenarios have recipes)
    const unregistered = results.filter(
      r => r.outcome === 'failed' && r.attempts === 0,
    );
    expect(unregistered).toHaveLength(0);
  });
});

// ====================================================================
// RecoveryExecutor — Builder 模式
// ====================================================================

describe('RecoveryExecutor builder', () => {
  it('register returns this for chaining', () => {
    // Given: a new executor
    const executor = new RecoveryExecutor();

    // When: chaining register calls
    const result = executor
      .register({ scenario: DiagnosisFailureScenario.LLM_TIMEOUT, maxAttempts: 1, steps: [passStep('a')] })
      .register({ scenario: DiagnosisFailureScenario.MODULE_COMPUTE_FAILED, maxAttempts: 1, steps: [passStep('b')] });

    // Then: returns same instance
    expect(result).toBe(executor);
  });

  it('registerAll adds multiple recipes at once', async () => {
    // Given: default recipes
    const executor = new RecoveryExecutor();
    executor.registerAll(createDefaultRecipes());

    // When: testing a known scenario
    const result = await executor.attempt(DiagnosisFailureScenario.EVIDENCE_CORRUPTION);

    // Then: recognized and recovered
    expect(result.outcome).toBe('recovered');
  });
});
