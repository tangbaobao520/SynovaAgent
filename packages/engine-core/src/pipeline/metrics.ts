/** engine-server/pipeline/metrics.ts — 管道指标可观测 */
interface PhaseMetrics {
  count: number;
  successCount: number;
  durations: number[];
  timestamps: number[];
}

const WINDOW_MS = 60 * 60 * 1000;
const phaseMetrics: Record<string, PhaseMetrics> = {};
const PHASES = ['phaseA', 'phaseB', 'phaseC', 'phaseD', 'phaseE'];
PHASES.forEach(p => { phaseMetrics[p] = { count: 0, successCount: 0, durations: [], timestamps: [] }; });

function prune(): void {
  const now = Date.now(), cutoff = now - WINDOW_MS;
  for (const phase of PHASES) {
    const m = phaseMetrics[phase];
    const keepFrom = m.timestamps.findIndex(ts => ts >= cutoff);
    if (keepFrom > 0) { m.durations = m.durations.slice(keepFrom); m.timestamps = m.timestamps.slice(keepFrom); }
    else if (keepFrom === -1 && m.timestamps.length > 0) { m.durations = []; m.timestamps = []; }
    m.count = m.durations.length;
  }
}

export function recordPhase(phase: string, durationMs: number, success: boolean): void {
  const m = phaseMetrics[phase];
  if (!m) return;
  const now = Date.now();
  m.durations.push(durationMs); m.timestamps.push(now); m.count++;
  if (success) m.successCount++;
  if (m.count % 10 === 0) prune();
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)];
}

export function getMetrics(): Record<string, { count: number; p50: number; p99: number; errorRate: number }> {
  prune();
  const result: Record<string, { count: number; p50: number; p99: number; errorRate: number }> = {};
  for (const phase of PHASES) {
    const m = phaseMetrics[phase];
    const sorted = [...m.durations].sort((a, b) => a - b);
    result[phase] = {
      count: sorted.length,
      p50: percentile(sorted, 50),
      p99: percentile(sorted, 99),
      errorRate: m.count > 0 ? Math.round((1 - m.successCount / m.count) * 1000) / 1000 : 0,
    };
  }
  return result;
}

export function resetMetrics(): void {
  for (const phase of PHASES) {
    phaseMetrics[phase] = { count: 0, successCount: 0, durations: [], timestamps: [] };
  }
}
