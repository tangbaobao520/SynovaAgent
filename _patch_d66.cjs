/**
 * _patch_d66.cjs — D66 补丁：为41个manifest添加 dependencies + boundaries
 *
 * 数据来源：第12份权威文档 第四章（edges_read/tools_consumed/sentinels_consumed）
 * 以及 Appendix A（compute函数映射）
 *
 * 用法: node _patch_d66.cjs
 */
const fs = require('fs');
const path = require('path');

const BUILTIN = path.join(process.cwd(), 'extensions', 'skills', 'builtin');

// ═══ 41个Skill的依赖数据（从第四章逐表提取） ═══

const DEPENDENCIES = {
  // ── L1 感知层 (5) ──
  'acquire-financial-data': {
    edges: ['E-1.1', 'E-1.2', 'E-5.1', 'E-5.2'],
    computes: [],
    sentinels: [],
  },
  'acquire-customer-data': {
    edges: ['E-4.1', 'E-4.2', 'E-4.3', 'E-4.6'],
    computes: [],
    sentinels: [],
  },
  'acquire-competitive-intel': {
    edges: ['E-4.4', 'E-4.7', 'E-0.3', 'E-X.1'],
    computes: [],
    sentinels: [],
  },
  'acquire-org-health-data': {
    edges: ['E-2.2', 'E-2.4', 'E-2.5', 'E-2.6', 'E-2.9', 'E-2.10'],
    computes: [],
    sentinels: [],
  },
  'acquire-operational-data': {
    edges: ['E-3.1', 'E-3.6', 'E-3.7', 'E-1.6', 'E-1.8'],
    computes: [],
    sentinels: [],
  },

  // ── L2 分析层 (8) ──
  'analyze-break-even': {
    edges: ['E-1.1', 'E-2.1', 'E-3.1', 'E-4.1'],
    computes: ['COMPUTE-BREAK-EVEN-v1'],
    sentinels: ['sentinel-breakeven'],
  },
  'analyze-operating-leverage': {
    edges: ['E-2.1', 'E-3.1', 'E-4.1'],
    computes: ['COMPUTE-DOL-v2'],
    sentinels: ['sentinel-operating-leverage'],
  },
  'analyze-price-elasticity': {
    edges: ['E-4.1', 'E-4.4', 'E-3.1'],
    computes: ['COMPUTE-PRICE-ELASTICITY-v2'],
    sentinels: ['sentinel-price-elasticity'],
  },
  'analyze-customer-value': {
    edges: ['E-4.1', 'E-4.2', 'E-4.6', 'E-5.4'],
    computes: ['COMPUTE-CUSTOMER-VALUE-SCORE-v1', 'COMPUTE-CUSTOMER-PROFITABILITY-v1', 'COMPUTE-CUSTOMER-DEMAND-STRUCTURE-v1'],
    sentinels: ['churn-health', 'client-portfolio-concentration'],
  },
  'analyze-competitive-position': {
    edges: ['E-4.7', 'E-4.4', 'E-4.5', 'E-5.4'],
    computes: ['COMPUTE-COMPETITIVE-POSITIONING-v1', 'COMPUTE-HHI-v1'],
    sentinels: ['competitive-position', 'competitive-moat', 'sentinel-hhi-concentration'],
  },
  'analyze-cost-structure': {
    edges: ['E-2.1', 'E-3.1', 'E-1.8', 'E-2.10'],
    computes: ['COMPUTE-FIXED-COST-RIGIDITY-v1', 'COMPUTE-MARGINAL-COST-v1'],
    sentinels: ['margin-health', 'sentinel-margin-trend'],
  },
  'analyze-learning-curve': {
    edges: ['E-2.7', 'E-2.8', 'E-5.3', 'E-5.5'],
    computes: ['COMPUTE-LEARNING-RATE-v1', 'COMPUTE-ORGANIZATIONAL-LEARNING-v1'],
    sentinels: ['sentinel-learning-curve'],
  },
  'analyze-capital-allocation': {
    edges: ['E-1.1', 'E-2.1', 'E-5.1', 'E-X.1'],
    computes: ['COMPUTE-CAPITAL-ALLOCATION-v1', 'COMPUTE-NPV-v1', 'COMPUTE-PROFIT-REINVESTMENT-v1'],
    sentinels: ['capital-health', 'sentinel-npv-negative'],
  },

  // ── L3 诊断层 (6) ──
  'diagnose-cashflow-health': {
    skills: ['analyze-break-even', 'analyze-operating-leverage', 'analyze-capital-allocation'],
    edges: ['E-1.1', 'E-1.2', 'E-2.1', 'E-5.1', 'E-4.1', 'E-X.1'],
    computes: ['COMPUTE-BREAK-EVEN-v1', 'COMPUTE-DOL-v2', 'COMPUTE-CAPITAL-ALLOCATION-v1'],
    sentinels: ['capital-health', 'margin-health', 'sentinel-breakeven', 'sentinel-operating-leverage', 'sentinel-survival-margin'],
  },
  'diagnose-churn-root-cause': {
    skills: ['analyze-customer-value', 'analyze-competitive-position'],
    edges: ['E-4.2', 'E-4.6', 'E-5.4', 'E-4.4', 'E-3.5'],
    computes: ['COMPUTE-CUSTOMER-LOCKIN-v1', 'COMPUTE-CUSTOMER-VALUE-SCORE-v1', 'COMPUTE-CUSTOMER-DATA-LOOP-v1', 'COMPUTE-COMPETITIVE-POSITIONING-v1'],
    sentinels: ['churn-health', 'competitive-position', 'client-portfolio-concentration'],
  },
  'diagnose-org-health': {
    edges: ['E-2.2', 'E-2.4', 'E-2.5', 'E-2.6', 'E-2.9', 'E-2.10'],
    computes: ['COMPUTE-INFORMATION-FLOW-v1', 'COMPUTE-INCENTIVE-ALIGNMENT-v1', 'COMPUTE-TRUST-FRICTION-v1', 'COMPUTE-ROUTINE-RIGIDITY-v1', 'COMPUTE-DECISION-AUTHORITY-v1', 'COMPUTE-KNOWLEDGE-SHARING-v1'],
    sentinels: ['org-health', 'collaboration-health', 'key-person-risk'],
  },
  'diagnose-competitive-decay': {
    skills: ['analyze-competitive-position'],
    edges: ['E-4.7', 'E-4.4', 'E-4.5', 'E-0.3', 'E-3.6'],
    computes: ['COMPUTE-COMPETITIVE-POSITIONING-v1', 'COMPUTE-COMPETITOR-FEATURE-THREAT-v1', 'COMPUTE-COMPETITOR-PRICING-LANDSCAPE-v1', 'COMPUTE-MARKET-SHARE-CAPTURE-v1', 'COMPUTE-HHI-v1'],
    sentinels: ['competitive-position', 'competitive-moat', 'sentinel-hhi-concentration'],
  },
  'diagnose-margin-erosion': {
    skills: ['analyze-break-even', 'analyze-operating-leverage', 'analyze-cost-structure', 'analyze-price-elasticity', 'analyze-competitive-position'],
    edges: ['E-2.1', 'E-3.1', 'E-4.1', 'E-4.4', 'E-3.6', 'E-X.1'],
    computes: ['COMPUTE-DOL-v2', 'COMPUTE-BREAK-EVEN-v1', 'COMPUTE-MARGINAL-COST-v1', 'COMPUTE-FIXED-COST-RIGIDITY-v1', 'COMPUTE-PRICE-ELASTICITY-v2', 'COMPUTE-COMPETITIVE-POSITIONING-v1'],
    sentinels: ['margin-health', 'sentinel-breakeven', 'sentinel-operating-leverage', 'sentinel-margin-trend'],
  },
  'diagnose-agency-cost': {
    edges: ['E-2.2', 'E-2.4', 'E-2.5', 'E-2.6'],
    computes: ['COMPUTE-AGENCY-COST-v1', 'COMPUTE-INCENTIVE-ALIGNMENT-v1', 'COMPUTE-DECISION-AUTHORITY-v1', 'COMPUTE-INFORMATION-FLOW-v1'],
    sentinels: ['sentinel-agency-cost'],
  },

  // ── L4 处方层 (4) ──
  'prescribe-pricing-strategy': {
    skills: ['analyze-price-elasticity', 'analyze-cost-structure', 'analyze-competitive-position'],
    edges: ['E-4.1', 'E-4.4', 'E-3.1'],
    computes: ['COMPUTE-PRICE-ELASTICITY-v2', 'COMPUTE-MARGINAL-COST-v1', 'COMPUTE-COMPETITIVE-POSITIONING-v1', 'COMPUTE-OPTIMAL-PRICE-v1', 'COMPUTE-TWO-PART-TARIFF-v1', 'COMPUTE-PRICE-DISCRIMINATION-v1', 'COMPUTE-BUNDLING-OPTIMAL-v1', 'COMPUTE-PEAK-LOAD-PRICING-v1'],
    sentinels: [],
  },
  'prescribe-budget-allocation': {
    skills: ['analyze-capital-allocation'],
    edges: ['E-2.1', 'E-5.1', 'E-X.1', 'E-1.8'],
    computes: ['COMPUTE-CAPITAL-ALLOCATION-v1', 'COMPUTE-NPV-v1', 'COMPUTE-IRR-v1', 'COMPUTE-DOL-v2', 'COMPUTE-BREAK-EVEN-v1'],
    sentinels: ['capital-health'],
  },
  'prescribe-market-entry': {
    skills: ['analyze-competitive-position'],
    edges: ['E-4.7', 'E-4.4', 'E-0.1', 'E-0.3'],
    computes: ['COMPUTE-MARKET-STRUCTURE-DIAGNOSIS-v1', 'COMPUTE-COMPETITIVE-POSITIONING-v1', 'COMPUTE-HHI-v1', 'COMPUTE-DEMAND-FORECAST-v1', 'COMPUTE-LERNER-INDEX-v1'],
    sentinels: [],
  },
  'prescribe-synergy-value': {
    edges: ['E-3.6', 'E-2.8', 'E-5.3'],
    computes: ['COMPUTE-SYNERGY-v1', 'COMPUTE-CROSS-FUNCTIONAL-SYNERGY-v1', 'COMPUTE-KNOWLEDGE-SHARING-v1'],
    sentinels: [],
  },

  // ── L5 反馈层 (3) ──
  'track-execution-progress': {
    edges: ['E-2.1', 'E-3.1', 'E-5.1', 'E-5.4'],
    computes: [],
    sentinels: ['action-tracker'],
  },
  'verify-hypothesis': {
    skills: ['detect-plan-deviation'],
    edges: ['E-X.1', 'E-0.4', 'E-2.7'],
    computes: ['COMPUTE-CAUSAL-SEQUENCE-v1', 'COMPUTE-INTERVENTION-EFFECT-v1', 'COMPUTE-SHAPLEY-ATTRIBUTION-v1'],
    sentinels: ['assumption-triggered-reallocation'],
  },
  'detect-plan-deviation': {
    skills: ['track-execution-progress'],
    edges: ['E-2.1', 'E-3.1', 'E-4.1', 'E-X.1'],
    computes: [],
    sentinels: [],
  },

  // ── L6 学习层 (3) ──
  'retrieve-industry-benchmark': {
    edges: ['E-0.1', 'E-0.3'],
    computes: [],
    sentinels: [],
  },
  'match-best-practice': {
    edges: ['E-2.7', 'E-2.8', 'E-5.3'],
    computes: [],
    sentinels: [],
  },
  'distill-expert-knowledge': {
    edges: ['E-2.7', 'E-2.8', 'E-5.3'],
    computes: [],
    sentinels: [],
  },

  // ── L7 自保层 (4) ──
  'check-data-source-health': {
    edges: ['E-1.5', 'E-0.1', 'E-0.2'],
    computes: [],
    sentinels: [],
  },
  'manage-sentinel-config': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'self-diagnose-agent': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'backup-restore': {
    edges: [],
    computes: [],
    sentinels: [],
  },

  // ── 协同类 (3) ──
  'cross-expert-review': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'conflict-resolution': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'synthesizer-invoke': {
    edges: [],
    computes: [],
    sentinels: [],
  },

  // ── 工作台类 (3) ──
  'agent-self-health': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'knowledge-base-maintenance': {
    edges: [],
    computes: [],
    sentinels: [],
  },
  'diagnosis-calibration': {
    edges: [],
    computes: [],
    sentinels: [],
  },

  // ── 跨专家 (2) ──
  'enterprise-growth-diagnosis': {
    skills: ['acquire-financial-data', 'acquire-customer-data', 'acquire-competitive-intel', 'acquire-org-health-data', 'acquire-operational-data',
            'analyze-break-even', 'analyze-operating-leverage', 'analyze-price-elasticity', 'analyze-customer-value', 'analyze-competitive-position',
            'analyze-cost-structure', 'analyze-learning-curve', 'analyze-capital-allocation',
            'diagnose-cashflow-health', 'diagnose-churn-root-cause', 'diagnose-org-health',
            'diagnose-competitive-decay', 'diagnose-margin-erosion', 'diagnose-agency-cost'],
    edges: [],
    computes: [],
    sentinels: [],
  },
  'survival-crisis-diagnosis': {
    skills: ['diagnose-cashflow-health', 'diagnose-margin-erosion'],
    edges: ['E-1.1', 'E-2.1', 'E-5.1', 'E-4.1', 'E-X.1', 'E-2.10'],
    computes: [],
    sentinels: ['sentinel-survival-margin', 'capital-health', 'margin-health'],
  },
};

// ═══ Boundaries 数据（按 expert 和 tier 确定） ═══

const EXPERT_BOUNDARIES = {
  'finance': {
    prohibitedDimensions: ['organizational', 'technology', 'customer-segment'],
    degradedBehavior: '财务数据源不可用或部分边缺失时返回部分指标并标记 degraded:true',
  },
  'strategy': {
    prohibitedDimensions: ['financial-detail', 'operational', 'technology-implementation'],
    degradedBehavior: '竞争数据源不存在时返回 degraded:true，仅输出已有数据',
  },
  'org': {
    prohibitedDimensions: ['financial', 'market-pricing', 'technology-stack'],
    degradedBehavior: '组织数据采集失败时返回 degraded:true，跳过不可用维度',
  },
  'marketing': {
    prohibitedDimensions: ['financial-internal', 'organizational', 'technology-stack'],
    degradedBehavior: '客户/渠道数据不足时降级为部分报告，标记 degraded:true',
  },
  'tech': {
    prohibitedDimensions: ['financial', 'organizational', 'market-strategy'],
    degradedBehavior: '运营数据不可用时返回部分指标并标记 degraded:true',
  },
  'action': {
    prohibitedDimensions: ['financial-decision', 'strategic-direction'],
    degradedBehavior: '执行数据不足时返回 degraded:true，仅输出可用数据',
  },
  'business_model': {
    prohibitedDimensions: ['financial-detail', 'technology-implementation'],
    degradedBehavior: '协同数据不可用时返回 degraded:true，跳过不可用维度',
  },
  'knowledge': {
    prohibitedDimensions: ['financial', 'operational', 'strategic-decision'],
    degradedBehavior: '知识库不可用时返回 degraded:true',
  },
  'host': {
    prohibitedDimensions: ['customer-data', 'financial-decision'],
    degradedBehavior: '系统数据不可用时返回 degraded:true',
  },
  'multi': {
    prohibitedDimensions: [],
    degradedBehavior: '部分专家不可用时降级为部分诊断，标记 degraded:true',
  },
};

// ═══ 工具函数 ═══

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ═══ 主流程 ═══

let patched = 0;
let errors = [];

const allNames = fs.readdirSync(BUILTIN, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('_'))
  .map(e => e.name);

for (const name of allNames) {
  const manifestPath = path.join(BUILTIN, name, 'manifest.json');
  const manifest = readJSON(manifestPath);
  if (!manifest) {
    errors.push(`❌ 无法读取 ${name}/manifest.json`);
    continue;
  }

  // 添加 dependencies
  const deps = DEPENDENCIES[name];
  if (!deps) {
    errors.push(`❌ ${name} 无 dependencies 数据`);
    continue;
  }

  manifest.dependencies = {
    skills: deps.skills || [],
    edges: deps.edges || [],
    computes: deps.computes || [],
    sentinels: deps.sentinels || [],
  };

  // 添加 boundaries
  const expert = manifest.expert || 'host';
  const boundaries = EXPERT_BOUNDARIES[expert] || EXPERT_BOUNDARIES['host'];

  manifest.boundaries = {
    prohibitedDimensions: boundaries.prohibitedDimensions,
    degradedBehavior: boundaries.degradedBehavior,
    preconditions: manifest.tier === 'L1'
      ? ['数据源连接可用']
      : manifest.tier === 'L2'
        ? ['L1感知层数据已采集', '对应compute函数可用']
        : manifest.tier === 'L3' || manifest.tier === 'L4'
          ? ['下级L1-L2数据已就绪', '相关compute函数可用', 'GraphStore连接正常']
          : manifest.tier >= 'L5'
            ? ['下级Skill执行结果已就绪', 'GraphStore连接正常']
            : ['数据源连接可用'],
  };

  // 添加 loading 和 lifecycle（D66 模板补充字段）
  manifest.loading = 'on-demand';
  manifest.lifecycle = 'active';

  writeJSON(manifestPath, manifest);
  patched++;
  if (patched % 10 === 0 || patched === allNames.length) {
    console.log(`  ✅ ${patched}/${allNames.length} — ${name}`);
  }
}

console.log(`\n✅ D66 补丁完成：${patched} 个 manifest 已添加 dependencies + boundaries`);
if (errors.length) {
  console.log(`\n⚠️  ${errors.length} 个错误:`);
  errors.forEach(e => console.log(`  ${e}`));
}

// 验证
console.log('\n--- 验证 ---');
const verifySample = readJSON(path.join(BUILTIN, 'diagnose-cashflow-health', 'manifest.json'));
console.log('diagnose-cashflow-health.dependencies:');
console.log(JSON.stringify(verifySample.dependencies, null, 2));
console.log('\ndiagnose-cashflow-health.boundaries:');
console.log(JSON.stringify(verifySample.boundaries, null, 2));

const verifyL1 = readJSON(path.join(BUILTIN, 'acquire-financial-data', 'manifest.json'));
console.log('\nacquire-financial-data.dependencies:');
console.log(JSON.stringify(verifyL1.dependencies, null, 2));
