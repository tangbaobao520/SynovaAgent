/**
 * compute-power-rigidity.ts — O9 哨兵 compute 函数
 *
 * Finkelstein 权力结构指数 — 四维度权力集中度评估
 * 1. 结构权力: CEO/Founder 的决策审批事件占比
 * 2. 所有权权力: 创始人持股比例
 * 3. 专家权力: 关键知识在少数人中的集中度
 * 4. 声望权力: 董事会中有声望背景的成员占比
 *
 * 来源: Finkelstein (1992) — 高层管理团队权力
 *
 * 边界: Person 总数 < 20 → stage0_exempt (创业阶段权力集中是正常现象)
 *
 * 阈值(非豁免时): >0.8严重 | 0.5-0.8预警 | <0.5健康
 */
export interface FinkelsteinPowerResult {
  powerIndex: number;
  structuralPower: number;
  ownershipPower: number;
  expertisePower: number;
  prestigePower: number;
  managerRatio: number;
  managerCount: number;
  totalPeople: number;
  signal: 'critical' | 'warning' | 'healthy' | 'stage0_exempt';
  stageExempt: boolean;
  degraded: boolean;
  warnings: string[];
}

export function computeFinkelsteinPowerIndex(params: {
  totalPeople: number;
  ceoDecisionApprovals: number;
  totalDecisionApprovals: number;
  founderEquity: number;
  keyKnowledgeHolders?: Array<{ knowledgeCoverage: number }>;
  boardMembersWithPrestige?: number;
  totalBoardMembers?: number;
  managerCount?: number;
}): FinkelsteinPowerResult {
  const warnings: string[] = [];
  const { totalPeople, ceoDecisionApprovals, totalDecisionApprovals, founderEquity, keyKnowledgeHolders, boardMembersWithPrestige, totalBoardMembers, managerCount } = params;

  if (totalPeople <= 0) {
    return { powerIndex: 0, structuralPower: 0, ownershipPower: 0, expertisePower: 0, prestigePower: 0, managerRatio: 0, managerCount: 0, totalPeople: 0, signal: 'healthy', stageExempt: false, degraded: true, warnings: ['No person data available'] };
  }

  const stageExempt = totalPeople < 20;

  const structuralPower = totalDecisionApprovals > 0 ? Math.min(ceoDecisionApprovals / totalDecisionApprovals, 1) : 0.5;
  const ownershipPower = Math.min(Math.max(founderEquity, 0), 1);

  let expertisePower = 0.5;
  if (keyKnowledgeHolders && keyKnowledgeHolders.length > 0) {
    const sorted = [...keyKnowledgeHolders].sort((a, b) => b.knowledgeCoverage - a.knowledgeCoverage);
    let cumulative = 0, personsNeeded = 0;
    for (const holder of sorted) { cumulative += holder.knowledgeCoverage; personsNeeded++; if (cumulative >= 0.6) break; }
    expertisePower = personsNeeded <= 1 ? 0.9 : personsNeeded <= 3 ? 0.7 : personsNeeded <= 5 ? 0.5 : 0.3;
  }

  let prestigePower = 0.5;
  if (boardMembersWithPrestige !== undefined && totalBoardMembers && totalBoardMembers > 0) {
    prestigePower = Math.min(boardMembersWithPrestige / totalBoardMembers, 1);
  }

  const dimensions = [structuralPower, ownershipPower, expertisePower, prestigePower];
  const powerIndex = dimensions.reduce((s, d) => s + d * d, 0);

  let signal: 'critical' | 'warning' | 'healthy' | 'stage0_exempt';
  if (stageExempt) { signal = 'stage0_exempt'; }
  else if (powerIndex > 0.8) { signal = 'critical'; }
  else if (powerIndex > 0.5) { signal = 'warning'; }
  else { signal = 'healthy'; }

  const mgrCount = managerCount ?? 0;
  const mgrRatio = totalPeople > 0 ? mgrCount / totalPeople : 0;

  if (stageExempt) warnings.push(`Organization has ${totalPeople} people (<20) — stage 0-1 exemption applied`);

  return {
    powerIndex: Math.round(powerIndex * 100) / 100,
    structuralPower: Math.round(structuralPower * 100) / 100,
    ownershipPower: Math.round(ownershipPower * 100) / 100,
    expertisePower: Math.round(expertisePower * 100) / 100,
    prestigePower: Math.round(prestigePower * 100) / 100,
    managerRatio: Math.round(mgrRatio * 100) / 100,
    managerCount: mgrCount,
    totalPeople,
    signal,
    stageExempt,
    degraded: false,
    warnings,
  };
}

// 别名 — manifest 声明 "compute-power-rigidity" 映射到 computeFinkelsteinPowerIndex
export { computeFinkelsteinPowerIndex as computePowerRigidity };
