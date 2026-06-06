/**
 * l2/domain-keywords.ts — 领域关键词映射表
 *
 * ExpertRouter Layer 2 使用。借鉴 claw-code token matching 模式。
 * strong: 高置信度关键词（命中 1 个即匹配）
 * weak: 辅助关键词（需命中 ≥2 个）
 * 运行时可通过 registerKeywords() 扩展。
 */

export interface DomainKeywordSet {
  strong: string[];
  weak: string[];
}

export const DEFAULT_DOMAIN_KEYWORDS: Record<string, DomainKeywordSet> = {
  finance: {
    strong: ['财务', '成本', '利润', '税务', '现金流', '报表', 'ROI', 'CPA', '杜邦',
      '盈利', '亏损', '毛利率', '净利率', '支出', '报销', '审计', '发票',
      '应收账款', '应付账款', '折旧', '摊销', '股东权益', '资产负债'],
    weak:   ['钱', '收入', '预算', '资产', '负债', '账', '费', '税'],
  },
  org: {
    strong: ['组织', '团队', '管理', '文化', '招聘', '绩效', '薪酬', '劳动法', 'OKR',
      '组织架构', '层级', '协作', '信息流', '沟通', '冲突', '人事', '编制',
      '胜任力', '360评估', '人才密度', 'BusFactor', '杨国安'],
    weak:   ['部门', '人太多', '离职', '协作', '人多', '人少', '人事', '员工'],
  },
  strategy: {
    strong: ['战略', '方向', '竞争', '蓝海', '波特', '差异化', '壁垒', '护城河',
      '定位', '使命', '愿景', '蓝海战略', 'BCG矩阵', 'SWOT', '增长飞轮',
      '第二曲线', '商业模式', '核心竞争力', '市场份额', '扩张'],
    weak:   ['定位', '增长', '未来', '目标', '方向', '长期', '3年', '5年'],
  },
  tech: {
    strong: ['技术', '系统', '自动化', '架构', '代码', 'AI', 'LLM', '技术债务',
      '微服务', '云原生', 'DevOps', 'CI/CD', 'API', '数据库', 'SaaS',
      'PaaS', '容器', 'Serverless', '安全漏洞', 'RPA', '数字化'],
    weak:   ['工具', '软件', '数字化', '系统', '平台', '技术栈'],
  },
  marketing: {
    strong: ['营销', '客户', '品牌', '广告', '获客', '转化', '渠道', 'CAC', 'LTV',
      '品牌定位', '竞品', '差异化', 'GTM', 'SEO', 'SEM', '内容营销', '私域',
      '增长黑客', '社群', '口碑', 'NPS', '留存率', '复购', '定价策略'],
    weak:   ['市场', '推广', '用户', '客户', '消费者', '买家'],
  },
  action: {
    strong: ['执行', '项目', '进度', '交付', '流程', '瓶颈', '优先级', '排期',
      'OKR', 'KPI', 'Scrum', '看板', '精益', '六西格玛', '里程碑',
      'Sprint', '回顾', '复盘', '甘特图', 'WBS', '关键路径'],
    weak:   ['任务', '计划', '跟踪', '推进', '落地', '交付物'],
  },
};

/** 领域 → 专家 ID 映射 */
export const DOMAIN_EXPERT_MAP: Record<string, string> = {
  finance: 'finance',
  org: 'org',
  strategy: 'strategy',
  tech: 'tech',
  marketing: 'marketing',
  action: 'action',
};

/** 允许运行时注册领域关键词（ExtensionRegistry 注入） */
export function registerKeywords(domain: string, keywords: DomainKeywordSet): void {
  DEFAULT_DOMAIN_KEYWORDS[domain] = keywords;
}
