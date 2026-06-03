/**
 * 模板详情页生成器 —— 自动产出每个行业模板的详情页
 * 位置: E:\scenario-forge-v2\src\team-protocol\detail-page-generator.ts
 * 沈括 @ 2026-05-06
 *
 * 设计原则:
 *   1. 从 team-protocol.json + 角色文件自动生成，不靠手工写
 *   2. 随每次 G-04 流水线重跑自动更新（版本号绑定）
 *   3. 明确告知边界: 能做什么、不能做什么、什么情况下该换模板
 */
interface DetailPageInput {
  templateName: string;
  industry: string;
  region: string;
  category: string;
  recommendedMode: string;
  modeScores: Record<string, number>;
  roleNames: string[];
  gapCoverage: { high: number; medium: number; low: number };
  consistencyPassed: boolean;
  version: string;
  generatedAt: string;
  warnings: string[];
}

export function generateDetailPage(input: DetailPageInput): string {
  const modeIcons: Record<string, string> = {
    iron_captain: '⚓ 铁腕船长——决策者主导，团队执行力强',
    democratic_council: '🏛️ 民主议会——集体讨论做出关键决策',
    loose_federation: '🌐 松散联邦——各角色高度自治，弱耦合',
    cross_check_balance: '⚖️ 交叉制衡——角色互审，合规优先',
  };

  const industryLabels: Record<string, string> = {
    ecommerce: '跨境电商', fintech: '金融科技', healthcare: '医疗健康',
    saas: 'SaaS/企业服务', gaming: '游戏', manufacturing: '制造业',
    edtech: '教育科技', logistics: '跨境物流', beauty: '美妆',
    fashion: '服饰', food: '食品', general: '通用',
  };

  const regionLabels: Record<string, string> = {
    vietnam: '🇻🇳 越南', indonesia: '🇮🇩 印尼', brazil: '🇧🇷 巴西',
    thailand: '🇹🇭 泰国', philippines: '🇵🇭 菲律宾', india: '🇮🇳 印度',
    us: '🇺🇸 美国', middle_east: '🌍 中东', unknown: '🌏 通用',
  };

  const lines: string[] = [];

  // ── Header ──
  lines.push(`# ${input.templateName}`);
  lines.push('');
  lines.push(`> **版本**: ${input.version} | **更新**: ${input.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push(`${regionLabels[input.region] || input.region} · ${industryLabels[input.industry] || input.industry} · ${input.category}`);
  lines.push('');

  // ── 快速预览 ──
  lines.push('## 🎯 快速预览');
  lines.push('');
  lines.push(`- **协同模式**: ${modeIcons[input.recommendedMode] || input.recommendedMode}`);
  lines.push(`- **角色数量**: ${input.roleNames.length} 个`);
  lines.push(`- **置信度**: ${input.gapCoverage.high + input.gapCoverage.medium >= 6 ? '较高' : '一般'}`);
  lines.push(`- **一致性**: ${input.consistencyPassed ? '✅ 通过 8 条一致性规则' : '⚠️ 存在冲突，见下方警告'}`);
  lines.push('');

  // ── 这个模板能做什么 ──
  lines.push('## ✅ 能做什么');
  lines.push('');
  lines.push('这个模板为以下场景设计：');
  lines.push('');
  lines.push(`1. **${industryLabels[input.industry] || input.industry}团队**在 **${regionLabels[input.region] || input.region}市场** 的实际运营`);
  lines.push(`2. 涵盖从选品、上架、定价、促销到退货处理的全链路`);
  lines.push(`3. 角色分工基于行业公开信息自动推断，覆盖 8 个协作维度`);
  lines.push('4. 每个角色都有明确的职责、所需技能和协作关系');
  lines.push('5. 提供合规风险预警（如认证要求、平台政策变化等）');
  lines.push('');

  // ── 不能做什么（边界） ──
  const boundaries = getBoundaries(input);
  lines.push('## ❌ 不能做什么');
  lines.push('');
  for (const b of boundaries) {
    lines.push(`- ${b}`);
  }
  lines.push('');

  // ── 模式推导 ──
  lines.push('## 🔀 为什么推荐这个模式？');
  lines.push('');
  for (const [mode, score] of Object.entries(input.modeScores)) {
    const bar = '█'.repeat(Math.round(score * 2));
    lines.push(`- **${mode}**: ${bar} ${(score as number).toFixed(0)}分`);
  }
  lines.push('');
  lines.push(`最终选择 **${input.recommendedMode}**: ${getModeReason(input.recommendedMode, input)}`);
  lines.push('');

  // ── 角色清单 ──
  lines.push('## 👥 角色清单');
  lines.push('');
  lines.push('| 角色 | 层级 | 核心职责 |');
  lines.push('|:-----|:----:|:--------|');
  for (const name of input.roleNames.slice(0, 10)) {
    const layer = name.includes('决策') || name.includes('合规') || name.includes('财务') ? 'L3 治理' :
                  name.includes('数据') ? 'L1 理解' : 'L2 执行';
    lines.push(`| ${name} | ${layer} | ${getRoleBrief(name)} |`);
  }
  lines.push('');

  // ── 适用条件 ──
  lines.push('## 🔧 适用条件与切换建议');
  lines.push('');
  lines.push('### 建议使用此模板');
  lines.push('');
  lines.push(`- 团队人数: ${input.roleNames.length >= 6 ? '4-8 人' : '2-4 人'}（当前模板为 ${input.roleNames.length} 个角色设计）`);
  lines.push(`- 行业: ${industryLabels[input.industry] || input.industry}`);
  lines.push(`- 目标市场: ${regionLabels[input.region] || input.region}`);
  lines.push('');
  lines.push('### 不适用的情况');
  lines.push('');
  for (const b of getContraindications(input)) {
    lines.push(`- ${b}`);
  }
  lines.push('');

  // ── 版本历史 ──
  lines.push('## 📜 版本');
  lines.push('');
  lines.push(`| 版本 | 日期 | 变更 |`);
  lines.push(`|:-----|:-----|:-----|`);
  lines.push(`| ${input.version} | ${input.generatedAt.slice(0, 10)} | 初始化：${input.roleNames.length}个角色，${input.recommendedMode}模式 |`);
  lines.push('');

  // ── 警告 ──
  if (input.warnings.length > 0) {
    lines.push('## ⚠️ 注意事项');
    lines.push('');
    for (const w of input.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// 辅助
// ============================================================

function gapLabel(gap: string): string {
  const labels: Record<string, string> = {
    division_of_labor: '分工',
    information_flow: '信息流',
    authority_governance: '权限治理',
    trust_incentive: '信任与激励',
    knowledge_sharing: '知识共享',
    external_interface: '外部接口',
    /** @deprecated 8→6 合并, 保留向后兼容 */
    conflict_resolution: '冲突解决',
    /** @deprecated 8→6 合并, 保留向后兼容 */
    power_distribution: '权力分配',
    /** @deprecated 8→6 合并, 保留向后兼容 */
    incentive_alignment: '激励对齐',
    /** @deprecated 8→6 合并, 保留向后兼容 */
    trust_model: '信任模型',
  };
  return labels[gap] || gap;
}

function getRoleBrief(name: string): string {
  const briefs: Record<string, string> = {
    '选品经理': '品类规划、供应商管理、新品开发',
    '品牌主理人': '品类规划、供应商管理、新品开发',
    '运营专员': '日常运营、平台维护、流程优化',
    '本地化运营专员': '日常运营、平台维护、本地化适配',
    '物流协调员': '仓储配送、库存周转、物流异常处理',
    '跨境物流与COD优化师': '仓储配送、COD管理、跨境物流优化',
    '合规官': '法规合规审查、一票否决权',
    '越南合规与税务专员': '法规合规审查、税务管理、一票否决权',
    '客服经理': '客户服务、纠纷处理、反馈分析',
    '营销经理': '营销策略、广告投放、ROI优化',
    '数据分析师': '数据看板、决策支持、异常预警',
    '数据与复盘负责人': '数据看板、决策支持、复盘分析',
    '决策者': '战略方向、重大决策审批、资源分配',
    '财务专员': '预算成本、折扣审核、结算对账',
  };
  return briefs[name] || '见角色文件详情';
}

function getModeReason(mode: string, input: DetailPageInput): string {
  const reasons: Record<string, string> = {
    iron_captain: '团队规模小，需要一人主导快速决策，适合初创期跑通从0到1',
    democratic_council: '团队成熟度较高，需要多方参与避免单一盲区',
    cross_check_balance: '合规要求高/风险敏感行业，角色间相互审查降低系统性风险',
    loose_federation: '各角色高度独立，协同需求低，适合人少但每人独当一面',
  };
  return reasons[mode] || '基于多维特征加权评分自动推荐';
}

function getBoundaries(input: DetailPageInput): string[] {
  const base = [
    '不适用于与模板行业完全不同的领域（如用美妆模板管理SaaS团队）',
    '不替代法律合规建议——ANVISA/BIS等认证要求请咨询当地专业机构',
    '平台政策会变化，模板基于生成时的公开信息，具体以平台最新规则为准',
    '角色分工是建议性而非强制性的——可根据实际团队情况调整合并',
  ];

  if (input.gapCoverage.medium + input.gapCoverage.low > 3) {
    base.push('⚠️ 部分缝隙证据不充分，对应的角色建议置信度较低');
  }

  return base;
}

function getContraindications(input: DetailPageInput): string[] {
  const contras: string[] = [];

  if (input.industry === 'ecommerce') {
    contras.push('市场规模 < $5M 的极小项目可能不需要完整角色（可考虑精简版）');
    contras.push('非电商行业（如纯内容、纯社交类）的基础运营逻辑不同');
  }
  if (['fintech', 'healthcare'].includes(input.industry)) {
    contras.push('合规要求极高的场景（如涉及处方药、金融牌照）模板不够深入');
  }

  contras.push('模板是通用框架，每个具体业务的特殊需求需要人工适配');
  return contras;
}
