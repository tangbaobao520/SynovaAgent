// 6 缝隙规则引擎 — 四层架构 (GAP-9 重组)
// Phase 2A: L0 铁律 → L1 协议规则 → L2 Authority → L3 S1
//
// 核心设计:
//   1. Iron Laws (L0): 始终生效，不依赖协议配置值，不可降级
//   2. Protocol Rules (L1): gap → value → rules[]，按协议当前值匹配
//   3. Authority (L2): 结构化权限检查（占位，待 GAP-3 交付）
//   4. S1 (L3): 协议禁止组合，不依赖消息内容
//   5. 延迟保证: P99 < 50ms（纯内存操作，无 I/O）

import type {
  GapDimension,
  TeamProtocol,
  AgentMessage,
  ProtocolViolation,
  ConstraintSeverity,
} from './types';
import type { MatchRule, RuleMatchResult } from './types';

// ============================================================
// L0: 铁律（安全基线）— 始终生效，不可覆盖，不可降级
// 13 条规则: 6 SB-LOCK + 3 IRON-BLOCK + 4 IRON-WARN
// ============================================================
export const IRON_LAWS: MatchRule[] = [
  // ── 6 条 SB-LOCK: 硬阻断，不可 override ──
  {
    id: 'SB-PAYMENT',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(付款|支付|转账|汇款|pay|transfer|send\s*money|结算|invoice|采购下单|下单采购|确认.*订单|执行.*付款|发起.*支付)/i,
    severity: 'LOCK',
    reason: '安全基线: 资金/支付操作必须由人类用户亲自确认——Agent不得自主执行资金操作',
    suggestion: '请暂停当前操作，将付款详情展示给用户，等待用户明确输入"确认"后才可继续',
  },
  {
    id: 'SB-CONTRACT',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(合同|签署|签约|协议|contract|sign|NDA|盖章|法务审核|法律.*审查)/i,
    severity: 'LOCK',
    reason: '安全基线: 合同/协议签署必须由人类用户亲自确认——Agent不得自主代表用户签署任何法律文件',
    suggestion: '请暂停当前操作，将合同条款展示给用户，等待用户明确输入"签署"后才可继续',
  },
  {
    id: 'SB-CREDENTIAL',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(密码|密钥|secret|token|api\s*key|credential|password|私钥|证书|certificate|加密.*key|解密.*key)/i,
    severity: 'LOCK',
    reason: '安全基线: 密码/密钥/Token等凭证操作必须由人类用户亲自确认——Agent不得自主管理或泄露凭证',
    suggestion: '请暂停当前操作，将凭证操作详情展示给用户，等待用户明确输入"确认"后才可继续',
  },
  {
    id: 'SB-PUBLISH',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(发布|上线|deploy|publish|release|公开|对外发布|推送.*生产|prod\s*deploy)/i,
    severity: 'LOCK',
    reason: '安全基线: 对外发布/生产环境变更必须由人类用户亲自确认——Agent不得自主推送到生产环境',
    suggestion: '请暂停当前操作，将发布内容展示给用户，等待用户明确输入"发布"后才可继续',
  },
  {
    id: 'SB-CONFIG',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(修改配置|改.*配置|config\s*change|权限.*修改|修改.*权限|policy\s*update|安全.*变更|防火墙.*规则|白名单.*修改)/i,
    severity: 'LOCK',
    reason: '安全基线: 系统配置/权限/安全策略变更必须由人类用户亲自确认——Agent不得自主变更安全配置',
    suggestion: '请暂停当前操作，将配置变更详情展示给用户，等待用户明确输入"确认"后才可继续',
  },
  {
    id: 'SB-PERSONNEL',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action', 'query'],
    contentPattern: /(招聘|hire|解雇|fire|授权.*角色|grant.*role|角色.*变更|权限.*分配)/i,
    severity: 'LOCK',
    reason: '安全基线: 人员变更/角色调整/权限授予必须由人类用户亲自确认——Agent不得自主管理人员或分配权限',
    suggestion: '请暂停当前操作，将人员变更详情展示给用户，等待用户明确输入"确认"后才可继续',
  },
  // ── 3 条 IRON-BLOCK: 可 override（默认配额 3 次/会话）──
  {
    id: 'IRON-S02',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action'],
    contentPattern: /(我来修改|我来写|我来创建|我来删除|我来执行|我来运行|我来安装|我来部署|我来发布|让我来改|让我来写|开始修改|开始写入|正在修改|正在写入|执行.*命令|运行.*脚本|调.*API|调用.*接口)/i,
    severity: 'BLOCK',
    reason: 'S-02 复述确认: 高风险操作前必须先复述理解、等待用户确认——不得基于自身假设直接执行',
    suggestion: '请先复述你对问题的理解和修改计划，等待用户明确确认后再执行。确认不是选择题是复述题。',
  },
  {
    id: 'IRON-INFO-BOUNDARY',
    gap: 'safety_baseline',
    messageType: ['speech', 'response'],
    contentPattern: /(另一个团队|别的团队|他们.*项目|其他.*blueprint|别的.*部门|隔壁.*组|跨团队.*情况|别的.*团队)/i,
    severity: 'BLOCK',
    reason: '信息边界: Agent引用了其他团队/项目的上下文——可能存在信息泄露风险',
    suggestion: '请确认该信息是否属于当前团队的共享上下文。跨团队信息引用需经过信息流缝隙的routingMap授权。',
  },
  {
    id: 'IRON-H01',
    gap: 'safety_baseline',
    messageType: ['speech', 'response'],
    contentPattern: /(已经完成|已完成|已修复|已解决|修好了|搞定了|没问题了|已经好了|已经部署|已经上线|已经启动)/i,
    severity: 'BLOCK',
    reason: 'H-01 交叉验证: 声称"X已完成"但需确认是否有独立验证来源——单一信息源的结论不可作为最终判定',
    suggestion: '请提供交叉验证来源：你是基于什么证据得出这个结论的？是否经过了独立验证？',
  },
  // ── 4 条 IRON-WARN: 走 LLM Judge 判定 ──
  {
    id: 'IRON-H02',
    gap: 'safety_baseline',
    messageType: ['speech', 'response', 'decision'],
    contentPattern: /(已部署|部署成功|已启动|启动成功|已上线|上线完成|已发布|发布成功|服务.*运行|server.*running|已生效)/i,
    severity: 'WARN',
    reason: 'H-02 表面完成≠实质运作: 声明部署/启动完成不代表服务可达——需验证对应端点是否真正响应',
    suggestion: '请验证：尝试访问对应端点确认服务可达。不要仅凭进程状态或构建输出判断"已完成"。',
  },
  {
    id: 'IRON-L03',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision'],
    contentPattern: /(确认|同意|没问题|可以|行|好的|OK|yes|确认.*执行|按.*方案.*执行)/i,
    severity: 'WARN',
    reason: 'L-03 确认不是选择题是复述题: 用户确认应包含对Agent理解的复述，而非仅对选项投票',
    suggestion: '在确认前，请先复述你对当前情况的理解。确认"我理解的情况是X，我计划做Y"，而非仅说"方案A可以"。',
  },
  {
    id: 'IRON-HONESTY',
    gap: 'safety_baseline',
    messageType: ['speech', 'response', 'decision'],
    contentPattern: /(我查了|我查询了|我调用了|数据库显示|API返回|根据.*数据|数据显示|查询.*结果|已.*查询|已.*验证.*数据)/i,
    severity: 'WARN',
    reason: '诚实边界: Agent声称"已查询/已调用"但需交叉验证——禁止在未实际查询的情况下声称已查询',
    suggestion: '请提供具体的查询参数、返回结果摘要或调用凭证。禁止在未实际查询的情况下声称已查询。',
  },
  {
    id: 'IRON-AUTHORITY',
    gap: 'safety_baseline',
    messageType: ['speech', 'decision', 'action'],
    contentPattern: /(我可以|我能|我会.*做|让我.*处理|交给我.*办|我能.*搞定|我可以.*执行|我有权限|我来.*操作|我有能力)/i,
    severity: 'WARN',
    reason: '权限边界: Agent声称具备某种能力——需确认该能力是否在其TOOLS.md声明范围内',
    suggestion: '请确认该操作在你的TOOLS.md中有明确声明。不在TOOLS.md中的能力声称应标记为"建议"而非"承诺"。',
  },
];

// ============================================================
// L1: 协议规则（按 6 缝隙当前值匹配）
// ============================================================
const RULES: Record<string, Record<string, MatchRule[]>> = {
  // ============================================================
  // 缝隙 1: 分工会
  // ============================================================
  division_of_labor: {
    // 跨模式默认规则
    default: [
      {
        id: 'DL-R1',
        gap: 'division_of_labor',
        messageType: ['speech', 'decision'],
        contentPattern: /(交给我|我来做|我负责|接受.*任务|接下|承接|我来处理|我处理|我.*执行.*任务)/i,
        severity: 'WARN',
        reason: 'DL-R1: Agent接受了可能超出核心能力的任务——如 proficiency < 0.5 且未请求增强包，执行质量无保障',
        suggestion: '此任务可能超出你的核心能力范围。建议请求任务增强包或推荐 fallbackRoles 中的角色。',
      },
      {
        id: 'DL-R2',
        gap: 'division_of_labor',
        messageType: ['speech', 'decision'],
        contentPattern: /(再加.*任务|还要.*做|额外.*任务|同时.*处理|并行.*执行|多.*任务.*一起)/i,
        severity: 'BLOCK',
        reason: 'DL-R2: Agent在疑似高负载下接受新任务——负载 > 80% 时应拒绝新任务并推荐 fallback',
        suggestion: '你当前可能负载过高。请确认当前任务量，必要时拒绝此任务并推荐 fallbackRoles 中的角色。',
      },
    ],
  },

  // ============================================================
  // 缝隙 2: 信息流
  // ============================================================
  information_flow: {
    star: [
      {
        id: 'GAP-IF-01',
        gap: 'information_flow',
        messageType: ['speech', 'decision', 'action'],
        contentPattern: /(绕过|跳过我|直接.*通知|直接.*告诉|不.*经.*过.*我)/i,
        severity: 'WARN',
        reason: '星型拓扑要求信息通过中心节点分发。绕过中心节点可能导致信息不一致。',
        suggestion: '请确保中心节点知晓此信息。',
      },
      {
        id: 'IF-R3',
        gap: 'information_flow',
        messageType: ['query'],
        contentPattern: /^ws\.(read|write)\s+/i,
        severity: 'LOCK',
        reason: '星型拓扑下非中心节点不得直接读取其他角色的工作区产出——必须通过中心节点(scenario-parser 或 orchestrator)中转',
        suggestion: '请通过中心节点请求工作区资产',
      },
    ],
    chain: [
      {
        id: 'IE-R2',
        gap: 'information_flow',
        messageType: ['speech'],
        rolePattern: /^(?!.*(scenario-parser|orchestrator)).*$/,
        severity: 'WARN',
        reason: '链式拓扑下长跳消息有信息衰减风险',
      },
      {
        id: 'IF-R3-chain',
        gap: 'information_flow',
        messageType: ['query'],
        contentPattern: /^ws\.(read|write)\s+/i,
        severity: 'WARN',
        reason: '链式拓扑下工作区跨角色访问需确认跳数——>2跳可能造成信息衰减',
        suggestion: '链式拓扑中长跳访问建议通过中间角色中转',
      },
    ],
    full_mesh: [
      {
        id: 'IF-R3-mesh',
        gap: 'information_flow',
        messageType: ['query'],
        contentPattern: /^ws\.(read|write)\s+/i,
        severity: 'WARN',
        reason: '全连接拓扑下跨角色工作区访问未在 routingMap 中获得显式授权——记录观察',
        suggestion: '全连接拓扑中建议通过 routingMap 显式声明可访问范围',
      },
    ],
    hierarchical: [
      {
        id: 'IF-R3-hier',
        gap: 'information_flow',
        messageType: ['query'],
        contentPattern: /^ws\.(read|write)\s+/i,
        severity: 'WARN',
        reason: '层级拓扑下跨层工作区访问需确认层级差——跨层访问可能绕过治理链',
        suggestion: '跨层工作区访问建议通过所在层的治理角色中转',
      },
    ],
  },

  // ============================================================
  // 缝隙 3: 权限治理（冲突解决 + 权力分配 合并）
  // ============================================================
  authority_governance: {
    single_decider: [
      {
        id: 'CR-R1',
        gap: 'authority_governance',
        messageType: ['decision'],
        contentPattern: /否决|推翻|不同意|驳回/i,
        severity: 'BLOCK',
        reason: 'single_decider 模式下非决策者的否决企图——只有决策者有最终决定权',
        suggestion: '如确需质疑决策，应通过 moderated 通道向决策者表达，而非直接否决',
      },
    ],
    consensus: [
      {
        id: 'CR-R2',
        gap: 'authority_governance',
        messageType: ['decision'],
        severity: 'WARN',
        reason: '共识模式下需确认所有角色已表态——当前决策消息发出但未必全体同意',
        suggestion: '检查决策是否满足共识条件（所有 veto 角色已确认）',
      },
    ],
    majority_vote: [
      {
        id: 'CR-R3',
        gap: 'authority_governance',
        messageType: ['decision', 'speech'],
        contentPattern: /(我.*一.*个.*人.*决.*定|不.*用.*投.*票|我.*说.*了.*算|不.*需.*要.*大.*家.*同.*意)/i,
        severity: 'WARN',
        reason: '多数投票模式下重要决策应通过投票而非个人决定。少数人独断违反投票规则。',
        suggestion: '请发起投票，按多数意见决定。',
      },
    ],
    hierarchical: [
      {
        id: 'PD-R1',
        gap: 'authority_governance',
        messageType: ['decision', 'speech'],
        contentPattern: /我决定|我命令|必须执行|按我说的/i,
        severity: 'WARN',
        reason: '层级权力下非顶层角色的命令式语气——可能越权',
        suggestion: '非 decide 角色的指令类发言应降级为建议语气',
      },
    ],
    flat: [
      {
        id: 'PD-R2',
        gap: 'authority_governance',
        messageType: ['decision'],
        severity: 'WARN',
        reason: '扁平权力下单个角色的决策应标注"待确认"——所有角色有权质疑',
      },
    ],
  },

  // ============================================================
  // 缝隙 4: 信任与激励（激励对齐 + 信任模型 合并）
  // ============================================================
  trust_incentive: {
    penalty: [
      {
        id: 'IA-R1',
        gap: 'trust_incentive',
        messageType: ['speech'],
        contentPattern: /惩罚|扣分|降级|处罚|追责/i,
        severity: 'WARN',
        reason: '纯惩罚激励环境下惩罚性语言可能加速协作崩溃——需确认是否合理使用',
      },
    ],
    low: [
      {
        id: 'TM-R1',
        gap: 'trust_incentive',
        messageType: ['speech', 'query'],
        contentPattern: /我来负责|交给我|相信我|没问题/i,
        severity: 'BLOCK',
        reason: '低信任环境下无条件信任请求需要验证——"相信我"不应作为论据',
        suggestion: '在低信任环境中，请用具体证据代替信任请求',
      },
      {
        id: 'TM-R2',
        gap: 'trust_incentive',
        messageType: ['response'],
        severity: 'WARN',
        reason: '低信任环境下响应需要附带可验证证据',
      },
    ],
  },

  // ============================================================
  // 缝隙 5: 知识共享
  // ============================================================
  knowledge_sharing: {
    internal: [
      {
        id: 'KS-R1',
        gap: 'knowledge_sharing',
        messageType: ['speech', 'response'],
        contentPattern: /我学到了|我发现|根据最新信息|根据数据/i,
        severity: 'WARN',
        reason: '知识默认内部可见——新知识可能需要显式 push 到团队',
        suggestion: '新知识应标记为需要传播（propagation mode=push）',
      },
    ],
    // 跨模式默认规则
    default: [
      {
        id: 'KS-R2',
        gap: 'knowledge_sharing',
        messageType: ['speech', 'decision', 'action'],
        contentPattern: /(修改.*别人|改.*他.*的|覆盖.*文件|改.*角色.*产出|修改.*交付|改.*artifact|覆盖.*artifact|删除.*共享|删.*团队.*文件)/i,
        severity: 'BLOCK',
        reason: 'KS-R2: Agent尝试修改其他角色的交付物——需 L2 Authority 协同判定是否允许跨角色写操作',
        suggestion: '修改其他角色的交付物需要明确的权限授权。请确认你在该角色工作区有写权限。',
      },
      {
        id: 'KS-R3',
        gap: 'knowledge_sharing',
        messageType: ['speech', 'response', 'decision'],
        contentPattern: /(产出|交付|完成.*文档|写完|生成.*报告|创建.*文件|新建.*文档|输出.*结果)/i,
        severity: 'WARN',
        reason: 'KS-R3: Agent产出了知识但可能未更新 SYNC.md 索引——团队其他成员无法发现此知识',
        suggestion: '请确认已更新 SYNC.md 产物索引，使团队成员可发现你的新产出。',
      },
    ],
  },

  // ============================================================
  // 缝隙 6: 外部接口
  // ============================================================
  external_interface: {
    full: [
      {
        id: 'EI-R1',
        gap: 'external_interface',
        messageType: ['speech', 'query'],
        contentPattern: /对外|发布|公开|分享到外部|export/i,
        severity: 'LOCK',
        reason: '全隔离沙箱下禁止对外发布——所有外部通信必须通过发言人审批',
        suggestion: '对外发布需求请通过 spokesperson 角色提交审核',
      },
    ],
    semi: [
      {
        id: 'EI-R2',
        gap: 'external_interface',
        messageType: ['speech'],
        contentPattern: /对外发布|公开声明|代表团队/i,
        severity: 'BLOCK',
        reason: '非发言人角色尝试代表团队对外发言——需内部审核',
        suggestion: '需内部审核 (requireInternalReview=true) 通过后方可对外发布',
      },
    ],
  },
};

/** Extract string value from unknown gap field, with fallback */
function getGapStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export class RuleEngine {
  /**
   * L0: 铁律检查 — 始终生效，不依赖协议配置
   * 返回所有匹配的铁律违规
   */
  checkIronLaws(message: AgentMessage): RuleMatchResult {
    const violations: ProtocolViolation[] = [];

    for (const rule of IRON_LAWS) {
      if (this.ruleMatches(message, rule)) {
        violations.push({
          gapDimension: 'safety_baseline',
          severity: rule.severity,
          clause: `${rule.id}: ${rule.reason}`,
          suggestion: rule.suggestion,
        });
      }
    }

    const severityPriority: Record<ConstraintSeverity, number> = { LOCK: 3, BLOCK: 2, WARN: 1 };
    let maxSeverity: ConstraintSeverity | null = null;
    for (const v of violations) {
      if (!maxSeverity || severityPriority[v.severity] > severityPriority[maxSeverity]) {
        maxSeverity = v.severity;
      }
    }

    return {
      matched: violations.length > 0,
      violations,
      maxSeverity,
    };
  }

  /**
   * L1: 协议规则匹配 — 按 6 缝隙当前值匹配
   *
   * @param message  待检查的消息
   * @param protocol 团队协议（用于读取当前缝隙值）
   * @returns 匹配结果（所有违规 + 最高严重级别）
   */
  match(message: AgentMessage, protocol: TeamProtocol): RuleMatchResult {
    const violations: ProtocolViolation[] = [];
    const gaps = protocol.gaps as Record<string, Record<string, unknown>>;

    // 遍历 6 缝隙，检查当前值对应的规则
    const gapValues: Record<string, string> = {
      division_of_labor: getGapStr(gaps.division_of_labor?.mode),
      information_flow: getGapStr(gaps.information_flow?.topology),
      authority_governance: getGapStr(gaps.authorityGovernance?.strategy) || getGapStr(gaps.authorityGovernance?.authority),
      trust_incentive: getGapStr(gaps.trustIncentive?.alignment) || getGapStr(gaps.trustIncentive?.initialTrust),
      knowledge_sharing: getGapStr(gaps.knowledge_sharing?.defaultVisibility),
      external_interface: getGapStr((gaps.external_interface as Record<string, unknown> | undefined)?.isolation as Record<string, unknown> | undefined, 'sandbox'),
    };

    for (const [gapName, gapValue] of Object.entries(gapValues)) {
      const gapRules = RULES[gapName];
      if (!gapRules) continue;

      // 先匹配协议值对应的规则
      const valueRules = gapRules[gapValue];
      if (valueRules) {
        for (const rule of valueRules) {
          if (this.ruleMatches(message, rule)) {
            violations.push({
              gapDimension: gapName as GapDimension,
              severity: rule.severity,
              clause: `${rule.id}: ${rule.reason}`,
              suggestion: rule.suggestion,
            });
          }
        }
      }

      // 再匹配跨模式默认规则（如 DL-R1/DL-R2、KS-R2/KS-R3）
      const defaultRules = gapRules['default'];
      if (defaultRules) {
        for (const rule of defaultRules) {
          if (this.ruleMatches(message, rule)) {
            violations.push({
              gapDimension: gapName as GapDimension,
              severity: rule.severity,
              clause: `${rule.id}: ${rule.reason}`,
              suggestion: rule.suggestion,
            });
          }
        }
      }
    }

    // 计算最高严重级别
    const severityPriority: Record<ConstraintSeverity, number> = { LOCK: 3, BLOCK: 2, WARN: 1 };
    let maxSeverity: ConstraintSeverity | null = null;

    for (const v of violations) {
      if (!maxSeverity || severityPriority[v.severity] > severityPriority[maxSeverity]) {
        maxSeverity = v.severity;
      }
    }

    return {
      matched: violations.length > 0,
      violations,
      maxSeverity,
    };
  }

  /**
   * 单条规则匹配
   */
  private ruleMatches(message: AgentMessage, rule: MatchRule): boolean {
    // 消息类型匹配
    if (rule.messageType && !rule.messageType.includes(message.type)) {
      return false;
    }

    // 角色匹配
    if (rule.rolePattern && !rule.rolePattern.test(message.from)) {
      return false;
    }

    // 内容匹配
    if (rule.contentPattern && !rule.contentPattern.test(message.content)) {
      return false;
    }

    return true;
  }

  /**
   * 获取当前协议值下激活的 L1 协议规则列表（用于调试/仪表盘）
   * 不含铁律——铁律通过 IRON_LAWS 常量独立获取
   */
  getActiveRules(protocol: TeamProtocol): MatchRule[] {
    const active: MatchRule[] = [];

    const gaps = protocol.gaps as Record<string, Record<string, unknown>>;
    const gapValues: Record<string, string> = {
      division_of_labor: getGapStr(gaps.division_of_labor?.mode),
      information_flow: getGapStr(gaps.information_flow?.topology),
      authority_governance: getGapStr(gaps.authorityGovernance?.strategy) || getGapStr(gaps.authorityGovernance?.authority),
      trust_incentive: getGapStr(gaps.trustIncentive?.alignment) || getGapStr(gaps.trustIncentive?.initialTrust),
      knowledge_sharing: getGapStr(gaps.knowledge_sharing?.defaultVisibility),
      external_interface: getGapStr((gaps.external_interface as Record<string, unknown> | undefined)?.isolation as Record<string, unknown> | undefined, 'sandbox'),
    };

    for (const [gapName, gapValue] of Object.entries(gapValues)) {
      const gapRules = RULES[gapName];
      if (!gapRules) continue;
      const valueRules = gapRules[gapValue];
      if (valueRules) active.push(...valueRules);
      const defaultRules = gapRules['default'];
      if (defaultRules) active.push(...defaultRules);
    }

    return active;
  }
}