/**
 * extensions/adapters/nemoclaw/adapter.ts — NemoClaw 连接器适配器
 * V3.8 Batch 5
 */
import type { DataConnector } from '../../../src/connectors/types';
import { createLogger } from '@synova/logger';

const log = createLogger('adapters/nemoclaw');

export const nemoclawAdapter = {
  name: 'nemoclaw',
  platform: 'nemoclaw',
  label: 'NemoClaw 连接器',

  async create(): Promise<DataConnector> {
    try {
      const { NemoClawConnector } = await import('../../../src/connectors/nemoclaw');
      const connector = new NemoClawConnector();
      log.info('NemoClaw 连接器已创建');
      return connector as unknown as DataConnector;
    } catch (err: any) {
      log.warn({ err }, 'NemoClaw 连接器创建失败 — degraded');
      throw err;
    }
  },
};
