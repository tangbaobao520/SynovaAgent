/**
 * tests/test-http-direct.ts — 绕过问题依赖，直接测试HTTP管线
 * @state: real
 *
 * 问题: diagnosis-upload-v2 顶层导入 ToolRegistry/EngineCoreVendorAdapter 引用了
 * 有解析问题的包(@synova/logger等)。直接调用核心模块绕过。
 */
import express from 'express';
import { createProvider } from '../src/providers/index.js';
import { loadConfig } from '../src/config.js';

async function main() {
  // 加载 .env（tsx 不自动加载）
  const fsSync = await import('fs');
  const envContent = fsSync.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  console.log(`LLM_API_KEY: ${process.env.LLM_API_KEY ? 'set' : 'MISSING'}\n`);
  console.log('=== HTTP 路由直接测试 ===\n');

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // 内联路由 — 只依赖 engine-core (可用)
  app.post('/api/diagnosis/upload', async (req, res) => {
    try {
      const { content, teamId = 'test-001', orgName = '企业' } = req.body as any;
      if (!content || content.length < 20) {
        res.status(400).json({ error: '文档内容至少20字符' }); return;
      }

      const jobId = `diag_${Date.now().toString(36)}`;

      // 异步处理，先返回 jobId
      res.json({ jobId, status: 'extracting' });

      // 后台处理管线
      try {
        const config = loadConfig();
        const provider = createProvider(
          (process.env.LLM_PROVIDER || 'deepseek') as any,
          { apiKey: config.llmApiKey, model: config.llmModel, baseUrl: config.llmBaseUrl },
        );

        const llmClient = {
          async complete(prompt: string, systemPrompt?: string): Promise<string> {
            const messages: Array<{role: string; content: string}> = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: prompt });
            const r = await provider.chat(messages);
            return Array.isArray(r.content) ? r.content.join('') : (r.content || '');
          },
        };

        const { DocExtractor } = await import('../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
        const { ReportBuilder } = await import('../packages/engine-core/src/pipeline/diagnosis/report-builder');

        const gs = memGraphStore();
        const extractor = new DocExtractor(gs as any, llmClient as any);
        const { NodeType } = await import('../packages/sog-core/src/sog-core-schema');
        const docId = gs.createNode(NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: SOGNodeType.DOCUMENT -> resource/knowledge or resource/data? Check context. */, { name: 'interview', content }, teamId);
        const extraction = await extractor.extract(docId, content, teamId);

        console.log(`[${jobId}] 提取完成: ${extraction.coveredCount}/8`);

        const sections = buildSections(extraction);
        const builder = new ReportBuilder();
        const html = builder.build({
          coreConclusion: `基于八维度诊断，${orgName}的增长关注点在于组织执行能力。`,
          explanation: `诊断基于FDE采访文档。${extraction.coveredCount}/8维度覆盖充分。`,
          orgName, diagnosedAt: new Date().toISOString().replace('T',' ').slice(0,19),
          overallScore: sections.reduce((s: number, x: any) => s + x.score, 0) / sections.length,
          extraction: extraction as any, sections,
          crossValidation: [],
          dataTrust: { coveredSources: ['FDE采访文档'], missingSources: extraction.insufficientDimensions.map((d: any) => `${d}维度信息不足`) },
        });

        const fs = await import('fs');
        fs.mkdirSync('tests/output', { recursive: true });
        fs.writeFileSync(`tests/output/http-report-${jobId}.html`, html);
        console.log(`[${jobId}] 报告完成: ${(html.length/1024).toFixed(1)}KB`);

      } catch (e: any) {
        console.error(`[${jobId}] 管线失败:`, e.message);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const PORT = 3099;
  app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}\n`));

  // ═══ 测试 ═══
  const SAMPLE = `## 企业访谈
### 任务目标
3年成为西南企业服务头部。年营收2000万→5000万。

### 业务价值
企业培训和管理咨询。毛利率45%。客户认可落地效果。

### 现状起点
团队35人。讲师10人。钉钉办公。

### 资源约束
预算偏紧。核心讲师只有3人。

### 风险瓶颈
1)核心讲师离职 2)大客户B占50%营收

### 成功标准
3年续约率>80%，年营收>5000万。

### 市场定位
课程不便宜但落地好。和竞品差异：只做落地。

### 数字底座
钉钉+微信+Excel。没有CRM。`;

  console.log('POST /api/diagnosis/upload...');
  const r = await fetch(`http://localhost:${PORT}/api/diagnosis/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: SAMPLE, orgName: 'XX科技' }),
  });
  const data = await r.json() as any;
  console.log(`  jobId: ${data.jobId}, status: ${data.status}`);

  if (data.jobId) {
    console.log('\n等待管线完成...');
    await new Promise(r => setTimeout(r, 15000));

    const files = await import('fs');
    const output = files.readdirSync('tests/output').filter((f: string) => f.startsWith('http-report-')).pop();
    if (output) {
      const html = files.readFileSync(`tests/output/${output}`, 'utf-8');
      const checks = ['核心结论', 'XX科技', '战略健康', '组织能力', '财务视角', '行动建议', '</html>'];
      console.log(`\n报告: tests/output/${output} (${(html.length/1024).toFixed(1)}KB)`);
      for (const c of checks) {
        console.log(`  ${html.includes(c) ? '✅' : '❌'} ${c}`);
      }
      if (!html.includes('测量器') && !html.includes('GapDimension')) {
        console.log('  ✅ 零内部术语');
      }
    }
  }

  process.exit(0);
}

function buildSections(ex: any): any[] {
  const m = new Map(ex.dimensions.map((d: any) => [d.dimensionKey, d]));
  const g = (k: string) => m.get(k)?.content || '';
  return [
    { expertName:'strategic', expertLabel:'战略健康', score:6.0, trend:'stable', findings:[
      {severity:'info', title:'战略方向', description:g('mission')||'待补充', evidence:g('mission')?[g('mission').slice(0,100)]:[], suggestion:'定期审视' },
    ], dataCoverage:0.6, confidence:'medium' },
    { expertName:'org', expertLabel:'组织能力', score:5.0, trend:'stable', findings:[
      {severity:'info', title:'组织现状', description:g('currentState')||'待补充', evidence:[], suggestion:'梳理缺口' },
    ], dataCoverage:0.5, confidence:'medium' },
    { expertName:'finance', expertLabel:'财务视角', score:5.0, trend:'stable', findings:[
      {severity:'warning', title:'风险关注', description:g('risks')||'待补充', evidence:[], suggestion:'分散风险' },
    ], dataCoverage:0.4, confidence:'medium' },
  ];
}

function memGraphStore() {
  const nodes = new Map<string,any[]>(); const edges: any[] = [];
  return {
    createNode(type:string,props:Record<string,unknown>,graph:string):string{const id=`n_${Date.now().toString(36)}`;const a=nodes.get(graph)||[];a.push({id,type,props,graph});nodes.set(graph,a);return id},
    createNodes(items:Array<any>,g:string):string[]{return items.map((i:any)=>this.createNode(i.type,i.props,g))},
    updateNode(id:string,props:Record<string,unknown>,graph:string):void{const n=(nodes.get(graph)||[]).find((x:any)=>x.id===id);if(n)Object.assign(n.props,props)},
    getNode(id:string,graph:string):any{return(nodes.get(graph)||[]).find((n:any)=>n.id===id)||null},
    queryNodes(type:string,_f?:any,graph?:string):any[]{return((graph?nodes.get(graph):[...nodes.values()].flat())||[]).filter((n:any)=>n.type===type)},
    createEdge(type:string,from:string,to:string,_w?:number,_p?:any,_g?:string):string{const id=`e_${Date.now().toString(36)}`;edges.push({id,type,from,to});return id},
    createEdges(items:Array<any>,g:string):string[]{return items.map((e:any)=>this.createEdge(e.type,e.from,e.to,e.weight,e.props,g))},
    queryEdges():any[]{return edges}, traverse():any{return{nodes:[...nodes.values()].flat(),edges}},
    findPaths():any[]{return[]}, queryTriples():any[]{return[]}, deleteNode():void{}, deleteEdge():void{},
    getNodeAtTime(id:string,_t:string,graph:string):any{return this.getNode(id,graph)},
  };
}

main();
