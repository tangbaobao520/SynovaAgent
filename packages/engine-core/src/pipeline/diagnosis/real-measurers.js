/**
 * real-measurers.js — FDE 哨兵 (on-demand 模式)
 * @state: real — 2026-06-18 术语统一
 *
 * 这些哨兵在 FDE 诊断时按需调用——分析八维度提取的访谈文本，产出评分。
 * 与 Cron 哨兵（src/sentinel/adapters/）共享同一个概念模型：
 *   哨兵 = compute() 函数，两种调用模式（Cron 定时 + FDE 按需）
 *
 * 诚实标注：当前评分基于访谈文本中的可验证信息量，不是企业真实运营数据。
 * 当飞书/Git/财务等数据源接入后，每个哨兵将升级为从真实数据流计算。
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

  // ═══ 力量适用性判定（规则引擎） ═══
  // 一个企业不可能同时拥有七种力量。先判定适用性，再对适用的力量量化。
  function checkPowerApplicability(dims) {
    const txt = dims.map(d => d.content || '').join(' ');
    const hasManyClients = txt.includes('客户') && !txt.includes('只有');
    const isPlatform = txt.includes('平台') || txt.includes('SaaS') || txt.includes('软件');
    const isManufacturing = txt.includes('制造') || txt.includes('工厂') || txt.includes('产线');
    const isEarly = txt.includes('初创') || txt.includes('刚成立') || txt.includes('早期');
    const isMature = !isEarly && (txt.includes('年营收') || txt.includes('成立') || parseInt(txt.match(/(\d+)人/)?.[1] || '0') > 50);

    return {
      scaleEconomies: isManufacturing || isPlatform || isMature,
      networkEffects: isPlatform,
      counterPositioning: isEarly,
      switchingCosts: hasManyClients && isMature,
      brand: isMature,
      corneredResource: txt.includes('专利') || txt.includes('独家') || txt.includes('牌照') || txt.includes('只有'),
      processPower: isMature && (isManufacturing || txt.includes('流程') || txt.includes('体系')),
    };
  }

  return [
    // ═══ D1: 战略力量 — 7 Powers 量化 ═══
    {
      config: { id: 'seven-powers', dimension: 'D1', dataRequirements: ['mission', 'businessModel', 'resources', 'marketPositioning'] },
      compute() {
        const applicable = checkPowerApplicability(dims);
        const scores = {};
        const evidence = [];
        let totalScore = 0, count = 0;

        // Power 1: 规模经济
        if (applicable.scaleEconomies) {
          const hasScaleSignal = (get('businessModel')?.content || '').includes('规模') || (get('resources')?.content || '').includes('产量');
          // 公式: 强度 = (固定成本占比 - 行业平均) / 行业标准差
          // 当前数据: 文本中是否有规模经济和产量描述
          const score = hasScaleSignal ? 6.0 : 3.0;
          scores.scaleEconomies = score;
          evidence.push(hasScaleSignal ? '存在规模效应信号（批量生产、产量描述）' : '规模效应信号弱，无法量化固定成本占比');
          totalScore += score; count++;
        } else { evidence.push('规模经济不适用（非制造业/非平台/早期阶段）'); }

        // Power 2: 网络效应
        if (applicable.networkEffects) {
          // 公式: 价值 ∝ n² (Metcalfe) 或 n×log(n) (Briscoe)
          // 当前数据: 文本中是否有用户网络描述
          const hasNetwork = (get('businessModel')?.content || '').includes('用户') || (get('marketPositioning')?.content || '').includes('平台');
          const score = hasNetwork ? 5.0 : 2.0;
          scores.networkEffects = score;
          evidence.push(hasNetwork ? '存在网络效应信号（用户/平台描述）' : '网络效应信号弱');
          totalScore += score; count++;
        } else { evidence.push('网络效应不适用（非平台/SaaS/软件企业）'); }

        // Power 3: 反定位
        if (applicable.counterPositioning) {
          // 公式: min(蚕食比率, 40%) / 40% × 10
          // 当前数据: 是否有新模式颠覆旧模式的描述
          const hasDisruption = (get('mission')?.content || '').includes('颠覆') || (get('mission')?.content || '').includes('新模式') || (get('marketPositioning')?.content || '').includes('不同');
          const score = hasDisruption ? 6.0 : 2.0;
          scores.counterPositioning = score;
          evidence.push(hasDisruption ? '存在反定位信号（颠覆性模式描述）' : '反定位信号弱，无法量化蚕食比率');
          totalScore += score; count++;
        } else { evidence.push('反定位不适用（成熟企业，反定位是挑战者的力量）'); }

        // Power 4: 转换成本
        if (applicable.switchingCosts) {
          // 公式: (行业流失率 - 企业流失率) / 行业流失率 × 10
          // 当前数据: 是否有客户锁定描述
          const hasLockIn = (get('businessModel')?.content || '').includes('合同') || (get('risks')?.content || '').includes('依赖');
          const score = hasLockIn ? 5.0 : 2.0;
          scores.switchingCosts = score;
          evidence.push(hasLockIn ? '存在转换成本信号（合同/依赖关系）' : '转换成本信号弱');
          totalScore += score; count++;
        } else { evidence.push('转换成本不适用（客户少/早期阶段）'); }

        // Power 5: 品牌
        if (applicable.brand) {
          // 公式: 品牌溢价 = WTP(品牌) - WTP(无品牌等价替代)，品牌价值 = 溢价 × 销量
          // 当前数据: 文本中是否有品质/口碑/NPS描述
          const brandText = (get('marketPositioning')?.content || '') + (get('businessModel')?.content || '');
          const hasBrand = brandText.includes('品质') || brandText.includes('口碑') || brandText.includes('不便宜') || brandText.includes('信任');
          const score = hasBrand ? 6.0 : 3.0;
          scores.brand = score;
          evidence.push(hasBrand ? '存在品牌效应信号（品质/口碑/溢价描述）' : '品牌效应信号弱，无法量化品牌溢价');
          totalScore += score; count++;
        } else { evidence.push('品牌不适用（早期企业，品牌尚未建立）'); }

        // Power 6: 垄断资源
        if (applicable.corneredResource) {
          // 公式: 资源价值 = NPV(独占资源带来的增量现金流)
          // 当前数据: 是否有专利/独家/稀缺资源描述
          const resText = (get('resources')?.content || '') + (get('businessModel')?.content || '');
          const hasExclusive = resText.includes('专利') || resText.includes('独家') || resText.includes('只有');
          const score = hasExclusive ? 7.0 : 2.0;
          scores.corneredResource = score;
          evidence.push(hasExclusive ? '存在垄断资源信号（专利/独家描述）' : '垄断资源信号弱，无法量化NPV');
          totalScore += score; count++;
        } else { evidence.push('垄断资源不适用（未检测到专利/独家/稀缺资源信号）'); }

        // Power 7: 流程优势
        if (applicable.processPower) {
          // 公式: 学习曲线 Cost(n) = Cost(1) × n^(-log₂(1-b))
          // 当前数据: 是否有流程/体系/效率描述
          const processText = (get('resources')?.content || '') + (get('digitalFoundation')?.content || '');
          const hasProcess = processText.includes('流程') || processText.includes('体系') || processText.includes('效率') || processText.includes('自动化');
          const score = hasProcess ? 5.0 : 2.0;
          scores.processPower = score;
          evidence.push(hasProcess ? '存在流程优势信号（流程/体系/效率描述）' : '流程优势信号弱，无法量化学习曲线斜率');
          totalScore += score; count++;
        } else { evidence.push('流程优势不适用（早期/非制造业企业，流程尚未沉淀）'); }

        return {
          measurerId: 'seven-powers', dimension: 'D1',
          score: count > 0 ? Math.round(totalScore / count * 10) / 10 : 0,
          confidence: count >= 3 ? 'medium' : 'low',
          evidence,
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
    // ═══ D1: 战略方向清晰度 ═══
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
    // ═══ D2: 目标对齐度 — cosine(G, E) ═══
    {
      config: { id: 'goal-alignment', dimension: 'D2', dataRequirements: ['mission', 'currentState', 'successCriteria'] },
      compute() {
        // 公式: 对齐度 = cosine(G, E) / 跨层级衰减率
        // 当前数据: 从文本中检测目标一致性信号
        const mission = get('mission')?.content || '';
        const state = get('currentState')?.content || '';
        const criteria = get('successCriteria')?.content || '';
        const hasMission = hasData('mission');
        const hasCriteria = hasData('successCriteria');
        const hasState = hasData('currentState');

        // 目标-执行对齐: mission 中的目标与 currentState 中的团队是否匹配
        const missionTarget = mission.match(/(\d+)万/) ? parseInt(mission.match(/(\d+)万/)[1]) : 0;
        const stateTeam = state.match(/(\d+)人/) ? parseInt(state.match(/(\d+)人/)[1]) : 0;

        let score = 5, evidence = [];
        if (hasMission && hasState && missionTarget > 0 && stateTeam > 0) {
          // 简单对齐: 目标/团队比率 (每千万营收需要多少人)
          const ratio = stateTeam / (missionTarget / 1000);
          if (ratio < 3) { score = 8; evidence.push('目标-团队配比合理（' + ratio.toFixed(1) + '人/千万），执行资源充足'); }
          else if (ratio < 8) { score = 6; evidence.push('目标-团队配比中等（' + ratio.toFixed(1) + '人/千万），需关注效率'); }
          else { score = 3; evidence.push('目标-团队配比偏高（' + ratio.toFixed(1) + '人/千万），可能存在效率问题'); }
        } else {
          score = hasMission && hasState ? 4 : 0;
          evidence.push('无法计算目标-团队配比：' + (!hasMission ? '缺少目标数据 ' : '') + (!hasState ? '缺少团队规模数据' : ''));
        }

        if (hasCriteria) {
          evidence.push('成功标准明确，可衡量目标对齐度');
        } else {
          evidence.push('缺少明确的成功标准，目标对齐无法验证');
        }

        return {
          measurerId: 'goal-alignment', dimension: 'D2',
          score,
          confidence: hasMission && hasState ? 'medium' : 'low',
          evidence,
          trend: 'stable',
          computedAt: new Date().toISOString(),
        };
      },
    },
    // ═══ D2: 能力分布熵 ═══
    {
      config: { id: 'capability-entropy', dimension: 'D2', dataRequirements: ['currentState', 'resources'] },
      compute() {
        // 公式: 能力分布熵 = -Σ(pⱼ × log(pⱼ)) / log(k)
        // 当前数据: 从资源和团队描述中推断能力集中度
        const resourceText = get('resources')?.content || '';
        const stateText = get('currentState')?.content || '';
        const hasSingle = resourceText.includes('只有') || resourceText.includes('唯一') || resourceText.includes('1个') || resourceText.includes('一人');

        // 简化: 检测单点依赖信号 → 反映能力集中度
        const singleCount = (resourceText.match(/只有|唯一|全靠|一人|1个/g) || []).length;
        const score = singleCount >= 2 ? 2 : singleCount === 1 ? 4 : 6;
        const evidence = [
          singleCount >= 2 ? '高能力集中度：多个关键岗位存在单点依赖（熵值低）'
            : singleCount === 1 ? '中能力集中度：存在个别关键岗位单点依赖'
            : '能力分布较均匀：未检测到明显的单点依赖',
        ];

        // 团队规模体现分布
        const teamMatch = stateText.match(/(\d+)人/);
        if (teamMatch && parseInt(teamMatch[1]) < 20) {
          evidence.push('小团队（' + teamMatch[1] + '人）：能力集中是正常现象，但有单点风险');
        }

        return {
          measurerId: 'capability-entropy', dimension: 'D2',
          score,
          confidence: hasData('resources') ? 'medium' : 'low',
          evidence,
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
