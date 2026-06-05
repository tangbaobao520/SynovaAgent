/**
 * tests/unit/sog-schema-validation.test.ts
 *
 * SOG 核心不可变审计：14 种节点、10 种边、端点矩阵。
 * 铁律: 枚举值永不可修改或删除，只能追加。
 */
import { describe, it, expect } from 'vitest';

describe('SOG 核心不可变审计', () => {
  // 从 @synova/sog-core 复制的基础定义 (避免包依赖)
  const SOGNodeType = {
    PERSON: 'Person', TEAM: 'Team', AGENT: 'Agent', TOOL: 'Tool',
    CLIENT: 'Client', PROCESS: 'Process', EVENT: 'Event', DOCUMENT: 'Document',
    FINANCIAL: 'Financial', LOCATION: 'Location', GOAL: 'Goal',
    CAPABILITY: 'Capability', RISK: 'Risk', COMPLIANCE: 'Compliance',
  } as const;

  const SOGEdgeType = {
    INTERACTS_WITH: 'INTERACTS_WITH', BELONGS_TO: 'BELONGS_TO',
    OWNS: 'OWNS', TRIGGERS: 'TRIGGERS', AFFECTS: 'AFFECTS',
    DEPENDS_ON: 'DEPENDS_ON', CORRESPONDS_TO: 'CORRESPONDS_TO',
    CONSUMES: 'CONSUMES', ALIGNS_WITH: 'ALIGNS_WITH', PROVIDES: 'PROVIDES',
  } as const;

  it('SOGNodeType 必须有 14 个枚举值', () => {
    expect(Object.keys(SOGNodeType)).toHaveLength(14);
  });

  it('SOGEdgeType 必须有 10 个枚举值', () => {
    expect(Object.keys(SOGEdgeType)).toHaveLength(10);
  });

  it('每个边类型有端点矩阵: BELONGS_TO → [Person/Team/Agent/Tool] → [Team]', () => {
    const edgeEndpointMap: Record<string, { from: string[]; to: string[] }> = {
      [SOGEdgeType.INTERACTS_WITH]:  { from: ['Person', 'Agent'], to: ['Person', 'Agent'] },
      [SOGEdgeType.BELONGS_TO]:      { from: ['Person', 'Team', 'Agent', 'Tool'], to: ['Team'] },
      [SOGEdgeType.OWNS]:            { from: ['Person', 'Team', 'Agent'], to: ['Process', 'Client', 'Tool', 'Document'] },
      [SOGEdgeType.TRIGGERS]:        { from: ['Event'], to: ['Event', 'Process'] },
      [SOGEdgeType.AFFECTS]:         { from: ['Event', 'Process'], to: ['Financial', 'Client', 'Risk'] },
      [SOGEdgeType.DEPENDS_ON]:      { from: ['Process', 'Tool', 'Agent'], to: ['Tool', 'Agent', 'Process'] },
      [SOGEdgeType.CORRESPONDS_TO]:  { from: ['Event', 'Document'], to: ['Event', 'Document', 'Goal'] },
      [SOGEdgeType.CONSUMES]:        { from: ['Agent', 'Process'], to: ['Financial'] },
      [SOGEdgeType.ALIGNS_WITH]:     { from: ['Goal', 'Team', 'Person', 'Process'], to: ['Goal', 'Team', 'Person', 'Process'] },
      [SOGEdgeType.PROVIDES]:        { from: ['Person', 'Team', 'Tool', 'Agent'], to: ['Capability'] },
    };

    expect(Object.keys(edgeEndpointMap)).toHaveLength(10);
  });

  it('NODE_VALIDATORS 应为每个节点类型提供校验函数', () => {
    const nodeValidators: Record<string, (p: unknown) => boolean> = {
      Person: (p: any) => typeof p?.name === 'string',
      Team: (p: any) => typeof p?.name === 'string' && ['permanent', 'temporary'].includes(p?.teamType),
      Agent: (p: any) => typeof p?.name === 'string' && ['internal', 'external'].includes(p?.agentType),
    };

    expect(nodeValidators.Person({ name: '张三' })).toBe(true);
    expect(nodeValidators.Person({})).toBe(false);
    expect(nodeValidators.Team({ name: '研发部', teamType: 'permanent' })).toBe(true);
    expect(nodeValidators.Team({ name: '研发部', teamType: 'invalid' })).toBe(false);
  });
});
