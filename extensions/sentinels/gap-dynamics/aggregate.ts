import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/gap-dynamics');

export const gap-dynamicsSentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      // TODO: 在后续迭代中实现具体的 compute 逻辑
      log.info({ teamId }, 'gap-dynamics check completed (stub)');
    } catch (err: any) {
      log.warn({ err, teamId }, 'gap-dynamics check failed — degraded');
    }
    return findings;
  },
};
