/**
 * document-pipeline.test.ts — 文档分析管线测试
 * P2-19: Given/When/Then 模式
 */
import {
  discoverDocuments,
  extractSignals,
  buildLLMRefinePrompt,
  parseLLMSignals,
  mapSignalsToEvidence,
  runDocumentPipeline,
  enqueueDocument,
  getDocumentQueueLength,
  clearDocumentQueue,
  type DocumentMeta,
} from '../document-pipeline';

// ====================================================================
// Test Data
// ====================================================================

const SOUL_MD = {
  path: 'docs/SOUL.md',
  preview: '我们的使命是让每个团队都能高效协作。团队目标：2026年实现全流程自动化。作者：张总。团队：星辰科技核心组。',
  content: '我们的使命是让每个团队都能高效协作。团队目标：2026年实现全流程自动化。决策流程需要经过三级审批，信息传递依赖每周例会。团队内部出现甩锅现象，返工率超过30%。作者：张总。团队：星辰科技核心组。',
};

const POSTMORTEM = {
  path: 'docs/postmortem-20260515.md',
  preview: '事故复盘：5月15日核心服务宕机3小时。故障原因：部署流程缺少审批环节。影响：200+ 客户受影响。复盘人：李副总。',
  content: '事故复盘：5月15日核心服务宕机3小时。故障原因：部署流程缺少审批环节，开发直接推送生产。知识库更新不及时导致值班工程师不知道回滚步骤。影响：200+ 客户受影响。复盘人：李副总。',
};

const MEETING_NOTES = {
  path: 'weekly/2026-W21.md',
  preview: '周报：本周讨论了3次还没结论的项目优先级问题。跨部门资源协调困难。',
  content: '周报：本周讨论了3次还没结论的项目优先级问题。跨部门资源协调困难。OKR目标完成度60%，低于预期。',
};

const IRRELEVANT = {
  path: 'random/lunch-menu.md',
  preview: '本周午餐菜单：周一红烧肉，周二清蒸鱼。',
  content: '本周午餐菜单：周一红烧肉，周二清蒸鱼。',
};

// ====================================================================
// Layer 1: Document Discovery
// ====================================================================

describe('discoverDocuments — Layer 1', () => {
  it('classifies SOUL.md as team_charter P0', () => {
    const results = discoverDocuments([SOUL_MD]);
    expect(results[0].docType).toBe('team_charter');
    expect(results[0].priority).toBe('P0');
    expect(results[0].relevanceScore).toBeGreaterThan(0.7);
  });

  it('classifies postmortem as P0', () => {
    const results = discoverDocuments([POSTMORTEM]);
    expect(results[0].docType).toBe('postmortem');
    expect(results[0].priority).toBe('P0');
  });

  it('classifies meeting notes as P1', () => {
    const results = discoverDocuments([MEETING_NOTES]);
    expect(results[0].docType).toBe('meeting_notes');
    expect(results[0].priority).toBe('P1');
  });

  it('classifies unknown documents as P3', () => {
    const results = discoverDocuments([IRRELEVANT]);
    expect(results[0].docType).toBe('unknown');
    expect(results[0].priority).toBe('P3');
    expect(results[0].relevanceScore).toBeLessThan(0.3);
  });

  it('boosts relevance for documents with incident keywords', () => {
    const withIncident = { path: 'report.md', preview: '本次故障导致数据泄露，影响严重' };
    const withoutIncident = { path: 'report.md', preview: '普通周报内容' };
    const results = discoverDocuments([withIncident, withoutIncident]);
    expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore);
  });

  it('sorts by priority then relevance', () => {
    const results = discoverDocuments([IRRELEVANT, SOUL_MD, MEETING_NOTES, POSTMORTEM]);
    expect(results[0].priority).toBe('P0');
    expect(results[1].priority).toBe('P0');
    expect(results[2].priority).toBe('P1');
    expect(results[3].priority).toBe('P3');
  });

  it('extracts author and team from preview', () => {
    const results = discoverDocuments([SOUL_MD]);
    expect(results[0].extractedAuthor).toBe('张总');
    expect(results[0].extractedTeam).toBe('星辰科技核心组');
  });

  it('extracts ISO date when present', () => {
    const results = discoverDocuments([{ path: 'report.md', preview: '创建日期：2026-05-15，作者：测试' }]);
    expect(results[0].extractedDate).toBe('2026-05-15');
  });
});

// ====================================================================
// Layer 2: Signal Extraction
// ====================================================================

describe('extractSignals — Layer 2', () => {
  const meta: DocumentMeta = {
    path: 'test.md', filename: 'test.md', docType: 'team_charter',
    priority: 'P0', relevanceScore: 0.9, wordCount: 200,
  };

  it('extracts decision_making signals from decision keywords', () => {
    const signals = extractSignals(meta, '每次发布都需要三级审批，决策速度太慢');
    const decision = signals.filter(s => s.gapDimension === 'decision_making');
    expect(decision.length).toBeGreaterThan(0);
    expect(decision[0].keywords).toContain('审批');
  });

  it('extracts trust_level signals from blame keywords', () => {
    const signals = extractSignals(meta, '团队内部出现甩锅现象，互不信任，出了问题就指责对方');
    const trust = signals.filter(s => s.gapDimension === 'trust_level');
    expect(trust.length).toBeGreaterThan(0);
  });

  it('extracts multiple dimensions from one document', () => {
    const signals = extractSignals(meta, SOUL_MD.content);
    const dimensions = [...new Set(signals.map(s => s.gapDimension))];
    expect(dimensions.length).toBeGreaterThan(1);
  });

  it('deduplicates signals to max 3 per dimension', () => {
    const text = '决策 审批 授权 决策 审批 授权 决策 审批 授权 决策 审批 授权 '.repeat(10);
    const signals = extractSignals(meta, text);
    const decisionSignals = signals.filter(s => s.gapDimension === 'decision_making');
    expect(decisionSignals.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for text with no diagnostic keywords', () => {
    const signals = extractSignals(meta, '今天天气很好，适合出去散步');
    expect(signals).toHaveLength(0);
  });

  it('handles short text (less than chunk size)', () => {
    const signals = extractSignals(meta, '审批卡了2天');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].extractionMethod).toBe('keyword_match');
  });
});

// ====================================================================
// Layer 2b: LLM Refine
// ====================================================================

describe('LLM Signal Refinement', () => {
  it('buildLLMRefinePrompt includes doc type and analysis dimensions', () => {
    const prompt = buildLLMRefinePrompt('测试文档片段', 'postmortem');
    expect(prompt).toContain('postmortem');
    expect(prompt).toContain('决策模式');
    expect(prompt).toContain('信息流动');
    expect(prompt).toContain('JSON 数组');
  });

  it('parseLLMSignals parses valid JSON array', () => {
    const output = '[{"signal": "决策权过度集中", "dimension": "decision_making", "confidence": 0.8, "evidence": "所有审批需要CEO签字"}]';
    const signals = parseLLMSignals(output, 'test.md', 0);
    expect(signals).toHaveLength(1);
    expect(signals[0].extractionMethod).toBe('llm_inferred');
    expect(signals[0].gapDimension).toBe('decision_making');
    expect(signals[0].confidence).toBe(0.8);
  });

  it('parseLLMSignals returns empty on malformed JSON', () => {
    expect(parseLLMSignals('not json', 'test.md', 0)).toHaveLength(0);
  });

  it('parseLLMSignals returns empty on empty array', () => {
    expect(parseLLMSignals('[]', 'test.md', 0)).toHaveLength(0);
  });

  it('parseLLMSignals clamps confidence to valid range', () => {
    const output = '[{"signal": "test", "dimension": "trust_level", "confidence": 2.5, "evidence": "x"}]';
    const signals = parseLLMSignals(output, 'test.md', 0);
    expect(signals[0].confidence).toBeLessThanOrEqual(0.95);
  });
});

// ====================================================================
// Layer 3: Signal Mapping
// ====================================================================

describe('mapSignalsToEvidence — Layer 3', () => {
  it('maps signals to DiagnosisEvidence format', () => {
    const signals = extractSignals(
      { path: 't.md', filename: 't.md', docType: 'postmortem', priority: 'P0', relevanceScore: 0.9, wordCount: 100 },
      '审批流程太长导致决策延迟',
    );
    const evidence = mapSignalsToEvidence(signals, 'team-1');
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].source).toBe('document');
    expect(evidence[0].moduleId).toBe('document-pipeline');
    expect(evidence[0].phase).toBe(1);
  });

  it('deduplicates similar evidence by dimension+content', () => {
    const signals = extractSignals(
      { path: 't.md', filename: 't.md', docType: 'postmortem', priority: 'P0', relevanceScore: 0.9, wordCount: 100 },
      '审批审批审批审批 决策决策决策决策',
    );
    const evidence = mapSignalsToEvidence(signals, 'team-1');
    const uniqueDims = [...new Set(evidence.map(e => e.dimension))];
    expect(uniqueDims.length).toBeLessThanOrEqual(evidence.length);
  });
});

// ====================================================================
// Full Pipeline
// ====================================================================

describe('runDocumentPipeline — Full Pipeline', () => {
  it('runs complete Layer 1→2→3 pipeline', () => {
    const result = runDocumentPipeline(
      [SOUL_MD, POSTMORTEM, MEETING_NOTES, IRRELEVANT],
      'team-test',
    );
    expect(result.meta).toHaveLength(4);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.queueStatus.phase).toBe('complete');
  });

  it('handles files without content gracefully', () => {
    const result = runDocumentPipeline(
      [{ path: 'empty.md', preview: '只有预览，无正文' }],
      'team-test',
    );
    expect(result.meta).toHaveLength(1);
    expect(result.signals).toHaveLength(0);
  });

  it('reports correct queue status', () => {
    const result = runDocumentPipeline([SOUL_MD], 'team-test');
    expect(result.queueStatus.totalDocuments).toBe(1);
    expect(result.queueStatus.signalsExtracted).toBeGreaterThan(0);
  });
});

// ====================================================================
// Async Queue
// ====================================================================

describe('Document Queue', () => {
  beforeEach(() => clearDocumentQueue());

  it('enqueues documents for async processing', () => {
    enqueueDocument('doc1.md', 'content', 'team-1');
    enqueueDocument('doc2.md', 'content', 'team-1');
    expect(getDocumentQueueLength()).toBe(2);
  });

  it('clearDocumentQueue empties the queue', () => {
    enqueueDocument('doc1.md', 'content', 'team-1');
    clearDocumentQueue();
    expect(getDocumentQueueLength()).toBe(0);
  });
});
