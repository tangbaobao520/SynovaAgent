/**
 * tests/control-tower/enterprise-fact-chain.test.ts — D568: enterprise-fact 版本链三断言（K3 18-5）
 *
 * 契约:
 *   @input  — EnterpriseFactStore（注入独立临时目录，不污染 SYNO_FACTS_ROOT / 仓库真实 facts）
 *   @output — 三断言:
 *             ① 写入→更新→旧条目物理保留（{key}.v1.md）且 front matter supersededBy 非空、指向新版本
 *             ② 历史可追溯: readFactVersion 取回 v1 原内容 + listFactVersions 返回完整版本链 [1,2]
 *             ③ readFact 默认返回链头（最新 version，supersededBy 为 null）
 *   @degraded — 文件写入失败降级路径不在本测试范围（store 原有 log.warn + SQL 回退路径保持不变）
 *
 * S-5 先红记录: main 现状为覆盖式写入（旧条目物理丢失、supersededBy 恒 null）→ ①②红 ③绿；
 *               实现版本链后三断言全绿（K3 18-5: 注释声明什么就实现什么）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { EnterpriseFactStore } from '../../scripts/control-tower/enterprise-fact-store';

const TMP = join(import.meta.dirname, '..', '..', '.tmp-d568-facts');

describe('D568: enterprise-fact superseded_by 版本链', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('断言①: 写入→更新→旧条目保留且 supersededBy 非空指向新版本', () => {
    const store = new EnterpriseFactStore(TMP);
    store.createFact('growth', 'north-star', '2025 北极星: NDR 110%', { source: 'manual' });
    store.createFact('growth', 'north-star', '2026 北极星: NDR 120%', { source: 'manual' });

    // 旧条目（v1）物理保留为历史版本文件
    const v1Path = join(TMP, 'growth', 'north-star.v1.md');
    expect(existsSync(v1Path), 'v1 历史文件应保留（不覆盖）').toBe(true);
    const v1Raw = readFileSync(v1Path, 'utf-8');
    expect(v1Raw, 'v1 内容应为初始版本内容').toContain('NDR 110%');
    expect(v1Raw, 'v1 front matter 应回填 supersededBy 指向 v2').toContain('superseded_by: north-star#v2');
    expect(v1Raw, 'v1 front matter 不应有空的 superseded_by').not.toContain('superseded_by: null');
  });

  it('断言②: 历史可追溯（readFactVersion 取回原内容 + listFactVersions 完整链）', () => {
    const store = new EnterpriseFactStore(TMP);
    store.createFact('growth', 'north-star', 'v1 内容 A', { source: 'manual' });
    store.createFact('growth', 'north-star', 'v2 内容 B', { source: 'manual' });
    store.createFact('growth', 'north-star', 'v3 内容 C', { source: 'manual' });

    const v1 = store.readFactVersion('growth', 'north-star', 1);
    expect(v1, 'v1 应可读回').not.toBeNull();
    expect(v1?.content).toContain('v1 内容 A');
    expect(v1?.metadata.version).toBe(1);
    expect(v1?.metadata.supersededBy).toBe('north-star#v2');

    const v2 = store.readFactVersion('growth', 'north-star', 2);
    expect(v2?.content).toContain('v2 内容 B');
    expect(v2?.metadata.supersededBy).toBe('north-star#v3');

    expect(store.listFactVersions('growth', 'north-star'), '版本链应完整可追溯').toEqual([1, 2, 3]);
  });

  it('断言③: readFact 默认读链头（最新版本，supersededBy 为 null）', () => {
    const store = new EnterpriseFactStore(TMP);
    store.createFact('growth', 'north-star', '旧内容', { source: 'manual' });
    store.createFact('growth', 'north-star', '新内容', { source: 'manual', status: 'active' });

    const head = store.readFact('growth', 'north-star');
    expect(head, '链头应存在').not.toBeNull();
    expect(head?.metadata.version, '默认读到的应是最新版本').toBe(2);
    expect(head?.content).toContain('新内容');
    expect(head?.metadata.supersededBy, '链头未被取代，supersededBy 应为 null').toBeNull();
    expect(head?.metadata.status).toBe('active');
  });

  it('链头语义: listFacts 只列链头不列历史版本；deleteFact 清理全链', () => {
    const store = new EnterpriseFactStore(TMP);
    store.createFact('growth', 'k1', 'v1', { source: 'manual' });
    store.createFact('growth', 'k1', 'v2', { source: 'manual' });

    const listed = store.listFacts().filter((f) => f.metadata.key === 'k1');
    expect(listed, 'listFacts 对同一 key 只应返回链头一条').toHaveLength(1);
    expect(listed[0]?.metadata.version).toBe(2);

    expect(store.deleteFact('growth', 'k1')).toBe(true);
    expect(existsSync(join(TMP, 'growth', 'k1.md')), '链头应删除').toBe(false);
    expect(existsSync(join(TMP, 'growth', 'k1.v1.md')), '历史版本应同步清理（防孤儿/复活）').toBe(false);
    expect(store.listFactVersions('growth', 'k1')).toEqual([]);
  });
});
