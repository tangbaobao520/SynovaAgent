/**
 * power-rigidity/computes/compute-power-rigidity.ts — 权力结构刚性
 *
 * 基于 Pfeffer (1981) 权力结构理论，评估组织权力集中程度。
 * 管理者/总人数比越高 = 权力越集中 = 结构越刚性。
 * 刚性过高 = 决策缓慢、一线声音无法上达。
 * 刚性过低 = 缺乏方向、执行无力。
 */
export interface RigidityResult {
  rigidityIndex: number;        // 0-1, 权力刚性指数
  managerRatio: number;         // 管理者占比
  totalPeople: number;
  managerCount: number;
  assessment: 'balanced' | 'rigid' | 'loose' | 'insufficient';
  degraded: boolean;
}

export function computePowerRigidity(
  totalPeople: number,
  managerCount: number
): RigidityResult {
  if (totalPeople === 0) {
    return { rigidityIndex: 0.5, managerRatio: 0, totalPeople: 0, managerCount: 0, assessment: 'insufficient', degraded: true };
  }

  const managerRatio = managerCount / totalPeople;

  // 管理比 < 10% = 松散
  // 管理比 10%-20% = 平衡（理想）
  // 管理比 > 20% = 刚性（过度管理）
  let assessment: 'balanced' | 'rigid' | 'loose' | 'insufficient';
  if (managerRatio > 0.2) {
    assessment = 'rigid';
  } else if (managerRatio < 0.1) {
    assessment = 'loose';
  } else {
    assessment = 'balanced';
  }

  // 刚性指数: 0 = 完全松散, 1 = 完全刚性
  // 管理比 15% 为最理想（0.5）
  const rigidityIndex = Math.round(Math.min(managerRatio * 3, 1) * 100) / 100;

  return { rigidityIndex, managerRatio: Math.round(managerRatio * 100) / 100, totalPeople, managerCount, assessment, degraded: false };
}
