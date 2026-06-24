import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/seven-powers');

export const seven-powersSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      // TODO: 在后续迭代中实现具体的 compute 逻辑
      log.info({ teamId }, 'seven-powers check completed (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, 'seven-powers check failed — degraded');
    }
    return findings;
  },
};
