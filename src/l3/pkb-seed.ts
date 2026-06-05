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
  { domain: 'marketing', type: 'theory', confidence: 0.9, level: 2, content: 'STP 市场定位: Segmentation(按地理/人口/心理/行为细分市场)→Targeting(选择目标市场,评估规模/增长/竞争/匹配度)→Positioning(差异化定位,价值主张一句话说清)。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: '4P/4C 营销组合: 4P(产品/价格/渠道/促销)→4C(客户价值/成本/便利/沟通)。4P是厂商视角,4C是客户视角。现代营销应4P+4C并用,以4C为起点反推4P。' },
  { domain: 'marketing', type: 'theory', confidence: 0.85, level: 2, content: 'AARRR 海盗指标: Acquisition(获客)→Activation(激活)→Retention(留存)→Revenue(变现)→Referral(推荐)。用于诊断增长漏斗,找到最大瓶颈。常见:获客够但激活低→产品体验问题,留存低→产品价值不足。' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 2, content: '品牌定位金字塔: 底层→品牌属性(是什么),中层→品牌利益(解决什么),高层→品牌价值观(信仰什么),塔尖→品牌精髓(一句话)。诊断:品牌各层是否一致?客户认知与品牌自述是否有偏差?' },
  { domain: 'marketing', type: 'theory', confidence: 0.8, level: 3, content: '客户旅程地图(Customer Journey Map): 认知→考虑→购买→使用→忠诚→推荐六个阶段。每个阶段标注触点、情绪曲线、痛点和机会。用于发现营销断裂点和体验优化空间。' },
  { domain: 'marketing', type: 'rule', confidence: 0.85, level: 2, content: '定价策略检查清单: 1.成本加成(确保不低于成本) 2.竞争对标(与竞品的价差是否合理) 3.价值定价(客户愿意付多少钱) 4.价格弹性(提价5%会流失多少客户)。最优价格不是最低价,是客户感知价值与竞品的平衡点。' },
  { domain: 'marketing', type: 'benchmark', confidence: 0.75, level: 2, content: '各行业营销费用占营收比: SaaS 40-60%(早期)/20-30%(成熟),消费品 10-20%,制造业 3-8%,服务业 5-10%。营销ROI>3为良好,>5为优秀。' },
  { domain: 'marketing', type: 'best_practice', confidence: 0.7, level: 1, content: '小企业营销起步: 1.建立品牌一句话介绍 2.先做一个免费获客渠道(SEO/内容/社交媒体) 3.客户推荐奖励机制 4.每季度测一个新渠道,保留>2倍ROI的。' },

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
