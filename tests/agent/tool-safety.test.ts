/**
 * tests/agent/tool-safety.test.ts — ParallelGate + ToolGuardrails 单元测试
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ParallelGate, ToolGuardrails, type ToolDefinition } from '../../src/agent/tools';

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'test_tool', description: 'test', parameters: { type: 'object', properties: {} },
    handler: async () => ({}),
    ...overrides,
  };
}

// ═══ ParallelGate ═══

describe('ParallelGate.canParallelize', () => {
  const gate = new ParallelGate();

  it('Given single tool, When canParallelize, Then false (no benefit)', () => {
    expect(gate.canParallelize([tool({ name: 'a', operationType: 'read' })])).toBe(false);
  });

  it('Given 2 read tools, When canParallelize, Then true', () => {
    expect(gate.canParallelize([
      tool({ name: 'a', operationType: 'read' }),
      tool({ name: 'b', operationType: 'read' }),
    ])).toBe(true);
  });

  it('Given read + write with different paths, When canParallelize, Then true', () => {
    expect(gate.canParallelize([
      tool({ name: 'a', operationType: 'read', resourcePath: '/a' }),
      tool({ name: 'b', operationType: 'write', resourcePath: '/b' }),
    ])).toBe(true);
  });

  it('Given 2 write tools with same path, When canParallelize, Then false (collision)', () => {
    expect(gate.canParallelize([
      tool({ name: 'a', operationType: 'write', resourcePath: '/shared' }),
      tool({ name: 'b', operationType: 'write', resourcePath: '/shared' }),
    ])).toBe(false);
  });

  it('Given interactive tool, When canParallelize, Then false', () => {
    expect(gate.canParallelize([
      tool({ name: 'a', operationType: 'read' }),
      tool({ name: 'b', operationType: 'interactive' }),
    ])).toBe(false);
  });

  it('Given destructive tool, When canParallelize, Then false', () => {
    expect(gate.canParallelize([
      tool({ name: 'a', operationType: 'read' }),
      tool({ name: 'rm', sideEffects: 'destructive' }),
    ])).toBe(false);
  });

  it('Given empty array, When canParallelize, Then false', () => {
    expect(gate.canParallelize([])).toBe(false);
  });
});

// ═══ ToolGuardrails ═══

describe('ToolGuardrails.check — exact failure detection', () => {
  let g: ToolGuardrails;
  beforeEach(() => { g = new ToolGuardrails(); });

  it('Given first failure, When check, Then allow', () => {
    const r = g.check('crashy', { input: 'x' }, { error: 'boom' });
    expect(r.action).toBe('allow');
  });

  it('Given 2nd exact same failure, When check, Then warn', () => {
    g.check('crashy', { input: 'x' }, { error: 'boom' });
    const r = g.check('crashy', { input: 'x' }, { error: 'boom' });
    expect(r.action).toBe('warn');
  });

  it('Given 5th exact same failure, When check, Then block', () => {
    for (let i = 0; i < 5; i++) {
      g.check('crashy', { input: 'x' }, { error: 'boom' });
    }
    const r = g.check('crashy', { input: 'x' }, { error: 'boom' });
    expect(r.action).toBe('block');
  });

  it('Given same tool different params fails, When check, Then not counting as exact', () => {
    g.check('crashy', { input: 'a' }, { error: 'boom' });
    const r = g.check('crashy', { input: 'b' }, { error: 'boom' });
    expect(r.action).toBe('allow'); // different params = different key
  });
});

describe('ToolGuardrails.check — no progress detection', () => {
  let g: ToolGuardrails;
  beforeEach(() => { g = new ToolGuardrails(); });

  it('Given same result 5 times, When check, Then block', () => {
    for (let i = 0; i < 5; i++) {
      g.check('reader', { q: 'x' }, { content: 'same result' });
    }
    const r = g.check('reader', { q: 'x' }, { content: 'same result' });
    expect(r.action).toBe('block');
    expect(r.reason).toContain('相同结果');
  });

  it('Given different results, When check, Then allow each time', () => {
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const r = g.check('reader', {}, { content: `result ${i}` });
      if (r.action === 'block') blocked = true;
    }
    expect(blocked).toBe(false);
  });

  it('Given success after failure, When check, Then failure counter resets', () => {
    g.check('tool', { x: 1 }, { error: 'fail' });
    g.check('tool', { x: 1 }, { error: 'fail' }); // warn
    const r = g.check('tool', { x: 1 }, { content: 'success' }); // resets
    expect(r.action).toBe('allow');
  });
});

describe('ToolGuardrails.resetForTurn', () => {
  it('Given accumulated state, When reset, Then clean slate', () => {
    const g = new ToolGuardrails();
    g.check('t', { x: 1 }, { error: '1' });
    g.check('t', { x: 1 }, { error: '2' });
    g.resetForTurn();
    const r = g.check('t', { x: 1 }, { error: '3' });
    expect(r.action).toBe('allow');
  });
});
