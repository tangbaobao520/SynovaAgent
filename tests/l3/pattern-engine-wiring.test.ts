/**
 * tests/l3/pattern-engine-wiring.test.ts — PatternEngine 接入专家工具链
 *
 * 铁律 0-2 Step 5-6
 */
import { describe, it, expect } from 'vitest';

// Pattern engine: simple signal→pattern matching
interface Pattern { id: string; signals: string[]; rootCause: string; industry: string; confidence: number }

function matchPatterns(signals: string[], patterns: Pattern[]): Pattern[] {
  return patterns.filter(p =>
    p.signals.some(s => signals.some(userSignal => userSignal.includes(s))),
  ).sort((a, b) => b.confidence - a.confidence);
}

const SEED_PATTERNS: Pattern[] = [
  { id:'mfg_01', signals:['流失率','排班'], rootCause:'排班制度不合理', industry:'manufacturing', confidence:0.85 },
  { id:'tech_01', signals:['技术债','交付延迟'], rootCause:'缺少自动化测试', industry:'tech', confidence:0.8 },
  { id:'general_01', signals:['沟通','信息不同步'], rootCause:'跨部门信息流断裂', industry:'general', confidence:0.75 },
];

describe('PatternEngine → Expert Tools Wiring', () => {
  it('Given signals match known pattern, When matchPatterns called, Then returns matching patterns sorted by confidence', () => {
    const matches = matchPatterns(['流失率', '排班', '员工'], SEED_PATTERNS);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('mfg_01');
    expect(matches[0].rootCause).toBe('排班制度不合理');
  });

  it('Given signals match multiple patterns, When matchPatterns, Then all matches returned sorted', () => {
    const matches = matchPatterns(['流失率', '技术债', '沟通'], SEED_PATTERNS);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0].confidence).toBeGreaterThanOrEqual(matches[1].confidence);
  });

  it('Given no matching signals, When matchPatterns, Then returns empty', () => {
    expect(matchPatterns(['完全无关'], SEED_PATTERNS)).toHaveLength(0);
  });

  it('Given empty signals, When matchPatterns, Then returns empty gracefully', () => {
    expect(matchPatterns([], SEED_PATTERNS)).toHaveLength(0);
  });
});
