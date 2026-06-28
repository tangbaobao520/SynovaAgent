/**
 * I8: 护城河依赖度 — 企业的增长对既有护城河的依赖程度
 *
 * 理论依据: Morningstar 护城河框架。当结构性护城河(scale/network/process)
 * 与感知性护城河(brand/loyalty)之间存在差距时，说明企业过度依赖
 * 某一类护城河，结构脆弱。
 *
 * 评分方法:
 * - structural: 护城河结构性强度得分 [0,1]
 * - perceptual: 护城河感知强度得分 [0,1]
 * - dependency = |structural - perceptual|，差值越大说明依赖越不均衡
 */
export interface MoatDependencyResult {
  dependency: number;
  structuralScore: number;
  perceptualScore: number;
  degraded: boolean;
}

export function computeMoatDependency(structural: number, perceptual: number): MoatDependencyResult {
  if (structural === 0 && perceptual === 0) return { dependency: 0, structuralScore: 0, perceptualScore: 0, degraded: true };
  const diff = Math.abs(structural - perceptual);
  return {
    dependency: Math.round(diff * 100) / 100,
    structuralScore: structural,
    perceptualScore: perceptual,
    degraded: false,
  };
}
