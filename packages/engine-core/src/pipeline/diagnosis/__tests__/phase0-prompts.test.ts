/**
 * phase0-prompts.test.ts — Phase 0 双入口+信任三步测试
 */
import {
  createPhase0State,
  detectEntryMode,
  canAdvanceToPhase1,
  extractPhase0Info,
  advancePhase0Round,
  buildGreetingPrompt,
  buildQuickStartPrompt,
} from '../phase0-prompts';

// ====================================================================
// Entry Detection
// ====================================================================

describe('detectEntryMode', () => {
  it('returns quick_start for URL param', () => {
    const result = detectEntryMode({ urlParams: { quick_start: 'true' } });
    expect(result.mode).toBe('quick_start');
  });

  it('returns quick_start for referrer', () => {
    const result = detectEntryMode({ referrer: 'craftsman_001' });
    expect(result.mode).toBe('quick_start');
  });

  it('returns quick_start for recent diagnosis (< 90 days)', () => {
    const result = detectEntryMode({ hasHistory: true, daysSinceLastDiagnosis: 30 });
    expect(result.mode).toBe('quick_start');
  });

  it('returns conversation for old diagnosis (> 90 days)', () => {
    const result = detectEntryMode({ hasHistory: true, daysSinceLastDiagnosis: 120 });
    expect(result.mode).toBe('conversation');
  });

  it('returns conversation for new user with no params', () => {
    const result = detectEntryMode({});
    expect(result.mode).toBe('conversation');
  });
});

// ====================================================================
// Phase0State
// ====================================================================

describe('createPhase0State', () => {
  it('creates conversation mode state by default', () => {
    const state = createPhase0State();
    expect(state.entryMode).toBe('conversation');
    expect(state.trustEstablished).toBe(false);
    expect(state.round).toBe('greeting');
    expect(state.completed).toBe(false);
  });

  it('creates quick_start mode with trust established', () => {
    const state = createPhase0State('quick_start');
    expect(state.entryMode).toBe('quick_start');
    expect(state.trustEstablished).toBe(true);
  });
});

// ====================================================================
// Gate Check
// ====================================================================

describe('canAdvanceToPhase1', () => {
  it('blocks empty state', () => {
    const state = createPhase0State();
    const result = canAdvanceToPhase1(state);
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('quick_start requires fewer messages', () => {
    const state = createPhase0State('quick_start');
    state.concernedDimensions = ['information_flow', 'trust_level'];
    state.depth = 'standard';
    state.messages = [{ role: 'agent', content: '欢迎回来' }, { role: 'user', content: '确认' }];
    const result = canAdvanceToPhase1(state);
    expect(result.canAdvance).toBe(true);
  });

  it('conversation requires more messages', () => {
    const state = createPhase0State('conversation');
    state.concernedDimensions = ['information_flow', 'trust_level'];
    state.depth = 'standard';
    state.messages = [{ role: 'agent', content: 'hi' }, { role: 'user', content: 'hi' }];
    const result = canAdvanceToPhase1(state);
    expect(result.canAdvance).toBe(false); // needs 6 messages
  });
});

// ====================================================================
// Info Extraction
// ====================================================================

describe('extractPhase0Info', () => {
  it('extracts org name', () => {
    const state = createPhase0State();
    const updates = extractPhase0Info(state, '我们公司叫星辰科技');
    expect(updates.orgName).toBe('星辰科技');
  });

  it('extracts team size', () => {
    const state = createPhase0State();
    const updates = extractPhase0Info(state, '团队大概80人');
    expect(updates.teamSize).toContain('80');
  });

  it('detects depth preference', () => {
    const state = createPhase0State();
    expect(extractPhase0Info(state, '快速试试看').depth).toBe('quick');
    expect(extractPhase0Info(state, '做深度诊断').depth).toBe('deep');
    expect(extractPhase0Info(state, '标准就行').depth).toBe('standard');
  });

  it('detects multi-role interview intent', () => {
    const state = createPhase0State();
    const updates = extractPhase0Info(state, '可以访谈一下其他人');
    expect(updates.enableMultiRole).toBe(true);
  });
});

// ====================================================================
// Round Advancement
// ====================================================================

describe('advancePhase0Round', () => {
  it('advances through all rounds', () => {
    const state = createPhase0State();
    expect(state.round).toBe('greeting');

    const s2 = advancePhase0Round(state);
    expect(s2.round).toBe('discovery');

    const s3 = advancePhase0Round(s2);
    expect(s3.round).toBe('scoping');

    const s4 = advancePhase0Round(s3);
    expect(s4.round).toBe('wrap_up');
  });

  it('wrap_up stays at wrap_up', () => {
    const state = createPhase0State();
    state.round = 'wrap_up';
    const next = advancePhase0Round(state);
    expect(next.round).toBe('wrap_up');
  });
});

// ====================================================================
// Prompt Generation (sanity checks)
// ====================================================================

describe('buildGreetingPrompt', () => {
  it('generates non-empty prompt', () => {
    const prompt = buildGreetingPrompt();
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain('Synova');
  });

  it('includes user name when provided', () => {
    const prompt = buildGreetingPrompt('张总');
    expect(prompt).toContain('张总');
  });
});

describe('buildQuickStartPrompt', () => {
  it('generates quick-start prompt with org name', () => {
    const state = createPhase0State('quick_start');
    state.orgName = '星辰科技';
    const prompt = buildQuickStartPrompt(state);
    // The prompt includes the full system prompt (template), so length is expectedly large
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain('星辰科技');
    expect(prompt).toContain('快速启动');
  });

  it('includes referrer note when present', () => {
    const state = createPhase0State('quick_start');
    state.referrer = '王老师';
    state.referrerNote = '扩团队，信息流重点关注';
    const prompt = buildQuickStartPrompt(state);
    expect(prompt).toContain('王老师');
  });
});
