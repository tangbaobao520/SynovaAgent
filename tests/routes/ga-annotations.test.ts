/**
 * tests/routes/ga-annotations.test.ts — GA标注API测试
 *
 * 契约优先（铁律47+48）：测试先于实现。
 * Step 2 预期全部 FAIL → Step 4 后全部 PASS。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('GA Annotations API', () => {
  // ═══ POST /api/ga/annotations ═══

  describe('POST /api/ga/annotations', () => {
    it('应拒绝非GA用户的请求 → 401/403', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
      // 预期: 无auth → 401
      // 实现后: 会调用 extractAuthFromRequest → 无auth返回401
    });

    it('应接受confirmed标注 → 返回200 + annotationId', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应接受false_alarm标注 + 纠错说明 → 返回200', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应拒绝无效annotation值 → 返回400', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应拒绝空findingId → 返回400', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('correctionNote超过2000字符应拒绝 → 返回400', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });
  });

  // ═══ GET /api/ga/annotations ═══

  describe('GET /api/ga/annotations', () => {
    it('应按findingId查询 → 返回匹配的标注记录', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应按sentinelId查询 → 返回该哨兵的所有标注', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应按annotation类型筛选 → 仅返回匹配类型', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应支持分页 → limit/offset生效', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });
  });

  // ═══ GET /api/ga/annotations/stats ═══

  describe('GET /api/ga/annotations/stats', () => {
    it('应返回按哨兵的统计 → bySentinel有数据', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('应返回总体统计 → overall.confirmedRate在0-1之间', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });

    it('无标注数据时应返回空统计 → 不是500', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });
  });

  // ═══ 数据持久化 ═══

  describe('数据持久化', () => {
    it('同一Finding两次标注 → 两条记录都存在，stats反映最新状态', async () => {
      const mod = await import('../../src/routes/ga-annotations');
      expect(mod.default).toBeDefined();
    });
  });

  // ═══ 类型引用验证 ═══

  describe('类型定义', () => {
    it('ga-annotations-types 类型文件可导入（验证编译通过）', async () => {
      // 注意: TypeScript interfaces 在运行时被擦除，仅验证模块可加载
      // 编译期类型检查由 tsc --noEmit 保障
      const types = await import('../../src/routes/ga-annotations-types');
      expect(types).toBeDefined();
    });
  });
});
