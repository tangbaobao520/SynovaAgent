/**
 * 中国 3C 数码电商 —— LLM 桥接推断结果
 * 推理模型: deepseek-v4-pro
 * 证据: 40 fragments (real web_search)
 * 生成时间: 2026-05-06
 */
const gapInferences = [
  {
    gap: 'division_of_labor',
    mode: 'role_based',
    confidence: 'high',
    reasoning: '证据明确显示3C数码电商需模块化角色分工：产品运营（选品+定价）、营销推广（平台+社媒）、供应链物流（多仓库WMS）、系统技术（数据分析）。制造-零售-物流三业联动，天然对应4-5个专业角色。',
    rolesNeeded: ['选品经理', '平台运营专员', '供应链经理', '营销推广专员', '数据分析师'],
    keywords: ['模块化分工', '选品', '供应链', '平台运营', 'WMS']
  },
  {
    gap: 'information_flow',
    mode: 'hub_spoke',
    confidence: 'high',
    reasoning: '平台政策更新频率极高（618分阶段促销、国补规则变化、平台罚单），需要专人集中监控京东/天猫/拼多多/抖音多家平台政策，然后广播给执行角色。运营专员天然是信息Hub。',
    rolesNeeded: ['运营专员(hub)', '数据分析师'],
    keywords: ['平台政策监控', '国补', '促销节奏', '信息Hub']
  },
  {
    gap: 'authority_governance',
    mode: 'escalation_with_veto',
    confidence: 'high',
    reasoning: '3C数码纠纷有明确层级：商家协商→平台投诉→监管部门→法院诉讼。且涉及国家三包政策、拆封退货判定等专业性问题，合规官需要一票否决权来阻止不合规的售后拒绝。',
    rolesNeeded: ['客服经理', '合规官'],
    keywords: ['三包政策', '拆封退货', '逐级升级', '消费者保护']
  },
  {
    gap: 'authority_governance',
    mode: 'hierarchical',
    confidence: 'high',
    reasoning: '3C数码需要严格的价格层级管理（旗舰店/专卖店/经销商/线下），促销活动必须提前报备审核，实时监控防止渠道串货。这要求定价权和促销审批权集中在决策层。',
    rolesNeeded: ['决策者', '渠道经理'],
    keywords: ['价格层级', '促销审批', '渠道管控', '防串货']
  },
  {
    gap: 'trust_incentive',
    mode: 'innovation_quota',
    confidence: 'high',
    reasoning: '证据反复强调"数据代替感觉"和"小单测款"——14天内日均<5单退出、TikTok 7天测试期、AI选品趋势。3C数码"追新"特征（91.7%关注新品）要求持续迭代的测款机制。',
    rolesNeeded: ['选品经理', '数据分析师'],
    keywords: ['小单测款', '数据驱动', '新品迭代', '退出标准']
  },
  {
    gap: 'trust_incentive',
    mode: 'audit_required',
    confidence: 'high',
    reasoning: '3C强制认证是法律红线——无证销售最高罚2倍货值、伪造3C标志退一赔三（法院判例）、多地执法部门都有权查处。2026年平台罚单35.97亿元，审查力度空前。合规官必须有权否决任何不合规产品的上架。',
    rolesNeeded: ['合规官(3C认证审查,一票否决)', '供应链经理'],
    keywords: ['3C强制认证', '退一赔三', '合规审查', '法律红线']
  },
  {
    gap: 'knowledge_sharing',
    mode: 'cultural_immersion',
    confidence: 'high',
    reasoning: '小红书1.8亿用户做购买决策（搜索+61%）、消费者从参数比较转向场景化体验、91.7%"追新"——团队必须深度浸入消费者文化和平台生态（小红书种草→直播转化），而不是仅靠内部文档。',
    rolesNeeded: ['营销经理', '内容运营专员'],
    keywords: ['小红书种草', '场景化体验', '消费者洞察', '追新']
  },
  {
    gap: 'external_interface',
    mode: 'redundancy',
    confidence: 'high',
    reasoning: '离职交接有成熟SOP（文档+操作手册+权限+1-2周带教），数字化系统能缩短60%交接时间、降低42%业务波动。企业已用劳动合同附件锁定交接义务。关键岗位需有应急预案（72小时逆向重建能力）。',
    rolesNeeded: ['决策者', '人事专员'],
    keywords: ['SOP交接', '数字化知识库', '带教期', '应急预案']
  }
];

export default gapInferences;
