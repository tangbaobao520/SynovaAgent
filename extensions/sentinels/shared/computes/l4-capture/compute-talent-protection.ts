/**
 * compute-talent-protection.ts — 知识保留与备份比率衡量人才保护 (E-41)
 *
 * @contract COMPUTE-TALENT-PROTECTION-v1 TalentProtectionInput {value,confidence,evidence,degraded,warnings} knowledgeRetention<0||backupRatio<0
 * 模块: l4-capture/talent_protection
 * 消费边: TALENT_PROTECTION
 * 输入: knowledgeRetention(0-1), backupRatio(0-1)
 * 输出(正常): { value: talent_protection_score, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings }
 *
 * 算法: talent_protection = (knowledge_retention + backup_ratio) / 2
 */
export interface TalentProtectionInput {
  knowledgeRetention: number;   // 知识保留率(0-1), -1=未配置
  backupRatio: number;          // 备份比率(0-1), -1=未配置
}

export function computeTalentProtection(input: TalentProtectionInput) {
  const warnings: string[] = [];
  const { knowledgeRetention, backupRatio } = input;

  if (knowledgeRetention < 0 && backupRatio < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无人才保护数据 — knowledgeRetention与backupRatio均未配置'],
    };
  }

  const clampedRetention = Math.max(0, Math.min(1, knowledgeRetention >= 0 ? knowledgeRetention : 0.5));
  const clampedBackup = Math.max(0, Math.min(1, backupRatio >= 0 ? backupRatio : 0.5));

  const value = Math.round((clampedRetention + clampedBackup) / 2 * 1000) / 1000;
  const confidence = value > 0.6 ? 'high' as const : value > 0.3 ? 'medium' as const : 'low' as const;

  return {
    value,
    confidence,
    evidence: [`knowledgeRetention: ${clampedRetention}`, `backupRatio: ${clampedBackup}`],
    degraded: false,
    warnings,
  };
}
