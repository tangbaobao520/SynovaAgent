/**
 * expert-pipeline.js — 专家推理管道 (Pure JS)
 * @state: real — TDD, 消费测量结果, 驱动LLM推理
 *
 * L3 模块：测量聚合结果 → N个专家并行推理 → 诊断结论
 */

// ═══ Expert Definitions ═══
// 六专家定义（系统级配置，不可在运行时随意修改）

const EXPERT_DEFINITIONS = [
  {
    id: 'strategic', name: '战略健康：方向对不对',
    dimensions: ['D1', 'D6'],
    systemPrompt: '你是企业战略诊断专家。你分析企业的竞争力量（规模经济、网络效应、反定位、转换成本、品牌、垄断资源、流程优势）、市场定位和战略方向。只基于提供的测量数据分析，不编造。如果数据不足，诚实标注。',
  },
  {
    id: 'org', name: '组织能力：团队能不能执行',
    dimensions: ['D2', 'D3'],
    systemPrompt: '你是组织诊断专家。你分析企业的协作健康度、决策效率、关键人依赖、目标对齐度。如果组织是人+Agent混合形态，额外关注混合协作质量。只基于测量数据分析，不编造。',
  },
  {
    id: 'finance', name: '财务视角：增长的财务支撑',
    dimensions: ['D1', 'D7'],
    systemPrompt: '你是财务诊断专家。你分析企业的增长动力、客户集中度、现金流健康度、成功标准的可衡量性。只基于测量数据分析，不编造。',
  },
  {
    id: 'marketing', name: '营销视角：市场定位与客户认知',
    dimensions: ['D1', 'D6'],
    systemPrompt: '你是营销诊断专家。你分析企业的市场定位清晰度、差异化实质性、客户认知与内部共识的一致性。只基于测量数据分析，不编造。',
  },
  {
    id: 'tech', name: '技术视角：数字底座与 Agent 适配',
    dimensions: ['D4', 'D5'],
    systemPrompt: '你是技术诊断专家。你分析企业的数字基础设施健康度、软件生态、Agent 适配度。只基于测量数据分析，不编造。',
  },
  {
    id: 'action', name: '行动建议：从分析到执行',
    dimensions: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
    systemPrompt: '你是行动诊断专家。你消费其他专家的分析结果，提炼出优先级最高的行动建议。每条建议必须可执行、可验证。不重复其他专家的分析。',
  },
];

// ═══ Types (JSDoc) ═══

/**
 * @typedef {Object} ExpertConfig
 * @property {string} id
 * @property {string} name
 * @property {string[]} dimensions
 * @property {string} systemPrompt
 */

/**
 * @typedef {Object} ExpertOutput
 * @property {string} expertId
 * @property {string} expertName
 * @property {string} conclusion
 * @property {ExpertFinding[]} findings
 * @property {number} score
 * @property {'high'|'medium'|'low'} confidence
 * @property {string} computedAt
 */

/**
 * @typedef {Object} ExpertFinding
 * @property {'critical'|'warning'|'info'} severity
 * @property {string} title
 * @property {string} description
 * @property {string[]} evidence
 * @property {string} suggestion
 */

/**
 * @typedef {Object} LLMClient
 * @property {function(string, string): Promise<string>} complete
 */

// ═══ Pipeline ═══

class ExpertPipeline {
  constructor() {
    /** @type {Array<{config: ExpertConfig, llm: LLMClient}>} */
    this._experts = [];
    /** @type {string[]} 降级的专家 ID */
    this._degraded = [];
  }

  /**
   * 注册专家。
   * @param {ExpertConfig[]} configs
   * @param {LLMClient} [llm] — 共享的 LLM client
   */
  register(configs, llm) {
    for (const c of configs) {
      this._experts.push({ config: c, llm: llm || null });
    }
  }

  getExpertCount() {
    return this._experts.length;
  }

  /**
   * 运行所有专家。并行执行。
   * 专家只处理自己有数据的维度。
   * @param {Record<string, {score: number, confidence: string, measurerCount: number}>} aggregatedInput — MeasurementPipeline.aggregated 输出
   * @param {string} [rawDocument] — 原始文档全文（可选，专家基于原文形成洞察）
   * @returns {Promise<{results: ExpertOutput[], degradedModules: string[], computedAt: string}>}
   */
  async run(aggregatedInput, rawDocument) {
    this._degraded = [];

    // 激活专家：有数据 OR 有原始文档（有文档时全激活）
    const activeExperts = rawDocument ? this._experts : this._experts.filter(e => {
      return e.config.dimensions.some(d => aggregatedInput[d] && aggregatedInput[d].measurerCount > 0);
    });

    if (activeExperts.length === 0) {
      return { results: [], degradedModules: [], computedAt: new Date().toISOString() };
    }

    // 并行执行
    const promises = activeExperts.map(e => this._runOne(e, aggregatedInput, rawDocument));
    const results = await Promise.all(promises);

    return {
      results: results.filter(Boolean),
      degradedModules: this._degraded,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * @param {{config: ExpertConfig, llm: LLMClient}} expert
   * @param {Record<string, *>} input
   * @returns {Promise<ExpertOutput|null>}
   */
  async _runOne(expert, input, rawDocument) {
    const dimensionData = {};
    let hasData = false;
    for (const d of expert.config.dimensions) {
      if (input[d]) {
        dimensionData[d] = input[d];
        hasData = true;
      }
    }
    // 有原始文档时即使没有测量数据也激活
    if (!hasData && !rawDocument) return null;

    const prompt = this._buildPrompt(expert.config, dimensionData, rawDocument);

    try {
      // LLM 调用 (最多重试 1 次)
      let response;
      try {
        response = await this._callLLM(expert, prompt);
      } catch (llmErr) {
        this._degraded.push(expert.config.id);
        return this._degradedOutput(expert.config, 'LLM 调用失败: ' + (llmErr.message || 'unknown'));
      }

      // JSON 解析
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('响应中未找到JSON');
        const output = JSON.parse(jsonMatch[0]);

        return {
          expertId: expert.config.id,
          expertName: expert.config.name,
          conclusion: output.conclusion || '分析未能生成结论。',
          findings: (output.findings || []).map(f => ({
            severity: f.severity || 'info',
            title: f.title || '未命名发现',
            description: f.description || '',
            evidence: f.evidence || [],
            suggestion: f.suggestion || '保持现有措施。',
          })),
          score: typeof output.score === 'number' ? output.score : 5.0,
          confidence: output.confidence || 'medium',
          computedAt: new Date().toISOString(),
        };
      } catch (parseErr) {
        // 重试一次
        const retryPrompt = prompt + '\n\n⚠️ 上一次你的回复不是有效的JSON。请只返回JSON对象，不要添加任何其他文字。格式：{"conclusion":"...","findings":[...],"score":0-10,"confidence":"high|medium|low"}';
        try {
          const retryResponse = await this._callLLM(expert, retryPrompt);
          const retryMatch = retryResponse.match(/\{[\s\S]*\}/);
          if (!retryMatch) throw new Error('重试失败');
          const output = JSON.parse(retryMatch[0]);
          return {
            expertId: expert.config.id,
            expertName: expert.config.name,
            conclusion: output.conclusion || '重试后生成。',
            findings: (output.findings || []).map(f => ({
              severity: f.severity || 'info', title: f.title || '发现',
              description: f.description || '', evidence: f.evidence || [],
              suggestion: f.suggestion || '保持现有措施。',
            })),
            score: typeof output.score === 'number' ? output.score : 5.0,
            confidence: output.confidence || 'low',
            computedAt: new Date().toISOString(),
          };
        } catch {
          this._degraded.push(expert.config.id);
          return this._degradedOutput(expert.config, 'JSON 解析失败，重试后仍失败');
        }
      }
    } catch (err) {
      this._degraded.push(expert.config.id);
      return this._degradedOutput(expert.config, err.message || '未知错误');
    }
  }

  async _callLLM(expert, prompt) {
    const llm = expert.llm;
    if (llm) {
      return llm.complete(prompt, expert.config.systemPrompt);
    }
    // 无 LLM → 使用共享 fallback
    throw new Error('No LLM client configured for expert: ' + expert.config.id);
  }

  _buildPrompt(config, dimData, rawDocument) {
    const dataStr = JSON.stringify(dimData, null, 2);
    const hasMetrics = dimData && Object.keys(dimData).length > 0;
    const docSection = rawDocument ? `\n\n## 原始文档（你的主要分析依据）\n以下是企业访谈/文档的全文。你的洞察应该主要从这里提取——测量数据仅作为补充验证。\n"""\n${rawDocument.slice(0, 8000)}\n"""` : '';

    return `你正在诊断一家企业。你的专业领域是：${config.name}。

${hasMetrics ? `## 测量数据（辅助参考）\n以下结构化评分仅供参考——可能因数据不足而不准确。你更应该相信原始文档中的实际内容。\n${dataStr}` : '## 测量数据\n暂无结构化测量数据。请完全基于原始文档进行分析。'}${docSection}

## 你的任务
从你的专业视角分析这家企业。给出具体的、有洞察力的诊断。

⚠️ 重要提醒：
- 如果文档中有真实信息，基于这些信息给出判断——不要说"数据不足"
- 如果某个方面文档确实没提到，诚实说"未提及"，但不要因此放弃其他方面的分析
- 不要念测量数据——测量数据可能有误，你是专家，你有判断力
- 每条发现必须有原文证据支撑
- 建议必须可执行——"提升协作"不算建议，"每周召开跨部门联席会"算建议

返回 JSON 对象（只返回 JSON，不要其他文字）：
{
  "conclusion": "一句话核心结论",
  "findings": [
    {
      "severity": "critical|warning|info",
      "title": "发现标题（一句话）",
      "description": "详细解释（人话，企业主能看懂）",
      "evidence": ["证据1", "证据2"],
      "suggestion": "可执行的建议（做什么，不是'提升'、'改善'这种空话）"
    }
  ],
  "score": 0-10,
  "confidence": "high|medium|low"
}

规则：
- 只基于提供的数据分析，数据不足时诚实标注 confidence: low
- 最多 3 条发现。不是越多越好，是最重要的
- 建议必须可执行——"提升协作效率" 不算建议，"恢复每周联席会" 算建议`;
  }

  _degradedOutput(config, reason) {
    return {
      expertId: config.id,
      expertName: config.name,
      conclusion: '该专家分析暂时不可用。',
      findings: [{
        severity: 'info',
        title: '分析暂不可用',
        description: reason,
        evidence: [],
        suggestion: '请稍后重试或联系 FDE。',
      }],
      score: 0,
      confidence: 'low',
      computedAt: new Date().toISOString(),
    };
  }
}

// ═══ Export ═══
module.exports = { ExpertPipeline, EXPERT_DEFINITIONS };

// ═══ Embedded Test ═══
if (require.main === module) {
  async function runTests() {
    var passed = 0, total = 0, errors = [];
    function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
    async function test(name, fn) { total++; try { await fn(); passed++; } catch(e) { errors.push(name + ': ' + e.message); } }

    function mockLLM(output) {
      output = output || {};
      return {
        async complete() {
          return JSON.stringify({
            conclusion: output.conclusion || '测试结论：该维度表现正常。',
            findings: output.findings || [{ severity: 'info', title: '指标正常', description: '在正常范围内。', evidence: ['m1: 7.0'], suggestion: '保持现有节奏。' }],
            score: output.score || 7.0,
            confidence: output.confidence || 'medium',
          });
        },
      };
    }

    await test('register expert', function() {
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '...' }]);
      assert(p.getExpertCount() === 1);
    });

    await test('skip expert when no dimension data', async function() {
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '...' }], mockLLM());
      var o = await p.run({ D3: { score: 3, confidence: 'medium', measurerCount: 1 } });
      assert(o.results.length === 0, 'Expert should skip when no D2 data');
    });

    await test('expert runs when dimension data present', async function() {
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '...' }], mockLLM({ conclusion: '组织能力正常' }));
      var o = await p.run({ D2: { score: 5.5, confidence: 'medium', measurerCount: 2 } });
      assert(o.results.length === 1, 'Expected 1 result');
      assert(o.results[0].expertId === 'org');
      assert(o.results[0].conclusion === '组织能力正常');
      assert(o.results[0].findings.length > 0);
    });

    await test('LLM failure → degraded, others continue', async function() {
      var failLLM = { async complete() { throw new Error('API timeout'); } };
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织', dimensions: ['D2'], systemPrompt: '...' }], failLLM);
      p.register([{ id: 'strat', name: '战略', dimensions: ['D1'], systemPrompt: '...' }], mockLLM({ conclusion: '战略OK' }));
      var o = await p.run({
        D2: { score: 5.5, confidence: 'medium', measurerCount: 1 },
        D1: { score: 7.0, confidence: 'high', measurerCount: 1 },
      });
      assert(o.degradedModules.length >= 1, 'Should have degraded');
    });

    await test('JSON parse failure → retry once', async function() {
      var calls = 0;
      var flaky = { async complete() { calls++; if (calls === 1) return 'not json {{{'; return JSON.stringify({ conclusion: 'retry ok', findings: [], score: 5, confidence: 'low' }); } };
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织', dimensions: ['D2'], systemPrompt: '...' }], flaky);
      var o = await p.run({ D2: { score: 5, confidence: 'medium', measurerCount: 1 } });
      assert(o.results[0].conclusion === 'retry ok', 'Should retry and succeed');
    });

    await test('findings are structured', async function() {
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织', dimensions: ['D2'], systemPrompt: '...' }], mockLLM());
      var o = await p.run({ D2: { score: 4, confidence: 'medium', measurerCount: 1 } });
      var f = o.results[0].findings[0];
      assert(/^(critical|warning|info)$/.test(f.severity), 'severity must be valid');
      assert(f.title.length > 3, 'title too short');
      assert(f.description.length > 5, 'description too short');
      assert(f.evidence.length > 0, 'must have evidence');
      assert(f.suggestion.length > 3, 'suggestion too short');
    });

    await test('parallel execution', async function() {
      var order = [];
      var m1 = { async complete() { order.push('org'); return JSON.stringify({ conclusion: 'ok', findings: [], score: 5, confidence: 'medium' }); } };
      var m2 = { async complete() { order.push('strat'); return JSON.stringify({ conclusion: 'ok', findings: [], score: 5, confidence: 'medium' }); } };
      var p = new ExpertPipeline();
      p.register([{ id: 'org', name: '组织', dimensions: ['D2'], systemPrompt: '...' }], m1);
      p.register([{ id: 'strat', name: '战略', dimensions: ['D1'], systemPrompt: '...' }], m2);
      var o = await p.run({
        D2: { score: 1, confidence: 'low', measurerCount: 1 },
        D1: { score: 1, confidence: 'low', measurerCount: 1 },
      });
      assert(o.results.length === 2, 'Both experts should run');
      assert(order.length === 2, 'Both should have been called: ' + order);
    });

    console.log(passed + '/' + total + ' passed');
    if (errors.length) { console.log('FAILURES:\n  ' + errors.join('\n  ')); process.exit(1); }
    console.log('OK');
  }
  runTests().then(function() { process.exit(0); });
}
