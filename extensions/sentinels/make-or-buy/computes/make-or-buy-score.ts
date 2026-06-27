export function computeMakeOrBuyScore(capabilities: Array<{ category: string; inHouse: boolean }>): { health: number; outsourcedCore: string[]; degraded: boolean } {
  if (capabilities.length === 0) return { health: 0.5, outsourcedCore: [], degraded: true };
  const core = capabilities.filter(c => c.category === 'core_competence' || c.category === 'core');
  const outsourcedCore = core.filter(c => !c.inHouse).map(c => c.category);
  const health = outsourcedCore.length > 0 ? Math.max(0.1, 0.5 - outsourcedCore.length * 0.1) : 0.8;
  return { health: Math.round(health * 100) / 100, outsourcedCore, degraded: false };
}
