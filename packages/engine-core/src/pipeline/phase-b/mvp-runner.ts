/**
 * 群像蒸馏 MVP 入口
 *
 * 以'跨境电商供应链对接员'为测试角色
 * 运行： npx ts-node src/group-distill/mvp-runner.ts
 *
 * @date 2026-05-08
 */

import type { RoleDecisionProfile } from './decision-extractor';
import { extractDecisionsFromConstraints, enhanceDecisionsFromSources } from './decision-extractor';
import { matchFrameworks, selectTopFrameworks } from './framework-matcher';
import { deriveAntiPatterns } from './anti-pattern-deriver';
import { assembleGenome } from './genome-assembler';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/phase-b/mvp-runner');

/**
 * 供应链对接员测试数据集
 * 来自 RS-23 供应链对接员群像蒸馏推导 + MBA智库/行业JD
 */
const SUPPLY_CHAIN_PROFILE: RoleDecisionProfile = {
  roleName: '跨境电商供应链对接员',
  roleDescription: '负责跨境贸易中供应商开发、评估、采购、物流协调和质量管控的角色',
  constraints: [
    '时间约束: 跨境物流有固定周期，不可压缩',
    '信息约束: 供应商在异国，信息不对称且无法实时验证',
    '质量约束: 质检在发货前完成，漏检不可逆',
    '关系约束: 供应商选择成本高，切换成本更高',
    '资金约束: 跨境结算周期长，现金流压力大',
  ],
  failureModes: [
    '轻易相信供应商的口头承诺',
    '为保交付进度接受不合格品',
    '因短期价格优势切换供应商，忽略长期关系',
    '信息不足时盲目下单',
    '过度依赖单一供应商',
    '合同条款不清晰导致法律纠纷',
  ],
  jdExcerpts: [
    '负责供应商开发、评估与管理，建立供应商资源池',
    '谈判采购合同，包括价格、交期、付款条件',
    '监控供应链风险，制定应急预案',
    '协调跨境物流，确保货物准时到达',
    '跟踪行业动态，识别新兴供应商机会',
  ],
  communityPosts: [
    '做跨境3年，被骗两次：一次货不对版，一次虚假发货',
    '供应商突然涨价30%，没有备选方案怎么办',
    '质检发现瑕疵，但交期只剩3天——整批退还是让步接收',
    '供应商一直不交合同，后来发现他同时在跟竞争对手谈',
  ],
};

function main() {
  log.info('=== 群像蒸馏 MVP ===');
  log.info('角色：', SUPPLY_CHAIN_PROFILE.roleName);
  log.info('');

  // S1: 从约束推导决策类型
  log.info('--- S1: 决策提取 ---');
  const baseDecisions = extractDecisionsFromConstraints(SUPPLY_CHAIN_PROFILE);
  log.info(`基础决策类型: ${baseDecisions.length}个`);
  baseDecisions.forEach(d => log.info(`  - ${d.name} (${d.severity})`));

  const enhancedDecisions = enhanceDecisionsFromSources(baseDecisions, SUPPLY_CHAIN_PROFILE);
  log.info(`\n信源增强后决策类型: ${enhancedDecisions.length}个`);
  enhancedDecisions.forEach(d => log.info(`  - ${d.name} | 频率:${d.frequency} | 严重度:${d.severity}`));

  // S3: 框架匹配
  log.info('\n--- S3: 框架匹配 ---');
  const matchResult = matchFrameworks(enhancedDecisions);
  log.info(`覆盖决策: ${enhancedDecisions.length - matchResult.unmatchedDecisionTypes.length}/${enhancedDecisions.length} (${(matchResult.coverage * 100).toFixed(0)}%)`);
  if (matchResult.unmatchedDecisionTypes.length > 0) {
    log.info('未匹配:', matchResult.unmatchedDecisionTypes.join(', '));
  }

  const topFrameworks = selectTopFrameworks(matchResult, 5);
  log.info('\nTop 5 心智模型:');
  topFrameworks.forEach((mf, i) => {
    log.info(`  ${i + 1}. ${mf.framework.name} (${(mf.matchScore * 100).toFixed(0)}%)`);
    log.info(`     ${mf.framework.coreInsight.substring(0, 60)}...`);
  });

  // S5: 反模式推导
  log.info('\n--- S5: 反模式 ---');
  const antiPatterns = deriveAntiPatterns(enhancedDecisions, matchResult.matchedFrameworks);
  antiPatterns.forEach((ap, i) => {
    log.info(`  ${i + 1}. [${ap.severity}] ${ap.name}`);
    log.info(`     → ${ap.remediation.substring(0, 60)}...`);
  });

  // S6: 组装 PersonaGenome
  log.info('\n--- S6: 组装 ---');
  const genome = assembleGenome(SUPPLY_CHAIN_PROFILE.roleName, enhancedDecisions, matchResult.matchedFrameworks, antiPatterns);

  log.info(`\n=== 生成结果 ===`);
  log.info(`角色: ${genome.roleName}`);
  log.info(`心智模型数: ${genome.mentalModels.length}`);
  log.info(`反模式数: ${genome.antiPatterns.length}`);
  log.info(`置信度: ${genome.meta.confidence}`);
  log.info(`框架覆盖率: ${(genome.meta.frameworkCoverage * 100).toFixed(0)}%`);
  log.info(`\n--- 完整输出 ---`);
  log.info(JSON.stringify(genome, null, 2));
}

main();
