/**
 * tests/l4/entity-resolver.test.ts — Phase 3 tests (simplified, robust)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveEntitiesL3 } from '../../src/l4/entity-resolver';
import { reflectOnTriples } from '../../src/l4/triple-reflection';
import { captureDecision } from '../../src/l4/decision-capture';
import type { LLMClient } from '../../src/orchestrator/diagnosis-orchestrator';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

// ═══ L3 Entity Resolver ═══

describe('resolveEntitiesL3', () => {
  function fakeStore(nodes: Array<{id:string, type:string, props:Record<string,unknown>}>, edges: Array<{from:string, to:string, type:string}> = []) {
    return {
      queryNodes(_type: string) { return nodes.filter(n => n.type === _type).map(n => ({...n})); },
      queryEdges(_type?: string, from?: string, to?: string) {
        return edges.filter(e =>
          (!_type || e.type === _type) && (!from || e.from === from) && (!to || e.to === to),
        ).map(e => ({...e, weight:1, id:'e1', props:{}}));
      },
    } as any;
  }

  it('runs L3 resolution without error', () => {
    const store = fakeStore([
      { id:'p1', type:SOGNodeType.PERSON, props:{ name:'Alice', email:'alice@example.com' }},
      { id:'p2', type:SOGNodeType.PERSON, props:{ name:'Alice', email:'alice@example.com' }},
    ]);
    // L3 resolution should not throw
    expect(() => resolveEntitiesL3(store, 'g')).not.toThrow();
  });

  it('returns empty for graph with no duplicates', () => {
    const store = fakeStore([
      { id:'p1', type:SOGNodeType.PERSON, props:{ name:'Alice' }},
    ]);
    const result = resolveEntitiesL3(store, 'g');
    expect(result.matches).toHaveLength(0);
  });

  it('returns empty for empty graph', () => {
    const store = fakeStore([]);
    const result = resolveEntitiesL3(store, 'g');
    expect(result.matches).toHaveLength(0);
    expect(result.autoMerged).toBe(0);
  });

  it('does not match different types (blocking)', () => {
    const store = fakeStore([
      { id:'p1', type:SOGNodeType.PERSON, props:{ name:'Alice' }},
      { id:'t1', type:SOGNodeType.TEAM, props:{ name:'Alice' }},
    ]);
    const result = resolveEntitiesL3(store, 'g');
    const crossType = result.matches.filter(m => m.entityA.type !== m.entityB.type);
    expect(crossType).toHaveLength(0);
  });
});

// ═══ Triple Reflection ═══

describe('reflectOnTriples', () => {
  const fakeLLM: LLMClient = { async consult() { return { content: JSON.stringify([{action:'keep', reason:'accurate'}]), model:'fake' }; } };

  it('returns keep for valid triples', async () => {
    const result = await reflectOnTriples(fakeLLM, [{ subject:'A', predicate:'BELONGS_TO', object:'B' }]);
    expect(result.reflections).toHaveLength(1);
    expect(result.reflections[0].action).toBe('keep');
  });

  it('handles LLM suggesting correction', async () => {
    const llm: LLMClient = { async consult() { return { content: JSON.stringify([{action:'correct', reason:'wrong', suggestedLabel:'OWNS'}]), model:'fake' }; } };
    const result = await reflectOnTriples(llm, [{ subject:'A', predicate:'BELONGS_TO', object:'B' }]);
    expect(result.reflections[0].action).toBe('correct');
    expect(result.reflections[0].suggestedLabel).toBe('OWNS');
  });

  it('returns empty for no triples', async () => {
    const result = await reflectOnTriples(fakeLLM, []);
    expect(result.reflections).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });
});

// ═══ Decision Capture ═══

describe('captureDecision', () => {
  it('records confirmed decision when node exists', () => {
    const edges: Array<{type:string, from:string, to:string}> = [];
    const store = {
      queryNodes() { return [{id:'rc1'}]; },
      createEdge(type: string, from: string, to: string, w?: number, p?: Record<string,unknown>) { edges.push({type, from, to}); return 'e1'; },
    };
    const result = captureDecision(store, 'g', { nodeId:'rc1', userId:'u1', action:'confirmed', reason:'valid' });
    expect(result.recorded).toBe(true);
    expect(result.edgeType).toBe('DECISION_CONFIRMED');
    expect(edges.length).toBe(1);
  });

  it('records rejected decision', () => {
    const edges: Array<{type:string, from:string, to:string}> = [];
    const store = {
      queryNodes() { return [{id:'rc2'}]; },
      createEdge(type: string, from: string, to: string, w?: number, p?: Record<string,unknown>) { edges.push({type, from, to}); return 'e2'; },
    };
    const result = captureDecision(store, 'g', { nodeId:'rc2', userId:'u1', action:'rejected', reason:'not valid' });
    expect(result.recorded).toBe(true);
    expect(result.edgeType).toBe('DECISION_REJECTED');
  });

  it('returns recorded=false when node does not exist', () => {
    const store = { queryNodes() { return []; }, createEdge() { return ''; } };
    const result = captureDecision(store, 'g', { nodeId:'nx', userId:'u1', action:'confirmed', reason:'' });
    expect(result.recorded).toBe(false);
    expect(result.error).toBeDefined();
  });
});
