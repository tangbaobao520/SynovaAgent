/**
 * tests/ingest/data-pipeline-monitor.test.ts — D266 数据管道监控测试
 *
 * 契约:
 *   @input  — fakeStore with nodes having createdAt
 *   @output — PipelineHealth
 *   @degraded — status='degraded' 当 nodesCreated7d = 0
 */
import { describe, it, expect } from 'vitest';
import { getPipelineHealth } from '../../src/ingest/data-pipeline-monitor';

function fakeStore(nodes: Array<{ id: string; type: string; props?: Record<string, unknown> }> = []) {
  return {
    queryNodes(_type: string, _filters?: Record<string, unknown>, _graph?: string) {
      return nodes.map(n => ({ ...n, props: n.props || {} }));
    },
    queryEdges() { return []; },
  };
}

describe('getPipelineHealth', () => {
  const recentDate = new Date(Date.now() - 1 * 86_400_000).toISOString();

  it('Given nodes created within 7 days, When getPipelineHealth, Then returns healthy', () => {
    const store = fakeStore([
      { id: 'n1', type: 'X', props: { createdAt: recentDate } },
    ]);
    const result = getPipelineHealth(store);
    expect(result.nodesCreated7d).toBe(1);
    expect(result.status).toBe('healthy');
  });

  it('Given no recent nodes, When getPipelineHealth, Then returns degraded', () => {
    const store = fakeStore([
      { id: 'n1', type: 'X', props: { createdAt: '2020-01-01T00:00:00.000Z' } },
    ]);
    const result = getPipelineHealth(store);
    expect(result.nodesCreated7d).toBe(0);
    expect(result.status).toBe('degraded');
  });

  it('Given custom days window, When getPipelineHealth with days param, Then uses custom window', () => {
    const store = fakeStore([
      { id: 'n1', type: 'X', props: { createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString() } },
    ]);
    expect(getPipelineHealth(store, 'default', 30).status).toBe('healthy');
    expect(getPipelineHealth(store, 'default', 7).status).toBe('degraded');
  });

  it('Given empty graph, When getPipelineHealth, Then returns degraded', () => {
    const store = fakeStore();
    const result = getPipelineHealth(store);
    expect(result.nodesCreated7d).toBe(0);
    expect(result.status).toBe('degraded');
  });
});
