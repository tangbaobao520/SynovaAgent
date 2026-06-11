/**
 * tests/run-mvp-pipeline-real.ts — MVP 管线真实 API 测试
 * @state: real — 调用真实 DeepSeek API，端到端验证
 *
 * 运行: npx tsx tests/run-mvp-pipeline-real.ts
 */

async function main() {
  console.log('=== Synova MVP 真实管线测试 ===\n');

  // ── Load API config (系统环境变量优先, .env 兜底) ──
  let API_KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!API_KEY) {
    // Fallback: 尝试读 .env (兼容未设系统变量的开发环境)
    try {
      const { readFileSync } = await import('fs');
      const envContent = readFileSync('.env', 'utf-8');
      const m = envContent.match(/LLM_API_KEY=(.+)/);
      if (m) API_KEY = m[1].trim();
    } catch(e) {}
  }
  const API_BASE = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
  const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

  if (!API_KEY) {
    console.error('❌ LLM_API_KEY 未设置 — 请设置系统环境变量或创建 .env');
    process.exit(1);
  }

  console.log(`API: ${API_BASE} | Model: ${MODEL} | Key: ${API_KEY.slice(0, 8)}...\n`);

  // ── Import ──
  const { DocExtractor } = await import('../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
  const { ReportBuilder } = await import('../packages/engine-core/src/pipeline/diagnosis/report-builder');

  // ── Real DeepSeek LLM Client ──
  const realLLM = {
    async complete(prompt: string, systemPrompt?: string): Promise<string> {
      const messages: Array<{role: string; content: string}> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 2000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '';
    },
  };

  // ── Sample document ──
  const SAMPLE_DOC = `
## 企业访谈记录 — XX 精密制造有限公司

### 任务目标
老板王总表示："我们未来3年的目标是成为华南地区精密模具制造的头部企业。目前年营收3000万，目标做到8000万。"
核心战略：从代工转向自主品牌，专注医疗设备和新能源汽车的精密配件。

### 业务价值
主营精密模具制造和注塑成型。客户集中在医疗器械（60%）和汽车零部件（30%）。
价值主张："精度达到±0.005mm，交货周期比同行短30%。"毛利率约35%。

### 现状起点
现有团队120人。工厂5000平米，CNC设备30台，注塑机20台。
在用金蝶ERP、飞书办公、AutoCAD。ERP数据不完整。

### 资源约束
预算紧张。技术团队只有1个资深模具设计师（张工），"他走了研发就停了。"

### 风险瓶颈
王总最担心：1)核心设计师离职风险 2)大客户A占40%营收

### 成功标准
3年目标：自有品牌收入超过代工。年营收>6000万。客户集中度<30%。

### 市场定位
客户评价："他们家不便宜，但精度确实好，交期也稳。"品质战而非价格战。

### 数字底座
生产靠Excel手工排期。ERP数据不准。CNC有接口没用。飞书只用消息。
`;

  // ── GraphStore ──
  const graphStore = createMemGraphStore();

  // ── Step 1: 真实八维度提取 ──
  console.log('Step 1: 八维度提取 (调用 DeepSeek API)...');
  const startTime = Date.now();
  const extractor = new DocExtractor(graphStore as any, realLLM as any);
  const docId = graphStore.createNode('Document', { name: 'interview_real_001' }, 'team-001');

  let extraction;
  try {
    extraction = await extractor.extract(docId, SAMPLE_DOC, 'team-001');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ 提取完成 (${elapsed}s): ${extraction.coveredCount}/${extraction.totalCount} 维度覆盖`);
    console.log(`  不足维度: ${extraction.insufficientDimensions.join(', ') || '无'}`);
    console.log('');
    for (const d of extraction.dimensions) {
      const icon = d.sufficient ? '✅' : '⚠️';
      console.log(`  ${icon} ${d.dimensionLabel} [${d.confidence}]: ${d.content.slice(0, 80)}...`);
    }
  } catch (e: any) {
    console.error(`  ❌ 提取失败: ${e.message}`);
    process.exit(1);
  }

  // ── Step 2: 构建报告 ──
  console.log('\nStep 2: 构建金字塔报告...');
  const sections = buildSections(extraction);
  const builder = new ReportBuilder();
  const html = builder.build({
    coreConclusion: buildConclusion(extraction),
    explanation: buildExplanation(extraction),
    orgName: 'XX精密制造有限公司',
    diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: 5.4,
    extraction: extraction as any,
    sections,
    crossValidation: [],
    dataTrust: {
      coveredSources: ['FDE采访文档（八维度提取）'],
      missingSources: extraction.insufficientDimensions.length > 0
        ? extraction.insufficientDimensions.map((d: string) => `${d}维度信息不足`)
        : [],
    },
  });

  const fs = await import('fs');
  fs.mkdirSync('tests/output', { recursive: true });
  const outPath = 'tests/output/mvp-report-real.html';
  fs.writeFileSync(outPath, html);
  console.log(`  ✅ 报告已生成: ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

  // ── Step 3: 验证 ──
  console.log('\nStep 3: 验证报告...');
  const checks = [
    { name: 'HTML结构完整', pass: html.startsWith('<!DOCTYPE html>') && html.includes('</html>') },
    { name: '包含核心结论', pass: html.includes('核心结论') },
    { name: '零内部术语', pass: !html.includes('测量器') && !html.includes('GapDimension') },
    { name: '提取内容出现在报告中', pass: extraction.dimensions.some((d: any) => html.includes(d.content.slice(0, 20))) },
  ];
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
  }

  console.log('\n🎉 真实管线测试完成！');
}

// ═══ Helpers ═══

function buildConclusion(extraction: any): string {
  const risks = extraction.dimensions.find((d: any) => d.dimensionKey === 'risks');
  const org = extraction.dimensions.find((d: any) => d.dimensionKey === 'currentState');
  if (risks && org) {
    return `XX精密制造的增长卡点在组织能力——${risks.content.slice(0, 100)}。战略方向清晰（品质战），但团队执行能力需要加强。`;
  }
  return 'XX精密制造当前处于转型期，从代工向自主品牌升级。建议优先解决组织能力和风险分散问题。';
}

function buildExplanation(extraction: any): string {
  return extraction.dimensions
    .filter((d: any) => d.sufficient)
    .slice(0, 4)
    .map((d: any) => `${d.dimensionLabel}: ${d.content.slice(0, 60)}`)
    .join('。');
}

function buildSections(extraction: any): any[] {
  const getContent = (key: string) => extraction.dimensions.find((d: any) => d.dimensionKey === key)?.content || '';

  return [
    {
      expertName: 'strategic', expertLabel: '战略健康：方向对不对',
      score: getContent('mission') ? 7.0 : 4.0, trend: 'stable' as const,
      findings: [
        { severity: 'info' as const, title: '战略方向', description: getContent('mission') || '待补充', evidence: [], suggestion: '定期审视赛道变化' },
        { severity: 'info' as const, title: '市场定位', description: getContent('marketPositioning') || '待补充', evidence: [], suggestion: '明确差异化传播策略' },
      ],
      dataCoverage: getContent('mission') ? 0.7 : 0.3, confidence: 'medium' as const,
    },
    {
      expertName: 'org', expertLabel: '组织能力：团队能不能执行',
      score: 4.5, trend: 'stable' as const,
      findings: [
        { severity: 'warning' as const, title: '组织现状', description: getContent('currentState') || '待补充', evidence: [], suggestion: '梳理关键岗位和能力缺口' },
        { severity: 'warning' as const, title: '资源约束', description: getContent('resources') || '待补充', evidence: [], suggestion: '在约束内找到最优解' },
      ],
      dataCoverage: getContent('currentState') ? 0.6 : 0.3, confidence: 'medium' as const,
    },
    {
      expertName: 'finance', expertLabel: '财务视角：增长的财务支撑',
      score: 5.0, trend: 'stable' as const,
      findings: [
        { severity: 'warning' as const, title: '风险关注', description: getContent('risks') || '待补充', evidence: [], suggestion: '分散客户集中度风险' },
        { severity: 'info' as const, title: '成功标准', description: getContent('successCriteria') || '待补充', evidence: [], suggestion: '拆解为年度里程碑' },
      ],
      dataCoverage: getContent('risks') ? 0.5 : 0.2, confidence: 'medium' as const,
    },
  ];
}

function createMemGraphStore() {
  const nodes = new Map<string, any[]>();
  const edges: any[] = [];
  return {
    createNode(type: string, props: Record<string, unknown>, graph: string): string {
      const id = `node_${Date.now().toString(36)}`;
      const arr = nodes.get(graph) || [];
      arr.push({ id, type, props, graph }); nodes.set(graph, arr);
      return id;
    },
    createNodes(items: Array<any>, g: string): string[] { return items.map((i: any) => this.createNode(i.type, i.props, g)); },
    updateNode(id: string, props: Record<string, unknown>, graph: string): void {
      const n = (nodes.get(graph) || []).find((x: any) => x.id === id);
      if (n) Object.assign(n.props, props);
    },
    getNode(id: string, graph: string): any { return (nodes.get(graph) || []).find((n: any) => n.id === id) || null; },
    queryNodes(type: string, _f?: any, graph?: string): any[] {
      return ((graph ? nodes.get(graph) : [...nodes.values()].flat()) || []).filter((n: any) => n.type === type);
    },
    createEdge(type: string, from: string, to: string): string { const id = `edge_${Date.now().toString(36)}`; edges.push({id, type, from, to}); return id; },
    createEdges(items: Array<any>, _g: string): string[] { return items.map((e:any) => this.createEdge(e.type, e.from, e.to)); },
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
  console.error('❌ 真实管线失败:', err.message);
  process.exit(1);
});
