export function computeTimePenetration(events: number, changes: number): { penetration: number; degraded: boolean } {
  if (events === 0) return { penetration: 0.5, degraded: true };
  return { penetration: Math.min(Math.log2(events + 1) / 5, 1), degraded: false };
}
