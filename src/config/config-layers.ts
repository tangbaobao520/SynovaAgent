/**
 * config-layers.ts — 客户配置四层叠加机制（D599，DSH 借鉴卡 B-10）
 *
 * spec: docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md §3.1
 * 范式来源: DSH packages/settings/src/index.ts（读源码自研，零 DSH 代码依赖，G1/G4）。
 *
 * 契约（铁律 47）:
 *   - mergeLayers(under, over): plain object 递归合并；数组/标量整值替换（决策点 1，
 *     禁止阈值数组逐元素合并产生不可控混合）；undefined 稀疏 patch 不删下层键。
 *     输入: 任意 JSON 值。输出: 合并结果（新对象，不改入参）。永不抛错（类型冲突即整值替换）。
 *   - deepEqualJson(a, b): JSON 兼容数据结构相等（键序无关、数组序敏感）。
 *   - configNamespace(value): kebab-case（/^[a-z][a-z0-9-]*$/）命名空间品牌化；
 *     非法抛 TypeError（fail-closed）。
 *   - resolveLayers({default,industry,customer,workspace}): 按 LAYER_ORDER 有序覆盖
 *     （workspace > customer > industry > default），返回 detached clone。
 *     层文档非 plain object → 抛 ConfigLayerError（code=CONFIG_LAYER_INVALID,
 *     phase='resolveLayers', retryable=false，铁律 32，fail-closed）。
 *   - dumpLayers(...): 逐层来源 provenance——每层 {layer, present, doc, contributedKeys}，
 *     contributedKeys = resolved 中该层拥有（未被更高层覆盖）的顶层键，每键唯一 owner。
 *
 * 降级: 本模块为纯函数层，无 I/O 无 catch；非法入参 fail-closed 抛 ConfigLayerError，
 * 调用方（customer-config-package / routes）负责 log.warn + degraded 传播（铁律 24/31）。
 */

/** 四层名：default → industry → customer → workspace（应用顺序即覆盖顺序，后者胜）。 */
export type LayerName = 'default' | 'industry' | 'customer' | 'workspace';

/** 层应用顺序；索引高者优先覆盖。 */
export const LAYER_ORDER: readonly LayerName[] = ['default', 'industry', 'customer', 'workspace'];

/** 一层配置文档：plain object（键值均须 JSON 兼容）。 */
export type LayerDoc = Record<string, unknown>;

/** kebab-case 配置命名空间（品牌化字符串，防裸 string 混用）。 */
export type ConfigNamespace = string & { readonly __brand: 'ConfigNamespace' };

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * 配置层机制错误（铁律 32: .code + .phase + .retryable）。
 * 层文档非法（非 plain object）等 fail-closed 场景抛出；不重试（retryable=false——
 * 输入不修正，重试无意义）。
 */
export class ConfigLayerError extends Error {
  /** 稳定机器码，供上层映射自身错误分类。 */
  readonly code = 'CONFIG_LAYER_INVALID';
  /** 出错机制阶段（如 resolveLayers）。 */
  readonly phase: string;
  /** 输入非法不重试。 */
  readonly retryable = false;

  constructor(phase: string, message: string) {
    super(`config-layers: ${message}`);
    this.name = 'ConfigLayerError';
    this.phase = phase;
  }
}

/** 是否 plain data object（非数组、非 null、原型为 Object.prototype 或 null）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 将 `over` 叠加到 `under` 之上（DSH mergeLayers 同型，读源码自研）。
 *
 * plain object 递归合并；其余值（数组/标量/null）整值替换。`over` 中值为 undefined
 * 的键按稀疏 patch 处理——保留 under 的键不删除（调用方可用缺键表达「不动下层」）。
 * @param under - 下层值（先应用）。
 * @param over - 上层值（后应用，覆盖 under）；undefined 时原样返回 under。
 * @returns 合并结果；至少一方非 plain object 时为 over 的整值。
 */
export function mergeLayers(under: unknown, over: unknown): unknown {
  if (over === undefined) return under;
  if (!isPlainObject(under) || !isPlainObject(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue; // 稀疏 patch：不删下层键
    merged[key] = key in merged ? mergeLayers(merged[key], value) : value;
  }
  return merged;
}

/**
 * JSON 兼容数据的深度相等（DSH deepEqualJson 同型）。
 * 对象键序无关、数组长度与顺序敏感；null 与 undefined 不相等。
 * @param a - 一个 JSON 兼容值。
 * @param b - 另一个 JSON 兼容值。
 * @returns 结构相等时 true。
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => deepEqualJson(entry, b[index]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && deepEqualJson(a[key], b[key]));
}

/**
 * 品牌化一个 kebab-case 配置命名空间（DSH settingsNamespace 同型）。
 * @param value - 候选命名空间；小写字母开头的 kebab-case。
 * @returns 品牌化命名空间。
 * @throws TypeError 非法格式（fail-closed）。
 */
export function configNamespace(value: string): ConfigNamespace {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`config namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  }
  return value as ConfigNamespace;
}

/** 校验一层文档为 plain object，否则 fail-closed（ConfigLayerError）。 */
function assertLayerDoc(name: LayerName, doc: unknown): void {
  if (isPlainObject(doc)) return;
  const kind = Array.isArray(doc) ? 'array' : doc === null ? 'null' : typeof doc;
  throw new ConfigLayerError(
    'resolveLayers',
    `层 "${name}" 文档必须是 plain object，收到 ${kind}`,
  );
}

/** JSON round-trip 深拷贝（detached；mergeLayers 输出的 plain JSON 值安全）。 */
function detachJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

/** 四层输入：任一层可缺省（undefined = 该层不参与叠加）。 */
export type LayerInput = Partial<Record<LayerName, LayerDoc>>;

/** 逐层来源 dump 行。 */
export interface LayerDump {
  /** 层名。 */
  layer: LayerName;
  /** 该层是否提供了文档（参与叠加）。 */
  present: boolean;
  /** 该层文档 detached 拷贝；未提供为 null。 */
  doc: LayerDoc | null;
  /** resolved 顶层键中归属本层的键（未被更高层覆盖），升序。 */
  contributedKeys: string[];
}

/** dumpLayers 输出：resolved 结果 + 逐层 provenance。 */
export interface LayerDumpResult {
  /** 四层叠加后的最终配置（detached clone）。 */
  resolved: LayerDoc;
  /** 逐层来源行，顺序恒为 LAYER_ORDER。 */
  layers: LayerDump[];
}

/**
 * 四层有序叠加：default → industry → customer → workspace（后者逐键覆盖前者）。
 * 缺省层跳过；输出 detached clone（修改输出/输入互不影响）。
 * @param layers - 四层输入文档。
 * @returns 叠加后的配置。
 * @throws ConfigLayerError 某层文档非 plain object（fail-closed，铁律 32）。
 */
export function resolveLayers(layers: LayerInput): LayerDoc {
  if (!isPlainObject(layers)) {
    throw new ConfigLayerError('resolveLayers', `层输入必须是对象，收到 ${typeof layers}`);
  }
  let acc: unknown = {};
  for (const name of LAYER_ORDER) {
    const doc = layers[name];
    if (doc === undefined) continue;
    assertLayerDoc(name, doc);
    acc = mergeLayers(acc, doc);
  }
  return detachJson(acc);
}

/**
 * 逐层来源 dump（DSH SettingsDescriptor {value, base, user} 同理念，四层扩展）：
 * resolved 结果 + 每层是否参与、原文快照、及其在 resolved 中仍拥有的顶层键。
 * 顶层键级 provenance——每键恰有一个 owner（定义该键的最高层）。
 * @param layers - 四层输入文档（与 resolveLayers 同参）。
 * @returns resolved + 逐层 provenance（顺序 = LAYER_ORDER）。
 * @throws ConfigLayerError 某层文档非 plain object（fail-closed）。
 */
export function dumpLayers(layers: LayerInput): LayerDumpResult {
  const resolved = resolveLayers(layers);
  // owner 键 → 定义该键的最高层；按 LAYER_ORDER 顺序扫，后者覆盖前者。
  const owner = new Map<string, LayerName>();
  for (const name of LAYER_ORDER) {
    const doc = layers[name];
    if (doc === undefined) continue;
    for (const key of Object.keys(doc)) owner.set(key, name);
  }
  const dumpLayersList: LayerDump[] = LAYER_ORDER.map((name) => {
    const doc = layers[name];
    if (doc === undefined) {
      return { layer: name, present: false, doc: null, contributedKeys: [] };
    }
    const contributed = [...owner.entries()]
      .filter(([, layer]) => layer === name)
      .map(([key]) => key)
      .sort();
    return { layer: name, present: true, doc: detachJson(doc), contributedKeys: contributed };
  });
  return { resolved, layers: dumpLayersList };
}
