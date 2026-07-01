import { describe, it, expect } from 'vitest';
import { RuleVersionManager, type SnapshotEntry, type GradualRolloutInput } from '@synova/evolution';

/**
 * 模拟 AgentMemoryStore — 真实模拟 orgId+key 复合主键。
 * recall/list 都正确过滤 orgId，防止测试误报绿。
 */
function makeMemoryStore() {
  // key = `${orgId}:${key}`
  const store = new Map<string, { orgId: string; key: string; value: string; tags: string[]; type: string }>();
  const mapKey = (orgId: string, key: string) => `${orgId}:${key}`;
  return {
    remember: (entry: { orgId: string; key: string; value: string; type: string; tags: string[]; confidence: number; source: string; expiresAt: string | null }) => {
      store.set(mapKey(entry.orgId, entry.key), { orgId: entry.orgId, key: entry.key, value: entry.value, tags: entry.tags, type: entry.type });
      return entry;
    },
    recall: (orgId: string, key: string) => {
      const item = store.get(mapKey(orgId, key));
      return item ? { value: item.value } : null;
    },
    list: (query: { orgId: string; type?: string; tags?: string[]; limit?: number }) => {
      return Array.from(store.values())
        .filter(item => item.orgId === query.orgId)
        .filter(item => query.type ? item.type === query.type : true)
        .filter(item => query.tags && query.tags.length > 0 ? query.tags.every(t => item.tags.includes(t)) : true)
        .slice(0, query.limit || 50)
        .map(r => ({ value: r.value, tags: r.tags, type: r.type }));
    },
    forget: (orgId: string, key: string) => {
      return store.delete(mapKey(orgId, key));
    },
  };
}

describe('RuleVersionManager', () => {
  describe('createSnapshot', () => {
    it('无 memoryStore → 返回 null', async () => {
      const mgr = new RuleVersionManager(null);
      const id = await mgr.createSnapshot('test-snapshot');
      expect(id).toBeNull();
    });

    it('空存储 → 创建快照成功（阈值0）', async () => {
      const mem = makeMemoryStore();
      const mgr = new RuleVersionManager(mem);
      const id = await mgr.createSnapshot('空数据测试');
      expect(id).not.toBeNull();
      expect(typeof id).toBe('string');
    });

    it('有阈值调整 → 快照包含它们', async () => {
      const mem = makeMemoryStore();
      mem.remember({
        orgId: 'global', key: 'threshold_F1',
        value: JSON.stringify({ sentinelId: 'F1', orgId: 'org1', newThreshold: { warning: 1.0, critical: 0.5 }, reason: '用户纠错' }),
        type: 'enterprise_fact', confidence: 0.8, source: 'org_adapter',
        tags: ['threshold_adjustment', 'F1'], expiresAt: null,
      });

      const mgr = new RuleVersionManager(mem);
      const id = await mgr.createSnapshot('含阈值测试');
      expect(id).not.toBeNull();

      const snapshots = mgr.listSnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      const latest = snapshots[snapshots.length - 1];
      expect(latest.thresholdCount).toBe(1);
    });
  });

  describe('listSnapshots', () => {
    it('无快照 → 返回空数组', () => {
      const mem = makeMemoryStore();
      const mgr = new RuleVersionManager(mem);
      expect(mgr.listSnapshots()).toEqual([]);
    });

    it('无 memoryStore → 返回空数组', () => {
      const mgr = new RuleVersionManager(null);
      expect(mgr.listSnapshots()).toEqual([]);
    });
  });

  describe('rollbackTo', () => {
    it('不存在的快照 → 返回 errors', async () => {
      const mem = makeMemoryStore();
      const mgr = new RuleVersionManager(mem);
      const result = await mgr.rollbackTo('snap_does_not_exist');
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.degraded).toBe(true);
    });

    it('创建然后回滚 → 阈值恢复', async () => {
      const mem = makeMemoryStore();

      // 先创建一个含阈值的数据
      mem.remember({
        orgId: 'global', key: 'threshold_F1',
        value: JSON.stringify({ sentinelId: 'F1', orgId: 'org1', newThreshold: { warning: 1.0, critical: 0.5 }, reason: '用户纠错' }),
        type: 'enterprise_fact', confidence: 0.8, source: 'org_adapter',
        tags: ['threshold_adjustment', 'F1'], expiresAt: null,
      });

      const mgr = new RuleVersionManager(mem);
      const snapId = await mgr.createSnapshot('回滚测试');
      expect(snapId).not.toBeNull();

      // 清空阈值
      mem.forget('global', 'threshold_F1');

      // 回滚
      const result = await mgr.rollbackTo(snapId!);
      expect(result.thresholdsRestored).toBe(1);
      expect(result.errors.length).toBe(0);

      // 验证恢复
      const restored = mem.recall('global', 'threshold_F1_threshold_F1');
      // key 变了 (rollback 用 threshold_{sentinelId} 格式写入)，检查实际值
      const checkKey = mem.recall('org1', 'threshold_F1');
      expect(checkKey).not.toBeNull();
      if (checkKey) {
        const val = JSON.parse(checkKey.value) as { newThreshold: { critical: number } };
        expect(val.newThreshold.critical).toBe(0.5);
      }
    });
  });

  describe('gradualRollout', () => {
    it('orgPool + percentage → 只影响部分组织', async () => {
      const mem = makeMemoryStore();
      const mgr = new RuleVersionManager(mem);

      const input: GradualRolloutInput = {
        orgPool: ['orgA', 'orgB', 'orgC', 'orgD', 'orgE'],
        percentage: 40,
        thresholds: [{ sentinelId: 'F1', warning: 1.0, critical: 0.5 }],
      };

      const affected = await mgr.gradualRollout(input);
      // 5 * 40% = 2
      expect(affected.length).toBe(2);
      expect(affected).toEqual(['orgA', 'orgB']);
    });

    it('percentage=100 → 影响所有组织', async () => {
      const mem = makeMemoryStore();
      const mgr = new RuleVersionManager(mem);

      const input: GradualRolloutInput = {
        orgPool: ['orgA', 'orgB', 'orgC'],
        percentage: 100,
        thresholds: [{ sentinelId: 'F1', warning: 0.8, critical: 0.4 }],
      };

      const affected = await mgr.gradualRollout(input);
      expect(affected.length).toBe(3);
    });

    it('无 memoryStore → 返回空数组', async () => {
      const mgr = new RuleVersionManager(null);
      const result = await mgr.gradualRollout({ orgPool: ['orgA'], percentage: 100, thresholds: [] });
      expect(result).toEqual([]);
    });
  });
});
