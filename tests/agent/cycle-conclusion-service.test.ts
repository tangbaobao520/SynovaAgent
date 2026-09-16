/**
 * tests/agent/cycle-conclusion-service.test.ts — D791 各维度循环结论派生（铁律 33: *.test.ts = 单元）
 *
 * 覆盖（spec §7 L1 对照表 + §5.4 派生契约）:
 *   正常路径 — 真实溢出快照 → 每循环一行，**只拼既有 DashboardRow 字段**（零新指标）
 *   降级路径 — store 缺席 → 全量「未建立基线」+ [degraded]；无注册循环 → lines=[] + reason；
 *              orgId 非法 → lines=[] + reason
 *   边界     — S3 条数上限裁剪（7 → 6，registry 顺序保留）／未注册维度不出现／S3 行数 = registry 长度
 *
 * 测试文件切分说明（D791，控文件数 ≤ D734 上限 12）：pre-commit 组 2 要求新增 src/ 文件配对
 * 同名测试（`src/agent/cycle-conclusion-service.ts` → 本文件、`src/agent/report-onepager-trace.ts`
 * → `tests/agent/report-onepager-trace.test.ts`）。本文件 = 派生链与 S3 内容面；
 * 指针面 + 渲染结构面见 report-onepager-trace.test.ts。
 */
import { describe, it, expect } from 'vitest';
import { renderOnePager, assembleOnePagerInputs } from '../../src/agent/report-assembler';
import { buildCycleConclusions } from '../../src/agent/cycle-conclusion-service';
import { CycleRegistry } from '../../src/cycles/cycle-registry';
import type { CycleConfig } from '../../src/cycles/cycle-types';
import type { DiagnosisReport } from '../../src/l3/synova-diagnosis-engine';

// ═══ Fixtures ═══

function makeReport(): DiagnosisReport {
  return {
    reportId: 'rpt-d791-cycle',
    teamId: 'd791-org',
    generatedAt: '2026-09-17T00:00:00.000Z',
    summary: '现金流缺口与人才密度双重制约增长。',
    expertReports: [],
    rootCauses: [{ description: '现金流缺口扩大', dimension: 'financial', confidence: 0.82 }],
    recommendations: [{ action: '压缩非核心固定成本 20%', priority: 'critical', expert: 'finance' }],
    raw: {},
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

/** 真实 OverflowSnapshot 形状的图节点；queryNodes 按 enterpriseId/cycleId 过滤（同生产读路径语义） */
interface FakeNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

function makeSnapshotNode(enterpriseId: string, cycleId: string, month: string, overflowValue: number, unit: string): FakeNode {
  return {
    id: `${enterpriseId}:${cycleId}:${month}`,
    type: 'OVERFLOW_SNAPSHOT',
    props: {
      enterpriseId,
      cycleId,
      month,
      overflowValue,
      unit,
      trend: 'declining',
      trendDelta: -2.5,
      maturity: 'mature',
      isIndustryBaseline: false,
      momChange: -2.5,
      momChangePercent: -16.7,
      yoyChange: null,
      yoyChangePercent: null,
      trendDirection: 'declining',
      consecutiveDirection: 3,
      degraded: false,
    },
  };
}

/** 最小 GraphStore 门面（只用 queryNodes——isGraphStoreLike 的存在性判据即此一个原语） */
function makeFakeStore(nodes: FakeNode[]): { queryNodes: (type: string, filters?: Record<string, unknown>) => FakeNode[] } {
  return {
    queryNodes: (type: string, filters?: Record<string, unknown>) =>
      nodes.filter(node =>
        node.type === type
        && (filters?.enterpriseId === undefined || node.props.enterpriseId === filters.enterpriseId)
        && (filters?.cycleId === undefined || node.props.cycleId === filters.cycleId),
      ),
  };
}

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

// ═══ 正常路径：真实快照 → 既有 DashboardRow 字段映射（零新指标） ═══

describe('D791: buildCycleConclusions — 各维度循环结论派生（3-7 数据面）', () => {
  it('正常路径: 2 条真实快照 → 2 行带 @YYYY-MM 指针，文案只拼既有 DashboardRow 字段', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const store = makeFakeStore([
      makeSnapshotNode('d791-org', 'customer-cycle', '2026-08', -12.5, '万元'),
      makeSnapshotNode('d791-org', 'cash-cycle', '2026-08', -38, '万元'),
    ]);

    const result = await buildCycleConclusions('d791-org', store, registry);

    expect(result.registeredCount).toBe(THREE_CYCLES.length);
    expect(result.degraded).toBe(false);
    expect(result.lines).toHaveLength(THREE_CYCLES.length);

    const cash = result.lines.find(line => line.cycleId === 'cash-cycle');
    expect(cash).toBeDefined();
    expect(cash!.hasSnapshot).toBe(true);
    expect(cash!.pointer).toBe('[src:cycle:cash-cycle@2026-08]');
    // 文案逐段来自既有字段: cycleName / currentOverflow+unit / trendArrow / trendDirection 中文化 / maturityLabel
    expect(cash!.text).toContain('现金流循环');
    expect(cash!.text).toContain('溢出 -38万元');
    expect(cash!.text).toContain('▼ 下降');
    expect(cash!.text).toContain('成熟 (高置信度)');

    // 无快照循环 → 不编造数值/趋势（R3），且显式降级标记（R2）
    const talent = result.lines.find(line => line.cycleId === 'talent-cycle');
    expect(talent!.hasSnapshot).toBe(false);
    expect(talent!.pointer).toBe('[src:cycle:talent-cycle@none]');
    expect(talent!.text).toContain('未建立基线（无快照数据）');
    expect(talent!.text).toContain('[degraded]');
    expect(talent!.text).not.toMatch(/[▲▼]/);
    expect(talent!.text).not.toContain('溢出 ');
  });

  // ═══ 降级路径 ═══

  it('降级: store 缺席 → 全量「未建立基线」行（registry 驱动，不硬编码维度表）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    const result = await buildCycleConclusions('d791-org', null, registry);

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('store-unavailable');
    expect(result.registeredCount).toBe(THREE_CYCLES.length);
    expect(result.lines).toHaveLength(THREE_CYCLES.length);
    for (const line of result.lines) {
      expect(line.hasSnapshot).toBe(false);
      expect(line.text).toContain('[degraded]');
      expect(line.pointer).toMatch(/@none\]$/);
    }
    // 传入非图存储句柄（缺 queryNodes）同样走 store-unavailable（守卫而非断言）
    const notStore = await buildCycleConclusions('d791-org', { foo: 1 }, registry);
    expect(notStore.reason).toBe('store-unavailable');
  });

  it('降级: orgId 非法 → lines=[] + reason=invalid-org-id（不抛）', async () => {
    const registry = makeRegistry(THREE_CYCLES);
    for (const bad of ['', '   ', undefined as unknown as string]) {
      const result = await buildCycleConclusions(bad, null, registry);
      expect(result.lines).toEqual([]);
      expect(result.reason).toBe('invalid-org-id');
      expect(result.degraded).toBe(true);
    }
  });

  it('降级: 无已注册循环 → lines=[] + reason=no-registered-cycles（不抛，不编造维度）', async () => {
    const result = await buildCycleConclusions('d791-org', null, new CycleRegistry());
    expect(result.lines).toEqual([]);
    expect(result.registeredCount).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('no-registered-cycles');
  });

  // ═══ 边界：S3 槽位渲染面 ═══

  it('边界: S3 裁剪 7 循环 → 6 条（registry 顺序保留，被裁条目不出现在正文）', async () => {
    const seven: ReadonlyArray<readonly [string, string]> = [
      ...THREE_CYCLES,
      ['product-cycle', '产品循环'],
      ['arr-growth', 'ARR增长循环'],
      ['store-replication', '门店复制循环'],
      ['nineth-dimension', '第九维度循环'],
    ];
    const registry = makeRegistry(seven);
    const conclusions = await buildCycleConclusions('d791-org', null, registry);
    const md = renderOnePager(
      makeReport(),
      'ceo',
      assembleOnePagerInputs([], conclusions.lines.map(line => line.text)),
    );

    const s3Lines = slotItems(md, '### 各维度循环结论');
    expect(s3Lines).toHaveLength(6);
    expect(s3Lines[0]).toContain('客户循环');
    expect(s3Lines[5]).toContain('门店复制循环');
    expect(md).not.toContain('第九维度循环');
  });

  it('边界: 未注册维度不出现（S3 只由 registry 驱动，防硬编码「客户/资本/人才」三件套）', async () => {
    const registry = makeRegistry([['cash-cycle', '现金流循环']]);
    const conclusions = await buildCycleConclusions('d791-org', null, registry);
    const md = renderOnePager(
      makeReport(),
      'ceo',
      assembleOnePagerInputs([], conclusions.lines.map(line => line.text)),
    );

    expect(md).toContain('现金流循环');
    expect(md).not.toContain('供应链循环');
    expect(md).not.toContain('人才循环');
    expect(md).not.toContain('资本循环');
    expect(slotItems(md, '### 各维度循环结论')).toHaveLength(1);
  });
});
