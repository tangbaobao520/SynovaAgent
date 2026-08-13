/**
 * compute-talent-deployment.ts — 把人分配到任务中 (2.3)
 *
 * @contract COMPUTE-TALENT-DEPLOYMENT-v1 TalentDeploymentInput {value,confidence,evidence,degraded,warnings} personSkillMatch<0||teamCompositionScore<0
 * 模块: l2-internal/talent_deployment
 * 消费边: TALENT_DEPLOYMENT
 * 输入: personSkillMatch(0-1), teamCompositionScore(0-1)
 * 输出(正常): { value: person_skill_match × team_composition_score, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无人员数据'] }
 *
 * 算法: person_skill_match × team_composition_score
 */
export interface TalentDeploymentInput {
  personSkillMatch: number;      // 人岗匹配度(0-1), -1=未配置
  teamCompositionScore: number;  // 团队构成评分(0-1), -1=未配置
}

export function computeTalentDeployment(input: TalentDeploymentInput) {
  const warnings: string[] = [];
  const { personSkillMatch, teamCompositionScore } = input;

  if (personSkillMatch < 0 || teamCompositionScore < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无人员数据 — personSkillMatch或teamCompositionScore未配置'],
    };
  }

  const clampedMatch = Math.max(0, Math.min(1, personSkillMatch));
  const clampedTeam = Math.max(0, Math.min(1, teamCompositionScore));

  const value = Math.round(clampedMatch * clampedTeam * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`personSkillMatch: ${clampedMatch}`, `teamCompositionScore: ${clampedTeam}`],
    degraded: false,
    warnings,
  };
}
