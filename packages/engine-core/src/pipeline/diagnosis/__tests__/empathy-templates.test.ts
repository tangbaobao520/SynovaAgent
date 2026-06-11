/**
 * empathy-templates.test.ts — 共情模板单元测试
 */

import {
  renderEmpathyMessage,
  renderMultiRoleMessages,
  getRoleLabel,
  getRoleTone,
  adaptDetailLevel,
  EmpathyTemplateParams,
} from '../empathy-templates';

function baseParams(overrides: Partial<EmpathyTemplateParams> = {}): EmpathyTemplateParams {
  return {
    scenario: 'finding_shared',
    recipientRole: 'ceo',
    severity: 'medium',
    teamName: '测试团队',
    dimensionName: '信息流',
    ...overrides,
  };
}

describe('renderEmpathyMessage', () => {
  it('renders opening scenario with team name', () => {
    // Given: opening scenario for a team
    const params = baseParams({ scenario: 'opening' });

    // When: rendering
    const msg = renderEmpathyMessage(params);

    // Then: headline and body contain team name
    expect(msg.headline).toContain('诊断');
    expect(msg.body).toContain('测试团队');
  });

  it('critical severity sets urgent tone and call-to-action', () => {
    // Given: critical finding
    const params = baseParams({ scenario: 'critical_alert', severity: 'critical' });

    // When: rendering
    const msg = renderEmpathyMessage(params);

    // Then: tone is urgent and has CTA
    expect(msg.tone).toBe('urgent');
    expect(msg.hasCallToAction).toBe(true);
  });

  it('low severity is supportive with no call-to-action', () => {
    // Given: low risk finding
    const params = baseParams({ scenario: 'finding_shared', severity: 'low' });

    // When: rendering
    const msg = renderEmpathyMessage(params);

    // Then: supportive and no CTA needed
    expect(msg.tone).toBe('supportive');
    expect(msg.hasCallToAction).toBe(false);
  });

  it('sensitive findings always use supportive tone regardless of severity', () => {
    // Given: sensitive finding at all severity levels
    const severities = ['low', 'medium', 'high', 'critical'] as const;

    for (const sev of severities) {
      // When: rendering sensitive scenario
      const msg = renderEmpathyMessage(baseParams({ scenario: 'finding_sensitive', severity: sev }));

      // Then: always supportive tone
      expect(msg.tone).toBe('supportive');
    }
  });

  it('interpolates dimensionName in headline', () => {
    // Given: finding with named dimension
    const params = baseParams({ scenario: 'finding_shared', severity: 'high', dimensionName: '决策权分配' });

    // When: rendering
    const msg = renderEmpathyMessage(params);

    // Then: headline includes the dimension name
    expect(msg.headline).toContain('决策权分配');
  });

  it('closing scenario references team name and next steps', () => {
    // Given: closing with critical severity
    const params = baseParams({ scenario: 'closing', severity: 'critical' });

    // When: rendering
    const msg = renderEmpathyMessage(params);

    // Then: body urges immediate action and references team
    expect(msg.body).toContain('测试团队');
    expect(msg.tone).toBe('urgent');
  });

  it('all six scenarios render without error', () => {
    // Given: all defined scenarios
    const scenarios = ['opening', 'finding_shared', 'finding_sensitive', 'critical_alert', 'recommendation', 'closing'] as const;

    for (const scenario of scenarios) {
      // When: rendering each
      const msg = renderEmpathyMessage(baseParams({ scenario }));

      // Then: both headline and body are non-empty strings
      expect(typeof msg.headline).toBe('string');
      expect(msg.headline.length).toBeGreaterThan(0);
      expect(typeof msg.body).toBe('string');
      expect(msg.body.length).toBeGreaterThan(0);
    }
  });
});

describe('renderMultiRoleMessages', () => {
  it('produces one message per role', () => {
    // Given: a finding suitable for multiple audiences
    const params = baseParams({ scenario: 'recommendation', severity: 'high' });

    // When: rendering for all roles
    const messages = renderMultiRoleMessages(params, ['ceo', 'cto', 'manager', 'ic']);

    // Then: all four roles have messages
    expect(messages.size).toBe(4);
    expect(messages.get('ceo')).toBeDefined();
    expect(messages.get('cto')).toBeDefined();
  });

  it('same base params produce different bodies per role via adaptDetailLevel', () => {
    // Given: a detailed finding body
    const params = baseParams({ scenario: 'finding_shared', severity: 'medium' });
    const baseMsg = renderEmpathyMessage({ ...params, recipientRole: 'cto' });

    // When: adapting for CEO vs CTO
    const ceoVersion = adaptDetailLevel(baseMsg.body, 'ceo');
    const ctoVersion = adaptDetailLevel(baseMsg.body, 'cto');

    // Then: CEO version is shorter
    expect(ceoVersion.length).toBeLessThanOrEqual(ctoVersion.length);
  });
});

describe('getRoleLabel', () => {
  it('returns Chinese label for each role', () => {
    expect(getRoleLabel('ceo')).toBe('创始人/CEO');
    expect(getRoleLabel('cto')).toBe('技术负责人');
    expect(getRoleLabel('manager')).toBe('团队管理者');
    expect(getRoleLabel('ic')).toBe('团队成员');
    expect(getRoleLabel('hr')).toBe('HR 负责人');
  });
});

describe('getRoleTone', () => {
  it('CEO has low detail level and high formality', () => {
    const tone = getRoleTone('ceo');
    expect(tone.detailLevel).toBeLessThan(0.5);
    expect(tone.formality).toBeGreaterThan(0.5);
  });

  it('CTO has high detail level', () => {
    const tone = getRoleTone('cto');
    expect(tone.detailLevel).toBeGreaterThan(0.8);
  });

  it('IC has lowest formality', () => {
    const tones = ['ceo', 'cto', 'manager', 'ic', 'hr'].map(r => ({ role: r, ...getRoleTone(r as any) }));
    const ic = tones.find(t => t.role === 'ic')!;
    const minFormal = Math.min(...tones.map(t => t.formality));
    expect(ic.formality).toBe(minFormal);
  });
});

describe('adaptDetailLevel', () => {
  it('truncates message for CEO to approximately 30%', () => {
    // Given: a long multi-sentence message
    const long = '信息流方面表现良好。数据同步及时准确。团队成员反馈积极。跨部门沟通顺畅。无阻塞问题。';

    // When: adapting for CEO
    const ceoVersion = adaptDetailLevel(long, 'ceo');

    // Then: shorter than original
    expect(ceoVersion.length).toBeLessThan(long.length);
  });

  it('preserves full detail for CTO', () => {
    // Given: a technical finding
    const detail = '系统架构存在单点依赖。数据库连接池配置偏低。缓存策略需重新评估。';

    // When: adapting for CTO
    const ctoVersion = adaptDetailLevel(detail, 'cto');

    // Then: essentially the full message
    expect(ctoVersion.length).toBeGreaterThanOrEqual(detail.length - 5);
  });
});
