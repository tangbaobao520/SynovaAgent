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
import { createLogger } from '@synova/logger';

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
  // 劳动法/劳动合同法
  { domain: 'org', type: 'regulation', confidence: 0.95, level: 2, content: '劳动合同法: 入职1个月内必须签书面合同,否则支付双倍工资(最多11个月)。合同类型: 固定期限/无固定期限/以完成一定工作任务为期限。连续签2次固定期限或工作满10年→员工有权要求签无固定期限合同。' },
  { domain: 'org', type: 'regulation', confidence: 0.9, level: 2, content: '经济补偿金(N+1): 协商解除/合同到期不续签/裁员→每满1年支付1个月工资。月工资>当地社平3倍→按3倍计算,最高12年。违法解除→赔偿金=2×经济补偿金(2N)。试用期不符合录用条件→可无偿解除(需证据)。' },
  { domain: 'org', type: 'regulation', confidence: 0.85, level: 2, content: '竞业限制: 仅限于高管/高级技术人员/其他负有保密义务的人员。期限≤2年,补偿金≥离职前12个月平均工资的30%且≥当地最低工资。违反竞业限制→员工需支付违约金+赔偿损失。' },
  { domain: 'org', type: 'rule', confidence: 0.9, level: 2, content: '社保公积金合规: 养老保险(单位16%+个人8%)、医疗保险(单位8%+个人2%)、失业保险(单位0.5%+个人0.5%)、工伤保险(单位0.2-1.9%)、生育保险(单位0.8%)、住房公积金(双方5-12%)。试用期也必须缴纳。按最低基数缴纳→不合规→补缴+滞纳金。' },
  { domain: 'org', type: 'threshold', confidence: 0.85, level: 2, content: '用工风险预警: 劳动合同签订率<100%→严重违规。社保未全员缴纳→补缴+滞纳金+罚款。加班费未足额支付→2年内可追溯。试用期超过6个月→违法(劳动合同期限≥3年试用期≤6个月)。' },
  // 杨国安组织能力理论
  { domain: 'org', type: 'theory', confidence: 0.95, level: 2, content: '杨国安组织能力杨三角: 企业持续成功=战略×组织能力。组织能力三支柱: 员工能力(会不会)、员工思维(愿不愿)、员工治理(容不容)。诊断需同时评估三个维度,缺一不可。知名案例: 宏碁、腾讯、京东的组织能力建设。' },
  { domain: 'org', type: 'rule', confidence: 0.9, level: 2, content: '杨三角诊断要点: 员工能力→招聘标准是否清晰?培训体系是否存在?关键岗位继任计划是否有? 员工思维→绩效考核是否与战略对齐?激励是否驱动正确行为?文化价值观是否落地? 员工治理→授权机制是否通畅?跨部门协作是否有制度保障?信息流通是否透明?' },
  // 薪酬/绩效体系设计
  { domain: 'org', type: 'theory', confidence: 0.9, level: 2, content: '全面薪酬模型: 货币薪酬(基本工资+绩效奖金+长期激励)+福利(社保+补充商业险+体检+带薪休假)+非货币(职业发展+工作环境+认可表彰)。初创期侧重股权激励,成长期侧重绩效奖金,成熟期侧重福利和稳定性。' },
  { domain: 'org', type: 'benchmark', confidence: 0.8, level: 2, content: '薪酬竞争力: P50(市场50分位)为基准线。核心岗位薪酬应处于P60-P75。宽带薪酬带宽(最大值/最小值)1.5-2.5倍。年度调薪预算通常为总薪酬的3-8%(通胀+绩效)。' },
  { domain: 'org', type: 'rule', confidence: 0.85, level: 2, content: '绩效考核体系设计原则: 1.战略对齐(考核指标必须从公司目标层层分解) 2.结果+行为双维度 3.强制分布需谨慎(末位淘汰合法性存疑) 4.考核周期: 季度考核适合快速迭代企业,半年度适合稳定型企业 5.绩效反馈必须面谈,不能只发数字。' },
  // 考核工具
  { domain: 'org', type: 'theory', confidence: 0.9, level: 2, content: 'OKR(Objectives and Key Results): 目标(O)定性+关键结果(KR)定量。每季度3-5个O,每个O配2-4个KR。KR完成70%为健康(过高说明目标保守,过低说明不切实际)。适合创新驱动型企业,不适合重复性工作。' },
  { domain: 'org', type: 'theory', confidence: 0.9, level: 2, content: 'KPI(Key Performance Indicator): 关键绩效指标。SMART原则(具体/可量化/可达成/相关性/时限性)。适合流程标准化高的岗位(生产/销售/客服)。与OKR的区别: KPI考核"做了什么",OKR考核"做成了什么"。' },
  { domain: 'org', type: 'theory', confidence: 0.85, level: 3, content: 'BSC平衡计分卡: 四个维度——财务(股东怎么看)、客户(客户怎么看)、内部流程(我们擅长什么)、学习成长(能否持续改进)。将战略转化为可操作的指标体系。适合成熟期大型企业。' },
  { domain: 'org', type: 'theory', confidence: 0.8, level: 2, content: '360度评估: 上级+同级+下属+客户+自评全方位反馈。用于领导力发展而非薪酬决策(用于薪酬易导致互评失真)。匿名性必须保证,评估者≥5人。建议每年1-2次,配合一对一反馈面谈。' },
  { domain: 'org', type: 'rule', confidence: 0.85, level: 2, content: '考核工具选择指南: 初创期→OKR(灵活)+360(发展导向)。成长期→KPI(流程)+OKR(创新)混合。成熟期→BSC(全面)+KPI(执行)。衰退/转型期→OKR(聚焦突破)。考核工具本身不是目的,服务于战略落地。' },
  // 组织行为学
  { domain: 'org', type: 'theory', confidence: 0.9, level: 2, content: '组织行为学核心框架: 个体(人格/知觉/动机/态度)→群体(沟通/冲突/领导/权力)→组织(文化/结构/变革)。三个层次相互影响,诊断不能只看单一层次。' },
  { domain: 'org', type: 'theory', confidence: 0.85, level: 2, content: '激励理论双因素(Herzberg): 保健因素(工资/工作环境/人际关系)不满足→不满,满足→不会不满。激励因素(成就感/认可/成长/责任)满足→真正的激励。只加薪不增加工作意义→员工仍会流失。' },
  { domain: 'org', type: 'theory', confidence: 0.85, level: 2, content: 'AMO模型(Ability-Motivation-Opportunity): 绩效=能力×动机×机会。能力不够→培训或招聘,动机不足→激励和反馈,机会缺失→授权和资源。三者乘积为零则绩效为零。与杨三角异曲同工。' },
  // 人+Agent 组织理论 (前沿)
  { domain: 'org', type: 'theory', confidence: 0.8, level: 3, content: 'Superminds理论(MIT Thomas Malone): 组织是"超级思维"——人类+AI构成的集体智能。五类超级思维: 层级型(传统组织)、民主型(投票)、市场型(价格信号)、社区型(规范共识)、生态系统型(进化)。AI Agent 加入后,组织从纯人类层级向人机混合生态系统演进。' },
  { domain: 'org', type: 'theory', confidence: 0.85, level: 3, content: '人+Agent协作的三种模式(Microsoft Research 2024): 1.嵌入式(Agent作为工具,人类决策,如Copilot) 2.对等式(Agent作为同事,共同执行,如多Agent诊断) 3.自主式(Agent独立执行,人类监督,如自动驾驶)。组织诊断需识别当前模式并评估升级路径。' },
  { domain: 'org', type: 'theory', confidence: 0.8, level: 3, content: 'Agentic Organization(斯坦福HAI 2024-2025): 随着AI Agent能力提升,组织设计的核心问题从"如何管理人"变为"如何设计人+Agent的协作系统"。关键发现: 1.混合团队的效率上限取决于Agent的透明度和可解释性 2.人类对Agent的信任建立需要可预测性和误差边界 3.最优配置不是替代人类,而是让Agent承担信息整合和模式识别,人类负责价值判断和创造力。' },
  { domain: 'org', type: 'rule', confidence: 0.85, level: 3, content: '多Agent组织设计原则: 1.每个Agent必须有明确的角色边界和可被人类审核的决策日志 2.Agent之间的信息传递必须有版本控制和冲突检测 3.关键决策(人事/财务/安全)必须保留人类审批节点 4.Agent的绩效评估不同于人类——用准确率/一致性/覆盖度而非完成任务数。' },
  { domain: 'org', type: 'theory', confidence: 0.75, level: 3, content: '组织网络分析(ONA)在人机混合团队中的应用: 传统ONA分析人类之间的沟通网络。未来组织需要双模ONA——同时映射人-人、人-Agent、Agent-Agent三类关系。诊断指标: Agent依赖度(人类向Agent求助的频率)、Agent可替代性(Agent宕机时人类的处理能力)、决策溯源完整度(从结论追溯到原始数据的链条长度)。' },
  { domain: 'org', type: 'benchmark', confidence: 0.7, level: 3, content: '人机混合组织成熟度模型(Anthropic/OpenAI 2025研究综合): L1工具辅助(人类决策,AI提供信息)→L2协作执行(AI执行子任务,人类整合)→L3对等诊断(AI与人类专家并列诊断,互相验证)→L4自主执行(AI独立管理部分业务域,人类监督)→L5自适应组织(AI持续优化组织结构和流程,人类设定目标和边界)。' },
  { domain: 'org', type: 'best_practice', confidence: 0.8, level: 2, content: '引入AI Agent到组织时: 1.先在小范围(单团队)试点,建立信任后再扩展 2.设定明确的"人类保留权限"清单 3.每季度审计Agent决策与人类决策的差异率 4.建立Agent退役机制(当Agent准确率<阈值时自动降级为只读模式)。' },
  { domain: 'org', type: 'best_practice', confidence: 0.8, level: 1, content: '小企业组织建设: 10-50人核心任务是建立基本制度(考勤/薪酬/考核)。50-100人需要中层管理者和明确的部门职责。100人以上需要HR专职岗位。不要等到乱象丛生才补制度。' },

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

  // ═══ 技术 — 面向所有企业: 技术公司(代码/架构/DevOps/AI) + 非技术公司(SaaS集成/软件优化/AI替代) ═══
  // ── 非技术企业: SaaS + 软件栈优化 ──
  { domain: 'tech', type: 'theory', confidence: 0.9, level: 1, content: '企业软件栈诊断框架(非技术公司): 六个维度——1.覆盖度(核心业务是否都有工具支撑) 2.冗余度(同一功能是否买了多个工具) 3.集成度(工具间数据是否互通) 4.利用率(买了的功能用了多少) 5.AI就绪度(是否可通过API对接Synova) 6.成本效率(工具费用/员工数是否合理)。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.8, level: 1, content: '企业SaaS费用基准: CRM 50-150元/人月、HRM 30-80元、财务 20-50元、协同办公 20-60元。全员软件人均<300元为健康,>800元需审查。SaaS总支出<营收2%(传统)或<5%(科技)。' },
  { domain: 'tech', type: 'rule', confidence: 0.9, level: 2, content: 'SaaS冗余诊断: 列出所有在用SaaS→按功能分类→标重叠→算使用率(日活/总账号)→使用率<30%的考虑砍掉。目标:每功能1个主工具+1个备选。' },
  { domain: 'tech', type: 'theory', confidence: 0.85, level: 2, content: '数据接入评估: Synova L5可对接飞书/企微/钉钉/Salesforce/用友/金蝶/北森/Moka。评估标准:是否有开放API、API是否支持业务数据读取、是否有webhook、数据是否JSON/CSV。无API→数据孤岛→优先替换。' },
  { domain: 'tech', type: 'best_practice', confidence: 0.75, level: 1, content: '企业软件选型原则: 1.选头部SaaS(稳定) 2.必须有开放API(对接AI) 3.先试用2周 4.合同≤1年 5.避免定制开发。选型让使用者(非IT部)参与决策。' },
  { domain: 'tech', type: 'theory', confidence: 0.8, level: 2, content: '企业IT成熟度(非技术公司): L1手工(Excel+邮件)→L2单点(各部门各自SaaS)→L3集成(API互通)→L4智能(AI跨系统分析)→L5自治(AI自动优化,人审批)。' },
  { domain: 'tech', type: 'rule', confidence: 0.85, level: 2, content: 'AI替代评估: 1.核心是信息处理还是物理操作?(信息→可替) 2.每天重复操作>2h?(高价值) 3.有API可安全访问?(可替)。优先级:高频重复+有API→ROI最高。不可替代:签字文件/面谈销售/创意设计。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.7, level: 2, content: 'AI可替代的SaaS: 客服机器人(减70%人工)、基础报表(替Tableau/PowerBI)、HR简历初筛、合同初审(提80%效率)。' },
  { domain: 'tech', type: 'rule', confidence: 0.85, level: 2, content: '软件更换原则: 1.使用率<30%→先优化,不换 2.无API→优先换 3.数据无法导出→高优先级换 4.新旧并行3个月再下线 5.每年换≤2个核心系统。' },
  { domain: 'tech', type: 'best_practice', confidence: 0.7, level: 1, content: '企业IT管理清单: 1.维护软件清单(半年更新) 2.每个软件有使用部门负责人 3.采购需IT+使用部门+财务三方 4.季度Review使用率 5.确保有人了解每个软件的API能力。' },
  // ── 技术企业: 代码/架构/DevOps/AI 工程 ──
  { domain: 'tech', type: 'theory', confidence: 0.9, level: 2, content: '技术债务评估(技术公司): 四个维度——代码质量(测试覆盖率>60%)、架构一致性(符合设计的模块>80%)、工具链效率(CI/CD自动化>90%)、文档完整度(>70%)。AI时代新增:AI生成代码占比、AI代码测试覆盖率。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.85, level: 2, content: '软件团队基准: 测试覆盖率>60%合格>80%良好。CI<10分钟。部署>每周一次。AI时代:AI辅助编程提升产出30-50%,但code review需同比增加。' },
  { domain: 'tech', type: 'rule', confidence: 0.85, level: 2, content: '技术债预警: 修复时间<总时间15%→加速累积。hotfix>30%→严重影响。AI时代:AI生成代码3个月折旧率>40%→AI技术债。' },
  { domain: 'tech', type: 'threshold', confidence: 0.8, level: 2, content: '系统可靠性: 可用性<99.9%→需SRE。P95延迟>500ms→恶化。AI时代:AI Agent调用链延迟<5s(P95),AI失误率<5%。' },
  { domain: 'tech', type: 'theory', confidence: 0.8, level: 3, content: 'TOGAF企业架构: 业务→数据→应用→技术四层。AI时代新增:AI架构层(模型管理/Agent编排/评估),每个架构决策考虑"未来是否被AI Agent调用"。' },
  { domain: 'tech', type: 'theory', confidence: 0.85, level: 3, content: 'AI成熟度模型(技术公司): L1实验→L2标准化→L3集成(AI参与开发)→L4自主(AI管非关键系统)→L5原生(AI-first,人定义意图)。' },
  { domain: 'tech', type: 'rule', confidence: 0.85, level: 2, content: 'AI安全基线: 1.AI决策可追溯 2.AI代码同标准审计 3.训练数据不含敏感信息 4.AI Agent API需认证限流 5.定期红队测试。' },
  { domain: 'tech', type: 'theory', confidence: 0.8, level: 2, content: 'DevOps成熟度: L1手动→L2自动构建→L3 CI/CD全自动→L4 ChatOps+AI运维→L5 AI自主运维。指标:变更失败<15%,恢复<1h,按需部署。' },
  { domain: 'tech', type: 'benchmark', confidence: 0.75, level: 2, content: '云架构健康度: 资源利用率>40%,自动扩缩容>80%,灾备演练>季一次。AI时代:GPU/TPU利用率>60%,模型服务延迟<200ms(P95)。' },
  { domain: 'tech', type: 'theory', confidence: 0.8, level: 2, content: '数据成熟度: L1散落→L2集中→L3治理→L4智能→L5原生(AI自动发现问题)。每级给出两步升级建议。' },
  { domain: 'tech', type: 'rule', confidence: 0.8, level: 2, content: '技术选型AI适配度: 1.有API可被Agent调? 2.日志监控结构化? 3.社区有AI插件? 4.供应商有AI路线图? AI适配度与性能/成本/稳定并列。' },
  { domain: 'marketing', type: 'theory', confidence: 0.9, level: 2, content: 'GTM 策略(Go-to-Market): 四个核心问题——卖给谁(目标客户)、卖什么(产品定位)、怎么卖(销售渠道)、为什么选你(竞争优势)。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: 'RFM 模型: Recency(最近一次消费)、Frequency(消费频率)、Monetary(消费金额)。用于客户分层和精准营销。' },
  { domain: 'marketing', type: 'benchmark', confidence: 0.8, level: 2, content: 'B2B SaaS: 网站访客→注册转化率 2-5%,注册→付费转化率 15-25%。NPS > 30 为良好,> 50 为优秀。' },
  { domain: 'marketing', type: 'rule', confidence: 0.85, level: 2, content: '客户流失预警: 月流失率 > 3% 或年流失率 > 30% → 产品-市场匹配度不足。NPS < 0 → 口碑负面,需要紧急干预。' },
  { domain: 'marketing', type: 'threshold', confidence: 0.8, level: 2, content: '市场份额: 在目标市场排名 > 前 3 且份额 > 10% → 有竞争力。份额 < 5% 且市场增长 > 20% → 处于追赶位置。' },
  { domain: 'marketing', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业: 先做好一个获客渠道(内容/广告/销售),跑通 1→10 后再扩渠道。不要同时尝试超过 3 个渠道。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 3, content: '品牌资产模型(Keller CBBE): 品牌显著性→品牌形象→品牌判断→品牌共鸣四个层次。品牌价值 = 消费者对品牌的知识和联想。' },
  { domain: 'marketing', type: 'theory', confidence: 0.9, level: 2, content: 'STP 市场定位: Segmentation(按地理/人口/心理/行为细分市场)→Targeting(选择目标市场,评估规模/增长/竞争/匹配度)→Positioning(差异化定位,价值主张一句话说清)。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: '4P/4C 营销组合: 4P(产品/价格/渠道/促销)→4C(客户价值/成本/便利/沟通)。4P是厂商视角,4C是客户视角。现代营销应4P+4C并用,以4C为起点反推4P。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: 'AARRR 海盗指标: Acquisition(获客)→Activation(激活)→Retention(留存)→Revenue(变现)→Referral(推荐)。用于诊断增长漏斗,找到最大瓶颈。常见:获客够但激活低→产品体验问题,留存低→产品价值不足。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 2, content: '品牌定位金字塔: 底层→品牌属性(是什么),中层→品牌利益(解决什么),高层→品牌价值观(信仰什么),塔尖→品牌精髓(一句话)。诊断:品牌各层是否一致?客户认知与品牌自述是否有偏差?' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 3, content: '客户旅程地图(Customer Journey Map): 认知→考虑→购买→使用→忠诚→推荐六个阶段。每个阶段标注触点、情绪曲线、痛点和机会。用于发现营销断裂点和体验优化空间。' },
  { domain: 'marketing', type: 'rule', confidence: 0.85, level: 2, content: '定价策略检查清单: 1.成本加成(确保不低于成本) 2.竞争对标(与竞品的价差是否合理) 3.价值定价(客户愿意付多少钱) 4.价格弹性(提价5%会流失多少客户)。最优价格不是最低价,是客户感知价值与竞品的平衡点。' },
  { domain: 'marketing', type: 'benchmark', confidence: 0.75, level: 2, content: '各行业营销费用占营收比: SaaS 40-60%(早期)/20-30%(成熟),消费品 10-20%,制造业 3-8%,服务业 5-10%。营销ROI>3为良好,>5为优秀。' },
  { domain: 'marketing', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业营销起步: 1.建立品牌一句话介绍 2.先做一个免费获客渠道(SEO/内容/社交媒体) 3.客户推荐奖励机制 4.每季度测一个新渠道,保留>2倍ROI的。' },
  // 营销补充 —《赢取竞争的100+N工具箱》(AI时代适配)
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: 'CRM客户关系管理: 识别(谁是高价值客户)→区分(按LTV分层)→互动(个性化沟通)→定制(针对高价值客户定制服务)。核心指标: 客户生命周期价值(LTV)、获客成本(CAC)、流失率、复购率。AI时代: AI Agent可自动完成客户分层、个性化内容生成和触达时机选择,人类聚焦于高价值客户的深度关系。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 2, content: '内容营销漏斗: 认知阶段(博客/白皮书/视频)→考虑阶段(案例研究/产品对比/Demo)→决策阶段(试用/优惠/客户推荐)。每个阶段需要不同的内容类型。B2B平均需要接触13次才能转化。AI适配: AI可批量生成个性化内容、自动A/B测试、根据用户行为实时调整内容策略。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 2, content: '渠道冲突管理: 直销vs代理vs电商三渠道并存时,必须明确: 1.价格体系统一(渠道间价差<10%) 2.客户归属规则(谁先接触归谁) 3.渠道激励差异化(不同渠道不同KPI)。渠道冲突是增长的最大隐性成本。AI适配: AI可实时监控全渠道价格和库存,自动预警并建议调价策略。' },
  { domain: 'marketing', type: 'benchmark', confidence: 0.75, level: 2, content: '数字营销效率基准: 搜索引擎广告ROAS>3为合格,>5为优秀。社媒CPM 20-80元。邮件营销打开率>20%,点击率>3%。SEO自然流量占比>40%为健康。AI时代: AI驱动的动态定价和个性化推荐可将ROAS提升30-50%。' },
  { domain: 'marketing', type: 'rule', confidence: 0.85, level: 2, content: '品牌一致性检查: 所有触点的视觉和文案风格是否统一,客户在各渠道的体验是否一致,员工是否能用一句话说清品牌定位。不一致→品牌资产稀释。AI时代: AI可自动审核全渠道品牌一致性,但品牌价值观的确定仍需人类决策。' },
  { domain: 'marketing', type: 'best_practice', confidence: 0.7, level: 1, content: '产品卖点提炼: 不要列功能,要讲利益。用"因为(功能),所以你能(利益)"句式。最多3个核心卖点,超过3个等于没有。每个卖点用客户的语言,不用行业术语。AI辅助: AI可分析竞品卖点和客户评论,生成差异化卖点建议,但最终需人类确认。' },
  // 营销 AI 原生知识 — 不是传统工具的延伸, 而是根本性的新能力
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 3, content: 'AI原生营销: 不同于"AI辅助的传统营销"。核心变化: 1.从"创建内容→推送受众"变为"理解意图→生成个性化回复" 2.搜索被对话取代(用户不再搜索"最好的CRM",而是问AI助手"我该用什么CRM") 3.品牌价值的衡量从"知名度"变为"推荐率"(被AI推荐了多少次)。传统营销漏斗正在被AI对话界面瓦解。' },
  { domain: 'marketing', type: 'rule', confidence: 0.75, level: 3, content: 'AI时代的品牌建设: 1.确保你的产品信息是AI可索引的结构化数据(被AI推荐比被人类搜索更重要) 2.品牌声誉管理要覆盖AI生成的答案(用户问AI"XX品牌靠谱吗",AI从全网数据中总结) 3.客户体验从"减少摩擦"变为"智能预判"(AI agent主动为客户解决问题)。' },

  // ═══ 运营/供应链 (15 条) ═══
  { domain: 'strategy', type: 'theory', confidence: 0.9, level: 2, content: '精益生产(Lean): 核心理念——消除一切不创造价值的浪费。七大浪费: 过量生产、等待、搬运、过度加工、库存、多余动作、缺陷。通过价值流图(VSM)识别浪费,持续改善(Kaizen)。' },
  { domain: 'strategy', type: 'theory', confidence: 0.9, level: 2, content: '六西格玛(6σ): DMAIC方法论——Define(定义问题)→Measure(测量现状)→Analyze(分析根因)→Improve(改善)→Control(控制)。6σ=每百万次机会仅3.4个缺陷。与Lean结合为Lean Six Sigma。' },
  { domain: 'strategy', type: 'theory', confidence: 0.85, level: 2, content: 'TQM全面质量管理: 全员参与、全流程覆盖、持续改进。核心: PDCA循环(Plan计划→Do执行→Check检查→Act处理)。日本戴明奖和美国波多里奇奖是TQM的两大标杆。' },
  { domain: 'strategy', type: 'theory', confidence: 0.85, level: 2, content: '5S现场管理: 整理(Seiri区分要/不要)→整顿(Seiton定置定位)→清扫(Seiso打扫维护)→清洁(Seiketsu标准化)→素养(Shitsuke习惯化)。简单但极难坚持——5S是精益和TQM的基础前提。' },
  { domain: 'strategy', type: 'theory', confidence: 0.8, level: 2, content: 'JIT准时生产: Just-In-Time——在需要时按需要量生产。核心要素: 看板(Kanban)拉动系统、单件流、快速换模(SMED)、零库存目标。丰田生产系统(TPS)的核心支柱之一。' },
  { domain: 'strategy', type: 'benchmark', confidence: 0.8, level: 2, content: '制造业效率基准: OEE(设备综合效率) = 可用率×性能率×质量率。世界级水平>85%,行业平均60-75%。库存周转率>12次/年为精益,<4次/年为积压。' },
  { domain: 'strategy', type: 'rule', confidence: 0.85, level: 2, content: '价值流图(VSM)诊断: 绘制从原材料到客户的完整流程→标注每个环节的C/T(周期时间)和VAT(增值时间)→计算流程效率=增值时间/总周期时间。健康企业>10%,世界级>25%。<5%→严重浪费。' },
  { domain: 'strategy', type: 'rule', confidence: 0.8, level: 2, content: '供应链风险诊断: 单一供应商依赖度>70%→高风险(断供即停)。关键物料库存覆盖<2周→紧急补货风险。供应商所在地政治/自然灾害风险未评估→盲区。供应商财务健康度<BBB级→潜在断裂。' },
  { domain: 'strategy', type: 'benchmark', confidence: 0.75, level: 2, content: '供应链健康度: 订单准时交付率>95%为合格,>98%为优秀。库存准确率>98%。供应商准时交付率>90%。物流成本占营收比:制造业3-8%,零售业5-12%,电商8-15%。' },
  { domain: 'strategy', type: 'theory', confidence: 0.8, level: 3, content: 'SCOR供应链运作参考模型: Plan(计划)→Source(采购)→Make(制造)→Deliver(交付)→Return(退货)。五个核心流程,每个可分解到三级指标。用于诊断供应链瓶颈和标杆对比。' },
  { domain: 'strategy', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业供应链管理: 1.关键物料至少保持2-3个合格供应商 2.签订框架协议而非单次采购 3.每月Review库存周转率 4.用ABC分类法管理库存(A类重点管,B类定期管,C类批量管)。' },

  // ═══ 执行 (15 条) ═══
  { domain: 'action', type: 'theory', confidence: 0.9, level: 2, content: 'OKR 方法: Objective(目标)定性+KR(关键结果)定量。每季度 3-5 个 O,每个 O 配 2-4 个 KR。完成率 70% 为健康。' },
  { domain: 'action', type: 'theory', confidence: 0.85, level: 2, content: 'Eisenhower 矩阵: 紧急重要→立即做,重要不紧急→安排时间,紧急不重要→委派,不重要不紧急→删除。' },
  { domain: 'action', type: 'benchmark', confidence: 0.8, level: 2, content: '执行健康度: 周计划完成率 > 80% 为优秀,> 60% 为合格。跨部门协调成本 < 工作时间的 20%。会议时间 < 总时间的 30%。' },
  { domain: 'action', type: 'rule', confidence: 0.85, level: 2, content: '行动项管理: 超过 30 天未更新的行动项 → 标记为 stale,需要重新评估。连续两次 sprint 未完成的特性 → 拆分或放弃。' },
  { domain: 'action', type: 'threshold', confidence: 0.8, level: 2, content: '交付延期: 项目里程碑延期率 > 30% → 计划能力不足或资源瓶颈。单个任务阻塞 > 5 个工作日 → 需要 escalate。' },
  { domain: 'action', type: 'best_practice', confidence: 0.7, level: 1, content: '小团队: 每日站会 ≤ 15 分钟。周计划聚焦 3-5 件最重要的事。月度回顾总结进展和调整方向。' },
  { domain: 'action', type: 'theory', confidence: 0.8, level: 3, content: '变革管理(Kotter 8步): 紧迫感→领导联盟→愿景→沟通→赋能→短期胜利→固化→文化制度化。大型组织变革的经典框架。' },
  // 执行补充 —《赢取竞争的100+N工具箱》(AI时代适配)
  { domain: 'action', type: 'theory', confidence: 0.9, level: 2, content: 'PMBOK项目管理十大知识领域: 整合/范围/时间/成本/质量/人力资源/沟通/风险/采购/干系人管理。诊断项目失败时从这10个维度逐一排查。AI适配: AI可自动追踪进度/预算/风险三项,动态预测延期概率,人类只需审批关键决策。' },
  { domain: 'action', type: 'theory', confidence: 0.85, level: 2, content: 'SCRUM敏捷框架: 3个角色(PO/SM/Team)、5个事件、3个产物。适合需求变化快的创新项目。AI适配: AI Agent可担任SM(自动生成sprint报告/检测阻塞/建议改进),PO协助(数据驱动优先级排序),人类专注于创意和决策。' },
  { domain: 'action', type: 'theory', confidence: 0.85, level: 2, content: 'Kanban看板方法: 可视化工作流→限制WIP→管理流动→持续改进。AI适配: AI自动优化WIP限额、检测瓶颈、预测交付日期。WIP限额从"经验法则"变为"数据驱动的动态调整"。' },
  { domain: 'action', type: 'rule', confidence: 0.9, level: 2, content: '项目管理铁三角: 范围/时间/成本三者互相制约。AI时代新增第四个维度: 质量/AI介入度。AI介入度高→可同时优化三者(AI自动处理重复性任务释放人类时间)。诊断延期时先判断: 哪些任务可以交给AI加速?' },
  { domain: 'action', type: 'threshold', confidence: 0.85, level: 2, content: '项目健康度: SPI>0.9为正常,CV<10%,风险关闭率>80%。AI时代新指标: AI辅助决策采纳率>60%、自动化任务占比>30%、人机协作效率比(有AI vs 无AI的任务完成时间)<0.7。' },
  { domain: 'action', type: 'theory', confidence: 0.8, level: 2, content: '风险管理五步法: 识别→评估→应对→监控→沟通。AI适配: AI可7×24扫描代码库/运维数据/市场新闻自动识别风险,人类聚焦于低概率高影响的"黑天鹅"风险,常规风险交给AI预警。' },
  { domain: 'action', type: 'rule', confidence: 0.85, level: 2, content: '沟通管理: 向上→说结果和需要的支持。平级→说协调点和资源冲突。向下→说目标和边界。AI时代新通道: AI→AI(Agent间自动协商资源),AI→人(自动生成状态报告和预警),人→AI(用自然语言设定目标和约束)。' },
  { domain: 'action', type: 'theory', confidence: 0.8, level: 2, content: 'PDCA持续改进: Plan→Do→Check→Act。AI适配: 改为P→D(人+AI协作)→C(AI自动对比分析)→A(人确认,AI执行标准化)。AI加速了循环频率,从月级降为日级甚至实时。' },
  { domain: 'action', type: 'benchmark', confidence: 0.75, level: 2, content: '会议效率基准: 决策会≤8人,准时率>90%,纪要24h内。AI时代: AI自动生成会议纪要和行动项,人工只需review。AI可参与信息同步会(自动回答进度问题),人类只参加需要判断的决策会。' },
  { domain: 'action', type: 'best_practice', confidence: 0.7, level: 1, content: '小团队项目管理: 用看板工具可视化任务,每周优先级评审。AI增强: AI自动从聊天记录中提取行动项并创建任务卡,自动提醒DDL,分析历史数据建议更合理的估时。' },
  { domain: 'action', type: 'theory', confidence: 0.8, level: 2, content: '精益六西格玛DMAIC: Define→Measure→Analyze→Improve→Control。AI适配: AI承担Measure(自动收集数据)和Analyze(自动找根因),人类负责Define(定义什么值得改善)和Improve(创造性方案)。' },
  { domain: 'action', type: 'rule', confidence: 0.85, level: 2, content: 'RICE优先级排序: Reach×Impact×Confidence÷Effort。AI适配: AI自动计算各项得分(从项目历史数据中学习),生成排序建议。人类只确认最终排序,不需要手动估算。关键: AI建议≠最终决定,人类保留否决权。' },
  // 执行 AI 原生知识
  { domain: 'action', type: 'theory', confidence: 0.75, level: 3, content: '人机混合团队的执行模式: Level 1 传统(人做所有事)→Level 2 辅助(AI做信息收集和报告)→Level 3 协作(AI和人类共同决策)→Level 4 自主(AI独立管理常规任务,人类只处理异常)。诊断时先判断当前团队处于哪个Level,再给出升级建议。升级不是替换人,是让人做更高价值的事。' },
  { domain: 'action', type: 'rule', confidence: 0.8, level: 2, content: 'AI时代会议规则: 1.信息同步类会议由AI Agent常态化进行(异步,不占人类时间) 2.决策会议前AI必须生成数据和方案对比,人类只做判断 3.”这个会议能不能由AI代替?”成为每个会议的准入门槛。目标是人类会议时间从30%降至15%。' },
  // ⚠️ 工具选择指南 — 避免冲突推荐
  { domain: 'action', type: 'rule', confidence: 0.95, level: 1, content: '执行工具选择指南(铁律): 1.初创期→OKR(目标对齐)+看板(可视化)。成长期→OKR+KPI混合(战略+执行)。成熟期→BSC(全面)+KPI(精细化)。任何时候: 一旦选定,至少坚持2个季度再评估。不要在同一个团队同时推行Scrum和Kanban(二选一)。工具切换的时机: 企业规模翻倍、业务模式转型、现有工具完成率<50%持续2个季度。' },
  { domain: 'action', type: 'rule', confidence: 0.9, level: 2, content: '方法论的适用边界: OKR→需要团队有自驱力和数据透明度,不适合强管控文化。KPI→适合流程标准化高的岗位(生产/销售),不适合创新岗位。Scrum→适合需求不明确、快速迭代的项目,不适合运维型工作。Kanban→适合持续交付型工作,不适合需要固定周期的项目。向客户推荐工具时,必须先说明: 1.为什么这个适合你(而非其他) 2.什么时候需要升级 3.什么情况下绝对不应该用。' },
  { domain: 'strategy', type: 'rule', confidence: 0.95, level: 1, content: '运营工具选择指南(铁律): 1.小企业(≤100人)→5S+PDCA(简单有效,先养成习惯) 2.成长企业(100-500人)→精益生产+价值流图(系统化) 3.大型企业(>500人)→六西格玛+SCOR(数据驱动)。原则: 不要在5S都没做好的企业推行六西格玛。工具是渐进式的——先把基础的做好,再上复杂的。每个阶段至少稳定运行1年再评估升级。' },

  // ═══ 商业模式 (15 条) — P1 PKB 种子知识 ═══
  // ── 核心层: 画布9要素 + 5种典型模式 ──
  { domain: 'business_model', type: 'theory', confidence: 0.95, level: 2, content: '商业模式画布(Business Model Canvas): 亚历山大·奥斯特瓦尔德提出的九要素框架。1.客户细分 2.价值主张 3.渠道通路 4.客户关系 5.收入来源 6.核心资源 7.关键业务 8.重要伙伴 9.成本结构。九个构造块覆盖价值创造、传递和捕获的完整逻辑。' },
  { domain: 'business_model', type: 'theory', confidence: 0.9, level: 2, content: '订阅制商业模式: 核心指标=MRR(月经常性收入)+Churn(流失率)+LTV(客户终身价值)。健康基准: 月Churn<3%(SaaS), LTV/CAC>3, 净收入留存率(NRR)>100%。典型行业: SaaS、流媒体、会员制电商。关键风险: 获客成本上升+流失加速→增长陷阱。' },
  { domain: 'business_model', type: 'theory', confidence: 0.9, level: 2, content: '交易市场(平台)商业模式: 核心指标=GMV(总交易额)+Take Rate(抽成率)+双边匹配效率。健康基准: Take Rate 5-30%(按行业), 卖家集中度<30%(避免单一卖家依赖)。典型行业: 电商、出行、招聘。关键风险: 冷启动(供需双边鸡生蛋)、跳单(买卖双方绕过平台)。' },
  { domain: 'business_model', type: 'theory', confidence: 0.85, level: 2, content: '广告/媒体商业模式: 核心指标=DAU/MAU(日活/月活)+ARPU(每用户收入)+广告填充率。健康基准: DAU/MAU>50%(高粘性), 广告eCPM>行业中位数, 用户增长>获客成本。典型行业: 社交媒体、内容平台。关键风险: 隐私政策变化(如GDPR)、广告主预算收缩。' },
  { domain: 'business_model', type: 'theory', confidence: 0.85, level: 2, content: '免费增值(Freemium)商业模式: 核心指标=免费→付费转化率+付费用户ARPU+免费用户服务成本。健康基准: 转化率2-5%(优秀>10%), 付费ARPU>免费服务成本×3, 病毒系数>1(自传播)。典型行业: 工具类SaaS、游戏、云存储。关键风险: 免费用户成本侵蚀利润、转化率低于预期。' },
  { domain: 'business_model', type: 'theory', confidence: 0.8, level: 3, content: '特许经营商业模式: 核心指标=单店盈利模型+加盟商ROI+品牌授权费占比。健康基准: 加盟商回本周期<18个月, 单店净利率>15%, 总部加盟费占比<总收入的10%(可持续)。典型行业: 餐饮、零售、教育。关键风险: 加盟商品控一致性、品牌声誉连带风险。' },
  // ── 核心层: 诊断规则 ──
  { domain: 'business_model', type: 'rule', confidence: 0.9, level: 2, content: '价值-收入对齐规则: 不同价值主张类型对应常见收入模式——便利型价值→交易/订阅收入; 体验型价值→溢价定价/会员收入; 平台型价值→抽成/广告收入; 成本型价值→规模交易收入。若价值主张与收入模式不匹配(如承诺"极致体验"但按"广告流量"收费)→标记结构性矛盾。' },
  { domain: 'business_model', type: 'rule', confidence: 0.85, level: 2, content: '成本-收入匹配规则: 收入模式决定成本结构形态。交易收入→边际成本应递减; 订阅收入→固定成本占比可较高(需规模化摊销); 广告收入→内容生产成本是核心; 平台收入→技术基础设施成本为主。固定成本占比>70%但收入按交易计费→结构性亏损风险。' },
  { domain: 'business_model', type: 'threshold', confidence: 0.85, level: 2, content: '收入集中度风险阈值: 单一客户收入占比>50%→高风险(生存依赖); 单一产品线收入>70%→中风险(转型困难); 单一渠道收入>80%→中风险(渠道依赖)。健康企业: 最大客户<25%, 最大产品线<50%, 最大渠道<60%。' },
  { domain: 'business_model', type: 'threshold', confidence: 0.8, level: 2, content: '定价权评估: 品牌效应+转换成本得分高(>0.7)但毛利率低于行业平均→定价权未转化为利润。提价10%后客户流失率<5%→定价权强; 流失率5-15%→中等; >15%→定价权弱。' },
  { domain: 'business_model', type: 'rule', confidence: 0.9, level: 2, content: '可防御性评估框架: 1.复制成本(竞品复制商业模式需要多少时间和资金?) 2.网络效应强度(每增加一个用户是否为其他用户创造价值?) 3.平台粘性(用户迁移到竞品的转换成本多高?) 4.规模经济(规模扩大时单位成本是否显著下降?)。四维度综合评分<0.4→模式脆弱,需要加固。' },
  // ── 基准层: 行业基准 ──
  { domain: 'business_model', type: 'benchmark', confidence: 0.8, level: 2, content: 'SaaS行业商业模式基准: LTV/CAC中位数3-5x, 毛利率>70%, NRR(净收入留存)>100%(优秀>120%), 客户获取成本回收周期<12个月, 月Churn<3%(企业级<1%)。订阅收入占比>80%为纯SaaS模式。' },
  { domain: 'business_model', type: 'benchmark', confidence: 0.75, level: 2, content: '制造业商业模式基准: 毛利率20-40%(按行业分化), 设备利用率>85%, 库存周转率>6次/年, 人均产值>50万元/年(自动化程度相关)。服务业转型: 从"卖设备"→"设备即服务(EaaS)"→经常性收入占比从0%→30%为目标。' },
  { domain: 'business_model', type: 'benchmark', confidence: 0.75, level: 2, content: '零售业商业模式基准: 坪效>行业平均(按业态), 库存周转率>4次/年(快消>12次), 线上占比>30%(全渠道趋势), 私域流量占比>15%(降低平台依赖)。DTC(直接面向消费者)模式毛利率通常比传统批发高15-25个百分点。' },
  { domain: 'business_model', type: 'best_practice', confidence: 0.7, level: 1, content: '中小企业商业模式创新路径: 1.从产品→服务(如卖设备→卖设备使用时长) 2.从一次性→经常性(如项目制→订阅制) 3.从单一收入→多元收入(如产品销售+培训+咨询+配件) 4.从单边→多边(如只服务买家→同时服务买卖双方)。每次转型需验证: 客户是否愿意为新模式付费?现有团队能否支撑?现金流能否度过转型期?' },
  // ── 动态层: 行业趋势 ──
  { domain: 'business_model', type: 'case_study', confidence: 0.75, level: 3, content: '制造业即服务(MaaS)趋势: 劳斯莱斯的Power-by-the-Hour(按飞行小时收费,从卖发动机→卖推力)、卡特彼勒的Cat Connect(设备+数据分析服务)。核心逻辑: 客户不需要设备,需要设备产出的结果。转型关键: IoT传感器数据+预测性维护AI+金融租赁能力。' },

  // ═══ 补充: business_model — 段永平六问 + 曾明 S2B2C（Synova v2.1） ═══
  { domain: 'business_model', type: 'theory', confidence: 0.95, level: 1, content: '段永平商业模式六问: 1.复购驱动力(客户为什么再买?) 2.定价权(涨价客户不走=有定价权) 3.现金流时序(先收后干>先干后收) 4.复制障碍(对手复制要多久?多贵?) 5.规模效应方向(越大越强还是越大越重?) 6.毛利率稳定性(被谁挤压?)。六问不是财务分析——是判断"这个生意天生好吗"。' },
  { domain: 'business_model', type: 'rule', confidence: 0.9, level: 2, content: '段永平体质判断: 好生意=自然复购+有定价权+先收后干+复制障碍高+规模是朋友+毛利率稳定。坏生意=一锤子买卖+随行就市+先干后收+无壁垒+越大越重+毛利率被挤压。大多数企业处于中间——诊断的价值是找到最薄弱的那一问。' },
  { domain: 'business_model', type: 'benchmark', confidence: 0.8, level: 2, content: '段永平视角的行业体质对比: 白酒(天生好生意:成瘾性复购+强定价权+先款后货+品牌壁垒+规模经济+高毛利)>家电(天生苦生意:低频复购+弱定价权+先货后款+规模是敌人+毛利率被渠道挤压)。培训咨询(项目制体质差:先干后收+核心人依赖,但轻资产+高毛利可弥补)。' },
  { domain: 'business_model', type: 'theory', confidence: 0.95, level: 2, content: '曾明 S2B2C 模式: S(Supply Chain/平台)做重——基础设施、供应链、IT、选品、物流; B(Business/前端)做轻——获客、服务、信任关系; C(Consumer)获得好产品+好体验。核心不是技术,是"谁干什么最有效率"。典型案例: 7-11(总部做供应链+系统,加盟店做最后一公里)、海澜之家(上游设计+供应链,加盟店出钱出场地)。' },
  { domain: 'business_model', type: 'rule', confidence: 0.85, level: 2, content: 'S2B2C 适配判断: 不是所有行业都适合。适合条件: 1.前端需要个性化/本地知识/信任关系(适合B做) 2.后端可以标准化/规模化(适合S做) 3.重新分工能让总体效率提升>20%。不适合: 前端高度标准化(如机票——直接S2C即可)、后端无法标准化(如高端定制咨询)。' },
  { domain: 'business_model', type: 'best_practice', confidence: 0.8, level: 2, content: '利益相关者动力分析: 强制评估两个问题——1.谁最希望看到你成功?(价值网络中利益正相关的参与者→潜在战略盟友) 2.谁在无意识中阻碍你?(激励机制与你增长目标相悖的参与者→隐藏的组织冲突)。例: 渠道商的销售提成结构让他们倾向于推竞品而不是你的新品——他们不是反对你,但他们的激励让他们无法帮你。' },
  { domain: 'business_model', type: 'benchmark', confidence: 0.8, level: 2, content: '定价权行业基准: 奢侈品(强定价权,毛利率>65%)> SaaS/软件(中强定价权,毛利率60-85%)> 消费品品牌(中定价权,毛利率40-65%)> 制造业(弱定价权,毛利率20-40%)> 大宗商品(无定价权,毛利率<20%)。定价权的结构性来源: 品牌溢价、转换成本、垄断地位、信息不对称。运营性"定价权"(如促销)不是真正的定价权。' },
  { domain: 'business_model', type: 'threshold', confidence: 0.85, level: 2, content: '复制障碍等级: 牌照/特许经营(最强,法律保护)> 网络效应(强,用户越多越不可替代)> 规模经济+品牌+渠道沉淀(中强,需时间和资本)> 专利(有时限,到期失效)> 运营效率(弱,竞品可通过学习追赶)> 先发优势(极弱,除非已转化为上述之一)。' },
  { domain: 'business_model', type: 'case_study', confidence: 0.85, level: 2, content: 'OPPO/vivo 商业模式(段永平视角): 品质定位+渠道共建+稳健定价——不是互联网模式但商业逻辑自洽。复购=品质可靠性→口碑传播; 定价权=价格稳定不乱降价→渠道有信心; 复制障碍=线下渠道需要多年时间沉淀→互联网公司难以复制。证明: 好商业模式不必须是互联网模式。' },
  { domain: 'business_model', type: 'case_study', confidence: 0.8, level: 2, content: '7-11 S2B2C: 总部S做供应链+IT+选品+物流+培训; 加盟店B做最后一公里服务+本地客户关系; C获得便利+品质。关键: S给B的价值=B自己做不到的效率提升(总部集采比单店采购成本低15-20%)。S2B2C成功的核心= S提供的价值让B的转换成本极高。' },

  // ═══ 补充: knowledge — 行业对标 + 跨行业模式（Synova v2.1） ═══
  { domain: 'knowledge', type: 'benchmark', confidence: 0.85, level: 2, content: '专业服务行业(培训/咨询/广告)基准: 毛利率40-60%,净利率8-20%,核心人依赖度<30%健康,客户集中度(前3)<40%健康,回款周期<60天健康,续约率>80%健康。致命风险: 核心讲师/客户总监离职→营收直接损失。' },
  { domain: 'knowledge', type: 'benchmark', confidence: 0.85, level: 2, content: '制造业基准: 毛利率25-40%,产能利用率>80%健康,OEE>72%健康,库存周转>6次/年健康,客户集中度(前3)<50%健康。致命风险: 单一客户依赖+核心工程师离职→研发停摆。代工→品牌转型的必经阵痛: 毛利率提升但营销费用激增。' },
  { domain: 'knowledge', type: 'benchmark', confidence: 0.85, level: 2, content: 'SaaS/订阅制基准: 月续费率(Logo)>95%健康,月续费率(MRR)>100%健康(NRR>100%),LTV/CAC>3健康,CAC回收期<12月健康,客户集中度(前3)<30%健康,跑道>24月健康。致命风险: 烧钱速度>增长带来的现金流改善。竞品有渠道和客户基础进入同一赛道。' },
  { domain: 'knowledge', type: 'benchmark', confidence: 0.85, level: 2, content: '零售/消费品基准: 毛利率60-75%(护肤品),净利率5-15%,库存周转>4次/年健康,复购率>40%健康,渠道集中度(单渠道)<40%健康。致命风险: 渠道依赖(平台规则一变就冲击营收)+SKU过长(长尾库存积压)。线下拓展缺经验团队。代工厂核心原料独家供应。' },
  { domain: 'knowledge', type: 'benchmark', confidence: 0.85, level: 2, content: '连锁餐饮基准: 单店净利润率>15%健康,盈利店占比>90%健康,新店养店期<6月健康,翻台率(午市)>3健康,店长流失率(年)<15%健康。致命风险: 店长培养速度跟不上开店计划。中央厨房配送半径限制跨区域扩张。关键配方只有核心人知道。' },
  { domain: 'knowledge', type: 'rule', confidence: 0.9, level: 2, content: '跨行业模式识别规则: 当不同行业的两个企业在同一乘数因子上得分相似时,它们的诊断结论可能互鉴。例: 一个培训公司(核心人依赖)和一个精密制造(核心工程师依赖)——在"组织能力"乘数上的瓶颈模式相同,解决方案可以跨行业借鉴。knowledge 专家应主动检索跨行业相似模式。' },
  { domain: 'knowledge', type: 'best_practice', confidence: 0.8, level: 1, content: '诊断知识积累原则: 每次诊断完成后,被验证正确的发现(用户确认+FDE审核)→自动沉淀为PKB条目(confidence=0.6,随重复验证次数上升)。被验证错误的发现→原条目confidence降级,superseded_by指向新条目。未验证的发现→不自动沉淀,由FDE手动判断。' },
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
