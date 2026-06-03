import { publishTemplate, listTemplates, searchTemplates, startTrial, isTrialActive, addReview, getReviews, forkTemplate, clearMarketplace } from '../template-marketplace';

beforeEach(() => clearMarketplace());

describe('publishTemplate', () => {
  it('publishes and retrieves template listing', () => {
    const tpl = listTemplates()[0]; // seeded
    expect(tpl).toBeDefined();
    expect(tpl.author).toBe('synova');
  });
});

describe('searchTemplates', () => {
  it('finds by industry', () => {
    const results = searchTemplates('SaaS');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
  it('returns empty for unknown query', () => {
    expect(searchTemplates('zzz_nonexistent')).toHaveLength(0);
  });
});

describe('trial', () => {
  it('starts trial and tracks active status', () => {
    const tpl = listTemplates()[0];
    const result = startTrial(tpl.id, 'org-1', 14);
    expect(result.ok).toBe(true);
    expect(isTrialActive(tpl.id, 'org-1')).toBe(true);
  });
  it('prevents duplicate trial', () => {
    const tpl = listTemplates()[0];
    startTrial(tpl.id, 'org-1');
    expect(startTrial(tpl.id, 'org-1').ok).toBe(false);
  });
});

describe('review', () => {
  it('adds review and updates rating', () => {
    const tpl = listTemplates()[0];
    addReview(tpl.id, 'user-1', 5, 'excellent');
    addReview(tpl.id, 'user-2', 3, 'ok');
    const reviews = getReviews(tpl.id);
    expect(reviews).toHaveLength(2);
    expect(listTemplates()[0].rating).toBeGreaterThan(0);
  });
});

describe('forkTemplate', () => {
  it('forks and creates child with parent reference', () => {
    const parent = listTemplates()[0];
    const child = forkTemplate(parent.id, 'craftsman-A', '王老师', { name: '定制版' });
    expect(child).not.toBeNull();
    expect(child!.parentTemplateId).toBe(parent.id);
    expect(child!.author).toBe('craftsman-A');
  });
  it('returns null for unknown template', () => {
    expect(forkTemplate('nonexistent', 'x', 'y', {})).toBeNull();
  });
});
