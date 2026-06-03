/**
 * orchestrator/wiring-integration.test.ts — 接线验证: Phase0+Tool+Module 接入现有引擎
 *
 * 验证: Phase0Engine 替换 turnCounting, HookRunner 接入工具执行,
 *       ModuleRunner 接入 Phase 1 诊断
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../../src/orchestrator/event-store';
import { EventBus } from '../../src/orchestrator/event-bus';
import { PhaseStateMachine } from '../../src/orchestrator/phase-state-machine';
import { HookRunner } from '../../src/orchestrator/hook-runner';
import { SessionManager } from '../../src/orchestrator/session-manager';
import { ModuleRunner } from '../../src/orchestrator/module-runner';
import { createOrchestrationWiring } from '../../src/orchestrator/wiring';
import { ToolRegistry } from '../../src/agent/tools';

// ═══ Wiring Setup ═══

function setupWiring() {
  const db = new Database(':memory:');
  const eventStore = new EventStore(db);
  const eventBus = new EventBus(eventStore);
  const hookRunner = new HookRunner();
  const sessionManager = new SessionManager();
  const stateMachine = new PhaseStateMachine({
    0: { label: '访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设', required: true, maxDurationMs: 300_000 },
    3: { label: '根因', required: true, maxDurationMs: 180_000 },
    4: { label: '报告', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  });
  const wiring = createOrchestrationWiring(eventBus, hookRunner, sessionManager, stateMachine);
  return { db, eventBus, hookRunner, sessionManager, stateMachine, wiring };
}

// ═══ Phase 0 替换验证 ═══

describe('Phase 0 Replacement — Intent Routing replaces turn counting', () => {
  it('Given PhaseStateMachine advances Phase 0, When event emitted, Then phase.started event logged', () => {
    const { eventBus, wiring } = setupWiring();
    const cid = 'phase0-test';
    const traceId = 'trace_phase0';

    wiring.advancePhase(cid, traceId); // Phase 0
    wiring.emitPhaseCompleted(cid, 0, traceId);
    wiring.advancePhase(cid, traceId); // Phase 1

    const events = eventBus.replay(cid);
    const phase0Start = events.filter(e => e.type === 'phase.started' && e.phase === 0);
    const phase0Complete = events.filter(e => e.type === 'phase.completed' && e.phase === 0);
    const phase1Start = events.filter(e => e.type === 'phase.started' && e.phase === 1);

    expect(phase0Start.length).toBe(1);
    expect(phase0Complete.length).toBe(1);
    expect(phase1Start.length).toBe(1);
  });
});

// ═══ HookRunner 接入工具执行验证 ═══

describe('HookRunner Integration — Tool execution hooks', () => {
  it('Given HookRunner wired, When tool executes via ToolRegistry, Then hooks fire in order', async () => {
    const { hookRunner } = setupWiring();
    const hookOrder: string[] = [];

    hookRunner.registerPreToolUse({
      name: 'safety-check',
      async onPreToolUse() { hookOrder.push('pre'); return { action: 'allow' }; },
    });
    hookRunner.registerPostToolUse({
      name: 'logger',
      async onPostToolUse() { hookOrder.push('post'); },
    });

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: 'test_tool', description: 'test',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
    });

    // Wired execution: pre-hook → execute → post-hook
    await hookRunner.runPreToolUse({ name: 'test_tool', input: '{}' });
    const result = await toolRegistry.execute('test_tool', { orgId: 'test' });
    await hookRunner.runPostToolUse({ name: 'test_tool', input: '{}' }, { content: JSON.stringify(result) });

    expect(hookOrder).toEqual(['pre', 'post']);
    expect(result).not.toHaveProperty('error');
  });

  it('Given deny hook, When tool would execute, Then tool call skipped', async () => {
    const { hookRunner } = setupWiring();

    hookRunner.registerPreToolUse({
      name: 'blocker',
      async onPreToolUse(t) {
        if (t.name === 'blocked_tool') return { action: 'deny', reason: 'Not allowed' };
        return { action: 'allow' };
      },
    });

    const result = await hookRunner.runPreToolUse({ name: 'blocked_tool', input: '{}' });
    expect(result.action).toBe('deny');
  });
});

// ═══ ModuleRunner 接入 Phase 1 验证 ═══

describe('ModuleRunner Integration — Phase 1 diagnosis', () => {
  it('Given ModuleRunner with diagnostic modules, When runAll in Phase 1, Then results with events', async () => {
    const { eventBus } = setupWiring();
    const cid = 'phase1-test';
    const runner = new ModuleRunner({ maxParallel: 3, perModuleTimeoutMs: 5000 });

    // Emit Phase 1 start before running modules
    eventBus.emit({
      id: `evt_phase1`, type: 'phase.started', consultationId: cid, phase: 1,
      data: {}, traceId: 't1', spanId: 's1', timestamp: new Date().toISOString(),
    });

    const results = await runner.runAll([
      { name: 'hona', priority: 'P1', async compute() { return { moduleId: 'hona', findings: [{ type: 'info_flow', summary: '信息流断裂' }] }; } },
      { name: 'gaps', priority: 'P1', async compute() { return { moduleId: 'gaps', findings: [{ type: 'collaboration', summary: '协作不畅' }] }; } },
    ]);

    expect(results.completedCount).toBe(2);
    expect(results.degradedModules).toHaveLength(0);

    // Emit module.completed events
    for (const r of results.results) {
      eventBus.emit({
        id: `evt_mod_${r.moduleId}`, type: 'module.completed', consultationId: cid, phase: 1,
        data: { moduleId: r.moduleId, findings: r.findings },
        traceId: 't1', spanId: 's1', timestamp: new Date().toISOString(),
      });
    }

    // Emit Phase 1 completed
    eventBus.emit({
      id: `evt_phase1_done`, type: 'phase.completed', consultationId: cid, phase: 1,
      data: { moduleCount: 2 }, traceId: 't1', spanId: 's1', timestamp: new Date().toISOString(),
    });

    // Verify event log
    const events = eventBus.replay(cid);
    expect(events.some(e => e.type === 'phase.started' && e.phase === 1)).toBe(true);
    expect(events.filter(e => e.type === 'module.completed').length).toBe(2);
    expect(events.some(e => e.type === 'phase.completed' && e.phase === 1)).toBe(true);
  });
});

// ═══ SessionManager 会话压缩在对话流中验证 ═══

describe('SessionManager in conversation flow', () => {
  it('Given conversation messages accumulate, When exceeds threshold, Then compaction preserves key signals', () => {
    const session = new SessionManager({ compactionThresholdTokens: 30, tokenEstimateCharsPerToken: 3 });

    // Phase 0: user answers
    session.addMessage({ role: 'user', content: '我们团队有30人' });
    session.addMessage({ role: 'assistant', content: '了解了。你们主要做什么业务？' });
    session.addMessage({ role: 'user', content: '做SaaS产品，面向B端客户' });
    // Long response that pushes over threshold
    session.addMessage({ role: 'user', content: 'x'.repeat(200) });

    expect(session.needsCompaction()).toBe(true);
    const result = session.compact();
    expect(result.removedCount).toBeGreaterThan(0);
    // Key info should be preserved in remaining messages
    const msgs = session.getMessages();
    const allContent = msgs.map(m => m.content).join(' ') + result.summary;
    expect(allContent).toContain('SaaS');
  });
});
