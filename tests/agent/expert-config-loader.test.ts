import { describe, it, expect } from 'vitest';
import { getEnabledDiagnosticExperts, getBackgroundExperts } from '../../src/agent/expert-config-loader';
describe('expert-config-loader', () => {
  it('getEnabledDiagnosticExperts returns array', () => { expect(Array.isArray(getEnabledDiagnosticExperts())).toBe(true); });
  it('getBackgroundExperts returns Set', () => { expect(getBackgroundExperts() instanceof Set).toBe(true); });
});
