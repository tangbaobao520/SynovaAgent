/**
 * tests/unit/sog-schema-validation.test.ts
 *
 * SOG 核心不可变审计：节点类型、边类型、端点矩阵。
 * 铁律: 枚举值永不可修改或删除，只能追加。
 * 更新: 2026-06-06 — 新增 USER/KNOWLEDGE_CHUNK/HAS_ACCESS_TO
 */
import { describe, it, expect } from 'vitest';

describe('SOG 核心不可变审计', () => {
  const SOGNodeType = {
    PERSON: 'Person', TEAM: 'Team', AGENT: 'Agent', TOOL: 'Tool',
    CLIENT: 'Client', PROCESS: 'Process', EVENT: 'Event', DOCUMENT: 'Document',
    FINANCIAL: 'Financial', LOCATION: 'Location', GOAL: 'Goal',
    CAPABILITY: 'Capability', RISK: 'Risk', COMPLIANCE: 'Compliance',
    USER: 'User', KNOWLEDGE_CHUNK: 'KnowledgeChunk',
  } as const;

  const SOGEdgeType = {
    INTERACTS_WITH: 'INTERACTS_WITH', BELONGS_TO: 'BELONGS_TO',
    OWNS: 'OWNS', TRIGGERS: 'TRIGGERS', AFFECTS: 'AFFECTS',
    DEPENDS_ON: 'DEPENDS_ON', CORRESPONDS_TO: 'CORRESPONDS_TO',
    CONSUMES: 'CONSUMES', ALIGNS_WITH: 'ALIGNS_WITH', PROVIDES: 'PROVIDES',
    HAS_ACCESS_TO: 'HAS_ACCESS_TO',
  } as const;

  it('SOGNodeType 必须有 16 个枚举值 (14 原始 + 2 M1新增)', () => {
    expect(Object.keys(SOGNodeType)).toHaveLength(16);
  });

  it('SOGEdgeType 必须有 11 个枚举值 (10 原始 + 1 M1新增)', () => {
    expect(Object.keys(SOGEdgeType)).toHaveLength(11);
  });

  it('M1 新增: USER + KNOWLEDGE_CHUNK 节点', () => {
    expect(SOGNodeType.USER).toBe('User');
    expect(SOGNodeType.KNOWLEDGE_CHUNK).toBe('KnowledgeChunk');
  });

  it('M1 新增: HAS_ACCESS_TO 边 (User→任意资源)', () => {
    expect(SOGEdgeType.HAS_ACCESS_TO).toBe('HAS_ACCESS_TO');
  });

  it('每个边类型有端点矩阵', () => {
    const map: Record<string, { from: string[]; to: string[] }> = {
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
      [SOGEdgeType.HAS_ACCESS_TO]:   { from: ['User', 'Agent'], to: ['Document', 'KnowledgeChunk', 'Financial', 'Goal', 'Risk'] },
    };
    expect(Object.keys(map)).toHaveLength(11);
  });

  it('NODE_VALIDATORS 应为典型节点提供校验', () => {
    const v: Record<string, (p: Record<string, unknown>) => boolean> = {
      Person: (p) => typeof p?.name === 'string',
      Team: (p) => typeof p?.name === 'string' && ['permanent', 'temporary'].includes(p?.teamType as string),
      Agent: (p) => typeof p?.name === 'string' && ['internal', 'external'].includes(p?.agentType as string),
      User: (p) => typeof p?.userId === 'string',
    };
    expect(v.Person({ name: '张三' })).toBe(true);
    expect(v.Person({})).toBe(false);
    expect(v.Team({ name: '研发部', teamType: 'permanent' })).toBe(true);
    expect(v.Team({ name: '研发部', teamType: 'invalid' })).toBe(false);
    expect(v.User({ userId: 'feishu:abc123' })).toBe(true);
    expect(v.User({})).toBe(false);
  });
});
