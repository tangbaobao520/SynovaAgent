/**
 * tests/run-mvp-pipeline.ts — MVP 管线独立运行脚本
 * @state: placeholder — 使用 mock LLM 和硬编码 section，仅验证代码骨架。非真实管线。
 *
 * 不依赖 vitest。直接运行：npx tsx tests/run-mvp-pipeline.ts
 * 输出：tests/output/mvp-sample-report.html
 */

async function main() {
  console.log('=== Synova MVP 管线测试 ===\n');

  // ── Import engine-core modules ──
  const { DocExtractor } = await import('../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
  const { ReportBuilder } = await import('../packages/engine-core/src/pipeline/diagnosis/report-builder');

  // ── Sample Interview Document ──
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
现有团队120人。工厂面积5000平米，CNC设备30台，注塑机20台。
目前在用：金蝶ERP、飞书办公、AutoCAD。ERP数据不完整，库存数据经常不准。

### 资源约束
年度预算紧张——王总说："利润都压在设备上。"
技术团队只有1个资深模具设计师（张工），"他走了我们整个研发就停了。"

### 风险瓶颈
王总最担心两件事：
1. "张工是研发核心，他要是走了，新产品的开发至少停半年。"
2. "我们的大客户A占了40%的营收。"

### 成功标准
3年目标：自有品牌收入超过代工。品牌客户>5个。年营收>6000万。

### 市场定位
客户评价："他们家东西是不便宜，但精度确实好，交期也稳。"
和竞品的差异：竞品A低价低质、竞品B中质不稳。品质战而非价格战。

### 数字底座
生产管理还是靠Excel和手工排期。ERP金蝶数据不准。CNC设备有数据接口但没接过。
`;

  // ── Mock LLM (avoids API costs) ──
  const dimensions = [
    { dimensionKey: 'mission', dimensionLabel: '任务目标', content: '3年从3000万→8000万。代工转自主品牌，专注医疗设备和新能源汽车。战略清晰。', confidence: 'high', sufficient: true },
    { dimensionKey: 'businessModel', dimensionLabel: '业务价值', content: '精密模具+注塑成型。毛利率35%。精度±0.005mm，交期短30%。质量稳定是核心优势。', confidence: 'high', sufficient: true },
    { dimensionKey: 'currentState', dimensionLabel: '现状起点', content: '120人团队。5000平米。30台CNC+20台注塑机。在用金蝶ERP/飞书/AutoCAD。ERP数据不准。', confidence: 'high', sufficient: true },
    { dimensionKey: 'resources', dimensionLabel: '资源约束', content: '预算紧，现金储备3个月。今年最多再招5人。只有1个资深设计师。', confidence: 'high', sufficient: true },
    { dimensionKey: 'risks', dimensionLabel: '风险瓶颈', content: '1)核心设计师离职风险(唯一资深); 2)大客户A占40%营收(集中度高); 3)三年前德国客户砍单经历', confidence: 'high', sufficient: true },
    { dimensionKey: 'successCriteria', dimensionLabel: '成功标准', content: '自有品牌>代工。品牌客户>5个。年营收>6000万。客户集中度<30%。', confidence: 'high', sufficient: true },
    { dimensionKey: 'marketPositioning', dimensionLabel: '市场定位', content: '品质战而非价格战。精度高+交期稳。竞品A低质低价、竞品B中质不稳。口碑传播已开始。', confidence: 'high', sufficient: true },
    { dimensionKey: 'digitalFoundation', dimensionLabel: '数字底座', content: '生产Excell手工排期(返工率高)。ERP数据不准。CNC数据接口未利用。飞书只用消息。', confidence: 'medium', sufficient: false },
  ];

  const mockLLM = {
    async complete(_prompt: string, _systemPrompt?: string): Promise<string> {
      return JSON.stringify(dimensions);
    },
  };

  // ── GraphStore (memory) ──
  const graphStore = createMemGraphStore();

  // ── Step 1: DocExtractor ──
  console.log('Step 1: 八维度提取...');
  const extractor = new DocExtractor(graphStore as any, mockLLM as any);
  const docId = graphStore.createNode('Document', { name: 'interview_001', content: SAMPLE_DOC }, 'team-001');
  let extraction;
  try {
    extraction = await extractor.extract(docId, SAMPLE_DOC, 'team-001');
  } catch (e: any) {
    console.error('  ❌ Extract failed:', e.message);
    console.error('  Stack:', e.stack?.slice(0, 300));
    process.exit(1);
  }

  console.log(`  ✅ 提取完成: ${extraction.coveredCount}/${extraction.totalCount} 维度覆盖`);
  console.log(`  不足维度: ${extraction.insufficientDimensions.join(', ') || '无'}`);

  // ── Step 2: Build Report ──
  console.log('\nStep 2: 构建金字塔报告...');
  const sections = [
    {
      expertName: 'strategic', expertLabel: '战略健康：方向对不对',
      score: 7.2, trend: 'improving' as const,
      findings: [
        { severity: 'info' as const, title: '战略方向清晰', description: '3年目标明确，代工→自主品牌路径清晰。医疗设备和新能源汽车赛道在快速增长。', evidence: ['3年营收从3000万→8000万', '专注医疗+新能源汽车两个高增长赛道'], suggestion: '定期（每半年）审视赛道变化，评估是否需要调整战略优先级' },
        { severity: 'warning' as const, title: '品质定位需要更多客户验证', description: '品质战是对的但需要时间。当前只有少数客户的口碑——需要更多案例证明。', evidence: ['客户集中度40%（集中在A客户）', '品牌客户<5个'], suggestion: '将A客户的成功案例写成可传播的内容，加速口碑扩散', crossReference: '与风险专家发现的客户集中度问题高度相关' },
      ],
      dataCoverage: 0.75, confidence: 'medium' as const,
    },
    {
      expertName: 'org', expertLabel: '组织能力：团队能不能执行',
      score: 4.1, trend: 'declining' as const,
      findings: [
        { severity: 'critical' as const, title: '关键岗位人才流失风险', description: '张工是唯一的资深模具设计师。如果他离开，新产品开发至少停半年。这是整个增长战略最脆弱的环节。', evidence: ['120人中仅1个资深设计师', '张工独自承担核心设计', '现金紧张限制了高薪留人'], suggestion: '立即启动张工留任计划——核心不是涨薪（没钱），是让他建立接班人制度+技术入股' },
        { severity: 'warning' as const, title: '数字底座严重不足', description: '生产排期靠Excel（返工率高），ERP数据不准。CNC设备有接口但没接——数据资产闲置。', evidence: ['ERP库存数字与实际不符', 'Excel手工排期', 'CNC数据接口未利用'], suggestion: '优先做两件事：① ERP数据清理（最基础）；② 1台CNC试点数据接入（验证ROI）' },
      ],
      dataCoverage: 0.8, confidence: 'medium' as const,
    },
    {
      expertName: 'finance', expertLabel: '财务视角：增长的财务支撑',
      score: 5.5, trend: 'stable' as const,
      findings: [
        { severity: 'warning' as const, title: '客户集中度过高', description: '大客户A占40%营收。历史：三年前德国客户砍单差点倒闭。', evidence: ['A客户=40%营收', '三年前砍单经历', '现金储备仅3个月'], suggestion: 'A客户占比降到30%以下——开拓2-3个中型客户分散风险' },
        { severity: 'info' as const, title: '成功标准清晰可衡量', description: '王总知道"什么叫成了"。', evidence: ['3年营收6000万', '自有品牌>50%', '品牌客户>5个'], suggestion: '拆解到年度里程碑，每季度检查进展' },
      ],
      dataCoverage: 0.5, confidence: 'medium' as const,
    },
  ];

  const builder = new ReportBuilder();
  const html = builder.build({
    coreConclusion: 'XX精密制造的增长卡点在组织能力——关键人依赖（张工）和客户集中度（A客户占40%）是最紧迫的两个风险。战略方向清晰（品质战），但团队执行能力不足——如果张工离开，整个增长战略将失去技术支撑。',
    explanation: '战略方向健康（7.2分）：品质定位清晰，赛道选择正确。组织能力不足（4.1分）：最紧急的是关键人才流失风险。财务视角（5.5分）：客户集中度过高需要立即分散，现金储备偏紧。',
    orgName: 'XX精密制造有限公司',
    diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: 5.4,
    extraction: extraction as any,
    sections,
    crossValidation: [
      '组织专家发现的"关键人依赖"与财务专家发现的"客户集中度"互相印证——单点故障风险不仅存在于人员（张工），也存在于客户结构',
      '战略专家发现"品质定位"与营销发现"客户口碑传播"一致——品质壁垒在积累，但需要更多客户案例验证',
    ],
    dataTrust: {
      coveredSources: ['FDE采访文档（八维度提取，6/8覆盖充分）'],
      missingSources: ['财务深度数据（客户未提供）', '数字底座详细诊断（需接入ERP/CNC数据）'],
    },
  });

  // ── Output ──
  const fs = await import('fs');
  const path = await import('path');
  const outDir = 'tests/output';
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'mvp-sample-report.html');
  fs.writeFileSync(outPath, html);

  console.log(`  ✅ 报告已生成: ${outPath}`);

  // ── Validate ──
  const checks = [
    { name: '包含核心结论', pass: html.includes('核心结论') },
    { name: '包含总分', pass: html.includes('5.4') },
    { name: '包含企业名称', pass: html.includes('XX精密制造有限公司') },
    { name: '包含紧急发现', pass: html.includes('关键岗位人才流失风险') },
    { name: '包含行动建议', pass: html.includes('行动建议') },
    { name: '零内部术语-测量器', pass: !html.includes('测量器') },
    { name: '零内部术语-GapDimension', pass: !html.includes('GapDimension') },
    { name: '零内部术语-D1/D2', pass: !html.includes('D1') && !html.includes('D2') },
    { name: 'HTML结构完整', pass: html.startsWith('<!DOCTYPE html>') && html.includes('</html>') },
  ];

  console.log('\nStep 3: 验证报告...');
  let allPass = true;
  for (const check of checks) {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
    if (!check.pass) allPass = false;
  }

  if (allPass) {
    console.log('\n🎉 MVP 管线验证通过！');
  } else {
    console.log('\n❌ 部分检查失败');
  }

  console.log(`\n报告大小: ${(html.length / 1024).toFixed(1)} KB`);
  console.log(`打开报告: tests/output/mvp-sample-report.html`);
}

// ═══ Memory GraphStore ═══

function createMemGraphStore() {
  const nodes = new Map<string, any[]>();
  const edges: any[] = [];
  return {
    createNode(type: string, props: Record<string, unknown>, graph: string): string {
      const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const arr = nodes.get(graph) || [];
      arr.push({ id, type, props, graph });
      nodes.set(graph, arr);
      return id;
    },
    createNodes(items: Array<{type:string;props:Record<string,unknown>}>, g:string): string[] {
      return items.map(i => this.createNode(i.type, i.props, g));
    },
    updateNode(id: string, props: Record<string, unknown>, graph: string): void {
      const arr = nodes.get(graph) || [];
      const n = arr.find((x: any) => x.id === id);
      if (n) Object.assign(n.props, props);
    },
    getNode(id: string, graph: string): any {
      return (nodes.get(graph) || []).find((n: any) => n.id === id) || null;
    },
    queryNodes(type: string, _f?: any, graph?: string): any[] {
      return ((graph ? nodes.get(graph) : [...nodes.values()].flat()) || []).filter((n: any) => n.type === type);
    },
    createEdge(type: string, from: string, to: string, _w?: number, _p?: any, _g?: string): string {
      const id = `edge_${Date.now().toString(36)}`; edges.push({id, type, from, to}); return id;
    },
    createEdges(items: Array<any>, g: string): string[] {
      return items.map((e: any) => this.createEdge(e.type, e.from, e.to, e.weight, e.props, g));
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

main().catch(err => {
  console.error('MVP 管线失败:', err);
  process.exit(1);
});
