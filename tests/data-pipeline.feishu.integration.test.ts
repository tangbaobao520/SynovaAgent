/**
 * tests/data-pipeline.feishu.integration.test.ts — 飞书数据管道集成测试
 *
 * 铁律 33: *.integration.test.ts = 集成测试（真实 API, 不 mock）
 * 铁律 0-2: 测试先于实现, Step 5 Wire Check 是硬门禁
 *
 * 验证链路: PythonBridge → feishu.py → feishu-bridge → GraphStore
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { getPythonBridge } from '../src/providers/python-bridge';
import { feishuHealthCheck, syncFeishuMembersToSOG } from '../src/connectors/feishu-bridge';
import { createLogger } from '../src/logger';
import type { GraphStore } from '../src/l4/graph-bridge';
import { createGraphStore as createEngineGraphStore } from '@synova/diagnosis-engine';

// ═══ 加载 .env (必须在 SKIP_FEISHU 之前) ═══
(function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
})();

const log = createLogger('test:data-pipeline');
const SKIP_FEISHU = !process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET;

if (SKIP_FEISHU) {
  log.warn({ FEISHU_APP_ID: process.env.FEISHU_APP_ID ? 'set' : 'missing', FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET ? 'set' : 'missing' }, 'FEISHU_* env 未设置, 飞书测试将跳过');
}

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

describe('数据管道 - 飞书连接器', () => {
  // ═══ 1. Python Bridge 可用性 ═══
  describe('PythonBridge health', () => {
    it('should ping Python worker successfully', async () => {
      const bridge = getPythonBridge();
      const healthy = await bridge.healthCheck();
      expect(healthy).toBe(true);
    }, 10000);
  });

  // ═══ 2. 飞书 API 连接 ═══
  describe('Feishu API connectivity', () => {
    it.runIf(!SKIP_FEISHU)('should connect to Feishu API', async () => {
      const healthy = await feishuHealthCheck(FEISHU_APP_ID, FEISHU_APP_SECRET);
      expect(healthy).toBe(true);
    }, 15000);
  });

  // ═══ 3. 成员数据 → GraphStore ═══
  describe('Feishu members → GraphStore', () => {
    it.runIf(!SKIP_FEISHU)('should fetch members and persist to GraphStore', async () => {
      // 内存 SQLite + GraphStore
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');

      const store = createEngineGraphStore('sqlite', db) as unknown as GraphStore;
      const orgId = 'test-org-feishu';

      const result = await syncFeishuMembersToSOG(
        FEISHU_APP_ID, FEISHU_APP_SECRET, orgId, store
      );

      log.info(result, '飞书成员同步结果');

      // 验证: 至少拉到了成员
      expect(result.members).toBeGreaterThan(0);
      expect(result.nodes).toBeGreaterThan(0);

      // 验证: GraphStore 中有 Person 节点
      const persons = store.queryNodes('Person', {}, orgId);
      expect(persons.length).toBeGreaterThan(0);

      log.info({ count: persons.length }, 'GraphStore 中 Person 节点');

      db.close();
    }, 30000);
  });
});
