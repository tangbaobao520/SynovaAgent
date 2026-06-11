/**
 * graph-sse.test.ts — B4 SSE协议扩展测试 (铁律 0-2: 测试先行)
 */
import { buildGraphUpdateEvent, buildInsightFlash, GraphSSEEncoder } from '../graph-sse';
import type { SubGraph } from '../types';

const mockSubGraph: SubGraph = {
  nodes: [
    { id: 'n1', type: 'Person', props: { name: 'Alice' }, graph: 'org-test', createdAt: '', updatedAt: '' },
    { id: 'n2', type: 'Team', props: { name: 'Engineering' }, graph: 'org-test', createdAt: '', updatedAt: '' },
  ],
  edges: [
    { id: 'e1', type: 'BELONGS_TO', from: 'n1', to: 'n2', weight: 1, props: {}, graph: 'org-test', validFrom: '' },
  ],
};

describe('buildGraphUpdateEvent', () => {
  it('Given subgraph, When built, Then produces valid SSE data string', () => {
    const event = buildGraphUpdateEvent(mockSubGraph, ['n1']);
    expect(event).toContain('event: graph_update');
    expect(event).toContain('data:');
    const parsed = JSON.parse(event.split('\n')[1].replace('data: ', ''));
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.highlights).toContain('n1');
  });
});

describe('buildInsightFlash', () => {
  it('Given anomaly alert, When built, Then produces valid SSE data', () => {
    const event = buildInsightFlash('anomaly', '信息流权重骤降40%', 'high', ['n1', 'n2']);
    expect(event).toContain('event: insight_flash');
    const parsed = JSON.parse(event.split('\n')[1].replace('data: ', ''));
    expect(parsed.type).toBe('anomaly');
    expect(parsed.severity).toBe('high');
    expect(parsed.nodeIds).toContain('n1');
  });

  it('Given trend insight, When built, Then severity is info', () => {
    const event = buildInsightFlash('trend', '信息流持续改善', 'info', []);
    expect(event).toContain('event: insight_flash');
  });
});

describe('GraphSSEEncoder', () => {
  it('Given graph_update + insight, When batched, Then produces multi-event SSE', () => {
    const encoder = new GraphSSEEncoder();
    encoder.addGraphUpdate(mockSubGraph, ['n1']);
    encoder.addInsightFlash('anomaly', '检测到异常子图', 'medium', ['n1']);
    const batch = encoder.encode();
    expect(batch).toContain('event: graph_update');
    expect(batch).toContain('event: insight_flash');
    expect(batch).toContain('\n\n'); // SSE double-newline separator
  });
});
