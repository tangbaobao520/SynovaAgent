/**
 * tests/agent/report-onepager-trace.test.ts — D791 溯源指针 + 一页纸四槽位渲染（铁律 33: *.test.ts = 单元）
 *
 * 覆盖（spec §7 L1 对照表）:
 *   ① 四槽位齐备（带 inputs）    ② 指针覆盖审计 0 缺口    ③ 三态解析审计（4 kind）
 *   ④ inputs 缺席 → [degraded]   ⑤ registry 抛错 → D480 fallback
 *   ⑥ 解析器抛错 → unknown 不 fail-open                   ⑦ 确定性（与渲染时钟无关）
 *   ⑧ 篇幅/单行/结论三约束（超限 → 布尔位 false）          ⑪ 槽位标题字面双源一致
 *   + 指针文法边界（重复去重 / 越界 index / 未知 kind / 空 ref / stripPointers）
 *
 * 测试文件切分说明（D791，控文件数 ≤ D734 上限 12）：pre-commit 组 2 要求新增 src/ 文件配对
 * 同名测试（`src/agent/report-onepager-trace.ts` → 本文件、`src/agent/cycle-conclusion-service.ts`
 * → `tests/agent/cycle-conclusion-service.test.ts`），故一页纸 L1 用例按**被测模块**切两处，
 * 本文件 = 指针面 + 渲染结构面；循环派生面见 cycle-conclusion-service.test.ts。
 *
 * 断言约定（同 D480）: 全部用无 emoji 子串；降级标记一律 ASCII `[degraded]`
 * （D480 既有用例断言正常路径 not.toContain('降级')，中文标记会误伤）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  renderOnePager,
  auditOnePagerReadability,
  buildEvidenceHighlights,
  assembleOnePagerInputs,
  type OnePagerInputs,
} from '../../src/agent/report-assembler';
import {
  auditConclusionCoverage,
  buildReportPointer,
  collectSlotLines,
  resolvePointers,
  stripPointers,
  ONEPAGER_SLOT_TITLES,
} from '../../src/agent/report-onepager-trace';
import { EXECUTIVE_SUMMARY_SLOT_TITLES, getReportTemplateRegistry, ReportTemplateRegistry } from '../../src/l3/report-templates';
import { buildCycleConclusions } from '../../src/agent/cycle-conclusion-service';
import { CycleRegistry } from '../../src/cycles/cycle-registry';
import type { CycleConfig } from '../../src/cycles/cycle-types';
import type { DiagnosisReport } from '../../src/l3/synova-diagnosis-engine';

// ═══ Fixtures ═══

function makeReport(overrides?: Partial<DiagnosisReport>): DiagnosisReport {
  return {
    reportId: 'rpt-d791-001',
    teamId: 'd791-org',
    generatedAt: '2026-09-17T00:00:00.000Z',
    summary: '现金流缺口与人才密度双重制约增长。',
    expertReports: [
      { expert: 'finance', findings: ['经营现金流连续 3 季度为负'], confidence: 0.8 },
    ],
    rootCauses: [
      { description: '现金流缺口扩大：经营现金流连续 3 季度为负', dimension: 'financial', confidence: 0.82 },
      { description: '核心人才密度不足', dimension: 'talent', confidence: 0.71 },
    ],
    recommendations: [
      { action: '压缩非核心固定成本 20%', priority: 'critical', expert: 'finance' },
      { action: '建立关键岗位继任计划', priority: 'high', expert: 'org' },
    ],
    raw: {},
    ...overrides,
  };
}

function makeCycle(cycleId: string, name: string): CycleConfig {
  return {
    cycleId,
    name,
    description: '',
    version: '1.0',
    applicableIndustries: [],
    nodes: [],
    edges: [],
    overflowFormula: { condition: '', targetNode: '', formula: '', minDataMaturity: 'low' },
    dataMaturity: 'low',
    mapping: [],
    crossCyclePropagation: [],
  };
}

function makeRegistry(pairs: ReadonlyArray<readonly [string, string]>): CycleRegistry {
  const registry = new CycleRegistry();
  for (const [cycleId, name] of pairs) registry.register(makeCycle(cycleId, name));
  return registry;
}

const THREE_CYCLES: ReadonlyArray<readonly [string, string]> = [
  ['customer-cycle', '客户循环'],
  ['cash-cycle', '现金流循环'],
  ['talent-cycle', '人才循环'],
];

/** 用真实 L2 派生服务构造 S2/S3 inputs（store=null → 全量「未建立基线」行，registry 驱动） */
async function makeInputs(registry: CycleRegistry, orgId = 'd791-org'): Promise<OnePagerInputs> {
  const conclusions = await buildCycleConclusions(orgId, null, registry);
  return assembleOnePagerInputs(
    [{ sentinelId: 'cash-runway', summary: '现金跑道不足 6 个月', confidence: 0.8, checkedAt: '2026-09-16T10:00:00.000Z' }],
    conclusions.lines.map(line => line.text),
  );
}

/**
 * 从渲染产物中提取某槽位的条目行（只取该槽位段——遇下一个标题/footer 即停）。
 * 独立实现（不调用被测的 collectSlotLines），避免"用被测代码验证被测代码"。
 */
function slotItems(markdown: string, title: string): string[] {
  const out: string[] = [];
  let inSlot = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === title) { inSlot = true; continue; }
    if (!inSlot) continue;
    if (line.startsWith('#') || line.startsWith('📎')) break;
    if (line.startsWith('- ')) out.push(line);
  }
  return out;
}

afterEach(() => {
  // 还原 singleton（构造器自动重注册全部 built-ins——文件内 singleton 跨用例持久）
  getReportTemplateRegistry(new ReportTemplateRegistry());
});

// ═══ ① 四槽位齐备 ═══

describe('D791: 一页纸结论先行四槽位（渲染结构面）', () => {
  it('① 带 inputs → 四槽位标题字面齐备；S3 行数 = registry 长度且每行带 [src:cycle: 指针', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const md = renderOnePager(makeReport(), 'ceo', await makeInputs(registry));

    for (const title of ONEPAGER_SLOT_TITLES) expect(md).toContain(title);

    const s3Lines = slotItems(md, '### 各维度循环结论');
    expect(s3Lines).toHaveLength(THREE_CYCLES.length);
    for (const line of s3Lines) expect(line).toContain('[src:cycle:');
    for (const [, name] of THREE_CYCLES) expect(md).toContain(name);
  });

  it('⑪ 模板槽位标题常量与审计模块 ONEPAGER_SLOT_TITLES 字面一致（双源防漂移）', () => {
    expect([...EXECUTIVE_SUMMARY_SLOT_TITLES]).toEqual([...ONEPAGER_SLOT_TITLES]);
  });

  it('② 覆盖审计：missingPointerLines === 0 且 conclusionLines ≥ 4（R1 条条带指针）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const md = renderOnePager(makeReport(), 'ceo', await makeInputs(registry));
    const coverage = auditConclusionCoverage(md);

    expect(coverage.degraded).toBe(false);
    expect(coverage.missingPointerLines).toBe(0);
    expect(coverage.conclusionLines).toBeGreaterThanOrEqual(4);
    expect(coverage.linesWithPointer).toBe(coverage.conclusionLines);
    // collectSlotLines 是同一解析单源（覆盖审计与可读性审计共用）
    expect(collectSlotLines(md).length).toBeGreaterThanOrEqual(coverage.conclusionLines);
  });

  it('④ inputs 缺席 → S2/S3 渲染 [degraded] 空态行且不抛出（whole-body 契约）', () => {
    const md = renderOnePager(makeReport(), 'ceo');

    expect(md).toContain('### 关键证据');
    expect(md).toContain('### 各维度循环结论');
    expect(md).toContain('[degraded]');
    const coverage = auditConclusionCoverage(md);
    expect(coverage.missingPointerLines).toBe(0);
    expect(coverage.degraded).toBe(false);
    expect(md).not.toContain('降级'); // 正常路径不得出现中文「降级」（D480 既有断言语义）
  });

  it('⑤ registry.render 抛错 → D480 纯文本 fallback（含降级标记 + 核心瓶颈），不抛出', () => {
    class ThrowingRegistry extends ReportTemplateRegistry {
      render(): string {
        throw new Error('mock: registry.render 爆炸');
      }
    }
    getReportTemplateRegistry(new ThrowingRegistry());
    const md = renderOnePager(makeReport(), 'ceo', { cycleConclusions: ['x'], evidenceHighlights: ['y'] });

    expect(md).toContain('降级');
    expect(md).toContain('核心瓶颈');
    expect(md).not.toContain('### 各维度循环结论');
  });

  it('⑦ 确定性：同输入两次渲染字节相等 + 跨两个不同系统时刻渲染字节仍相等（禁渲染时刻）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const inputs = await makeInputs(registry);

    const first = renderOnePager(makeReport(), 'ceo', inputs);
    expect(renderOnePager(makeReport(), 'ceo', inputs)).toBe(first);

    // 强证明: 渲染时刻推进 1.5 年，产物必须逐字节不变（任何 new Date()/Date.now() 进正文即红）
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const at2030 = renderOnePager(makeReport(), 'ceo', inputs);
      vi.setSystemTime(new Date('2031-06-06T12:34:56.000Z'));
      const at2031 = renderOnePager(makeReport(), 'ceo', inputs);
      expect(at2030).toBe(first);
      expect(at2031).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('⑧ 超限输入 → budgetOk / maxLineOk / conclusionCharsOk 三布尔位均为 false（不 fail-open）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const inputs = await makeInputs(registry);

    const longLine = renderOnePager(makeReport(), 'ceo', { ...inputs, cycleConclusions: ['超' + '长'.repeat(80) + ' [src:cycle:x@none]'] });
    expect(auditOnePagerReadability(longLine).maxLineOk).toBe(false);

    // flywheel 深度的 recommendations[0] = 原始建议，不受 assembleCeo 200 截断保护
    const longConclusion = renderOnePager(
      makeReport({ recommendations: [{ action: '建'.repeat(300), priority: 'high', expert: 'org' }] }),
      'flywheel',
      inputs,
    );
    const conclusionMetrics = auditOnePagerReadability(longConclusion);
    expect(conclusionMetrics.conclusionCharsOk).toBe(false);
    expect(conclusionMetrics.conclusionChars).toBeGreaterThan(200);

    const bulk = Array.from({ length: 6 }, (_, i) => `循环${i}：${'溢'.repeat(180)} [src:cycle:c${i}@none]`);
    const overBudget = renderOnePager(makeReport(), 'ceo', { ...inputs, cycleConclusions: bulk });
    expect(auditOnePagerReadability(overBudget).budgetOk).toBe(false);

    // 对照组（防"恒 false"假绿）
    const ok = auditOnePagerReadability(renderOnePager(makeReport(), 'ceo', inputs));
    expect(ok.budgetOk).toBe(true);
    expect(ok.maxLineOk).toBe(true);
    expect(ok.conclusionCharsOk).toBe(true);
    expect(ok.slotsOk).toBe(true);
    expect(ok.slotCount).toBe(4);
  });

  it('边界: 非字符串输入 → 审计工具全 false/空 + degraded（不抛、不 fail-open）', () => {
    const readability = auditOnePagerReadability(undefined);
    expect(readability.degraded).toBe(true);
    expect(readability.budgetOk).toBe(false);
    expect(readability.maxLineOk).toBe(false);
    expect(readability.conclusionCharsOk).toBe(false);
    expect(readability.slotsOk).toBe(false);

    const coverage = auditConclusionCoverage(null);
    expect(coverage.degraded).toBe(true);
    expect(coverage.conclusionLines).toBe(0);
    expect(collectSlotLines(null)).toEqual([]);
    expect(resolvePointers(undefined, {}).degraded).toBe(true);
  });
});

// ═══ ③ 三态解析审计 ═══

describe('D791: 结论溯源指针（文法 / 覆盖 / 三态解析）', () => {
  it('③ 解析审计：4 kind 全 resolved + externalResolvableCount ≥ 1（支柱② 判据）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const md = renderOnePager(makeReport(), 'ceo', await makeInputs(registry));

    const text = [
      '- 结论 [src:report:rpt-d791-001#summary]',
      '- 循环 [src:cycle:customer-cycle@2026-08]',
      '- 证据 [src:finding:cash-runway@2026-09-16T10:00:00.000Z]',
      '- 证据池 [src:evidence:ev-1]',
    ].join('\n');
    const all = resolvePointers(text, {
      report: () => true,
      cycle: () => true,
      finding: () => true,
      evidence: () => true,
    });
    expect(all.total).toBe(4);
    expect(all.resolvedCount).toBe(4);
    expect(all.unresolvedCount).toBe(0);
    expect(all.unknownCount).toBe(0);
    // report 指向报告自身；cycle/finding/evidence = 报告之外的物理记录
    expect(all.externalResolvableCount).toBe(3);

    const real = resolvePointers(md, {
      report: (_kind, ref) => ref.startsWith('rpt-d791-001#'),
      cycle: (_kind, ref) => ref.endsWith('@none'),
      finding: (_kind, ref) => ref === 'cash-runway@2026-09-16T10:00:00.000Z',
    });
    expect(real.unresolvedCount).toBe(0);
    expect(real.unknownCount).toBe(0);
    expect(real.externalResolvableCount).toBeGreaterThanOrEqual(1);
  });

  it('⑥ 解析器抛错 / 缺席 → 计 unknown 而非 resolved（"判不了" ≠ "判过了"）', () => {
    const text = '- a [src:report:r1#summary]\n- b [src:cycle:c1@2026-08]';

    const throwing = resolvePointers(text, {
      report: () => { throw new Error('mock: 解析器爆炸'); },
    });
    expect(throwing.unknownCount).toBe(2); // report 抛错 + cycle 无解析器
    expect(throwing.resolvedCount).toBe(0);
    expect(throwing.unresolvedCount).toBe(0);
    expect(throwing.degraded).toBe(true);
    expect(throwing.externalResolvableCount).toBe(0);

    const absent = resolvePointers(text, null);
    expect(absent.unknownCount).toBe(2);
    expect(absent.resolvedCount).toBe(0);

    // 解析器可用但目标不存在 → unresolved（编造/漂移指纹），与 unknown 严格区分
    const unresolved = resolvePointers(text, { report: () => false, cycle: () => false });
    expect(unresolved.unresolvedCount).toBe(2);
    expect(unresolved.unknownCount).toBe(0);
    expect(unresolved.degraded).toBe(false);
  });

  it('边界: 重复指针去重 / 越界 index 计 unresolved / 未知 kind 不匹配 / stripPointers 剥离', () => {
    const duplicated = '- a [src:report:r1#summary] 与 [src:report:r1#summary]';
    expect(resolvePointers(duplicated, { report: () => true }).total).toBe(1);

    const outOfRange = resolvePointers('- a [src:report:r1#recommendation:99]', {
      report: (_kind, ref) => ref === 'r1#recommendation:0',
    });
    expect(outOfRange.unresolvedCount).toBe(1);
    expect(outOfRange.resolvedCount).toBe(0);

    // 未注册 kind（正则白名单外）连匹配都不发生——不产生 phantom 指针
    expect(resolvePointers('- a [src:unknownkind:x]', {}).total).toBe(0);
    expect(resolvePointers('- a [src:cycle:]', {}).total).toBe(0); // ref 为空 → 不匹配

    expect(stripPointers('客户循环：溢出 -12.5万元 [src:cycle:c@none]')).toBe('客户循环：溢出 -12.5万元');
    expect(buildReportPointer('cycle', 'c1@2026-08')).toBe('[src:cycle:c1@2026-08]');
    expect(buildReportPointer('report', 'r1#summary')).toBe('[src:report:r1#summary]');
  });

  it('边界: buildEvidenceHighlights / assembleOnePagerInputs 字段缺失 → 跳过（不编造）且「空即缺席」', () => {
    expect(buildEvidenceHighlights(null)).toEqual([]);
    const mixed = buildEvidenceHighlights([
      { sentinelId: 'ok-1', summary: '现金跑道不足 6 个月', confidence: 0.8, checkedAt: '2026-09-16T10:00:00.000Z' },
      { sentinelId: 'bad-1', summary: '', confidence: 0.8, checkedAt: '2026-09-16T10:00:00.000Z' },
      { sentinelId: 'bad-2', summary: '有摘要无时间', confidence: 0.8, checkedAt: '' },
    ]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toContain('[src:finding:ok-1@2026-09-16T10:00:00.000Z]');

    // 空来源 → 字段缺席（模板走"入参缺席"文案而非"有源但为空"文案——两处语义不同）
    expect(assembleOnePagerInputs([], [])).toEqual({});
    expect(assembleOnePagerInputs(null, ['行 [src:cycle:c@none]']).cycleConclusions).toEqual(['行 [src:cycle:c@none]']);
  });
});
