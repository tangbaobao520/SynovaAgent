/**
 * community-reports-adapter.test.ts — L3 适配层单测: 社区报告 (D292)
 *
 * 验证 (铁律 0-2 测试先行 + 铁律 39):
 *   1. 正常路径: 适配器导出与 L4 原模块为同一引用 (纯代理 re-export)
 *   2. 降级路径: 适配器可独立导入不抛错
 *   3. 边界: 动态 import 场景可用 (diagnosis-launcher L230 的消费方式)
 *
 * Given/When/Then 格式。不调用 generateCommunityReports 本体, 避免图计算副作用。
 */
import { describe, it, expect } from 'vitest';
import { generateCommunityReports } from '../../src/l3/community-reports-adapter';
import { generateCommunityReports as l4GenerateCommunityReports } from '../../src/l4/community-reports';

describe('L3 community-reports-adapter (D292)', () => {
  it('正常路径: 与 L4 原模块为同一引用 (纯代理)', () => {
    expect(generateCommunityReports).toBe(l4GenerateCommunityReports);
  });

  it('降级路径: 可独立导入, 函数可调用', () => {
    expect(typeof generateCommunityReports).toBe('function');
  });

  it('边界: 动态 import 场景可用 (diagnosis-launcher L230 消费方式)', async () => {
    // 模拟 L2 动态 import 路径 — 模块加载成功且导出完整
    const mod = await import('../../src/l3/community-reports-adapter');
    expect(typeof mod.generateCommunityReports).toBe('function');
  });
});
