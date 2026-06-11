/**
 * interviewee-profile.test.ts — 角色画像单元测试
 */

import {
  buildIntervieweeProfile,
  listRoleTypes,
  suggestRoleType,
  getDimensionPriority,
  aggregateTeamPriorities,
  IntervieweeRoleType,
} from '../interviewee-profile';

describe('buildIntervieweeProfile', () => {
  it('builds founder profile with high evidence weight', () => {
    // Given: founder input
    // When: building profile
    const profile = buildIntervieweeProfile({ roleType: 'founder' });

    // Then: strategic authority, high weight
    expect(profile.decisionAuthority).toBe('strategic');
    expect(profile.evidenceWeight).toBe(0.9);
    expect(profile.concernedDimensions).toContain('信任与心理安全');
  });

  it('builds senior-engineer profile with operational authority', () => {
    // Given: senior engineer input
    // When: building
    const profile = buildIntervieweeProfile({ roleType: 'senior-engineer' });

    // Then: operational, medium-high weight
    expect(profile.decisionAuthority).toBe('operational');
    expect(profile.evidenceWeight).toBe(0.7);
    expect(profile.concernedDimensions).toContain('工具与自动化');
  });

  it('applies custom title when provided', () => {
    // Given: input with custom title
    // When: building
    const profile = buildIntervieweeProfile({ roleType: 'engineering-manager', customTitle: '技术 VP' });

    // Then: custom title preserved
    expect(profile.customTitle).toBe('技术 VP');
    expect(profile.roleType).toBe('engineering-manager');
  });

  it('overrides dimensions when specified', () => {
    // Given: override dimensions
    const dims = ['目标对齐', '信息透明度'];

    // When: building
    const profile = buildIntervieweeProfile({ roleType: 'founder', overrideDimensions: dims });

    // Then: only specified dimensions
    expect(profile.concernedDimensions).toEqual(dims);
  });

  it('overrides evidence weight when specified', () => {
    // Given: custom weight
    // When: building
    const profile = buildIntervieweeProfile({ roleType: 'junior-engineer', overrideWeight: 0.8 });

    // Then: custom weight applied
    expect(profile.evidenceWeight).toBe(0.8);
  });

  it('throws for unknown role type', () => {
    // Given: invalid role type
    // When/Then: throws
    expect(() => buildIntervieweeProfile({ roleType: 'astronaut' as IntervieweeRoleType }))
      .toThrow('未知角色类型');
  });

  it('all 13 builtin role types build without error', () => {
    // Given: all defined role types
    const types = listRoleTypes();
    expect(types.length).toBe(13);

    // When: building each
    for (const t of types) {
      const profile = buildIntervieweeProfile({ roleType: t });
      // Then: all required fields present
      expect(profile.roleType).toBe(t);
      expect(profile.responsibilities.length).toBeGreaterThan(0);
      expect(profile.concernedDimensions.length).toBeGreaterThan(0);
      expect(profile.evidenceWeight).toBeGreaterThan(0);
    }
  });
});

describe('suggestRoleType', () => {
  it('matches founder by strategic responsibilities', () => {
    // Given: strategic responsibilities
    const resp = ['战略方向', '核心团队组建'];

    // When: suggesting
    const suggestions = suggestRoleType(resp);

    // Then: founder at top
    expect(suggestions[0]).toBe('founder');
  });

  it('matches engineer by technical responsibilities', () => {
    // Given: engineering responsibilities
    const resp = ['代码质量', '技术方案设计'];

    // When: suggesting
    const suggestions = suggestRoleType(resp);

    // Then: senior-engineer suggested
    expect(suggestions).toContain('senior-engineer');
  });

  it('returns empty for unmatched responsibilities', () => {
    // Given: obscure responsibilities
    const resp = ['养花', '遛狗'];

    // When: suggesting
    const suggestions = suggestRoleType(resp);

    // Then: no matches
    expect(suggestions).toHaveLength(0);
  });
});

describe('getDimensionPriority', () => {
  it('puts concerned dimensions first', () => {
    // Given: founder profile, full dimension list
    const profile = buildIntervieweeProfile({ roleType: 'founder' });
    const allDims = ['工具与自动化', '信任与心理安全', '分工合理性', '决策权分配'];

    // When: computing priority
    const priority = getDimensionPriority(profile, allDims);

    // Then: founder-concerned dims come first
    expect(priority[0]).toBe('信任与心理安全');
    expect(priority[1]).toBe('决策权分配');
  });
});

describe('aggregateTeamPriorities', () => {
  it('weights dimensions by role count and evidence weight', () => {
    // Given: two profiles with overlapping concerns
    const founder = buildIntervieweeProfile({ roleType: 'founder' });
    const eng = buildIntervieweeProfile({ roleType: 'senior-engineer' });
    const dims = ['信任与心理安全', '工具与自动化', '目标对齐'];

    // When: aggregating
    const scores = aggregateTeamPriorities([founder, eng], dims);

    // Then: trust gets high score (both care), tools gets medium (only eng cares highly)
    expect(scores.get('信任与心理安全')).toBeGreaterThan(0);
    expect(scores.get('工具与自动化')).toBeGreaterThan(0);
  });

  it('returns 0 for dimensions no one cares about', () => {
    // Given: no one cares about a dimension
    const founder = buildIntervieweeProfile({ roleType: 'founder' });
    const dims = ['不存在的维度'];

    // When: aggregating
    const scores = aggregateTeamPriorities([founder], dims);

    // Then: score is 0
    expect(scores.get('不存在的维度')).toBe(0);
  });
});

describe('listRoleTypes', () => {
  it('returns all 13 role types', () => {
    const types = listRoleTypes();
    expect(types).toHaveLength(13);
    expect(new Set(types).size).toBe(13);
  });
});
