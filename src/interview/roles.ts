/**
 * interview/roles.ts — 多角色访谈定义 (Phase 2.2)
 *
 * MASTER-REPORT 裁决"必须实现":
 * C-Suite 问战略 / 一线问工具痛点 / HR 问文化 / 焦点座谈
 */
export interface InterviewRole {
  id: string;
  name: string;
  level: 'c-suite' | 'middle' | 'frontline' | 'hr';
  /** Aggregation weight — c-suite has higher per-person weight but fewer samples */
  weight: number;
  /** Opening message tailored to this role */
  openingMessage: string;
}

/** All interview roles */
export const INTERVIEW_ROLES: InterviewRole[] = [
  {
    id: 'ceo', name: 'CEO/创始人', level: 'c-suite', weight: 1.0,
    openingMessage: '作为组织的最高决策者，我想了解你对战略方向、目标对齐度和关键风险的看法。',
  },
  {
    id: 'cto', name: 'CTO/技术负责人', level: 'c-suite', weight: 0.9,
    openingMessage: '作为技术领导者，请分享你对技术债、工具链效率和团队技能的看法。',
  },
  {
    id: 'cfo', name: 'CFO/财务负责人', level: 'c-suite', weight: 0.85,
    openingMessage: '从财务视角，请描述组织的资源分配、成本结构和投资回报情况。',
  },
  {
    id: 'manager', name: '中层管理者', level: 'middle', weight: 0.6,
    openingMessage: '作为连接战略和执行的关键层，请描述团队协作、流程效率和资源瓶颈。',
  },
  {
    id: 'engineer', name: '一线工程师', level: 'frontline', weight: 0.4,
    openingMessage: '作为实际的执行者，请分享你每天使用的工具、遇到的障碍和改进建议。',
  },
  {
    id: 'designer', name: '设计师/产品', level: 'frontline', weight: 0.4,
    openingMessage: '从产品和用户体验视角，请描述需求流转、设计评审和用户反馈的情况。',
  },
  {
    id: 'hr', name: 'HR/人事负责人', level: 'hr', weight: 0.7,
    openingMessage: '从人才视角，请描述人员流失、文化氛围、薪酬竞争力和成长路径。',
  },
];

/** Get role by ID */
export function getInterviewRole(id: string): InterviewRole | undefined {
  return INTERVIEW_ROLES.find(r => r.id === id);
}

/** Get roles by level */
export function getRolesByLevel(level: InterviewRole['level']): InterviewRole[] {
  return INTERVIEW_ROLES.filter(r => r.level === level);
}
