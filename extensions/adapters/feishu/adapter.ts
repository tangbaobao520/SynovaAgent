/**
 * extensions/adapters/feishu/adapter.ts — 飞书连接器适配器
 * 包装 FeishuConnector，实现 DataConnector 接口。
 * V3.8 Batch 5 — IM 连接器文件化
 */
import type { DataConnector } from '../../../src/connectors/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('adapters/feishu');

export const feishuAdapter = {
  name: 'feishu',
  platform: 'feishu',
  label: '飞书连接器',

  async create(): Promise<DataConnector> {
    try {
      const { FeishuConnector } = await import('../../../src/connectors/feishu');
      const connector = new FeishuConnector();
      const healthy = await connector.healthCheck();
      if (!healthy.healthy) {
        log.warn({ error: healthy.error }, '飞书连接器健康检查失败 — degraded');
      }
      log.info('飞书连接器已创建');
      return connector as unknown as DataConnector;
    } catch (err: any) {
      log.warn({ err }, '飞书连接器创建失败 — degraded');
      throw err;
    }
  },
};
