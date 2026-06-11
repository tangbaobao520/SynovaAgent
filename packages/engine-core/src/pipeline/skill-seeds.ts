/**
 * @deprecated 旧 Novis/ClawOrg 通用 AI 技能种子。
 * SynovaAgent 使用 synova-agent/src/tools/pattern-engine.ts (30条诊断模式)。
 * 保留供旧 L0-L5 管道兼容。不删除——被 8 个文件引用。
 *
 * skill-seeds.ts — 结构化技能种子数据
 *
 * V1.5 L1/L2/L3 升级：将 22 遗留技能 + 5 框架技能映射转为完整 SkillPattern[]
 * 每条包含 L2（prerequisites/failureModes/sourceTier）+ L3（dependsOn/conflictsWith/triggers）
 *
 * 来源:
 *   - legacy-archive/.../seedData/skills.ts (BUILTIN 10 + GUISHANG 7 + BAGUI 5 = 22)
 *   - docs/design-decisions/SKILLCARD-SCHEMA-V1.md FRAMEWORK_SKILL_MAP (5)
 */

import type { SkillPattern } from './phase-b/framework-library';

// ══════════════════════════════════════════════════════════════════
// A. 遗留内置技能（10 条，从 BUILTIN_SKILLS 转换）
// ══════════════════════════════════════════════════════════════════

const BUILTIN_SEEDS: SkillPattern[] = [
  {
    name: '文本摘要',
    summary: '提取长文本的核心要点，生成简洁的摘要信息',
    category: '数据分析',
    tags: ['文本处理', '摘要', '信息提取'],
    isMarketplaceSkill: true,
    prerequisites: ['原始文本内容完整', '明确摘要长度或要点数量要求'],
    failureModes: ['关键数字/日期在摘要中丢失', '摘要遗漏次要但重要的信息点', '过度浓缩导致原意扭曲'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户提交长文本并要求总结', '会议记录需要生成纪要'],
  },
  {
    name: '情感分析',
    summary: '分析文本的正负面情绪倾向及情感强度',
    category: '数据分析',
    tags: ['情感分析', 'NLP', '舆情监测'],
    isMarketplaceSkill: true,
    prerequisites: ['待分析文本内容', '了解分析目标（客户反馈/舆情/用户评价）'],
    failureModes: ['讽刺/反语误判为正面', '多语言混合文本分析偏差', '领域术语的情感极性理解错误'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户提交客户反馈/评论数据', '品牌需要监测社交媒体舆情'],
  },
  {
    name: '多语言翻译',
    summary: '支持中英日韩等常见语言互译，保持语义准确和风格一致',
    category: '内容创作',
    tags: ['翻译', '多语言', '本地化'],
    isMarketplaceSkill: true,
    prerequisites: ['明确源语言和目标语言', '了解文本类型（正式/口语/技术文档）'],
    failureModes: ['专业术语翻译不准确', '口语化文本使用过于正式的译文', '数字/日期格式未按目标语言习惯转换'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户提交需要跨语言转换的文本', '跨境业务需要多语言内容'],
  },
  {
    name: '代码解释',
    summary: '解释代码片段的功能、逻辑和使用方式',
    category: '开发工具',
    tags: ['代码', '编程', '解释'],
    isMarketplaceSkill: true,
    prerequisites: ['完整可读的代码片段', '明确编程语言/框架'],
    failureModes: ['对过时API的用法给出错误建议', '忽略代码中的安全漏洞', '解释过于学术化不够实用'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户提交代码片段请求解释', '代码审查中需要理解他人代码'],
  },
  {
    name: '邮件起草',
    summary: '根据要点生成专业规范的商务邮件',
    category: '内容创作',
    tags: ['邮件', '商务写作', '沟通'],
    isMarketplaceSkill: true,
    prerequisites: ['收件人角色和关系（上级/平级/客户）', '邮件目的和关键要点'],
    failureModes: ['语气与收件人关系不匹配', '遗漏关键行动呼吁', '过度正式显得不自然'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户需要发送商务邮件', '客户沟通需要正式书面记录'],
  },
  {
    name: '社交媒体文案',
    summary: '生成适合各平台推广风格的社交媒体文案',
    category: '营销推广',
    tags: ['社交媒体', '文案', '营销'],
    isMarketplaceSkill: true,
    prerequisites: ['产品/服务核心信息', '目标平台（微信/小红书/抖音/LinkedIn等）'],
    failureModes: ['平台风格不匹配（如小红书文案用在LinkedIn）', '过度营销引起用户反感', '未包含合规要求的广告标识'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['品牌需要发布社交媒体内容', '新品上市需要多平台推广'],
  },
  {
    name: '数据可视化建议',
    summary: '根据数据特征推荐最适合的图表展示方案',
    category: '数据分析',
    tags: ['数据可视化', '图表', 'BI'],
    isMarketplaceSkill: true,
    prerequisites: ['数据类型和维度信息', '数据量级和数值范围'],
    failureModes: ['推荐的图表类型不适合目标受众', '忽略数据分布特征导致可视化误导', '配色方案对色盲用户不友好'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户需要将数据制作成图表', 'BI报告需要选择可视化方案'],
  },
  {
    name: '合同条款审查',
    summary: '识别合同中的风险条款并提供修改建议',
    category: '合规管理',
    tags: ['合同', '法律', '风险'],
    isMarketplaceSkill: true,
    prerequisites: ['完整合同文本', '了解合同涉及的司法管辖区'],
    failureModes: ['遗漏隐蔽的单方解除条款', '对违约金合理性判断缺乏行业基准', '未识别跨法域法律冲突风险'],
    sourceTier: 'verified',
    dependsOn: ['法规合规检查'],
    conflictsWith: [],
    triggers: ['用户提交合同要求审查', '商务谈判中需要评估合同风险'],
  },
  {
    name: '隐私数据脱敏',
    summary: '对敏感个人信息进行自动脱敏处理',
    category: '合规管理',
    tags: ['隐私', '数据安全', '脱敏'],
    isMarketplaceSkill: true,
    prerequisites: ['待脱敏的原始文本', '明确的脱敏规则（如GDPR/中国个人信息保护法要求）'],
    failureModes: ['未识别新型个人标识符（如设备指纹）', '脱敏后数据仍可通过交叉关联恢复', '脱敏规则未及时更新以适应新法规'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户提交包含个人信息的文本', '需要在测试环境中使用生产数据'],
  },
  {
    name: '网页抓取与信息提取',
    summary: '抓取指定网页内容并提取结构化信息',
    category: '数据分析',
    tags: ['网页抓取', '信息提取', '数据采集'],
    isMarketplaceSkill: true,
    prerequisites: ['目标网页URL', '明确需要提取的信息类型'],
    failureModes: ['页面结构变化导致提取失败', '未遵守 robots.txt 或爬虫协议', '提取内容侵犯版权或违反服务条款'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['用户需要从网页获取结构化数据', '竞品信息持续监测'],
  },
];

// ══════════════════════════════════════════════════════════════════
// B. 桂商出海技能（7 条，从 GUISHANG_SKILLS 转换）
// ══════════════════════════════════════════════════════════════════

const GUISHANG_SEEDS: SkillPattern[] = [
  {
    name: '多语言标题翻译',
    summary: '将商品标题翻译为东盟5国语言（泰/越/马来/印尼/菲律宾），保持营销风格',
    category: '内容创作',
    tags: ['跨境电商', '翻译', '东盟'],
    isMarketplaceSkill: true,
    prerequisites: ['原始商品中文标题', '目标国家/语言', '了解各平台标题长度限制'],
    failureModes: ['品牌名翻译不当损害品牌形象', '当地热门关键词使用过时', '语言变体混淆（如印尼语vs马来语差异）'],
    sourceTier: 'verified',
    dependsOn: ['多语言翻译'],
    conflictsWith: [],
    triggers: ['商品需要上架东南亚电商平台', '东南亚市场多语言Listing优化'],
  },
  {
    name: 'HS编码查询与归类',
    summary: '根据商品参数查询对应HS编码，确保出口报关合规',
    category: '合规管理',
    tags: ['HS编码', '出口', '报关'],
    isMarketplaceSkill: true,
    prerequisites: ['商品材质/用途/成分等关键参数', '目标出口国家'],
    failureModes: ['HS编码归类错误导致关税计算偏差', '目标国海关编码更新未及时同步', '复杂商品（多材质）归类歧义'],
    sourceTier: 'verified',
    dependsOn: ['法规合规检查'],
    conflictsWith: [],
    triggers: ['客户提出出口新产品', '目标市场关税政策变更'],
  },
  {
    name: '合规审计检查',
    summary: '检查出口商品的合规性，包括认证要求、标签规范和禁售限制',
    category: '合规管理',
    tags: ['合规', '认证', '出口'],
    isMarketplaceSkill: true,
    prerequisites: ['商品类别和规格', '目标市场法规要求', '已有认证证书清单'],
    failureModes: ['遗漏新兴市场新增的认证要求', '标签语言要求未覆盖所有目标市场', '化学物质限制标准引用过时版本'],
    sourceTier: 'verified',
    dependsOn: ['HS编码查询与归类'],
    conflictsWith: [],
    triggers: ['新产品出口前合规审查', '目标市场法规更新'],
  },
  {
    name: '认证顾问',
    summary: '为出口商品匹配合适的国际认证方案（如CE/FCC/FDA/Halal等）',
    category: '合规管理',
    tags: ['认证', '出口', 'CE', 'FDA'],
    isMarketplaceSkill: true,
    prerequisites: ['商品类别和用途', '目标市场', '已有认证状态'],
    failureModes: ['认证等效性判断错误（如某国不接受他国认证）', '忽略认证更新周期导致证书过期', '对特殊品类认证要求（如医疗器械）理解不足'],
    sourceTier: 'verified',
    dependsOn: ['合规审计检查'],
    conflictsWith: [],
    triggers: ['产品首次进入新目标市场', '客户询问特定认证要求'],
  },
  {
    name: '竞品监测与分析',
    summary: '监测目标市场竞品上架、定价、促销和评价趋势',
    category: '市场情报',
    tags: ['竞品', '监测', '定价', '市场'],
    isMarketplaceSkill: true,
    prerequisites: ['竞品品牌/店铺列表', '目标电商平台', '监测频率要求'],
    failureModes: ['未区分竞品的季节性波动与趋势性变化', '忽略竞品评价中的消费者需求信号', '仅关注价格而忽略竞品Listing质量优化'],
    sourceTier: 'verified',
    dependsOn: ['网页抓取与信息提取'],
    conflictsWith: [],
    triggers: ['新品上架前竞品调研', '季度性市场回顾'],
  },
  {
    name: '多语言客服',
    summary: '为东南亚客户提供泰/越/马来/印尼/菲律宾语的基础客服支持',
    category: '沟通协调',
    tags: ['客服', '多语言', '东南亚'],
    isMarketplaceSkill: true,
    prerequisites: ['客户问题原文', '产品/订单信息', '售后政策'],
    failureModes: ['对文化敏感的投诉处理不当', '机器翻译导致客户误解升级', '未识别需要人工客服升级的紧急情况'],
    sourceTier: 'verified',
    dependsOn: ['多语言翻译'],
    conflictsWith: [],
    triggers: ['东南亚客户提交售后问题', '店铺收到多语言差评'],
  },
  {
    name: '出口发票生成',
    summary: '根据订单信息生成符合国际惯例的商业发票、装箱单和原产地证明',
    category: '运营执行',
    tags: ['发票', '出口', '单证'],
    isMarketplaceSkill: true,
    prerequisites: ['订单详情（商品/数量/金额）', '买卖双方公司信息', '贸易条款（FOB/CIF等）'],
    failureModes: ['HS编码在发票上的申报价值不准确', '遗漏目标国海关要求的特殊声明', '发票格式不符合特定国家海关要求'],
    sourceTier: 'verified',
    dependsOn: ['HS编码查询与归类'],
    conflictsWith: [],
    triggers: ['订单确认后需要准备出口单证', '海关查验要求提供补充发票'],
  },
];

// ══════════════════════════════════════════════════════════════════
// C. 八桂农业技能（5 条，从 BAGUI_SKILLS 转换）
// ══════════════════════════════════════════════════════════════════

const BAGUI_SEEDS: SkillPattern[] = [
  {
    name: '品牌故事生成',
    summary: '根据农产品特点生成有地域特色和情感共鸣的品牌故事',
    category: '营销推广',
    tags: ['品牌', '农业', '故事', '营销'],
    isMarketplaceSkill: true,
    prerequisites: ['农产品品类和产地信息', '目标消费群体画像', '品牌定位和差异化卖点'],
    failureModes: ['品牌故事与产品实际品质不符', '地域文化元素使用不当引发争议', '过度包装导致消费者不信任'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['农产品品牌策划', '电商详情页需要品牌故事文案'],
  },
  {
    name: '种植建议',
    summary: '根据土壤、气候条件和作物类型提供科学的种植管理建议',
    category: '运营执行',
    tags: ['农业', '种植', '作物管理'],
    isMarketplaceSkill: true,
    prerequisites: ['土壤类型和肥力数据', '当地气候和降雨规律', '作物品种特性'],
    failureModes: ['忽略微气候差异导致建议不适用', '未考虑病虫害季节性爆发规律', '过度依赖通用方案忽视本地经验'],
    sourceTier: 'inferred',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['种植季开始前制定种植计划', '作物出现异常生长状况'],
  },
  {
    name: '补贴政策检索',
    summary: '检索和解读最新的农业补贴、出口补贴和地方扶持政策',
    category: '市场情报',
    tags: ['补贴', '政策', '农业', '出口'],
    isMarketplaceSkill: true,
    prerequisites: ['企业/农户基本信息', '经营品类和规模', '所在地区'],
    failureModes: ['政策文件解读遗漏关键申请条件', '未更新最新政策导致错过申报窗口期', '不同层级政策（中央/省/市）冲突时未提示'],
    sourceTier: 'inferred',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['企业需要申请政府补贴', '新政策发布需要评估对企业的影响'],
  },
  {
    name: '价格分析与预测',
    summary: '分析农产品历史价格走势，预测短期价格波动趋势',
    category: '数据分析',
    tags: ['价格', '预测', '农业', '市场'],
    isMarketplaceSkill: true,
    prerequisites: ['农产品品类', '历史价格数据（至少6个月）', '目标市场区域'],
    failureModes: ['未考虑天气突发事件对价格的冲击', '忽略政策干预（收储/投放）对价格的影响', '仅依赖历史趋势忽视供需结构变化'],
    sourceTier: 'inferred',
    dependsOn: ['网页抓取与信息提取'],
    conflictsWith: [],
    triggers: ['农户需要决定销售时机', '采购商需要评估进货成本'],
  },
  {
    name: '出口合规与检疫',
    summary: '检查农产品出口的检疫要求、农药残留标准和进口国准入门槛',
    category: '合规管理',
    tags: ['出口', '检疫', '农药残留', '合规'],
    isMarketplaceSkill: true,
    prerequisites: ['农产品品类和加工程度', '目标出口国家/地区', '当前使用农药清单'],
    failureModes: ['不同国家对同一农药的MRL标准差异巨大', '忽略加工方式对检疫要求的影响', '遗漏包装和标签的检疫合规要求'],
    sourceTier: 'verified',
    dependsOn: ['合规审计检查', 'HS编码查询与归类'],
    conflictsWith: [],
    triggers: ['农产品首次出口到新目标市场', '进口国更新了检疫标准'],
  },
];

// ══════════════════════════════════════════════════════════════════
// D. 框架技能映射（5 条，从 SKILLCARD-SCHEMA-V1.md 转换）
// ══════════════════════════════════════════════════════════════════

const FRAMEWORK_SKILL_SEEDS: SkillPattern[] = [
  {
    name: 'ABC分类与优先级管理',
    summary: '基于帕累托原理对库存/任务/客户进行ABC分类，实现资源的差异化配置',
    category: '运营执行',
    tags: ['ABC分类', '帕累托', '优先级', '库存管理'],
    isMarketplaceSkill: true,
    prerequisites: ['分类对象的完整清单和关键指标', '分类阈值标准（如A类占比20%贡献80%）'],
    failureModes: ['仅按单一维度分类忽略多因素交互', '分类阈值机械应用不随业务阶段调整', 'C类完全忽视导致长尾风险积累'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['库存/任务量超过手工管理能力', '资源配置需要区分优先级'],
  },
  {
    name: '激励结构审计',
    summary: '系统审计组织现有激励体系，识别激励偏差导致的扭曲行为',
    category: '组织设计',
    tags: ['激励', '绩效', 'KPI', '组织'],
    isMarketplaceSkill: true,
    prerequisites: ['现有KPI/OKR/薪酬结构', '团队行为和绩效数据', '业务目标和战略'],
    failureModes: ['仅关注显性激励忽略隐性激励（如晋升预期）', 'KPI博弈行为未被识别', '过度调整激励导致团队不信任'],
    sourceTier: 'verified',
    dependsOn: ['激励方案设计'],
    conflictsWith: [],
    triggers: ['组织出现激励扭曲信号（如刷指标）', '绩效体系改革前诊断'],
  },
  {
    name: '魔鬼代言人审查',
    summary: '对关键决策进行系统性反向论证，克服确认偏误',
    category: '战略规划',
    tags: ['决策', '确认偏误', '批判性思维', '风险管理'],
    isMarketplaceSkill: true,
    prerequisites: ['待审查的决策方案和支撑数据', '决策的影响范围和时效要求'],
    failureModes: ['反向论证流于形式未触及核心假设', '过度否定导致决策瘫痪', '忽略反向论证者的立场偏见'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['重大投资/战略决策前', '团队对某个方案共识过高需要压力测试'],
  },
  {
    name: '任务紧急度分级',
    summary: '基于分诊原理对任务进行紧急度/重要性双维分级，匹配适当的处理策略',
    category: '运营执行',
    tags: ['分诊', '优先级', '任务管理', '紧急度'],
    isMarketplaceSkill: true,
    prerequisites: ['待分级任务清单', '组织当前资源容量', '分级标准（紧急/重要阈值）'],
    failureModes: ['一切标记为紧急导致分级失效', '低估非紧急但重要的战略性任务', '分级结果不被执行层接受'],
    sourceTier: 'verified',
    dependsOn: ['ABC分类与优先级管理'],
    conflictsWith: [],
    triggers: ['同时处理多来源任务请求', '资源瓶颈期需要决策哪些任务优先'],
  },
  {
    name: '变更风险评估',
    summary: '对任何变更请求（代码/配置/流程）进行首要不伤害原则评估',
    category: '合规管理',
    tags: ['变更管理', '风险评估', '不伤害原则', '安全'],
    isMarketplaceSkill: true,
    prerequisites: ['变更内容和影响范围', '当前系统架构/流程文档', '回滚方案'],
    failureModes: ['低估变更的间接影响（级联故障）', '仅关注技术风险忽略用户体验风险', '回滚方案未在变更前验证可用性'],
    sourceTier: 'verified',
    dependsOn: [],
    conflictsWith: [],
    triggers: ['生产环境变更前', '重大配置或架构调整', '发布窗口前的最终安全检查'],
  },
];

// ══════════════════════════════════════════════════════════════════
// 合并导出
// ══════════════════════════════════════════════════════════════════

/** 从遗留系统转换的所有技能种子（22 条） */
export const LEGACY_SKILL_SEEDS: SkillPattern[] = [
  ...BUILTIN_SEEDS,
  ...GUISHANG_SEEDS,
  ...BAGUI_SEEDS,
];

/** 框架→技能映射产生的技能种子（5 条） */
export const FRAMEWORK_SKILL_SEEDS_EXPORT = FRAMEWORK_SKILL_SEEDS;

/** 全部种子技能（遗留 + 框架），用于初始化市场和注册表 */
export const ALL_SEED_SKILLS: SkillPattern[] = [
  ...LEGACY_SKILL_SEEDS,
  ...FRAMEWORK_SKILL_SEEDS,
];
