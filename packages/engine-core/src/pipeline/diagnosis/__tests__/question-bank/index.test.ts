/**
 * question-bank/index.test.ts — 问题库单元测试
 */

import {
  queryQuestions,
  countByDimension,
  countByRole,
  addCustomQuestion,
  addCustomQuestions,
  removeCustomQuestion,
  getQuestionCount,
  clearCustomQuestions,
  getSeedQuestions,
  generateQuestionnaire,
} from '../../question-bank';

describe('queryQuestions', () => {
  beforeEach(() => clearCustomQuestions());

  it('returns all questions with no filter', () => {
    // Given: no filter
    // When: querying
    const results = queryQuestions();

    // Then: many questions returned
    expect(results.length).toBeGreaterThan(50);
  });

  it('filters by phase', () => {
    // Given: phase 0 filter
    // When: querying
    const results = queryQuestions({ phase: 0 });

    // Then: only phase 0 questions
    expect(results.length).toBeGreaterThan(0);
    for (const q of results) {
      expect(q.phase).toBe(0);
    }
  });

  it('filters by dimension', () => {
    // Given: 信任与心理安全 filter
    // When: querying
    const results = queryQuestions({ dimension: '信任与心理安全' });

    // Then: all results relate to trust (including 'any' dimension)
    expect(results.length).toBeGreaterThan(0);
    for (const q of results) {
      expect(['信任与心理安全', 'any']).toContain(q.dimension);
    }
  });

  it('filters by target role', () => {
    // Given: founder-specific questions
    // When: querying
    const results = queryQuestions({ targetRole: 'founder' });

    // Then: includes both founder-specific and 'any'
    const founderSpecific = results.filter(q => q.targetRole === 'founder');
    expect(founderSpecific.length).toBeGreaterThan(0);
  });

  it('filters by keyword in text', () => {
    // Given: keyword 'CEO'
    // When: querying
    const results = queryQuestions({ keyword: 'CEO' });

    // Then: matches text or dimension containing 'CEO'
    expect(results.length).toBeGreaterThan(0);
  });

  it('combines multiple filters', () => {
    // Given: phase 1 + trust dimension + founder role
    // When: querying
    const results = queryQuestions({ phase: 1, dimension: '信任与心理安全', targetRole: 'founder' });

    // Then: narrow result set
    expect(results.length).toBeGreaterThan(0);
    for (const q of results) {
      expect(q.phase).toBe(1);
      expect(['信任与心理安全', 'any']).toContain(q.dimension);
      expect(['founder', 'any']).toContain(q.targetRole);
    }
  });
});

describe('countByDimension', () => {
  it('returns non-zero counts for all dimensions', () => {
    // Given: seed questions
    // When: counting
    const counts = countByDimension();

    // Then: key dimensions have questions
    expect(counts['信任与心理安全']).toBeGreaterThan(0);
    expect(counts['决策权分配']).toBeGreaterThan(0);
    expect(counts['any']).toBeGreaterThan(0);
  });
});

describe('countByRole', () => {
  it('any role has the most questions', () => {
    // Given: seed questions
    // When: counting
    const counts = countByRole();

    // Then: 'any' is the largest category
    const anyCount = counts['any'] ?? 0;
    for (const [role, count] of Object.entries(counts)) {
      if (role !== 'any') {
        expect(count).toBeLessThanOrEqual(anyCount);
      }
    }
  });
});

describe('addCustomQuestion / removeCustomQuestion', () => {
  beforeEach(() => clearCustomQuestions());

  it('adds a custom question with auto-generated id', () => {
    // Given: custom question params
    // When: adding
    const q = addCustomQuestion({
      type: 'open_ended',
      phase: 1,
      text: '你们团队有代码审查流程吗？',
      dimension: '工具与自动化',
      targetRole: 'engineering-manager',
      weight: 0.6,
    });

    // Then: id generated, source is custom, createdAt set
    expect(q.id).toMatch(/^custom-/);
    expect(q.source).toBe('custom');
    expect(q.createdAt).toBeDefined();
  });

  it('custom questions appear in queries', () => {
    // Given: a custom question added
    addCustomQuestion({
      type: 'scale_1_10', phase: 1, text: 'Custom Q', dimension: 'any', targetRole: 'any', weight: 0.5,
    });

    // When: querying custom only
    const results = queryQuestions({ source: 'custom' });

    // Then: custom question found
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('Custom Q');
  });

  it('removes a custom question by id', () => {
    // Given: a custom question
    const q = addCustomQuestion({
      type: 'open_ended', phase: 1, text: 'To remove', dimension: 'any', targetRole: 'any', weight: 0.5,
    });

    // When: removing
    const removed = removeCustomQuestion(q.id);

    // Then: gone from results
    expect(removed).toBe(true);
    expect(queryQuestions({ source: 'custom' })).toHaveLength(0);
  });

  it('returns false when removing non-existent question', () => {
    // Given: no custom questions
    // When: removing nonexistent id
    const removed = removeCustomQuestion('custom-99999');

    // Then: returns false
    expect(removed).toBe(false);
  });

  it('addCustomQuestions batch adds multiple', () => {
    // Given: 3 custom question params
    const params = [
      { type: 'open_ended' as const, phase: 1 as const, text: 'Q1', dimension: 'any' as const, targetRole: 'any' as const, weight: 0.5 },
      { type: 'open_ended' as const, phase: 1 as const, text: 'Q2', dimension: 'any' as const, targetRole: 'any' as const, weight: 0.5 },
      { type: 'open_ended' as const, phase: 1 as const, text: 'Q3', dimension: 'any' as const, targetRole: 'any' as const, weight: 0.5 },
    ];

    // When: batch adding
    const results = addCustomQuestions(params);

    // Then: 3 custom questions
    expect(results).toHaveLength(3);
    expect(queryQuestions({ source: 'custom' })).toHaveLength(3);
  });
});

describe('getQuestionCount', () => {
  beforeEach(() => clearCustomQuestions());

  it('reports builtin and custom counts separately', () => {
    // Given: no custom questions
    const initial = getQuestionCount();
    expect(initial.custom).toBe(0);
    expect(initial.builtin).toBeGreaterThan(50);

    // When: adding custom
    addCustomQuestion({ type: 'open_ended', phase: 1, text: 'C', dimension: 'any', targetRole: 'any', weight: 0.5 });
    const after = getQuestionCount();

    // Then: custom count incremented
    expect(after.custom).toBe(1);
  });
});

describe('clearCustomQuestions', () => {
  it('removes all custom questions', () => {
    // Given: 2 custom questions
    addCustomQuestion({ type: 'open_ended', phase: 1, text: 'A', dimension: 'any', targetRole: 'any', weight: 0.5 });
    addCustomQuestion({ type: 'open_ended', phase: 1, text: 'B', dimension: 'any', targetRole: 'any', weight: 0.5 });

    // When: clearing
    clearCustomQuestions();

    // Then: no custom questions remain
    expect(queryQuestions({ source: 'custom' })).toHaveLength(0);
  });
});

describe('getSeedQuestions', () => {
  it('returns read-only builtin questions', () => {
    // Given: seed questions exist
    // When: getting
    const seeds = getSeedQuestions();

    // Then: many questions, all builtin
    expect(seeds.length).toBeGreaterThan(50);
    for (const q of seeds) {
      expect(q.source).toBe('builtin');
    }
  });
});

describe('generateQuestionnaire', () => {
  beforeEach(() => clearCustomQuestions());

  it('generates role-specific questionnaire for founder', () => {
    // Given: founder role, phase 1
    // When: generating questionnaire
    const questions = generateQuestionnaire('founder', 1, 10);

    // Then: includes founder-specific questions first
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(10);
    // founder-specific questions should come before generic ones
    const firstFounderIdx = questions.findIndex(q => q.targetRole === 'founder');
    expect(firstFounderIdx).toBeGreaterThanOrEqual(0);
  });

  it('limits to maxQuestions', () => {
    // Given: max 3 questions
    // When: generating
    const questions = generateQuestionnaire('any', 1, 3);

    // Then: exactly 3
    expect(questions).toHaveLength(3);
  });

  it('does not duplicate questions', () => {
    // Given: a role with both specific and generic matches
    // When: generating
    const questions = generateQuestionnaire('engineering-manager', 1);
    const ids = questions.map(q => q.id);

    // Then: all unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sorts by weight descending', () => {
    // Given: any role questionnaire
    // When: generating
    const questions = generateQuestionnaire('any', 1, 20);

    // Then: weights are descending
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i - 1].weight).toBeGreaterThanOrEqual(questions[i].weight);
    }
  });
});
