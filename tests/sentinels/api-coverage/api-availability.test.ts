import { describe, it, expect } from 'vitest';
import { computeProtocolCoverage } from '../../../extensions/sentinels/api-coverage/computes/protocol-coverage';

describe('computeApiAvailability', () => {
  it('空列表应返回 degraded', async () => {
    const { computeApiAvailability } = await import('../../../extensions/sentinels/api-coverage/computes/api-availability');
    const result = await computeApiAvailability([]);
    expect(result.degraded).toBe(true);
    expect(result.rate).toBe(1);
    expect(result.totalTools).toBe(0);
  });
});
