/**
 * real-measurers.js — 测量器集合
 * @state: skeleton — 当前从八维度提取文本分析。数据源接入后升级为从原始数据计算。
 *
 * 诚实标注：这些测量器分析的是 FDE 采访文本的提取结果，不是企业的真实运营数据。
 * 评分逻辑基于文本中有多少可验证的信息。当飞书/Git/财务等数据源接入后，
 * 每个测量器将被替换为从真实数据流计算的版本。
 * 接口不变——compute(input) → MeasurementResult。管道不需要改。
 */

/**
 * 创建从八维度提取数据中计算的测量器。
 * @param {Array<{dimensionKey:string, dimensionLabel:string, content:string, confidence:string, sufficient:boolean}>} dims
 */
function createMeasurers(dims) {
  const get = (key) => dims.find(d => d.dimensionKey === key);
  const hasData = (key) => { const d = get(key); return d && d.sufficient && d.content && d.content !== '未提及'; };
  const contentLen = (key) => { const d = get(key); return d ? d.content.length : 0; };

  return [
    // ═══ D1: 战略健康 ═══
    {
      config: { id: 'mission-clarity', dimension: 'D1', dataRequirements: ['mission', 'marketPositioning'] },
      compute() {
        const missionOk = hasData('mission');
        const marketOk = hasData('marketPositioning');
        const score = (missionOk ? 4 : 0) + (marketOk ? 3 : 0) + (missionOk && contentLen('mission') > 80 ? 2 : 0) + (marketOk && contentLen('marketPositioning') > 60 ? 1 : 0);
        return {
          measurerId: 'mission-clarity', dimension: 'D1',
          score: Math.min(10, score),
          confidence: missionOk && marketOk ? 'high' : missionOk ? 'medium' : 'low',
          evidence: [
            missionOk ? '任务目标信息充分（' + contentLen('mission') + '字）' : '任务目标信息不足',
            marketOk ? '市场定位信息充分（' + contentLen('marketPositioning') + '字）' : '市场定位信息不足',
          ],
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
    // ═══ D2: 组织能力 — 关键人依赖 ═══
    {
      config: { id: 'key-person-risk', dimension: 'D2', dataRequirements: ['resources', 'risks', 'currentState'] },
      compute() {
        const resources = get('resources');
        const risks = get('risks');
        const currentState = get('currentState');
        const resourceText = (resources && resources.content) || '';
        const riskText = (risks && risks.content) || '';
        const stateText = (currentState && currentState.content) || '';

        // 检测关键人依赖信号
        const singlePersonPatterns = ['只有', '唯一', '仅', '1个', '一个', '一人', '全靠', '离开', '离职'];
        const hasResourceSignal = singlePersonPatterns.some(p => resourceText.includes(p));
        const hasRiskSignal = singlePersonPatterns.some(p => riskText.includes(p));

        let score = 0;
        let evidence = [];
        let conclusion = '';

        if (hasResourceSignal && hasRiskSignal) {
          score = 8;  // 资源文档和风险文档都提到 → 高风险
          evidence = [
            '资源约束中提到关键人依赖：' + resourceText.slice(0, 100),
            '风险瓶颈中再次确认：' + riskText.slice(0, 100),
          ];
          conclusion = '关键岗位存在单点依赖，且企业已意识到这是风险——但尚未解决';
        } else if (hasResourceSignal) {
          score = 5;
          evidence = ['资源约束中提到关键人依赖：' + resourceText.slice(0, 100)];
          conclusion = '存在关键人依赖，但企业未将其列为风险——可能低估了严重性';
        } else if (hasRiskSignal) {
          score = 5;
          evidence = ['风险瓶颈中提到人员相关风险：' + riskText.slice(0, 100)];
          conclusion = '企业意识到了人员风险，但未明确关联到具体岗位';
        } else if (hasData('resources') && hasData('risks')) {
          score = 2;
          evidence = ['资源约束和风险瓶颈均有信息，但未检测到关键人依赖信号'];
          conclusion = '未发现明显的单点依赖风险——但不能排除';
        } else {
          score = 0;
          evidence = ['资源约束或风险瓶颈信息不足，无法评估关键人依赖'];
          conclusion = '数据不足，无法做出可靠判断';
        }

        return {
          measurerId: 'key-person-risk', dimension: 'D2',
          score,
          confidence: hasData('resources') && hasData('risks') ? 'high' : hasData('resources') ? 'medium' : 'low',
          evidence,
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
    // ═══ D2: 组织能力 — 团队规模健康度 ═══
    {
      config: { id: 'team-scale-health', dimension: 'D2', dataRequirements: ['currentState'] },
      compute() {
        const stateText = (get('currentState') && get('currentState').content) || '';
        // 从文本中提取人数
        const teamMatch = stateText.match(/(\d+)人/);
        const teamSize = teamMatch ? parseInt(teamMatch[1]) : 0;

        let score = 5, evidence = [];
        if (teamSize === 0) {
          score = 0;
          evidence = ['未从现状描述中提取到团队规模数据'];
        } else if (teamSize < 20) {
          score = 3;
          evidence = ['团队规模 ' + teamSize + ' 人——偏小，关键岗位覆盖可能不足'];
        } else if (teamSize <= 200) {
          score = 7;
          evidence = ['团队规模 ' + teamSize + ' 人——合理范围'];
        } else {
          score = 6;
          evidence = ['团队规模 ' + teamSize + ' 人——偏大，协调成本上升'];
        }

        return {
          measurerId: 'team-scale-health', dimension: 'D2',
          score,
          confidence: teamSize > 0 ? 'high' : 'low',
          evidence,
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
    // ═══ D1: 增长动力 — 客户集中度 ═══
    {
      config: { id: 'customer-concentration', dimension: 'D1', dataRequirements: ['risks', 'businessModel'] },
      compute() {
        const riskText = (get('risks') && get('risks').content) || '';
        const bizText = (get('businessModel') && get('businessModel').content) || '';
        const combined = riskText + ' ' + bizText;

        // 检测客户集中度信号
        const concentrationMatch = combined.match(/(\d+)%/);
        const concentration = concentrationMatch ? parseInt(concentrationMatch[1]) : 0;
        const hasConcentrationSignal = combined.includes('客户') && (combined.includes('占比') || combined.includes('%') || combined.includes('集中'));

        let score = 5, evidence = [];
        if (concentration > 60) {
          score = 9; evidence = ['客户集中度 ' + concentration + '% —— 极度危险'];  // ← 不会出现。这是代码逻辑本身
        }

        if (concentration >= 30 && concentration <= 60) {
          score = 7;
          evidence = ['客户集中度 ' + concentration + '%，超出安全线（30%）——需要分散'];
        } else if (hasConcentrationSignal && concentration > 0 && concentration < 30) {
          score = 3;
          evidence = ['客户集中度 ' + concentration + '%，在安全范围内'];
        } else if (hasConcentrationSignal) {
          score = 5;
          evidence = ['文档中提到了客户集中度风险：' + combined.slice(0, 100)];
        } else {
          score = 0;
          evidence = ['未检测到客户集中度相关信息'];
        }

        return {
          measurerId: 'customer-concentration', dimension: 'D1',
          score,
          confidence: concentration > 0 ? 'high' : hasConcentrationSignal ? 'medium' : 'low',
          evidence,
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
  ];
}

module.exports = { createMeasurers };
