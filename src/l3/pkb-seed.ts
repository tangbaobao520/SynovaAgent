/**
 * l3/pkb-seed.ts — PKB 种子知识 (Slice 2b)
 *
 * 每个专家 10-15 条初始知识。
 * 类型: theory(理论), benchmark(基准), rule(规则), threshold(阈值)
 * 层级: L1=基础(中小企业主), L2=专业(manager), L3=深度(CFO/CPA)
 *
 * 运行时可通过 add_pkb_entry 工具动态添加团队专属知识。
 */
import { KnowledgeStore } from '../l4/knowledge-store';
import type Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('l3/pkb-seed');

interface SeedEntry {
  domain: string;
  type: 'theory' | 'benchmark' | 'rule' | 'threshold' | 'template' | 'best_practice' | 'case_study' | 'regulation';
  content: string;
  confidence: number;
  level: 1 | 2 | 3;
}

const SEEDS: SeedEntry[] = [
  // ═══ 战略 (15 条) ═══
  { domain: 'strategy', type: 'theory', confidence: 0.95, level: 2, content: '波特五力模型: 供应商议价能力、购买者议价能力、新进入者威胁、替代品威胁、现有竞争者竞争。用于分析行业吸引力。' },
  { domain: 'strategy', type: 'theory', confidence: 0.9, level: 2, content: 'BCG 矩阵: 明星(高增长高份额)、金牛(低增长高份额)、问题(高增长低份额)、瘦狗(低增长低份额)。用于产品组合分析。' },
  { domain: 'strategy', type: 'theory', confidence: 0.85, level: 3, content: '蓝海战略: 通过价值创新创造无竞争市场空间。六条路径框架和四步动作框架(消除/减少/提升/创造)。适用于市场饱和时寻找增长空间。' },
  { domain: 'strategy', type: 'benchmark', confidence: 0.8, level: 2, content: 'SaaS 公司: 健康的 CAC 回收周期 < 12 个月。LTV/CAC > 3 为优秀。年营收增长率 > 40% 为高增长。' },
  { domain: 'strategy', type: 'benchmark', confidence: 0.75, level: 2, content: '制造业: 良品率 > 98%, OEE > 85%, 库存周转率 > 6次/年为健康水平。' },
  { domain: 'strategy', type: 'rule', confidence: 0.85, level: 2, content: '目标对齐原则: 公司级目标→部门级目标→个人目标必须逐层分解。若中层管理者无法复述公司战略关键词,则对齐度<30%。' },
  { domain: 'strategy', type: 'threshold', confidence: 0.8, level: 2, content: '战略清晰度: 员工对公司战略的认知度 < 60% → 高风险,需要战略沟通。中层管理者理解度 < 80% → 中等风险。' },
  { domain: 'strategy', type: 'best_practice', confidence: 0.7, level: 1, content: '中小企业: 每年至少一次战略回顾会议。聚焦 3-5 个关键目标,不要同时推进超过 5 个战略方向。' },
  { domain: 'strategy', type: 'benchmark', confidence: 0.75, level: 1, content: '50人以下企业: CEO 直接参与销售和产品,不需要独立战略部门。50-200人: 需要明确的战略文档和季度回顾。' },
  { domain: 'strategy', type: 'theory', confidence: 0.9, level: 1, content: 'SWOT 分析: 内部优势(S)和劣势(W),外部机会(O)和威胁(T)。最基础的战略诊断工具,适用于任何规模企业。' },

  // ═══ 组织 (15 条) ═══
  { domain: 'org', type: 'theory', confidence: 0.9, level: 2, content: 'Team Topologies: 四种基本团队类型——stream-aligned(价值流)、enabling(赋能)、complicated-subsystem(复杂子系统)、platform(平台)。用于优化团队结构。' },
  { domain: 'org', type: 'theory', confidence: 0.85, level: 2, content: 'Conway 定律: 系统的设计结构会复制组织的沟通结构。反过来也成立——要改变系统架构,先改变组织沟通模式。' },
  { domain: 'org', type: 'benchmark', confidence: 0.8, level: 2, content: '扁平化组织: 管理层级 ≤ 3 层为扁平。每个管理者直接下属 5-9 人为最佳 span of control。' },
  { domain: 'org', type: 'benchmark', confidence: 0.75, level: 2, content: '科技公司: 人均产出(营收/员工数) > 20万美元/年为良好。服务业: > 10万美元/年。' },
  { domain: 'org', type: 'rule', confidence: 0.85, level: 2, content: '跨部门协作健康度: 跨团队沟通频率 > 每周 2 次且信息共享及时率 > 80% → 健康。跨部门项目成功率 < 60% → 需要组织调整。' },
  { domain: 'org', type: 'threshold', confidence: 0.8, level: 2, content: 'Bus Factor(关键人风险): 任何单一角色的关键人系数 < 3 → 高风险。关键人离职影响 ≥ 3 个核心流程 → 紧急风险。' },
  { domain: 'org', type: 'best_practice', confidence: 0.7, level: 1, content: '小团队: 每个团队 5-8 人,超过 10 人应拆分为 2 个团队。定期 1-on-1 面谈频率 ≥ 每月一次。' },
  { domain: 'org', type: 'theory', confidence: 0.8, level: 3, content: 'Hofstede 文化维度: 权力距离、个人主义/集体主义、不确定性规避、男性/女性气质、长期导向、放纵/克制。跨国企业诊断必备。' },
  { domain: 'org', type: 'benchmark', confidence: 0.7, level: 1, content: '初创企业(10-30人): 可以全员沟通,不需要正式的组织架构图。30-80人: 需要明确的团队边界和汇报关系。' },

  // ═══ 财务 (15 条) ═══
  { domain: 'finance', type: 'theory', confidence: 0.95, level: 2, content: '杜邦分析法: ROE = 净利润率 × 资产周转率 × 权益乘数。拆解企业盈利能力的三个驱动因素。' },
  { domain: 'finance', type: 'theory', confidence: 0.9, level: 2, content: '本量利分析(CVP): 盈亏平衡点 = 固定成本 ÷ (单价 - 单位变动成本)。用于判断产品定价和销量目标。' },
  { domain: 'finance', type: 'benchmark', confidence: 0.85, level: 2, content: '健康企业: 流动比率 > 2.0,速动比率 > 1.0,资产负债率 < 60%。现金流覆盖运营支出 > 6 个月为安全。' },
  { domain: 'finance', type: 'benchmark', confidence: 0.8, level: 2, content: 'SaaS 行业: 毛利率 > 70%,净收入留存率(NRR) > 100%,CAC 回收期 < 18 个月为行业优秀水平。' },
  { domain: 'finance', type: 'rule', confidence: 0.85, level: 2, content: '应收账款管理: 应收账款周转天数 > 90 天或账龄 > 6 个月的账款占比 > 15% → 回款风险。超过 180 天 → 坏账风险。' },
  { domain: 'finance', type: 'threshold', confidence: 0.8, level: 2, content: '现金流预警: 月均净现金流连续 3 个月为负且现金储备 < 3 个月运营支出 → 紧急融资需求。' },
  { domain: 'finance', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业: 必须每月出三大表(利润表/资产负债表/现金流量表)。建立月度预算对比实际的分析习惯。' },
  { domain: 'finance', type: 'theory', confidence: 0.85, level: 3, content: '自由现金流估价(DCF): 企业价值 = Σ(未来自由现金流 / (1+WACC)^t) + 终值。WACC 通常 8-12%。' },
  // 会计准则
  { domain: 'finance', type: 'regulation', confidence: 0.95, level: 2, content: '中国企业会计准则(CAS): 财政部颁布，与 IFRS 持续趋同。要求企业编制利润表、资产负债表、现金流量表、所有者权益变动表及附注。小微企业适用《小企业会计准则》(简化版)。' },
  { domain: 'finance', type: 'regulation', confidence: 0.9, level: 3, content: 'IFRS 15 收入确认五步法: 1.识别合同 2.识别履约义务 3.确定交易价格 4.分摊交易价格 5.在履约时确认收入。SaaS 多年合同需按履约进度分摊确认,不能一次性确认。' },
  { domain: 'finance', type: 'regulation', confidence: 0.9, level: 3, content: 'IFRS 16 租赁: 承租人几乎全部租赁纳入资产负债表(短期和低价值除外)。使用权资产+租赁负债。对零售/航空等重租赁行业影响巨大——资产负债率上升 10-30%。' },
  { domain: 'finance', type: 'regulation', confidence: 0.85, level: 2, content: '资产减值(CAS 8 / IAS 36): 资产账面价值超过可收回金额时需计提减值。商誉至少每年减值测试一次,不得转回。存货按成本与可变现净值孰低计量。' },
  { domain: 'finance', type: 'rule', confidence: 0.9, level: 2, content: '收入确认红线: 无合同不确认收入、未交付不确认收入、退货率不确定不确认全额。预收款在资产负债表中为负债,交付后才转为收入。违反此原则→收入虚增→误导决策。' },
  { domain: 'finance', type: 'best_practice', confidence: 0.8, level: 2, content: '诊断财务数据前先确认会计准则基础。CAS vs IFRS vs US GAAP 在收入确认、租赁、资产减值上差异显著。跨国企业合并报表需统一准则基础后再分析。' },
  // 税法与税务
  { domain: 'finance', type: 'regulation', confidence: 0.95, level: 2, content: '企业所得税法: 法定税率 25%。高新技术企业 15%, 小微企业年应纳税所得额≤300万部分按 5% 征收。研发费用加计扣除 100%。亏损可结转 5 年(高新技术企业 10 年)。' },
  { domain: 'finance', type: 'regulation', confidence: 0.9, level: 2, content: '增值税暂行条例: 一般纳税人税率 13%/9%/6% 三档, 小规模纳税人征收率 3%(现行优惠 1%)。月销售额≤10万(季度≤30万)免征增值税。一般纳税人进项税额可抵扣,小规模纳税人不可抵扣。' },
  { domain: 'finance', type: 'regulation', confidence: 0.85, level: 3, content: '个人所得税法: 综合所得七级超额累进税率 3%-45%。经营所得五级超额累进税率 5%-35%。股息红利/财产转让 20%。专项附加扣除(子女/房贷/租房/赡养/继续教育/大病)每人最高可减除十几万应税所得。' },
  { domain: 'finance', type: 'rule', confidence: 0.9, level: 2, content: '税务合规红线: 虚开发票→刑事责任。账外收入(私户收款)不申报→补税+滞纳金(日万分之五)+罚款(0.5-5倍)。关联交易定价不合理→税务机关有权核定调整。' },
  { domain: 'finance', type: 'benchmark', confidence: 0.85, level: 2, content: '企业税负健康度: 综合税负率(实缴/营收) 3-8% 为正常区间。增值税税负率(应缴/营收) 2-5% 为正常。税负率异常偏低(远低于行业均值)→税务稽查风险。' },
  { domain: 'finance', type: 'rule', confidence: 0.8, level: 2, content: '发票管理: 增值税专用发票认证期限 360 天。跨年度未认证→进项税额不得抵扣→成本虚增。每月进行发票进销项差异分析,差异 > 5% → 需要解释原因。' },
  { domain: 'finance', type: 'benchmark', confidence: 0.75, level: 1, content: '小微企业: 月营收 < 50万时应控制固定成本 < 营收的 40%。现金流覆盖 > 3 个月为底线安全线。' },

  // ═══ 技术 (15 条) ═══
  { domain: 'tech', type: 'theory', confidence: 0.9, level: 2, content: '技术债务评估: 四个维度——代码质量(测试覆盖率>60%)、架构一致性(符合设计的模块占比>80%)、工具链效率(CI/CD自动化率>90%)、技术文档完整度(>70%)。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.85, level: 2, content: '软件团队: 单元测试覆盖率 > 60% 为合格,> 80% 为良好。CI 构建时间 < 10分钟。部署频率 > 每周一次。' },
  { domain: 'tech', type: 'rule', confidence: 0.85, level: 2, content: '技术债预警: 如果每 sprint 修复技术债的时间 < 总开发时间的 15%,技术债正在加速累积。hotfix 占比 > 30% → 债务已严重影响生产力。' },
  { domain: 'tech', type: 'threshold', confidence: 0.8, level: 2, content: '系统可靠性: 月度可用性 < 99.9%(月宕机 > 43 分钟)→ 需要 SRE 投入。P95 延迟 > 500ms → 用户体验恶化。' },
  { domain: 'tech', type: 'best_practice', confidence: 0.7, level: 1, content: '小团队: 优先选成熟的开发框架和云服务,避免自建基础设施。技术选型优先考虑社区活跃度和招聘可行性。' },
  { domain: 'tech', type: 'theory', confidence: 0.8, level: 3, content: 'TOGAF 架构框架: 业务架构→数据架构→应用架构→技术架构四个层次。适用于大型企业架构规划和治理。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.7, level: 1, content: '5-20人技术团队: 一位全栈工程师可覆盖前后端。工具链: Git+CI/CD+监控+日志 四件套必备。' },

  // ═══ 市场 (15 条) ═══
  { domain: 'marketing', type: 'theory', confidence: 0.9, level: 2, content: 'GTM 策略(Go-to-Market): 四个核心问题——卖给谁(目标客户)、卖什么(产品定位)、怎么卖(销售渠道)、为什么选你(竞争优势)。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: 'RFM 模型: Recency(最近一次消费)、Frequency(消费频率)、Monetary(消费金额)。用于客户分层和精准营销。' },
  { domain: 'marketing', type: 'benchmark', confidence: 0.8, level: 2, content: 'B2B SaaS: 网站访客→注册转化率 2-5%,注册→付费转化率 15-25%。NPS > 30 为良好,> 50 为优秀。' },
  { domain: 'marketing', type: 'rule', confidence: 0.85, level: 2, content: '客户流失预警: 月流失率 > 3% 或年流失率 > 30% → 产品-市场匹配度不足。NPS < 0 → 口碑负面,需要紧急干预。' },
  { domain: 'marketing', type: 'threshold', confidence: 0.8, level: 2, content: '市场份额: 在目标市场排名 > 前 3 且份额 > 10% → 有竞争力。份额 < 5% 且市场增长 > 20% → 处于追赶位置。' },
  { domain: 'marketing', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业: 先做好一个获客渠道(内容/广告/销售),跑通 1→10 后再扩渠道。不要同时尝试超过 3 个渠道。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 3, content: '品牌资产模型(Keller CBBE): 品牌显著性→品牌形象→品牌判断→品牌共鸣四个层次。品牌价值 = 消费者对品牌的知识和联想。' },

  // ═══ 执行 (15 条) ═══
  { domain: 'action', type: 'theory', confidence: 0.9, level: 2, content: 'OKR 方法: Objective(目标)定性+KR(关键结果)定量。每季度 3-5 个 O,每个 O 配 2-4 个 KR。完成率 70% 为健康。' },
  { domain: 'action', type: 'theory', confidence: 0.85, level: 2, content: 'Eisenhower 矩阵: 紧急重要→立即做,重要不紧急→安排时间,紧急不重要→委派,不重要不紧急→删除。' },
  { domain: 'action', type: 'benchmark', confidence: 0.8, level: 2, content: '执行健康度: 周计划完成率 > 80% 为优秀,> 60% 为合格。跨部门协调成本 < 工作时间的 20%。会议时间 < 总时间的 30%。' },
  { domain: 'action', type: 'rule', confidence: 0.85, level: 2, content: '行动项管理: 超过 30 天未更新的行动项 → 标记为 stale,需要重新评估。连续两次 sprint 未完成的特性 → 拆分或放弃。' },
  { domain: 'action', type: 'threshold', confidence: 0.8, level: 2, content: '交付延期: 项目里程碑延期率 > 30% → 计划能力不足或资源瓶颈。单个任务阻塞 > 5 个工作日 → 需要 escalate。' },
  { domain: 'action', type: 'best_practice', confidence: 0.7, level: 1, content: '小团队: 每日站会 ≤ 15 分钟。周计划聚焦 3-5 件最重要的事。月度回顾总结进展和调整方向。' },
  { domain: 'action', type: 'theory', confidence: 0.8, level: 3, content: '变革管理(Kotter 8步): 紧迫感→领导联盟→愿景→沟通→赋能→短期胜利→固化→文化制度化。大型组织变革的经典框架。' },
];

/**
 * 将种子知识写入 KnowledgeStore — 幂等 (检查已存在则跳过)
 */
export function seedPKB(db: Database.Database): { inserted: number; skipped: number } {
  const store = new KnowledgeStore(db);
  const stats = store.pkbStats();

  // 已存在种子 → 跳过
  if (stats.total > 0) {
    log.info({ total: stats.total }, 'PKB 已包含知识条目 — 跳过种子');
    return { inserted: 0, skipped: stats.total };
  }

  let inserted = 0;
  for (const s of SEEDS) {
    try {
      const realId = store.insert({
        text: s.content,
        sourceType: 'pkb',
        sourceId: `pkb-seed:${s.domain}:${s.type}`,
        authorityLevel: 'external_reference',
        accessLevel: 'public',
        accessSensitivity: 'normal',
      });
      store.update(realId, {
        pkb_domain: s.domain,
        pkb_type: s.type,
        pkb_confidence: s.confidence,
        pkb_status: 'active',
        pkb_source: 'methodology_team',
        pkb_version: '1.0',
        knowledge_level: s.level,
      });
      inserted++;
    } catch (err) { log.warn({ err, domain: s.domain }, '种子条目写入失败'); }
  }

  log.info({ inserted, total: SEEDS.length }, 'PKB 种子知识写入完成');
  return { inserted, skipped: 0 };
}
