/**
 * tests/l3/decision-capture-wiring.test.ts — DecisionCapture 接入 Phase 5
 *
 * 用户旅程: Phase 5 → 用户确认根因 → captureDecision → GraphStore 决策边
 * 铁律 0-2 Step 5-6
 */
import { describe, it, expect } from 'vitest';
import { captureDecision } from '../../src/l4/decision-capture';

describe('DecisionCapture → Phase 5 Wiring', () => {
  it('Given user confirms root cause, When captureDecision, Then creates DECISION_CONFIRMED edge', () => {
    const edges: Array<{type:string, from:string, to:string}> = [];
    const store = {
      queryNodes() { return [{ id:'rc1' }]; },
      createEdge(type:string, from:string, to:string) { edges.push({type,from,to}); return 'de1'; },
    };
    const result = captureDecision(store, 'org-1', { nodeId:'rc1', userId:'u1', action:'confirmed', reason:'确实如此' });
    expect(result.recorded).toBe(true);
    expect(edges[0].type).toBe('DECISION_CONFIRMED');
  });

  it('Given user rejects root cause, When captureDecision, Then creates DECISION_REJECTED edge', () => {
    const edges: Array<{type:string, from:string, to:string}> = [];
    const store = {
      queryNodes() { return [{ id:'rc2' }]; },
      createEdge(type:string, from:string, to:string) { edges.push({type,from,to}); return 'de2'; },
    };
    const result = captureDecision(store, 'org-1', { nodeId:'rc2', userId:'u1', action:'rejected', reason:'不是主因' });
    expect(result.recorded).toBe(true);
    expect(edges[0].type).toBe('DECISION_REJECTED');
  });

  it('Given node does not exist, When captureDecision, Then returns recorded=false', () => {
    const store = { queryNodes() { return []; }, createEdge() { return ''; } };
    const result = captureDecision(store, 'org-1', { nodeId:'nx', userId:'u1', action:'confirmed', reason:'' });
    expect(result.recorded).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('Given user modifies root cause, When captureDecision, Then creates DECISION_MODIFIED edge', () => {
    const edges: Array<{type:string, from:string, to:string}> = [];
    const store = {
      queryNodes() { return [{ id:'rc3' }]; },
      createEdge(type:string, from:string, to:string) { edges.push({type,from,to}); return 'de3'; },
    };
    const result = captureDecision(store, 'org-1', { nodeId:'rc3', userId:'u1', action:'modified', reason:'调整', modifiedProps:{severity:'medium'} });
    expect(result.recorded).toBe(true);
    expect(edges[0].type).toBe('DECISION_MODIFIED');
  });
});
