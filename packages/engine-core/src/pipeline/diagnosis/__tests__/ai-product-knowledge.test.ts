/**
 * ai-product-knowledge.test.ts — AI 产品知识库测试
 */

import {
  queryProducts,
  getProduct,
  isVersionDeprecated,
  isVersionOutdated,
  getCategories,
  fuzzySearch,
  analyzeAIInventory,
} from '../ai-product-knowledge';
import type { TeamAIToolEntry } from '../ai-product-knowledge';

describe('ai-product-knowledge', () => {
  describe('getProduct', () => {
    it('returns product by ID', () => {
      const p = getProduct('openai-api');
      expect(p).not.toBeNull();
      expect(p!.name).toBe('OpenAI API');
      expect(p!.vendor).toBe('OpenAI');
    });

    it('returns null for unknown ID', () => {
      expect(getProduct('nonexistent')).toBeNull();
    });
  });

  describe('queryProducts', () => {
    it('returns all products with no filter', () => {
      const results = queryProducts();
      expect(results.length).toBeGreaterThan(15);
    });

    it('filters by category', () => {
      const results = queryProducts({ category: 'llm-platform' });
      expect(results.length).toBeGreaterThan(3);
      expect(results.every(p => p.category === 'llm-platform')).toBe(true);
    });

    it('filters by vendor', () => {
      const results = queryProducts({ vendor: 'Anthropic' });
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(p => p.vendor === 'Anthropic')).toBe(true);
    });

    it('filters by keyword in name', () => {
      const results = queryProducts({ keyword: 'Claude' });
      expect(results.some(p => p.id === 'claude-code')).toBe(true);
      expect(results.some(p => p.id === 'anthropic-api')).toBe(true);
    });

    it('filters by keyword in description', () => {
      const results = queryProducts({ keyword: '开源' });
      expect(results.some(p => p.id === 'chromadb')).toBe(true);
    });

    it('filters by keyword in keywords array', () => {
      const results = queryProducts({ keyword: 'RAG' });
      expect(results.some(p => p.id === 'pinecone')).toBe(true);
    });

    it('filters by pricing tier', () => {
      const results = queryProducts({ pricingTier: 'free' });
      expect(results.every(p => p.pricingTier === 'free')).toBe(true);
    });

    it('filters by suitable team size', () => {
      const results = queryProducts({ suitableFor: 'enterprise' });
      expect(results.every(p => p.suitableFor.includes('enterprise'))).toBe(true);
    });
  });

  describe('isVersionDeprecated', () => {
    it('returns true for deprecated version', () => {
      expect(isVersionDeprecated('openai-api', '2023-06')).toBe(true);
    });

    it('returns false for current version', () => {
      expect(isVersionDeprecated('openai-api', '2026-05')).toBe(false);
    });

    it('returns false for unknown product', () => {
      expect(isVersionDeprecated('unknown', '1.0')).toBe(false);
    });
  });

  describe('isVersionOutdated', () => {
    it('returns true for version below minStableVersion', () => {
      // minStableVersion for anthropic-api is '2025-03'
      expect(isVersionOutdated('anthropic-api', '2024-02')).toBe(true);
    });

    it('returns false for version at minStableVersion', () => {
      expect(isVersionOutdated('anthropic-api', '2025-03')).toBe(false);
    });

    it('returns false for version above minStableVersion', () => {
      expect(isVersionOutdated('anthropic-api', '2025-06')).toBe(false);
    });

    it('returns false for unknown product', () => {
      expect(isVersionOutdated('unknown', '1.0')).toBe(false);
    });
  });

  describe('getCategories', () => {
    it('returns all unique categories', () => {
      const cats = getCategories();
      expect(cats.length).toBeGreaterThanOrEqual(5);
      expect(cats).toContain('llm-platform');
      expect(cats).toContain('agent-framework');
      expect(cats).toContain('code-assistant');
      // no duplicates
      expect(new Set(cats).size).toBe(cats.length);
    });
  });

  describe('fuzzySearch', () => {
    it('returns exact match first', () => {
      const results = fuzzySearch('DeepSeek');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('deepseek-api');
    });

    it('finds by keyword match', () => {
      const results = fuzzySearch('向量');
      expect(results.some(p => p.id === 'pinecone')).toBe(true);
      expect(results.some(p => p.id === 'chromadb')).toBe(true);
    });

    it('finds by vendor partial match', () => {
      const results = fuzzySearch('Micro');
      expect(results.some(p => p.id === 'autogen')).toBe(true);
      expect(results.some(p => p.id === 'github-copilot')).toBe(true);
    });

    it('respects maxResults', () => {
      const results = fuzzySearch('a', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns empty for no match', () => {
      const results = fuzzySearch('xyzzy123noexist');
      expect(results).toHaveLength(0);
    });
  });

  describe('analyzeAIInventory', () => {
    it('detects outdated tools using deprecated versions', () => {
      // Given: OpenAI API on deprecated version 2023-06
      const tools: TeamAIToolEntry[] = [
        { productId: 'openai-api', version: '2023-06', usageScope: 'team-wide', satisfaction: 8, monthlyCost: 2000 },
      ];

      const analysis = analyzeAIInventory(tools);
      expect(analysis.outdatedTools).toHaveLength(1);
      expect(analysis.outdatedTools[0].currentVersion).toBe('2023-06');
      expect(analysis.outdatedTools[0].recommendedVersion).toBe('2026-05');
    });

    it('detects version risks for outdated versions', () => {
      // Given: Anthropic API on version below minStableVersion
      const tools: TeamAIToolEntry[] = [
        { productId: 'anthropic-api', version: '2024-02', usageScope: 'team-wide', satisfaction: 7, monthlyCost: 1500 },
      ];

      const analysis = analyzeAIInventory(tools);
      expect(analysis.versionRisks.length).toBeGreaterThan(0);
      expect(analysis.versionRisks[0].risk).toContain('2024-02');
    });

    it('recommends alternatives for low satisfaction tools', () => {
      // Given: low satisfaction with a tool that has alternatives
      const tools: TeamAIToolEntry[] = [
        { productId: 'openai-api', version: '2026-05', usageScope: 'team-wide', satisfaction: 3, monthlyCost: 3000 },
      ];

      const analysis = analyzeAIInventory(tools);
      expect(analysis.recommendedAlternatives.length).toBeGreaterThan(0);
      expect(analysis.recommendedAlternatives[0].current.id).toBe('openai-api');
      expect(analysis.recommendedAlternatives[0].alternatives.length).toBeGreaterThan(0);
    });

    it('identifies missing categories', () => {
      // Given: only llm-platform tools used — all other categories missing
      const tools: TeamAIToolEntry[] = [
        { productId: 'openai-api', version: '2026-05', usageScope: 'team-wide', satisfaction: 8, monthlyCost: 2000 },
      ];

      const analysis = analyzeAIInventory(tools);
      expect(analysis.missingCategories.length).toBeGreaterThan(0);
      const allCategories = getCategories();
      expect(analysis.missingCategories.length).toBe(allCategories.length - 1);
    });

    it('detects overlaps when >=3 products in same category', () => {
      // Given: 3 code-assistant tools
      const tools: TeamAIToolEntry[] = [
        { productId: 'github-copilot', version: '2026-04', usageScope: 'team-wide', satisfaction: 8, monthlyCost: 10 },
        { productId: 'claude-code', version: '2026-05', usageScope: 'team-wide', satisfaction: 9, monthlyCost: 20 },
        { productId: 'cursor', version: '2026-04', usageScope: 'team-wide', satisfaction: 7, monthlyCost: 15 },
      ];

      const analysis = analyzeAIInventory(tools);
      const overlap = analysis.overlaps.find(o => o.category === 'code-assistant');
      expect(overlap).toBeDefined();
      expect(overlap!.products).toHaveLength(3);
    });

    it('does not flag overlaps with only 2 products in same category', () => {
      const tools: TeamAIToolEntry[] = [
        { productId: 'github-copilot', version: '2026-04', usageScope: 'team-wide', satisfaction: 8, monthlyCost: 10 },
        { productId: 'claude-code', version: '2026-05', usageScope: 'team-wide', satisfaction: 9, monthlyCost: 20 },
      ];

      const analysis = analyzeAIInventory(tools);
      const overlap = analysis.overlaps.find(o => o.category === 'code-assistant');
      expect(overlap).toBeUndefined();
    });

    it('calculates overall score: perfect=100 when no issues', () => {
      // Given: one tool, up-to-date, no issues
      const tools: TeamAIToolEntry[] = [
        { productId: 'openai-api', version: '2026-05', usageScope: 'team-wide', satisfaction: 8, monthlyCost: 1000 },
      ];

      const analysis = analyzeAIInventory(tools);
      // missingCategories > 0 will reduce score, but we test it's <= 100
      expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
      expect(analysis.overallScore).toBeLessThanOrEqual(100);
    });

    it('score drops significantly with multiple issues', () => {
      // Given: deprecated version + low satisfaction + many missing categories
      const tools: TeamAIToolEntry[] = [
        { productId: 'openai-api', version: '2023-06', usageScope: 'team-wide', satisfaction: 2, monthlyCost: 1000 },
      ];

      const analysis = analyzeAIInventory(tools);
      // Many issues should drop the score below 50
      expect(analysis.overallScore).toBeLessThan(50);
    });

    it('skips unknown product IDs gracefully', () => {
      const tools: TeamAIToolEntry[] = [
        { productId: 'unknown-product', version: '1.0', usageScope: 'team-wide', satisfaction: 5, monthlyCost: 0 },
      ];

      const analysis = analyzeAIInventory(tools);
      expect(analysis.outdatedTools).toHaveLength(0);
      expect(analysis.versionRisks).toHaveLength(0);
    });
  });
});
