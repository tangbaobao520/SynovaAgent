/**
 * diagnosis-link.test.ts — 诊断链接生成与解析测试
 */
import {
  generateDiagnosisLink,
  parseDiagnosisLink,
  isLinkExpired,
  trackLinkSent,
  trackLinkViewed,
  trackLinkCompleted,
  getLinkState,
  getCraftsmanLinks,
} from '../diagnosis-link';

describe('generateDiagnosisLink', () => {
  it('generates URL with base64url payload', () => {
    const link = generateDiagnosisLink('https://synova.app/diagnosis', {
      orgId: 'org-001',
      referrer: '王老师',
      referrerNote: '扩团队，信息流重点关注',
      dimensions: ['information_flow', 'trust_level'],
      depth: 'standard',
    });
    expect(link.url).toContain('quick_start=true');
    expect(link.url).toContain('payload=');
    expect(link.url).toContain('ref=');
    expect(link.linkId).toMatch(/^link_/);
    expect(link.expired).toBe(false);
  });

  it('sets expiry 30 days from now by default', () => {
    const link = generateDiagnosisLink('https://test.com', {
      orgId: 'o1', referrer: 'ref',
    });
    const expiresAt = new Date(link.expiresAt);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    expect(Math.abs(expiresAt.getTime() - thirtyDays.getTime())).toBeLessThan(86400000); // within 1 day
  });
});

describe('parseDiagnosisLink', () => {
  it('parses valid payload', () => {
    const link = generateDiagnosisLink('https://test.com', {
      orgId: 'org-001',
      referrer: '李顾问',
      referrerNote: '重点关注财务维度',
      depth: 'deep',
    });
    // Extract URL params manually
    const url = new URL(link.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });

    const payload = parseDiagnosisLink(params);
    expect(payload).not.toBeNull();
    expect(payload!.orgId).toBe('org-001');
    expect(payload!.referrer).toBe('李顾问');
    expect(payload!.referrerNote).toBe('重点关注财务维度');
    expect(payload!.depth).toBe('deep');
  });

  it('returns null for missing payload', () => {
    expect(parseDiagnosisLink({})).toBeNull();
  });

  it('returns null for corrupted payload', () => {
    expect(parseDiagnosisLink({ payload: 'not-valid-base64!!!' })).toBeNull();
  });
});

describe('isLinkExpired', () => {
  it('returns false for fresh link', () => {
    const link = generateDiagnosisLink('https://t.com', { orgId: 'o1', referrer: 'r' });
    const url = new URL(link.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    const payload = parseDiagnosisLink(params)!;
    expect(isLinkExpired(payload)).toBe(false);
  });
});

describe('link state tracking', () => {
  it('tracks link lifecycle: sent → viewed → completed', () => {
    trackLinkSent('link-1', 'org-1', 'craftsman-A');
    expect(getLinkState('link-1')?.status).toBe('sent');

    trackLinkViewed('link-1');
    expect(getLinkState('link-1')?.status).toBe('viewed');

    trackLinkCompleted('link-1');
    expect(getLinkState('link-1')?.status).toBe('completed');
  });

  it('filters links by craftsman', () => {
    trackLinkSent('link-a', 'org-a', 'craftsman-X');
    trackLinkSent('link-b', 'org-b', 'craftsman-Y');
    trackLinkSent('link-c', 'org-c', 'craftsman-X');

    const xLinks = getCraftsmanLinks('craftsman-X');
    expect(xLinks).toHaveLength(2);
    const yLinks = getCraftsmanLinks('craftsman-Y');
    expect(yLinks).toHaveLength(1);
  });
});
