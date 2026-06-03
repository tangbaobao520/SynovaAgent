/**
 * posture-detector.ts — 战略姿态识别器
 *
 * Phase 0 中嵌入，通过发起人自述（3 道选择题）识别组织的战略姿态。
 * 分类器是确定性的——不依赖 LLM，规则透明可解释。
 *
 * 五种姿态中 P1 识别前三种，自由生活型和使命驱动型留到 P2。
 */
import type { PostureQuestionnaire, StrategicPosture } from './types';

/** 姿态识别结果 */
export interface PostureDetectionResult {
  posture: StrategicPosture;
  label: string;
  confidence: number;   // 0-1，分类置信度
  reasons: string[];    // 判定依据（人类可读）
}

/** Phase 0 姿态问卷定义（供前端渲染） */
export const POSTURE_QUESTIONS = [
  {
    id: 'q1Goal',
    text: '未来三年，你希望这个组织达到什么状态？',
    options: [
      { value: 'leader', label: '成为行业领导者，建立不可撼动的地位' },
      { value: 'stable_profit', label: '稳定盈利，持续为股东和员工创造价值' },
      { value: 'survive', label: '先活下来，证明我们能持续赚到钱' },
      // P2: { value: 'lifestyle', label: '维持现在的规模，提升生活质量和工作自由度' },
      // P2: { value: 'impact', label: '最大化我们对行业/社区/技术的影响力，商业回报其次' },
    ],
  },
  {
    id: 'q2Growth',
    text: '面对一个可能让公司增长 3 倍的机会，但它需要你个人投入加倍的时间和风险，你会？',
    options: [
      { value: 'seize', label: '毫不犹豫抓住' },
      { value: 'cautious', label: '谨慎评估，如果风险可控就做' },
      { value: 'survive_first', label: '现在顾不上，先解决生存问题' },
      // P2: { value: 'reject', label: '放弃，我不想让工作侵蚀我的生活' },
      // P2: { value: 'mission_aligned', label: '如果它对我们的使命有帮助就做，否则不做' },
    ],
  },
  {
    id: 'q3Metrics',
    text: '你更倾向于用什么指标衡量组织的成功？（选择最重要的两项）',
    multiSelect: true,
    maxSelect: 2,
    options: [
      { value: 'market_share', label: '市场份额 / 竞争地位' },
      { value: 'profit_cashflow', label: '利润 / 现金流' },
      { value: 'team_wellbeing', label: '团队幸福感 / 员工留存' },
      { value: 'user_growth', label: '用户数 / 收入增长率' },
      // P2: { value: 'social_impact', label: '社会影响力 / 社区活跃度' },
    ],
  },
];

/**
 * 根据问卷答案识别战略姿态。
 * 分类规则透明：Q1（三年目标）主导，Q2（风险态度）修正，Q3（成功指标）微调。
 *
 * 规则矩阵：
 *   Q1=leader       + Q2=seize/cautious        → moat_builder
 *   Q1=stable_profit + Q2=cautious              → steady_operator
 *   Q1=survive       + Q2=survive_first/seize   → survival_seeker
 *   混合/矛盾信号                                → steady_operator (回退)
 */
export function detectPosture(answers: PostureQuestionnaire): PostureDetectionResult {
  const reasons: string[] = [];

  // 主导信号：Q1
  let posture: StrategicPosture;
  let confidence = 0.6; // 基础置信度

  switch (answers.q1Goal) {
    case 'leader':
      posture = 'moat_builder';
      reasons.push('发起人目标为行业领导者');
      confidence = 0.7;
      break;
    case 'stable_profit':
      posture = 'steady_operator';
      reasons.push('发起人追求稳定盈利');
      confidence = 0.7;
      break;
    case 'survive':
      posture = 'survival_seeker';
      reasons.push('发起人优先考虑生存');
      confidence = 0.8; // 生存信号通常最明确
      break;
    default:
      posture = 'steady_operator';
      reasons.push('三年目标不明确，回退为稳健经营型');
      confidence = 0.4;
  }

  // Q2 修正
  if (answers.q1Goal === 'stable_profit' && answers.q2Growth === 'seize') {
    // 稳健目标但激进态度 → 可能是隐藏的护城河型
    posture = 'moat_builder';
    confidence = 0.55;
    reasons.push('虽自称稳健，但对增长机会态度激进，倾向护城河型');
  } else if (answers.q1Goal === 'leader' && answers.q2Growth === 'cautious') {
    // 领导目标但谨慎态度 → 更接近稳健经营
    confidence = 0.6;
    reasons.push('有领导雄心但行动谨慎，仍在护城河型范畴');
  } else if (answers.q2Growth === 'survive_first') {
    // 任何目标 + "先解决生存" → 生存信号
    if (posture !== 'survival_seeker') {
      posture = 'survival_seeker';
      confidence = 0.65;
      reasons.push('对增长机会的回答揭示了强烈的生存优先级');
    } else {
      confidence = 0.85;
      reasons.push('三年目标和对增长的态度高度一致，生存信号强');
    }
  }

  // Q3 微调（±0.05）
  const metrics = answers.q3Metrics || [];
  if (metrics.includes('market_share') && posture === 'steady_operator') {
    confidence = Math.max(0.5, confidence - 0.05);
    reasons.push('关注市场份额与稳健定位略有矛盾');
  }
  if (metrics.includes('profit_cashflow') && posture === 'survival_seeker') {
    confidence = Math.min(0.95, confidence + 0.05);
    reasons.push('在生存阶段关注现金流，判断务实');
  }
  if (metrics.includes('team_wellbeing') && posture === 'moat_builder') {
    confidence = Math.max(0.5, confidence - 0.05);
    reasons.push('关注团队幸福感弱化了纯竞争导向');
  }

  const label = postureLabel(posture);
  return { posture, label, confidence: Math.round(confidence * 100) / 100, reasons };
}

/** 无人回答时的默认姿态 */
export function defaultDetection(): PostureDetectionResult {
  return {
    posture: 'steady_operator',
    label: '稳健经营型',
    confidence: 0.3,
    reasons: ['发起人未提供姿态问卷答案，使用默认分类'],
  };
}

function postureLabel(p: StrategicPosture): string {
  switch (p) {
    case 'moat_builder': return '护城河型';
    case 'steady_operator': return '稳健经营型';
    case 'survival_seeker': return '生存突破型';
    case 'lifestyle_keeper': return '自由生活型';
    case 'mission_focus': return '使命驱动型';
  }
}
