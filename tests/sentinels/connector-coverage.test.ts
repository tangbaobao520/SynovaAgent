import { describe, it, expect } from 'vitest';
import { computeConnectorCoverage } from '../../extensions/sentinels/connector-coverage/computes/compute-connector-coverage';

describe('T4: computeConnectorCoverage', () => {
  it('should return degraded for no processes', () => {
    const r = computeConnectorCoverage({ processes: [] });
    expect(r.degraded).toBe(true);
  });

  it('should calculate full coverage', () => {
    const r = computeConnectorCoverage({
      processes: [
        { name: 'billing', hasConnector: true, isKeyProcess: true },
        { name: 'crm', hasConnector: true, isKeyProcess: false },
        { name: 'analytics', hasConnector: true, isKeyProcess: false },
      ],
    });
    expect(r.degraded).toBe(false);
    expect(r.coverage).toBeGreaterThanOrEqual(0.9);
    expect(r.connectedProcesses).toBe(3);
  });

  it('should penalize missing key process connectors', () => {
    const r = computeConnectorCoverage({
      processes: [
        { name: 'billing', hasConnector: false, isKeyProcess: true },
        { name: 'crm', hasConnector: true, isKeyProcess: true },
      ],
    });
    expect(r.degraded).toBe(false);
    expect(r.coverage).toBeLessThan(1);
    expect(r.keyProcessesCovered).toBe(1);
  });
});
