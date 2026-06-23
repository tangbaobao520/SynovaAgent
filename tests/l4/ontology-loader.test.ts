/**
 * tests/l4/ontology-loader.test.ts — V3.8 Batch 4
 */
import { describe, it, expect } from 'vitest';
import { loadOntology, getTypesByTags, validateEdgeEndpoints } from '../../src/l4/ontology-loader';

describe('loadOntology', () => {
  it('加载 17 节点类型', () => {
    const { ontology, degraded } = loadOntology();
    expect(degraded).toBe(false);
    expect(ontology.nodeTypes.length).toBe(17);
  });
  it('加载 14 边类型', () => {
    const { ontology } = loadOntology();
    expect(ontology.edgeTypes.length).toBe(14);
  });
  it('edgeEndpointMap 从 edge types 动态构建', () => {
    const { ontology } = loadOntology();
    expect(ontology.edgeEndpointMap['INTERACTS_WITH']).toBeDefined();
    expect(ontology.edgeEndpointMap['INTERACTS_WITH'].from).toContain('Person');
  });
});

describe('getTypesByTags', () => {
  it('any 模式: human 标签返回 Person 等', () => {
    const { nodes } = getTypesByTags(['human']);
    expect(nodes.some(n => n.label === 'Person')).toBe(true);
  });
  it('all 模式: organizational+human 精确匹配', () => {
    const { nodes } = getTypesByTags(['organizational', 'human'], 'all');
    expect(nodes.every(n => n.tags.includes('organizational') && n.tags.includes('human'))).toBe(true);
  });
});

describe('validateEdgeEndpoints', () => {
  it('INTERACTS_WITH Person→Agent 合法', () => {
    expect(validateEdgeEndpoints('INTERACTS_WITH', 'Person', 'Agent')).toBe(true);
  });
  it('INTERACTS_WITH Team→Document 非法', () => {
    expect(validateEdgeEndpoints('INTERACTS_WITH', 'Team', 'Document')).toBe(false);
  });
});
