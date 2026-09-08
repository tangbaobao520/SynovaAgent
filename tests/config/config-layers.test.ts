/**
 * tests/config/config-layers.test.ts — D599（DSH 借鉴卡 B-10）四层配置叠加机制单测
 *
 * spec: docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md §4
 * 覆盖（≥8 用例，每用例 ≥3 expect，正常 + 降级 + 边界）:
 *   ① mergeLayers 对象递归合并不覆盖未提供键（DSH settings mergeLayers 同型）
 *   ② mergeLayers 数组/标量整值替换（禁止逐元素合并——决策点 1）
 *   ③ mergeLayers undefined 稀疏 patch 不删下层键
 *   ④ deepEqualJson 结构相等（键序无关/数组序敏感/边界）
 *   ⑤ configNamespace kebab-case 校验（非法 fail-closed）
 *   ⑥ resolveLayers 四层有序覆盖 workspace>customer>industry>default
 *   ⑦ resolveLayers 非法层文档 fail-closed（ConfigLayerError .code/.phase/.retryable）
 *   ⑧ dumpLayers 逐层来源 provenance（每键唯一 owner + 缺层 present=false）
 *   ⑨ resolveLayers detached：输入 mutate 不影响已解析结果
 *
 * 借鉴自读源码自研（DSH packages/settings/src/index.ts），零 DSH 代码依赖。
 */
import { describe, it, expect } from 'vitest';
import {
  mergeLayers,
  deepEqualJson,
  configNamespace,
  resolveLayers,
  dumpLayers,
  LAYER_ORDER,
  ConfigLayerError,
  type LayerName,
  type LayerDoc,
} from '../../src/config/config-layers';

describe('D599 config-layers: mergeLayers', () => {
  it('对象递归合并：未提供的键保留下层值，输入不被修改', () => {
    const under = { llm: { model: 'base-model', temperature: 0.5 }, top: 1 };
    const over = { llm: { temperature: 0.9 } };
    const merged = mergeLayers(under, over) as Record<string, unknown>;
    // 递归合并：temperature 被上层覆盖，model 保留
    const llm = merged.llm as Record<string, unknown>;
    expect(llm.temperature).toBe(0.9);
    expect(llm.model).toBe('base-model');
    expect(merged.top).toBe(1);
    // 输入不被修改（返回新对象）
    expect(under.llm.temperature).toBe(0.5);
    expect(merged).not.toBe(under);
  });

  it('数组整值替换：禁止逐元素合并产生混合数组（决策点 1）', () => {
    const under = { arr: [1, 2, 3], nested: { list: [{ a: 1 }] } };
    const over = { arr: [9], nested: { list: [{ b: 2 }] } };
    const merged = mergeLayers(under, over) as Record<string, unknown>;
    // 数组整体替换，不是 [9,2,3]
    expect(merged.arr).toEqual([9]);
    // 嵌套在对象里的数组同样整值替换
    const nested = merged.nested as Record<string, unknown>;
    expect(nested.list).toEqual([{ b: 2 }]);
    // 下层输入不变
    expect(under.arr).toEqual([1, 2, 3]);
  });

  it('undefined 稀疏 patch：不删除下层键；over 为 undefined 返回 under', () => {
    const under = { keep: 1, drop: 2 };
    const over: Record<string, unknown> = { drop: undefined, add: 3 };
    const merged = mergeLayers(under, over) as Record<string, unknown>;
    expect(merged.keep).toBe(1);
    expect(merged.drop).toBe(2); // 稀疏语义：undefined 不删下层键
    expect(merged.add).toBe(3);
    // 整层 undefined → 返回 under 本身
    expect(mergeLayers(under, undefined)).toBe(under);
  });

  it('类型冲突边界：标量与对象/数组互换时整值替换（不合并、不抛错）', () => {
    // 标量 → 对象
    expect(mergeLayers({ v: 5 }, { v: { a: 1 } })).toEqual({ v: { a: 1 } });
    // 数组 → 字符串
    expect(mergeLayers({ v: [1] }, { v: 's' })).toEqual({ v: 's' });
    // 顶层标量 under + 对象 over → over 整体生效
    expect(mergeLayers('scalar', { a: 1 })).toEqual({ a: 1 });
    // 对象 under + 数组 over → 数组整值替换
    expect(mergeLayers({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });
});

describe('D599 config-layers: deepEqualJson', () => {
  it('结构相等：键序无关；数组序敏感', () => {
    expect(deepEqualJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqualJson([1, 2], [2, 1])).toBe(false);
    expect(deepEqualJson({ a: 1 }, { a: 1, b: undefined })).toBe(false); // 键数不同
  });

  it('边界：null/标量/类型差异', () => {
    expect(deepEqualJson(null, null)).toBe(true);
    expect(deepEqualJson(null, undefined)).toBe(false);
    expect(deepEqualJson('x', 'x')).toBe(true);
    expect(deepEqualJson(1, '1')).toBe(false);
    expect(deepEqualJson({}, [])).toBe(false);
  });
});

describe('D599 config-layers: configNamespace', () => {
  it('合法 kebab-case 通过且值保真', () => {
    expect(configNamespace('diagnosis-depth')).toBe('diagnosis-depth');
    expect(configNamespace('a')).toBe('a');
    expect(configNamespace('sentinel-threshold-v2')).toBe('sentinel-threshold-v2');
  });

  it('非法命名空间 fail-closed（TypeError）', () => {
    expect(() => configNamespace('Diagnosis')).toThrow(TypeError);
    expect(() => configNamespace('diagnosis_depth')).toThrow(TypeError);
    expect(() => configNamespace('9depth')).toThrow(TypeError);
    expect(() => configNamespace('')).toThrow(TypeError);
    expect(() => configNamespace('has space')).toThrow(TypeError);
  });
});

describe('D599 config-layers: resolveLayers 四层有序覆盖', () => {
  it('workspace > customer > industry > default 深层值覆盖；缺层跳过', () => {
    const resolved = resolveLayers({
      default: { a: { b: 'default', c: 1 }, only: 'd' },
      industry: { a: { b: 'industry' } },
      customer: { a: { b: 'customer' } },
      workspace: { a: { b: 'workspace' } },
    });
    const a = resolved.a as Record<string, unknown>;
    expect(a.b).toBe('workspace');
    expect(a.c).toBe(1); // 只有 default 提供的键保留
    expect(resolved.only).toBe('d');
    // 部分层缺省：default + customer → customer 赢
    const partial = resolveLayers({
      default: { a: { b: 'default' } },
      customer: { a: { b: 'customer' } },
    });
    expect((partial.a as Record<string, unknown>).b).toBe('customer');
  });

  it('层顺序常量与空层输入', () => {
    expect(LAYER_ORDER).toEqual(['default', 'industry', 'customer', 'workspace']);
    expect(resolveLayers({})).toEqual({});
    expect(resolveLayers({ default: { x: 1 } })).toEqual({ x: 1 });
  });

  it('非法层文档 fail-closed：ConfigLayerError 带 code/phase/retryable', () => {
    const badArray: unknown = [1, 2];
    expect(() => resolveLayers({ default: badArray as LayerDoc })).toThrow(ConfigLayerError);
    const badScalar: unknown = 'not-an-object';
    try {
      resolveLayers({ customer: badScalar as LayerDoc });
      expect.unreachable('必须抛出 ConfigLayerError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConfigLayerError);
      const cle = err as ConfigLayerError;
      expect(cle.code).toBe('CONFIG_LAYER_INVALID');
      expect(cle.phase.length).toBeGreaterThan(0);
      expect(cle.retryable).toBe(false);
    }
  });

  it('detached：输入对象事后 mutate 不影响已解析结果', () => {
    const customer: LayerDoc = { svc: { key: 'customer' } };
    const resolved = resolveLayers({ default: { svc: { key: 'default' } }, customer });
    const svc = resolved.svc as Record<string, unknown>;
    expect(svc.key).toBe('customer');
    // 事后修改输入 → 已解析结果不变（clone 语义）
    (customer.svc as Record<string, unknown>).key = 'MUTATED';
    expect(svc.key).toBe('customer');
  });
});

describe('D599 config-layers: dumpLayers 逐层来源 provenance', () => {
  it('每键唯一 owner：被覆盖键归属最高层；缺层 present=false doc=null', () => {
    const dump = dumpLayers({
      default: { a: 1, b: { c: 1 } },
      customer: { b: { c: 2 } },
    });
    expect(dump.resolved).toEqual({ a: 1, b: { c: 2 } });
    const byLayer = new Map(dump.layers.map((l) => [l.layer, l]));
    const def = byLayer.get('default');
    const cust = byLayer.get('customer');
    const ws = byLayer.get('workspace');
    expect(def).toBeDefined();
    expect(cust).toBeDefined();
    expect(ws).toBeDefined();
    // a 只有 default 提供 → owner=default；b 被 customer 覆盖 → owner=customer
    expect(def?.contributedKeys).toContain('a');
    expect(def?.contributedKeys).not.toContain('b');
    expect(cust?.contributedKeys).toContain('b');
    // 缺层：present=false + doc=null
    expect(ws?.present).toBe(false);
    expect(ws?.doc).toBeNull();
    // 出现的层 present=true 且 doc 带原文
    expect(def?.present).toBe(true);
    expect(def?.doc).toEqual({ a: 1, b: { c: 1 } });
    // 每个顶层键恰有一个 owner（provenance 无交叉重复）
    const owners = dump.layers.flatMap((l) => (l.present ? l.contributedKeys : []));
    expect(new Set(owners).size).toBe(owners.length);
  });

  it('dumpLayers 层枚举完整且顺序稳定（LAYER_ORDER 同序）', () => {
    const dump = dumpLayers({ default: { x: 1 } });
    expect(dump.layers.map((l) => l.layer)).toEqual([...LAYER_ORDER]);
    const ind = dump.layers.find((l) => l.layer === 'industry');
    expect(ind?.present).toBe(false);
  });
});

describe('D599 config-layers: LayerName 类型面', () => {
  it('四层名单编译期与运行期一致', () => {
    const names: readonly LayerName[] = ['default', 'industry', 'customer', 'workspace'];
    expect(names).toEqual(LAYER_ORDER);
    expect(LAYER_ORDER.length).toBe(4);
  });
});
