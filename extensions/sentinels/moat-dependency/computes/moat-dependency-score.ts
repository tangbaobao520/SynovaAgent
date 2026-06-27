export function computeMoatDependency(structural: number, perceptual: number): { dependency: number; degraded: boolean } {
  if (structural === 0 && perceptual === 0) return { dependency: 0, degraded: true };
  const diff = Math.abs(structural - perceptual);
  return { dependency: Math.round(diff * 100) / 100, degraded: false };
}
