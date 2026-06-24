import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/collaboration-health');

export const collaboration-healthSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      // TODO: 在后续迭代中实现具体的 compute 逻辑
      log.info({ teamId }, 'collaboration-health check completed (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, 'collaboration-health check failed — degraded');
    }
    return findings;
  },
};
