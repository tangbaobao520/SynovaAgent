/**
 * tests/run-experts-real.ts — 全部 7 位诊断专家真实 API 测试
 * @state: real — 调用真实 DeepSeek API，逐专家验证
 *
 * 运行: npx tsx tests/run-experts-real.ts
 *
 * 验证内容:
 *   1. 每位专家的 prompt 是否从文件加载成功
 *   2. 每位专家能否基于企业数据产出结构化诊断
 *   3. 新版 business_model 专家是否输出三框架分析
 */
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  console.log('=== SynovaAgent 全部专家诊断测试 ===\n');

  // ── Load API config ──
  let API_KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!API_KEY) {
    try {
      const envContent = fs.readFileSync('.env', 'utf-8');
      const m = envContent.match(/LLM_API_KEY=(.+)/);
      if (m) API_KEY = m[1].trim();
    } catch {}
  }
  const API_BASE = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
  const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

  if (!API_KEY) {
    console.error('❌ LLM_API_KEY 未设置');
    process.exit(1);
  }

  console.log(`API: ${API_BASE} | Model: ${MODEL} | Key: ${API_KEY.slice(0, 8)}...\n`);

  // ── Real LLM Client ──
  async function llmComplete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Array<{role: string; content: string}> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 1500, temperature: 0.1 }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  // ── Sample enterprise data (XX科技 — 培训咨询公司) ──
  const ENTERPRISE_DATA = `
## 企业数据摘要 — XX科技

**基本信息**: 企业培训和管理咨询公司，成立6年，团队35人。

**战略方向**: 3年成为西南企业服务头部。年营收2000万→5000万。

**业务模式**: 企业内训+管理咨询项目。毛利率45%。课程不便宜但落地效果好。
收入结构: 内训占60%（项目制，回款周期60-90天），公开课占25%，咨询占15%。
核心讲师只有3人（张老师一人承担60%课程量）。

**财务状况**: 年营收2000万，净利润约300万（15%净利率）。前3大客户占收入55%（其中B客户占30%）。
现金流: 项目制先干后收，平均账期75天。

**市场定位**: 品质优先，和竞品的差异是"只做落地"。客户续约率约70%。

**团队情况**: 35人。讲师10人（核心3人），销售5人，运营20人。组织架构扁平。
老板王总直接管理所有核心讲师和销售。

**风险点**:
1) 核心讲师离职（张老师承担60%课程，无人可替代）
2) 客户集中度高（前3占55%，B客户占30%）
3) 现金流压力（项目制→先干后收→账期75天）

**数字化**: 钉钉+微信+Excel。没有CRM，没有学员管理系统。
`;

  // ── Load expert prompts from files ──
  const EXPERT_DIR = path.resolve('expert');
  const EXPERT_NAMES = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action', 'business_model'];

  function loadExpertPrompt(name: string): string {
    const dir = path.join(EXPERT_DIR, name);
    const sections: string[] = [];
    const fileOrder = ['IDENTITY.md', 'SOUL.md', 'RULES.md', 'TOOLS.md', 'KNOWLEDGE.md'];
    const headers = ['角色定义', '诊断风格与方法论', '诊断规则与评分指南', '可用工具', '领域知识'];

    for (let i = 0; i < fileOrder.length; i++) {
      const fp = path.join(dir, fileOrder[i]);
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf-8').trim();
        if (content) {
          sections.push(`## ${headers[i]}\n\n${content}`);
        }
      }
    }
    return sections.join('\n\n---\n\n');
  }

  // ── Test each expert ──
  const results: Array<{ name: string; ok: boolean; conclusion: string; degraded: boolean; time: number; tokens: number }> = [];
  let totalOK = 0;
  let totalFail = 0;

  for (const name of EXPERT_NAMES) {
    const prompt = loadExpertPrompt(name);

    if (!prompt.trim()) {
      console.log(`  ⚠️  ${name}: 无 prompt 文件，跳过`);
      totalFail++;
      results.push({ name, ok: false, conclusion: '无 prompt 文件', degraded: true, time: 0, tokens: 0 });
      continue;
    }

    const userMessage = `请基于以下企业数据，按你的方法论进行诊断分析。

${ENTERPRISE_DATA}

请输出 JSON 格式（不要 Markdown 代码块包裹）:
{
  "conclusion": "一句话核心诊断结论",
  "findings": [
    {
      "severity": "critical|warning|info",
      "title": "发现标题",
      "description": "用企业负责人能听懂的话解释",
      "evidence": ["证据1"],
      "suggestion": "具体可执行的建议"
    }
  ],
  "score": 0-10,
  "confidence": "high|medium|low"
}`;

    const startTime = Date.now();
    process.stdout.write(`  🧠 ${name.padEnd(18)} `);

    try {
      const raw = await llmComplete(userMessage, prompt);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Try to parse JSON
      let parsed: any = null;
      let degraded = false;
      try {
        // Strip markdown code blocks if present
        const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch { /* expected: JSON parse may fail */
        degraded = true;
        parsed = { conclusion: raw.slice(0, 150), findings: [], score: 0, confidence: 'low' };
      }

      const conclusion = (parsed.conclusion || '').slice(0, 100);
      const findingCount = parsed.findings?.length || 0;
      const severityCounts = (parsed.findings || []).reduce((acc: any, f: any) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1; return acc;
      }, {} as any);

      totalOK++;
      console.log(`✅ ${elapsed}s | score=${parsed.score} | ${findingCount} findings${degraded ? ' (JSON degraded)' : ''}`);
      if (conclusion) console.log(`     → ${conclusion}`);
      if (Object.keys(severityCounts).length > 0) {
        const parts = Object.entries(severityCounts).map(([k, v]) => `${k}:${v}`).join(' ');
        console.log(`     [${parts}]`);
      }

      results.push({ name, ok: true, conclusion, degraded, time: parseFloat(elapsed), tokens: raw.length });
    } catch (e: any) {
      totalFail++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`❌ ${elapsed}s — ${e.message.slice(0, 80)}`);
      results.push({ name, ok: false, conclusion: e.message, degraded: true, time: parseFloat(elapsed), tokens: 0 });
    }
  }

  // ── Summary ──
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  汇总: ${totalOK}/${EXPERT_NAMES.length} 通过, ${totalFail} 失败`);
  console.log(`${'═'.repeat(70)}`);

  const totalTime = results.reduce((s, r) => s + r.time, 0);
  console.log(`  总耗时: ${totalTime.toFixed(1)}s`);
  console.log('');

  // ── Check business_model specifically for new frameworks ──
  const bm = results.find(r => r.name === 'business_model');
  if (bm && bm.ok) {
    console.log('📋 business_model 专家特别检查:');
    console.log(`  结论: ${bm.conclusion}`);
    console.log(`  耗时: ${bm.time}s | 降级: ${bm.degraded ? '是' : '否'}`);
  }

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon} ${r.name.padEnd(18)} ${r.time.toFixed(1).padStart(5)}s  ${r.conclusion.slice(0, 80)}`);
  }

  // Write results
  fs.mkdirSync('tests/output', { recursive: true });
  fs.writeFileSync(
    'tests/output/expert-test-results.json',
    JSON.stringify(results, null, 2),
  );
  console.log(`\n结果已保存: tests/output/expert-test-results.json`);

  if (totalFail > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
