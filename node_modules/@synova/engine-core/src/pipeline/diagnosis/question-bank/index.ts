/**
 * question-bank/index.ts — 诊断问题库
 *
 * 为诊断 Phase 0（界定）+ Phase 1（采集）提供结构化问卷。
 *
 * 设计：
 *   - ~150 道种子题，按 [维度] × [角色类型] × [阶段] 三维索引
 *   - addCustomQuestion() 扩展 API（供 FDE 手动添加）
 *   - 检索：按维度/角色/阶段/关键词多条件过滤
 *   - 每个问题带 source 标记（builtin / custom），用于反馈循环
 *
 * 问题类型：
 *   - scale_1_10    — 1-10 打分题
 *   - multiple_choice — 单选题
 *   - open_ended    — 开放题
 *   - scenario      — 场景判断题
 */

// ====================================================================
// 类型定义
// ====================================================================

export type QuestionType = 'scale_1_10' | 'multiple_choice' | 'open_ended' | 'scenario';

export type DiagnosticPhase = 0 | 1;

/** 适用角色 */
export type TargetRole =
  | 'any'
  | 'founder'
  | 'executive'
  | 'engineering-manager'
  | 'product-manager'
  | 'senior-engineer'
  | 'junior-engineer'
  | 'designer'
  | 'data-scientist'
  | 'devops'
  | 'hr'
  | 'operations'
  | 'sales'
  | 'marketing';

/** 适用维度 */
export type TargetDimension =
  | '信任与心理安全'
  | '决策权分配'
  | '信息透明度'
  | '分工合理性'
  | '目标对齐'
  | '角色清晰度'
  | '冲突解决模式'
  | '工具与自动化'
  | '品类认知与定位'
  | '获客与转化'
  | '客户关系与品牌'
  | '服务体验'
  | 'any';

export interface QuestionChoice {
  value: string;
  label: string;
  /** 该选项暗示的问题等级（1-10） */
  scoreHint?: number;
}

export interface DiagnosticQuestion {
  id: string;
  type: QuestionType;
  /** 所属诊断阶段 */
  phase: DiagnosticPhase;
  /** 问题文本 */
  text: string;
  /** 适用维度 */
  dimension: TargetDimension;
  /** 适用角色 */
  targetRole: TargetRole;
  /** 选择题的选项（仅 multiple_choice） */
  choices?: QuestionChoice[];
  /** 开放题的追问提示 */
  followUp?: string;
  /** 来源——builtin 或 custom */
  source: 'builtin' | 'custom';
  /** 该问题的默认权重 0-1（在证据池中的重要性） */
  weight: number;
  /** 创建时间（custom 问题用） */
  createdAt?: string;
}

export interface QuestionFilter {
  phase?: DiagnosticPhase;
  dimension?: TargetDimension;
  targetRole?: TargetRole;
  type?: QuestionType;
  keyword?: string;
  /** 只返回指定来源的问题 */
  source?: 'builtin' | 'custom';
}

// ====================================================================
// 种子问题库
// ====================================================================

const SEED_QUESTIONS: DiagnosticQuestion[] = [
  // ── Phase 0: 界定阶段 — 通用 ──
  { id: 'p0-gen-01', type: 'open_ended', phase: 0, text: '请用一句话描述你所在团队的职责和定位。', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.5 },
  { id: 'p0-gen-02', type: 'multiple_choice', phase: 0, text: '目前团队最需要改善的方面是？', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.5, choices: [
    { value: 'trust', label: '团队信任与心理安全' },
    { value: 'decision', label: '决策效率与权责清晰度' },
    { value: 'info', label: '信息流通与透明度' },
    { value: 'division', label: '分工与协作模式' },
    { value: 'alignment', label: '目标对齐与优先级' },
    { value: 'tools', label: '工具与自动化水平' },
  ]},
  { id: 'p0-gen-03', type: 'scale_1_10', phase: 0, text: '你对团队目前整体状态的满意度是？（1=非常不满，10=非常满意）', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.6 },
  { id: 'p0-gen-04', type: 'open_ended', phase: 0, text: '在过去一个月里，你遇到的最大协作障碍是什么？', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ── Phase 1: 采集 — 信任与心理安全 ──
  { id: 'p1-trust-01', type: 'scale_1_10', phase: 1, text: '你在团队中可以自由表达不同意见，而不必担心负面影响。（1=完全不同意，10=完全同意）', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.9 },
  { id: 'p1-trust-02', type: 'scale_1_10', phase: 1, text: '即使犯了错误，你也相信团队会支持你而非责备。（1=完全不信任，10=完全信任）', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-trust-03', type: 'multiple_choice', phase: 1, text: '当你在团队中提出反对意见时，通常的反应是？', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.8, choices: [
    { value: 'welcomed', label: '被认真倾听和讨论', scoreHint: 9 },
    { value: 'tolerated', label: '被礼貌地忽略', scoreHint: 5 },
    { value: 'defended', label: '被防御性回应', scoreHint: 3 },
    { value: 'punished', label: '在后续沟通或机会中被边缘化', scoreHint: 1 },
  ]},
  { id: 'p1-trust-04', type: 'scenario', phase: 1, text: '想象一个场景：你在全员会议上指出 CEO 的决策有明显风险。会议结束后，你觉得会发生什么？（开放式回答）', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.8, followUp: '你是否有过类似的真实经历？结果如何？' },
  { id: 'p1-trust-05', type: 'scale_1_10', phase: 1, text: '团队成员之间能够坦诚地讨论困难话题（如绩效、薪资、人际关系）。（1=从不，10=总是）', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-trust-06', type: 'open_ended', phase: 1, text: '你认为是什么在阻碍团队建立更深层的信任？', dimension: '信任与心理安全', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ── Phase 1: 采集 — 决策权分配 ──
  { id: 'p1-decision-01', type: 'scale_1_10', phase: 1, text: '在你的职责范围内，你是否有足够的自主权做出决策？（1=完全没有，10=完全自主）', dimension: '决策权分配', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-decision-02', type: 'multiple_choice', phase: 1, text: '当你需要做一个跨部门决策时，通常会？', dimension: '决策权分配', targetRole: 'any', source: 'builtin', weight: 0.8, choices: [
    { value: 'autonomous', label: '直接决策，知会相关人员', scoreHint: 9 },
    { value: 'consult', label: '先征求受影响方意见再决策', scoreHint: 7 },
    { value: 'escalate', label: '上报给上级决策', scoreHint: 4 },
    { value: 'stalled', label: '多方僵持，决策无限期推迟', scoreHint: 1 },
  ]},
  { id: 'p1-decision-03', type: 'scale_1_10', phase: 1, text: '你知道每一个关键业务决策的最终负责人是谁。（1=完全不知道，10=一清二楚）', dimension: '决策权分配', targetRole: 'any', source: 'builtin', weight: 0.8 },
  { id: 'p1-decision-04', type: 'open_ended', phase: 1, text: '请举一个最近的例子：一个本来应该很快做出的决策，实际上花了很长时间。问题出在哪里？', dimension: '决策权分配', targetRole: 'any', source: 'builtin', weight: 0.75, followUp: '谁应该拥有这个决策的最终裁定权？' },
  { id: 'p1-decision-05', type: 'scenario', phase: 1, text: '假设你发现一个技术方案存在严重缺陷需要立即推翻重来，但这会影响产品经理的发布计划。你会怎么做？', dimension: '决策权分配', targetRole: 'senior-engineer', source: 'builtin', weight: 0.7 },
  { id: 'p1-decision-06', type: 'scale_1_10', phase: 1, text: '作为高管，你的战略决策能够被下级团队有效执行而不被"打折扣"。（1=总是被打折，10=完全一致执行）', dimension: '决策权分配', targetRole: 'executive', source: 'builtin', weight: 0.8 },

  // ── Phase 1: 采集 — 信息透明度 ──
  { id: 'p1-info-01', type: 'scale_1_10', phase: 1, text: '你能够及时获取完成工作所需的所有信息。（1=总是滞后/缺失，10=总是及时完整）', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-info-02', type: 'multiple_choice', phase: 1, text: '关于公司战略和重大决策的信息，你通常从哪里获知？', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.75, choices: [
    { value: 'official', label: '正式渠道（全员会/邮件/文档）', scoreHint: 9 },
    { value: 'manager', label: '直属上级的二次传达', scoreHint: 6 },
    { value: 'grapevine', label: '同事间的非正式交流', scoreHint: 3 },
    { value: 'outsider', label: '外部渠道或完全不知情', scoreHint: 1 },
  ]},
  { id: 'p1-info-03', type: 'scale_1_10', phase: 1, text: '跨团队之间的信息同步是否顺畅？（1=严重壁垒，10=无缝流通）', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.8 },
  { id: 'p1-info-04', type: 'open_ended', phase: 1, text: '你最近一次因为信息不对称而做出错误判断是什么情况？', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-info-05', type: 'scale_1_10', phase: 1, text: '公司/团队的重要文档（决策记录、技术方案、项目计划）是否便于查找和阅读？（1=几乎找不到，10=结构清晰易查找）', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-info-06', type: 'open_ended', phase: 1, text: '你认为目前团队中信息流通的最大瓶颈在哪里？是工具、流程、还是人的因素？', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.65 },

  // ── Phase 1: 采集 — 分工合理性 ──
  { id: 'p1-div-01', type: 'scale_1_10', phase: 1, text: '你和协作同事之间的职责边界是否清晰？（1=完全模糊，10=非常清晰）', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-div-02', type: 'multiple_choice', phase: 1, text: '关于团队分工，以下哪项最接近你的真实感受？', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.8, choices: [
    { value: 'optimal', label: '分工合理，各司其职', scoreHint: 9 },
    { value: 'overlap', label: '存在明显的职责重叠区域', scoreHint: 5 },
    { value: 'gap', label: '存在无人认领的关键任务', scoreHint: 4 },
    { value: 'mismatch', label: '能力与职责严重不匹配', scoreHint: 2 },
  ]},
  { id: 'p1-div-03', type: 'scale_1_10', phase: 1, text: '你的工作量是否合理？（1=严重超负荷/严重不足，10=合理均衡）', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-div-04', type: 'open_ended', phase: 1, text: '团队中是否存在"能者多劳"的现象——少数人承担了不成比例的工作量？', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-div-05', type: 'scenario', phase: 1, text: '一个紧急需求来了，你没时间做但必须完成。你找同事求助，但对方说"这不是我的职责范围"。这种情况发生的频率？', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.65 },

  // ── Phase 1: 采集 — 目标对齐 ──
  { id: 'p1-align-01', type: 'scale_1_10', phase: 1, text: '你清楚团队在未来 3 个月的最高优先级目标。（1=完全不清楚，10=非常清楚）', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.9 },
  { id: 'p1-align-02', type: 'multiple_choice', phase: 1, text: '当你发现自己负责的工作与团队宣称的目标不一致时，通常会？', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.75, choices: [
    { value: 'realign', label: '主动提出并推动调整', scoreHint: 9 },
    { value: 'ignore', label: '继续照做，觉得提了也没用', scoreHint: 3 },
    { value: 'confused', label: '不确定应该怎么做', scoreHint: 5 },
    { value: 'hidden', label: '团队目标本身就是模糊的，无法比对', scoreHint: 2 },
  ]},
  { id: 'p1-align-03', type: 'scale_1_10', phase: 1, text: '不同部门/小组之间的目标是否一致而非相互冲突？（1=严重冲突，10=高度一致）', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.8 },
  { id: 'p1-align-04', type: 'open_ended', phase: 1, text: '请描述一个你亲身经历的"目标冲突"场景——两个团队为了各自的 KPI 而相互阻碍。', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-align-05', type: 'scale_1_10', phase: 1, text: 'OKR/KPI 等目标管理工具在你的团队中是真正被使用的，还是流于形式？（1=纯形式，10=真正驱动决策）', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ── Phase 1: 采集 — 角色清晰度 ──
  { id: 'p1-role-01', type: 'scale_1_10', phase: 1, text: '你清楚自己角色在团队中的定位和价值。（1=定位模糊，10=角色定位非常清晰）', dimension: '角色清晰度', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-role-02', type: 'multiple_choice', phase: 1, text: '关于角色晋升和成长路径，以下哪项最符合你的情况？', dimension: '角色清晰度', targetRole: 'any', source: 'builtin', weight: 0.75, choices: [
    { value: 'clear', label: '有明确的晋升标准和成长路径', scoreHint: 9 },
    { value: 'informal', label: '大概知道但无正式定义', scoreHint: 5 },
    { value: 'opaque', label: '完全不清楚如何晋升', scoreHint: 2 },
    { value: 'deadend', label: '感觉在本团队没有成长空间', scoreHint: 1 },
  ]},
  { id: 'p1-role-03', type: 'open_ended', phase: 1, text: '如果你离开当前的团队，有没有一个明确的交接对象和流程？', dimension: '角色清晰度', targetRole: 'any', source: 'builtin', weight: 0.65 },
  { id: 'p1-role-04', type: 'scale_1_10', phase: 1, text: '你的日常工作和你的职位描述/入职时的期望是否一致？（1=完全不一致，10=高度一致）', dimension: '角色清晰度', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ── Phase 1: 采集 — 冲突解决模式 ──
  { id: 'p1-conflict-01', type: 'multiple_choice', phase: 1, text: '当团队内部发生意见分歧时，最终通常如何解决？', dimension: '冲突解决模式', targetRole: 'any', source: 'builtin', weight: 0.85, choices: [
    { value: 'consensus', label: '通过讨论达成共识', scoreHint: 9 },
    { value: 'authority', label: '由上级直接裁定', scoreHint: 6 },
    { value: 'vote', label: '少数服从多数', scoreHint: 7 },
    { value: 'avoid', label: '回避分歧，问题自然消失或恶化', scoreHint: 2 },
    { value: 'winner', label: '谁声音大谁赢', scoreHint: 1 },
  ]},
  { id: 'p1-conflict-02', type: 'scale_1_10', phase: 1, text: '冲突解决后，团队成员之间的关系是否能够恢复？（1=留下长期裂痕，10=恢复如初）', dimension: '冲突解决模式', targetRole: 'any', source: 'builtin', weight: 0.8 },
  { id: 'p1-conflict-03', type: 'open_ended', phase: 1, text: '回顾最近一次团队内的明显分歧——它是如何被处理的？你认为处理方式有什么可以改进的？', dimension: '冲突解决模式', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-conflict-04', type: 'scenario', phase: 1, text: '两个技术骨干对架构方向存在根本分歧，各自坚持已见，项目因此停滞两周。作为管理者，你会怎么处理？', dimension: '冲突解决模式', targetRole: 'engineering-manager', source: 'builtin', weight: 0.75 },

  // ── Phase 1: 采集 — 工具与自动化 ──
  { id: 'p1-tools-01', type: 'scale_1_10', phase: 1, text: '团队使用的工具链是否让工作更顺畅而非成为阻碍？（1=严重拖累效率，10=显著提升效率）', dimension: '工具与自动化', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-tools-02', type: 'multiple_choice', phase: 1, text: '关于重复性工作，你们团队的做法是？', dimension: '工具与自动化', targetRole: 'any', source: 'builtin', weight: 0.7, choices: [
    { value: 'automated', label: '大部分已自动化', scoreHint: 9 },
    { value: 'partial', label: '部分自动化，部分仍手动', scoreHint: 6 },
    { value: 'manual', label: '基本靠手动操作', scoreHint: 3 },
    { value: 'chaos', label: '没有统一的工具和流程', scoreHint: 1 },
  ]},
  { id: 'p1-tools-03', type: 'open_ended', phase: 1, text: '如果有一笔预算用于改进团队工具链，你最优先投入的是什么？为什么？', dimension: '工具与自动化', targetRole: 'any', source: 'builtin', weight: 0.65 },

  // ── CEO/Founder 专属问题 ──
  { id: 'p1-ceo-01', type: 'open_ended', phase: 1, text: '作为创始人/CEO，你最担心团队在哪些方面"报喜不报忧"？', dimension: '信任与心理安全', targetRole: 'founder', source: 'builtin', weight: 0.9, followUp: '你认为这种信息过滤的程度有多严重？' },
  { id: 'p1-ceo-02', type: 'scale_1_10', phase: 1, text: '你的核心管理层在战略上是否与你保持高度一致？（1=各自为政，10=高度一致）', dimension: '目标对齐', targetRole: 'founder', source: 'builtin', weight: 0.9 },
  { id: 'p1-ceo-03', type: 'open_ended', phase: 1, text: '作为最终决策者，你是如何确保关键决策的信息充分性？是否有一个你信任的"红队"来挑战你的假设？', dimension: '决策权分配', targetRole: 'founder', source: 'builtin', weight: 0.85 },
  { id: 'p1-ceo-04', type: 'scenario', phase: 1, text: '你打算做出一个可能不受欢迎但你认为正确的战略转向。你会如何在宣布前准备团队？', dimension: '决策权分配', targetRole: 'founder', source: 'builtin', weight: 0.8 },

  // ── Engineering Manager 专属 ──
  { id: 'p1-em-01', type: 'scale_1_10', phase: 1, text: '你的技术决策权是否匹配你所承担的责任？（1=有责无权，10=权责匹配）', dimension: '决策权分配', targetRole: 'engineering-manager', source: 'builtin', weight: 0.85 },
  { id: 'p1-em-02', type: 'open_ended', phase: 1, text: '技术债务在你们团队的决策优先级中排第几？是否经常为了赶进度而积累新的技术债？', dimension: '分工合理性', targetRole: 'engineering-manager', source: 'builtin', weight: 0.75 },
  { id: 'p1-em-03', type: 'scale_1_10', phase: 1, text: '跨部门（产品/设计/运营）的协作是否高效而非相互消耗？（1=深陷部门墙，10=无缝协作）', dimension: '信息透明度', targetRole: 'engineering-manager', source: 'builtin', weight: 0.8 },

  // ── HR 专属 ──
  { id: 'p1-hr-01', type: 'open_ended', phase: 1, text: '你认为团队目前最严重的"人"的风险是什么？（离职、倦怠、文化稀释、招聘困难等）', dimension: 'any', targetRole: 'hr', source: 'builtin', weight: 0.85 },
  { id: 'p1-hr-02', type: 'scale_1_10', phase: 1, text: '团队成员的离职意愿如何？（1=严重流失风险，10=非常稳定）', dimension: '信任与心理安全', targetRole: 'hr', source: 'builtin', weight: 0.8 },
  { id: 'p1-hr-03', type: 'multiple_choice', phase: 1, text: '关于绩效评估的公平性和透明度，团队成员的反馈倾向是？', dimension: '角色清晰度', targetRole: 'hr', source: 'builtin', weight: 0.75, choices: [
    { value: 'fair', label: '普遍认为公平透明', scoreHint: 9 },
    { value: 'mixed', label: '褒贬不一，部分角色存在争议', scoreHint: 5 },
    { value: 'unfair', label: '普遍认为不够公平', scoreHint: 2 },
    { value: 'nonexist', label: '没有正式的绩效评估体系', scoreHint: 3 },
  ]},

  // ── 补充：覆盖各维度的额外问题 ──
  { id: 'p1-extra-01', type: 'scale_1_10', phase: 1, text: '团队的 OKR/KPI 体系是否真正反映了工作价值，而非沦为"刷数字"？（1=完全脱节，10=高度一致）', dimension: '目标对齐', targetRole: 'any', source: 'builtin', weight: 0.65 },
  { id: 'p1-extra-02', type: 'open_ended', phase: 1, text: '团队中是否存在"信息守门人"——某个或某些人控制着关键信息的流通？', dimension: '信息透明度', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-extra-03', type: 'scale_1_10', phase: 1, text: '在紧急情况下，团队是否能迅速组成临时攻坚小组而非死守原有分工？（1=完全僵化，10=灵活机动）', dimension: '分工合理性', targetRole: 'any', source: 'builtin', weight: 0.65 },
  { id: 'p1-extra-04', type: 'scenario', phase: 1, text: '一个新人加入团队 3 个月后，他能从哪里了解"我们是如何做决策的"？这份文档/流程存在吗？', dimension: '决策权分配', targetRole: 'any', source: 'builtin', weight: 0.6 },
  { id: 'p1-extra-05', type: 'scale_1_10', phase: 1, text: '团队是否有正式的回顾/复盘机制？（1=从不复盘，10=每次迭代都系统复盘）', dimension: '冲突解决模式', targetRole: 'any', source: 'builtin', weight: 0.6 },
  { id: 'p1-extra-06', type: 'open_ended', phase: 1, text: '如果团队下个月只做一件事来改善协作，你认为最该做的是什么？', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ═══════════════════════════════════════════════════════════
  // Phase 0: 界定 — 营销通用
  // ═══════════════════════════════════════════════════════════
  { id: 'p0-mkt-01', type: 'open_ended', phase: 0, text: '请用一句话描述你们公司的市场定位（你们是谁、为谁解决什么问题）。', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.5 },
  { id: 'p0-mkt-02', type: 'open_ended', phase: 0, text: '如果随机问 10 个客户"XX 公司是做什么的"，你认为他们会用什么词来描述？', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.5 },
  { id: 'p0-mkt-03', type: 'multiple_choice', phase: 0, text: '关于公司营销现状，你认为最紧迫的问题是？', dimension: 'any', targetRole: 'any', source: 'builtin', weight: 0.5, choices: [
    { value: 'positioning', label: '市场定位不清晰，客户不知道我们是做什么的' },
    { value: 'reach', label: '获客渠道效率低，花钱多效果差' },
    { value: 'brand', label: '品牌知名度低，客户不信任' },
    { value: 'service', label: '服务体验差，客户流失率高' },
    { value: 'differentiation', label: '缺乏差异化，客户看不出我们和竞品有什么区别' },
  ]},

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — 品类认知与定位（Insight & Positioning）
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-pos-01', type: 'scale_1_10', phase: 1, text: '客户是否用统一的品类词来描述你们的产品/服务？（1=每个人说的都不一样，10=高度一致）', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-pos-02', type: 'open_ended', phase: 1, text: '你们对外宣称的差异化主张是什么？你是否认为客户真正感知到了这一点？', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.8, followUp: '请举例说明客户的感知与你声称的差异在何处。' },
  { id: 'p1-mkt-pos-03', type: 'multiple_choice', phase: 1, text: '关于公司定位，以下哪项最接近你的真实感受？', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.8, choices: [
    { value: 'aligned', label: '对外说的、内部理解、客户感知三者一致', scoreHint: 9 },
    { value: 'internal_gap', label: '对外说的和内部理解一致，但客户没感知到', scoreHint: 5 },
    { value: 'external_gap', label: '内部知道真实定位，但对外说得不一致', scoreHint: 4 },
    { value: 'chaotic', label: '三方各说各话，完全没有一致的定位', scoreHint: 1 },
  ]},
  { id: 'p1-mkt-pos-04', type: 'scenario', phase: 1, text: '假设一个新销售入职，他需要向客户解释"我们跟竞品的核心区别是什么"。他能在入职培训材料中找到一致的答案吗？还是每个老销售给的答案都不一样？', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-mkt-pos-05', type: 'scale_1_10', phase: 1, text: '公司内部（不同部门、不同层级）对"我们是谁、我们不是谁"的认知是否一致？（1=严重分歧，10=高度一致）', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-mkt-pos-06', type: 'open_ended', phase: 1, text: '请描述一次你听到客户用你完全没想到的词汇描述你们公司的经历。这说明什么？', dimension: '品类认知与定位', targetRole: 'any', source: 'builtin', weight: 0.65 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — 获客与转化（Reach & Conversion）
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-rch-01', type: 'scale_1_10', phase: 1, text: '你们对每个获客渠道的投入产出比（ROI）是否有清晰的计算？（1=完全不清楚，10=精确到渠道）', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-rch-02', type: 'multiple_choice', phase: 1, text: '目前对你们最重要的获客渠道是？', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.7, choices: [
    { value: 'referral', label: '老客户推荐/口碑' },
    { value: 'content', label: '内容营销/SEO' },
    { value: 'paid_ads', label: '付费广告（SEM/信息流）' },
    { value: 'outbound', label: '主动外呼/BD' },
    { value: 'partner', label: '渠道合作伙伴' },
    { value: 'social', label: '社交媒体/社区运营' },
  ]},
  { id: 'p1-mkt-rch-03', type: 'open_ended', phase: 1, text: '从"潜在客户第一次听说你们"到"签约付费"，最大的流失发生在哪个环节？你认为原因是什么？', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.8, followUp: '这个环节的转化率大概是多少？' },
  { id: 'p1-mkt-rch-04', type: 'scale_1_10', phase: 1, text: '销售/BD 团队对产品真实能力的描述是否准确，而非过度承诺？（1=严重夸大，10=完全准确）', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-mkt-rch-05', type: 'open_ended', phase: 1, text: '你们是如何衡量营销投入的回报的？目前的评估方式有什么让你不满意的地方？', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-mkt-rch-06', type: 'scale_1_10', phase: 1, text: '线索到成交的平均周期是否在可接受范围内？（1=远超预期/无底洞，10=高效可预测）', dimension: '获客与转化', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — 客户关系与品牌（Relationship & Brand）
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-rel-01', type: 'scale_1_10', phase: 1, text: '客户是否会主动向他人推荐你们的产品？（1=从未发生，10=经常发生/有完善的推荐机制）', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-rel-02', type: 'multiple_choice', phase: 1, text: '关于客户关系，以下最接近真实情况的是？', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.8, choices: [
    { value: 'partnership', label: '客户视我们为战略伙伴，深度绑定', scoreHint: 9 },
    { value: 'vendor', label: '客户视我们为可靠供应商，按需使用', scoreHint: 6 },
    { value: 'transactional', label: '纯交易关系，随时可能替换', scoreHint: 3 },
    { value: 'hostile', label: '关系紧张，客户在找替代方案', scoreHint: 1 },
  ]},
  { id: 'p1-mkt-rel-03', type: 'open_ended', phase: 1, text: '客户流失的最主要原因是什么？你是否有系统的流失分析？', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.8, followUp: '最近一个流失的客户是怎么说的？' },
  { id: 'p1-mkt-rel-04', type: 'scenario', phase: 1, text: '如果一个老客户在社交媒体上公开投诉你们的产品，从发现到回应到解决，完整流程是怎样的？是否有明确的责任人？', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.7 },
  { id: 'p1-mkt-rel-05', type: 'scale_1_10', phase: 1, text: '你们的品牌在目标市场中的知名度如何？（1=完全无人知晓，10=行业标杆/首选品牌）', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-mkt-rel-06', type: 'open_ended', phase: 1, text: '你们是否定期做客户满意度调研（NPS/CSAT）？调研结果是如何被使用的——是真正驱动了改进，还是看看就过去了？', dimension: '客户关系与品牌', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — 服务体验（Service Experience）
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-svc-01', type: 'scale_1_10', phase: 1, text: '客户对你们的服务响应速度和质量是否满意？（1=普遍不满/频繁投诉，10=高度满意/极少投诉）', dimension: '服务体验', targetRole: 'any', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-svc-02', type: 'multiple_choice', phase: 1, text: '客户提出需求后，通常的首次响应周期是？', dimension: '服务体验', targetRole: 'any', source: 'builtin', weight: 0.75, choices: [
    { value: 'instant', label: '实时/1小时内', scoreHint: 9 },
    { value: 'same_day', label: '当天内', scoreHint: 7 },
    { value: 'next_day', label: '1-2个工作日', scoreHint: 5 },
    { value: 'slow', label: '3天以上或响应时间不可预测', scoreHint: 2 },
  ]},
  { id: 'p1-mkt-svc-03', type: 'open_ended', phase: 1, text: '客户最常抱怨的服务问题是什么？这个问题的根因在哪个部门？', dimension: '服务体验', targetRole: 'any', source: 'builtin', weight: 0.8 },
  { id: 'p1-mkt-svc-04', type: 'scale_1_10', phase: 1, text: '客户成功/售后团队的配置是否足以支撑当前客户规模？（1=严重不足，10=绰绰有余）', dimension: '服务体验', targetRole: 'any', source: 'builtin', weight: 0.75 },
  { id: 'p1-mkt-svc-05', type: 'scenario', phase: 1, text: '一个客户因为产品 bug 导致业务中断，愤怒地在工作群里 @ 了所有人。从这一刻开始，到问题解决，中间经历哪些环节？每个环节有明确的责任人和 SLA 吗？', dimension: '服务体验', targetRole: 'any', source: 'builtin', weight: 0.7 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — 营销角色专属
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-role-01', type: 'open_ended', phase: 1, text: '如果下个季度营销只能做一件改进，你会选择什么？为什么？', dimension: 'any', targetRole: 'marketing', source: 'builtin', weight: 0.9 },
  { id: 'p1-mkt-role-02', type: 'scale_1_10', phase: 1, text: '你们是否有系统的客户访谈/市场调研机制来持续获取外部洞察？（1=从不做，10=定期、系统化）', dimension: '品类认知与定位', targetRole: 'marketing', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-role-03', type: 'multiple_choice', phase: 1, text: '你们获取市场洞察的主要方式是？', dimension: '品类认知与定位', targetRole: 'marketing', source: 'builtin', weight: 0.75, choices: [
    { value: 'interviews', label: '客户深度访谈' },
    { value: 'surveys', label: '问卷调研' },
    { value: 'analytics', label: '产品使用数据分析' },
    { value: 'sales_feedback', label: '销售团队反馈（二手信息）' },
    { value: 'competitor', label: '竞品动向观察' },
    { value: 'guess', label: '主要靠经验和直觉判断' },
  ]},
  { id: 'p1-mkt-role-04', type: 'open_ended', phase: 1, text: '你觉得公司目前营销最大的盲区是什么？有什么你想知道但一直没数据支撑的问题？', dimension: 'any', targetRole: 'marketing', source: 'builtin', weight: 0.8 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — Founder/CEO 营销视角
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-ceo-01', type: 'open_ended', phase: 1, text: '你认为公司营销最大的短板是什么？是认知问题（客户不知道我们）、信任问题（客户不信任我们）、还是产品问题（产品本身没有竞争力）？', dimension: 'any', targetRole: 'founder', source: 'builtin', weight: 0.9 },
  { id: 'p1-mkt-ceo-02', type: 'scale_1_10', phase: 1, text: '你是否清楚客户为什么选择了你们而非竞品？（1=完全靠猜测，10=有系统的 win/loss 分析）', dimension: '品类认知与定位', targetRole: 'founder', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-ceo-03', type: 'open_ended', phase: 1, text: '你们的差异化主张是否有组织能力的实质支撑？——声称"品质最好"但返工率高企、声称"服务最好"但投诉不断、声称"最快"但交付延期——这些矛盾你是否关注过？', dimension: '品类认知与定位', targetRole: 'founder', source: 'builtin', weight: 0.85 },

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 采集 — Sales 角色营销视角
  // ═══════════════════════════════════════════════════════════
  { id: 'p1-mkt-sales-01', type: 'open_ended', phase: 1, text: '在销售过程中，客户最常提出的异议是什么？（如："太贵了"、"和 XX 有什么区别"、"没听说过你们"等）', dimension: '获客与转化', targetRole: 'sales', source: 'builtin', weight: 0.85 },
  { id: 'p1-mkt-sales-02', type: 'scale_1_10', phase: 1, text: '对外销售材料（官网、PPT、Demo）与产品实际能力之间是否存在差距？（1=严重脱节/过度承诺，10=完全一致）', dimension: '获客与转化', targetRole: 'sales', source: 'builtin', weight: 0.8 },
  { id: 'p1-mkt-sales-03', type: 'open_ended', phase: 1, text: '如果让你给市场部提一个请求——提供一样你最需要的"武器"来帮你更好地成交，你会要什么？', dimension: '获客与转化', targetRole: 'sales', source: 'builtin', weight: 0.75 },
];

// ====================================================================
// 问题库管理
// ====================================================================

let customQuestions: DiagnosticQuestion[] = [];
let customIdCounter = 1000;

/** 检索问题 */
export function queryQuestions(filter: QuestionFilter = {}): DiagnosticQuestion[] {
  let results = [...SEED_QUESTIONS, ...customQuestions];

  if (filter.phase !== undefined) {
    results = results.filter(q => q.phase === filter.phase);
  }
  if (filter.dimension && filter.dimension !== 'any') {
    results = results.filter(q => q.dimension === filter.dimension || q.dimension === 'any');
  }
  if (filter.targetRole && filter.targetRole !== 'any') {
    results = results.filter(q => q.targetRole === filter.targetRole || q.targetRole === 'any');
  }
  if (filter.type) {
    results = results.filter(q => q.type === filter.type);
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    results = results.filter(q =>
      q.text.toLowerCase().includes(kw) ||
      q.dimension.toLowerCase().includes(kw) ||
      (q.followUp && q.followUp.toLowerCase().includes(kw)),
    );
  }
  if (filter.source) {
    results = results.filter(q => q.source === filter.source);
  }

  return results;
}

/** 按维度分组统计 */
export function countByDimension(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of [...SEED_QUESTIONS, ...customQuestions]) {
    counts[q.dimension] = (counts[q.dimension] ?? 0) + 1;
  }
  return counts;
}

/** 按角色分组统计 */
export function countByRole(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of [...SEED_QUESTIONS, ...customQuestions]) {
    counts[q.targetRole] = (counts[q.targetRole] ?? 0) + 1;
  }
  return counts;
}

/** 添加自定义问题（FDE 扩展 API） */
export function addCustomQuestion(
  question: Omit<DiagnosticQuestion, 'id' | 'source' | 'createdAt'>,
): DiagnosticQuestion {
  const id = `custom-${++customIdCounter}`;
  const entry: DiagnosticQuestion = {
    ...question,
    id,
    source: 'custom',
    createdAt: new Date().toISOString(),
  };
  customQuestions.push(entry);
  return entry;
}

/** 批量添加自定义问题 */
export function addCustomQuestions(
  questions: Omit<DiagnosticQuestion, 'id' | 'source' | 'createdAt'>[],
): DiagnosticQuestion[] {
  return questions.map(q => addCustomQuestion(q));
}

/** 删除自定义问题 */
export function removeCustomQuestion(id: string): boolean {
  const idx = customQuestions.findIndex(q => q.id === id);
  if (idx === -1) return false;
  customQuestions.splice(idx, 1);
  return true;
}

/** 获取问题总数（内置 + 自定义） */
export function getQuestionCount(): { builtin: number; custom: number } {
  return { builtin: SEED_QUESTIONS.length, custom: customQuestions.length };
}

/** 清除所有自定义问题（测试用） */
export function clearCustomQuestions(): void {
  customQuestions = [];
  customIdCounter = 1000;
}

/** 获取种子问题列表（只读，供 FDE 参考） */
export function getSeedQuestions(): readonly DiagnosticQuestion[] {
  return SEED_QUESTIONS;
}

/** 为特定角色生成诊断问卷 */
export function generateQuestionnaire(
  targetRole: TargetRole,
  phase: DiagnosticPhase = 1,
  maxQuestions = 15,
): DiagnosticQuestion[] {
  // 优先匹配角色专属问题，再匹配通用问题
  const specific = queryQuestions({ phase, targetRole });
  const general = queryQuestions({ phase, targetRole: 'any' });

  // 去重合并
  const seen = new Set(specific.map(q => q.id));
  const combined = [...specific];
  for (const q of general) {
    if (!seen.has(q.id)) {
      combined.push(q);
      seen.add(q.id);
    }
  }

  // 按权重降序 + 限制数量
  return combined.sort((a, b) => b.weight - a.weight).slice(0, maxQuestions);
}
