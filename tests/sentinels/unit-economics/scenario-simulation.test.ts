import { describe, it, expect } from 'vitest';
import { computeScenarioSimulation } from '../../../extensions/sentinels/unit-economics/computes/scenario-simulation';

const groups = [
  { groupId: 'g1', revenue: 100000, variableCost: 40000, marginalContribution: 60000, mcRatio: 0.6, isPositive: true },
  { groupId: 'g2', revenue: 50000, variableCost: 30000, marginalContribution: 20000, mcRatio: 0.4, isPositive: true },
  { groupId: 'g3', revenue: 20000, variableCost: 25000, marginalContribution: -5000, mcRatio: -0.25, isPositive: false },
];
const rigidCosts = [{ name: 'Rent', amount: 50000, reducible: false, reductionPercent: 0 }];

describe('computeScenarioSimulation', () => {
  it('should generate at least 1 scenario', () => {
    const r = computeScenarioSimulation(groups, rigidCosts, 75000);
    expect(r.scenarios.length).toBeGreaterThan(0);
    expect(r.degraded).toBe(false);
  });

  it('should return a valid result object', () => {
    const r = computeScenarioSimulation(groups, rigidCosts, 75000);
    expect(r).toHaveProperty('scenarios');
    expect(r).toHaveProperty('bestScenario');
    expect(r).toHaveProperty('profitImprovementPossible');
  });

  it('should degrade on empty groups', () => {
    const r = computeScenarioSimulation([], rigidCosts, 0);
    expect(r.degraded).toBe(true);
  });
});
