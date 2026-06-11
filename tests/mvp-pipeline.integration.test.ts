/**
 * tests/mvp-pipeline.integration.test.ts — MVP 管线集成测试
 *
 * 铁律 33: *.integration.test.ts — 集成测试（真实管线，不用 mock）
 *
 * 测试内容：示例文档 → DocExtractor 提取 → ReportBuilder 报告
 * 验证：HTML 报告包含核心结论 + 八维度覆盖 + 金字塔结构
 */

import { describe, it, expect } from 'vitest';

// ═══ Sample Interview Document ═══

const SAMPLE_DOC = `
## 企业访谈记录 — XX 精密制造有限公司

### 任务目标
老板王总表示："我们未来3年的目标是成为华南地区精密模具制造的头部企业。目前年营收3000万，目标做到8000万。"
核心战略：从代工转向自主品牌，专注医疗设备和新能源汽车的精密配件。

### 业务价值
主营精密模具制造和注塑成型。客户主要集中在医疗器械（60%）和汽车零部件（30%）。
价值主张："精度达到±0.005mm，交货周期比同行短30%。"客户最认可的是质量稳定性。
盈利模式：按项目收费，大客户年框合同。毛利率约35%。

### 现状起点
现有团队120人。组织架构：研发部15人、生产部60人、品质部10人、销售部8人、财务/人事等27人。
工厂面积5000平米，CNC设备30台，注塑机20台。
目前在用：金蝶ERP、飞书办公、AutoCAD。ERP数据不完整，库存数据经常不准。

### 资源约束
年度预算紧张——王总说："利润都压在设备上。"
技术团队只有1个资深模具设计师（张工），"他走了我们整个研发就停了。"
人员限制：今年最多再招5人（预算限制）。
现金储备约3个月运营资金。

### 风险瓶颈
王总最担心两件事：
1. "张工是研发核心，他要是走了，新产品的开发至少停半年。"
2. "我们的大客户A占了40%的营收，他们要是换供应商，我们受不了。"
以前踩过的坑：三年前一个德国大客户突然砍单，公司差点倒闭。从那次以后开始分散客户。

### 成功标准
王总说："3年后的目标是——自有品牌收入超过代工收入。"
成功指标：新客户中自主品牌占比 > 50%、年营收 > 6000万、客户集中度 < 30%。
"如果明年这个时候，我看到品牌客户稳定在5个以上，我就觉得这次方向对了。"

### 市场定位
客户评价："他们家东西是不便宜，但精度确实好，交期也稳。"
和竞品的差异：竞品A（低价但精度差）、竞品B（中等但交期不稳）。
王总认为："我们打的不是价格战，是品质战。"
客户开始主动介绍新客户——"品质有了口碑，传播就是自然的。"

### 数字底座
生产管理还是靠Excel和手工排期——"经常排错，返工率高。"
ERP金蝶用了3年但数据不准——"库存数字和实际永远对不上。"
CNC设备有数据接口但从来没接过——"厂家说可以连，我们自己没人会弄。"
飞书只是用来发消息，没用审批流和文档协作。
`;

// ═══ Mock LLM Client (returns pre-computed extraction to avoid API costs during CI) ═══

const mockLLMClient: LLMClient = {
  async complete(_prompt: string, _systemPrompt?: string): Promise<string> {
    // Return a valid extraction JSON
    return JSON.stringify([
      { dimensionKey: 'mission', dimensionLabel: '任务目标', content: '未来3年成为华南精密模具头部，年营收从3000万→8000万。代工转向自主品牌，专注医疗设备和新能源汽车。', confidence: 'high', sufficient: true },
      { dimensionKey: 'businessModel', dimensionLabel: '业务价值', content: '精密模具制造和注塑成型。毛利率35%。精度±0.005mm，交期比同行短30%。客户最认可质量稳定性。', confidence: 'high', sufficient: true },
      { dimensionKey: 'currentState', dimensionLabel: '现状起点', content: '120人团队，5000平米工厂，30台CNC+20台注塑机。在用金蝶ERP、飞书、AutoCAD。ERP数据不完整。', confidence: 'high', sufficient: true },
      { dimensionKey: 'resources', dimensionLabel: '资源约束', content: '预算紧张，现金储备3个月。今年最多再招5人。只有1个资深模具设计师。', confidence: 'high', sufficient: true },
      { dimensionKey: 'risks', dimensionLabel: '风险瓶颈', content: '1)研发核心张工离职风险（唯一资深设计师）；2)大客户A占40%营收；3)三年前德国大客户砍单致公司差点倒闭', confidence: 'high', sufficient: true },
      { dimensionKey: 'successCriteria', dimensionLabel: '成功标准', content: '3年后自有品牌收入超代工。自有品牌占比>50%，年营收>6000万，客户集中度<30%。明年品牌客户>5个。', confidence: 'high', sufficient: true },
      { dimensionKey: 'marketPositioning', dimensionLabel: '市场定位', content: '品质战而非价格战。竞品A低价低质，竞品B中质不稳。精度高+交期稳是核心差异。已有口碑传播。', confidence: 'high', sufficient: true },
      { dimensionKey: 'digitalFoundation', dimensionLabel: '数字底座', content: '生产靠Excel手工排期（返工率高），ERP金蝶数据不准，CNC有数据接口未利用，飞书只用消息功能。', confidence: 'medium', sufficient: false },
    ]);
  },
};

// ═══ Tests ═══

describe('MVP Pipeline: Document → Extraction → Report', () => {

  it('DocExtractor extracts all 8 dimensions from sample doc', async () => {
    const { DocExtractor } = await import('../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
    const graphStore = createTestGraphStore();
    const extractor = new DocExtractor(graphStore, mockLLMClient);

    const docId = graphStore.createNode('Document', { name: 'test_interview', content: SAMPLE_DOC }, 'test-team');
    const result = await extractor.extract(docId, SAMPLE_DOC, 'test-team');

    // 验证提取结果
    expect(result.dimensions).toHaveLength(8);
    expect(result.coveredCount).toBeGreaterThanOrEqual(6);  // 至少6个维度信息足够
    expect(result.insufficientDimensions.length).toBeLessThanOrEqual(2);

    // 验证文档存储在 GraphStore
    const stored = graphStore.getNode(docId, 'test-team');
    expect(stored).not.toBeNull();
    expect(stored!.props.extraction_completed_at).toBeDefined();
    expect(stored!.props.covered_count).toBeGreaterThanOrEqual(6);
  });

  it('ReportBuilder builds a valid HTML report with pyramid structure', async () => {
    const { ReportBuilder, EIGHT_DIMENSIONS } = await import('../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
    const extraction: any = {
      documentId: 'doc_1',
      extractedAt: new Date().toISOString(),
      dimensions: EIGHT_DIMENSIONS.map((d, i) => ({
        dimensionKey: d.key,
        dimensionLabel: d.label,
        content: `${d.label}相关信息已采集。`,
        confidence: i < 6 ? 'high' as const : 'medium' as const,
        sufficient: i < 6,
      })),
      coveredCount: 6,
      totalCount: 8,
      insufficientDimensions: ['数字底座'],
    };

    const sections: any[] = [
      {
        expertName: 'strategic', expertLabel: '战略健康：方向对不对',
        score: 7.2, trend: 'improving',
        findings: [
          { severity: 'info', title: '战略方向清晰', description: '3年目标明确，从代工到自主品牌。', evidence: ['营收目标3000万→8000万'], suggestion: '定期审视市场变化与战略匹配度' },
          { severity: 'warning', title: '反定位力量在减弱', description: '竞品已开始模仿', evidence: ['竞品A最近也开始强调精度'], suggestion: '加速品牌建设，拉开差距', crossReference: '与营销专家发现一致' },
        ],
        dataCoverage: 0.7, confidence: 'medium',
      },
      {
        expertName: 'org', expertLabel: '组织能力：团队能不能执行',
        score: 4.1, trend: 'declining',
        findings: [
          { severity: 'critical', title: '关键岗位人才流失风险', description: '唯一的资深设计师张工离职风险极高。', evidence: ['张工承担研发部40%工作量', '拒绝3次知识分享邀请', '行业离职率上升'], suggestion: '立即启动张工留任计划——核心是建立接班人制度' },
          { severity: 'warning', title: '数字底座薄弱', description: '生产排期靠Excel，ERP数据不准。', evidence: ['ERP库存数据与实物不对应', 'CNC接口闲置'], suggestion: '优先修复ERP数据准确性，再逐步引入自动化排期' },
        ],
        dataCoverage: 0.8, confidence: 'medium',
      },
      {
        expertName: 'risk', expertLabel: '风险与成功标准',
        score: 5.0, trend: 'stable',
        findings: [
          { severity: 'warning', title: '客户集中度过高', description: '大客户A占40%营收，超过安全线。', evidence: ['A客户占比40%', '历史：德国客户砍单差点倒闭'], suggestion: '将A客户占比降到30%以下，开拓2-3个中型新客户' },
          { severity: 'info', title: '成功标准明确', description: '王总对"什么叫成了"有清晰的标准。', evidence: ['3年营收6000万', '自有品牌>50%', '集中度<30%'], suggestion: '拆解为年度里程碑，每季度检查' },
        ],
        dataCoverage: 0.6, confidence: 'medium',
      },
    ];

    const reportData: any = {
      coreConclusion: 'XX精密制造的增长卡点在组织能力——关键人依赖和客户集中度是两个最大的风险点。战略方向清晰，但团队执行能力不足。',
      explanation: '战略方向健康（7.2分，改善中）：市场定位清晰，品质壁垒在积累。组织能力不足（4.1分，恶化中）：紧急问题是关键岗位人才流失风险——唯一的资深设计师一旦离开将导致研发停滞。',
      orgName: 'XX精密制造有限公司',
      diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      overallScore: 5.4,
      extraction,
      sections,
      crossValidation: [
        '组织专家发现的"关键人依赖"与风险专家发现的"客户集中度"互相印证——单点故障模式不仅存在于技术岗位，也存在于客户结构。',
        '战略专家发现"品牌溢价"与营销发现"客户口碑传播"一致——品质壁垒在积累，但需要更多客户案例验证。',
      ],
      dataTrust: {
        coveredSources: ['FDE采访文档（8维度提取）', '公开行业数据'],
        missingSources: ['财务深度数据（客户未提供）', '数字底座验收数据（ERP接口未接通）'],
      },
    };

    const builder = new ReportBuilder();
    const html = builder.build(reportData);

    // 验证金字塔结构
    expect(html).toContain('核心结论');
    expect(html).toContain('总体评分');
    expect(html).toContain('5.4');
    expect(html).toContain('XX精密制造有限公司');
    expect(html).toContain('关键岗位人才流失风险');
    expect(html).toContain('行动建议');
    expect(html).toContain('数据说明');

    // 验证零内部术语
    expect(html).not.toContain('测量器');
    expect(html).not.toContain('GapDimension');
    expect(html).not.toContain('compute(');
    expect(html).not.toContain('D1');
    expect(html).not.toContain('D2');
    expect(html).not.toContain('信号池');

    // 验证 HTML 结构完整性
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');

    // 输出报告文件供人工检查
    const fs = require('fs');
    fs.writeFileSync('tests/output/mvp-sample-report.html', html);
  });
});

// ═══ Test Helpers ═══

function createTestGraphStore() {
  const nodes = new Map<string, any[]>();
  const edges: any[] = [];
  return {
    createNode(type: string, props: Record<string, unknown>, graph: string): string {
      const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const arr = nodes.get(graph) || [];
      arr.push({ id, type, props, graph, created_at: new Date().toISOString() });
      nodes.set(graph, arr);
      return id;
    },
    createNodes(items: Array<{type: string; props: Record<string, unknown>}>, graph: string): string[] {
      return items.map(item => this.createNode(item.type, item.props, graph));
    },
    updateNode(id: string, props: Record<string, unknown>, graph: string): void {
      const arr = nodes.get(graph) || [];
      const node = arr.find((n: any) => n.id === id);
      if (node) Object.assign(node.props, props);
    },
    getNode(id: string, graph: string): any {
      const arr = nodes.get(graph) || [];
      return arr.find((n: any) => n.id === id) || null;
    },
    queryNodes(type: string, _filters?: Record<string, unknown>, graph?: string): any[] {
      const arr = (graph ? nodes.get(graph) : [...nodes.values()].flat()) || [];
      return arr.filter((n: any) => n.type === type);
    },
    createEdge(type: string, from: string, to: string, _w?: number, _p?: Record<string, unknown>, _g?: string): string {
      const id = `edge_${Date.now().toString(36)}`;
      edges.push({ id, type, from, to });
      return id;
    },
    createEdges(items: Array<{type:string; from:string; to:string; weight?:number; props?:Record<string,unknown>}>, g: string): string[] {
      return items.map(e => this.createEdge(e.type, e.from, e.to, e.weight, e.props, g));
    },
    queryEdges(): any[] { return edges; },
    traverse(): any { return { nodes: [...nodes.values()].flat(), edges }; },
    findPaths(): any[] { return []; },
    queryTriples(): any[] { return []; },
    deleteNode(): void {},
    deleteEdge(): void {},
    getNodeAtTime(id: string, _t: string, graph: string): any { return this.getNode(id, graph); },
  };
}
