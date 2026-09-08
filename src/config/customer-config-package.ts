/**
 * customer-config-package.ts — 客户配置包发现/挂载/泄漏审计（D599，DSH 借鉴卡 B-09）
 *
 * spec: docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md §3.1
 * 范式来源: DSH packages/preset/agent-presets/{discovery,mount}.ts（读源码自研，零 DSH 代码依赖，G1/G4）。
 *
 * 载体（决策点 2）: 目录即客户包——customer-config/{orgId}/config.yml（composition，必需）
 *   + industry.yml（industry 层，可选）+ workspace.yml（workspace 层，可选）
 *   + metadata.yml（纯展示，坏不阻断，DSH preset.yml 理念）。
 *
 * 契约（铁律 47）:
 *   - discoverCustomerConfigPackages(roots): roots 按优先级序扫描，first-root-wins 按 orgId
 *     去重；broken 包（composition 缺失/不可读/坏 YAML/顶层非对象）上报 roster 而非静默跳过
 *     （缺失的目录仍占用 id，静默跳过会让坏包在首次挂载才爆）。不存在 root → 空数组不抛；
 *     非法目录名（非 ORG_ID_PATTERN，防路径逃逸）跳过且不报 broken。
 *   - mountCustomerConfig(orgId, options): per-org 四层解析（default→industry→customer→
 *     workspace），只返回 detached + deep frozen 解析结果，绝不写任何进程级/全局单例
 *     （决策点 3）。无包/broken/可选层损坏/泄漏键剥离 → degraded:true + reason（铁律 24/31），
 *     不抛错不炸诊断。
 *   - leakedGlobalConfig(config): 审计客户配置是否试图命名进程级全局物——顶层保留全局键
 *     （process/env/require/...，kind='reserved-global'）或任意深度原型污染键
 *     （__proto__/prototype/constructor，kind='prototype-key'）。返回泄漏路径列表，空 = 干净。
 *   - resolveCustomerConfig(orgId, options): mountCustomerConfig 的接线入口别名
 *     （spec §5: routes/diagnosis.ts consult 生产路径消费点）。
 *
 * 降级: 所有 I/O 失败区分 ENOENT（正常缺省 → 层跳过）与解析/读取失败（log.warn + degraded
 * 传播，铁律 24）；单客户坏包只降级该客户的挂载，不拖垮进程（铁律 31）。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { createLogger } from '@synova/logger';
import {
  dumpLayers,
  resolveLayers,
  type LayerDoc,
  type LayerDump,
  type LayerName,
} from './config-layers';

const log = createLogger('config/customer-config-package');

/** composition 文件名——使一个目录成为客户配置包的文件（DSH COMPOSITION_FILE 同理念）。 */
export const COMPOSITION_FILE = 'config.yml';
/** industry 层文件（可选）。 */
export const INDUSTRY_FILE = 'industry.yml';
/** workspace 层文件（可选）。 */
export const WORKSPACE_FILE = 'workspace.yml';
/** 纯展示元数据文件（可选；坏不阻断挂载）。 */
export const METADATA_FILE = 'metadata.yml';
/** 默认客户配置根目录名（相对 cwd；进程级全局只读定位，不承载任何可变状态）。 */
export const DEFAULT_ROOT_NAME = 'customer-config';

/** orgId 即目录名：首字符字母/数字，允许内嵌 . _ -（杜绝 `..` 前导、路径分隔符、隐藏目录）。 */
const ORG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 客户配置根：一个扫描目录 + 其下包继承的信任级（DSH PresetRoot 同理念）。 */
export interface CustomerConfigRoot {
  /** 绝对或相对 cwd 的根目录。 */
  path: string;
  /** 信任级：system 随部署分发 / customer 客户自管 / workspace 工作区覆盖。 */
  trust: 'system' | 'customer' | 'workspace';
}

/** 客户配置包展示元数据（display only，缺省/坏均不阻断）。 */
export interface CustomerConfigMetadata {
  name?: string;
  description?: string;
}

/** 一个被发现的客户配置包（broken 时仍占其 id 并带原因上报）。 */
export interface CustomerConfigPackage {
  /** orgId = 目录名。 */
  orgId: string;
  /** 发现根的信任级。 */
  trust: CustomerConfigRoot['trust'];
  /** composition 文件绝对路径。 */
  path: string;
  /** 不可挂载原因；健康包无此字段。 */
  broken?: string;
  /** 展示元数据（display only）。 */
  metadata?: CustomerConfigMetadata;
}

/** 审计泄漏类别。 */
export type LeakedGlobalKind = 'reserved-global' | 'prototype-key';

/** 一条泄漏审计记录：泄漏键与其 `$` 根路径。 */
export interface LeakedGlobalEntry {
  /** `$` 根路径（如 `$.process`、`$.llm.__proto__`）。 */
  path: string;
  /** 泄漏键名。 */
  key: string;
  /** 泄漏类别。 */
  kind: LeakedGlobalKind;
}

/** 顶层保留全局键：客户配置不得命名进程级全局物（决策点 3）。 */
const RESERVED_GLOBAL_KEYS: ReadonlySet<string> = new Set([
  'process', 'global', 'globalThis', 'env', 'require', 'module', 'exports',
  '__dirname', '__filename', 'Buffer',
]);

/** 任意深度禁止的原型污染键。 */
const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 单值 Yale 首行（js-yaml 多行 code-frame 收敛为单行，roster/日志可读）。 */
function firstLine(text: string): string {
  return text.replace(/\r?\n[\s\S]*$/, '');
}

/** 错误是否 ENOENT（正常缺省——可选文件不存在）。 */
function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * 读并校验一个 YAML 层文档为 plain object。
 * @param path - 文件绝对路径。
 * @returns 文档；文件不存在（ENOENT）返回 undefined。
 * @throws Error 读失败或解析失败或顶层非对象（非 ENOENT 一律上抛，由调用方降级）。
 */
async function readYamlLayer(path: string): Promise<LayerDoc | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (isENOENT(error)) return undefined; // 可选层缺省 ≠ 错误
    throw new Error(`配置文件不可读: ${path}: ${String(error)}`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`配置不是合法 YAML: ${path}: ${firstLine(detail)}`, { cause: error });
  }
  if (!isPlainObject(parsed)) {
    const kind = Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed;
    throw new Error(`配置顶层必须是对象，收到 ${kind}: ${path}`);
  }
  return parsed;
}

/** 读纯展示元数据：缺省/不可读/坏 YAML/非对象一律空元数据（display 永不阻断挂载）。 */
async function readMetadata(directory: string): Promise<CustomerConfigMetadata | undefined> {
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(join(directory, METADATA_FILE), 'utf8'));
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) return undefined;
  const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };
  const name = text(parsed.name);
  const description = text(parsed.description);
  if (name === undefined && description === undefined) return undefined;
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
  };
}

/** composition 健康判定：可读 + 合法 YAML + 顶层对象，否则返回一句 broken 原因。 */
async function compositionProblem(path: string): Promise<string | undefined> {
  try {
    await stat(path);
  } catch {
    return `${COMPOSITION_FILE} 缺失——目录仍占用其 id；删除该目录或恢复文件`;
  }
  try {
    await readYamlLayer(path);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

/**
 * 扫描一个根目录下的客户配置包（DSH scanRoot 同理念）。
 * 不存在的根 → 空数组（首个包落盘前的常态）；其他读取失败上抛（fail-loud，由调用方降级）。
 * @param root - 待扫描根。
 * @returns 该根下的包，按 orgId 升序。
 */
async function scanRoot(root: CustomerConfigRoot): Promise<CustomerConfigPackage[]> {
  const dir = resolve(root.path);
  let children: Dirent[];
  try {
    children = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isENOENT(error)) return [];
    throw new Error(`customer-config: 无法读取根目录 ${dir}: ${String(error)}`, { cause: error });
  }
  const found: CustomerConfigPackage[] = [];
  for (const child of children) {
    // 非法目录名跳过且不报 broken：命名不合法的目录永远不会成为包，
    // 把 .DS_Store 级残渣报成 broken 会让运维学会忽略告警（DSH 同理由）。
    if (!child.isDirectory() || !ORG_ID_PATTERN.test(child.name)) continue;
    const directory = join(dir, child.name);
    const path = join(directory, COMPOSITION_FILE);
    const broken = await compositionProblem(path);
    const metadata = await readMetadata(directory);
    found.push({
      orgId: child.name,
      trust: root.trust,
      path,
      ...(metadata === undefined ? {} : { metadata }),
      ...(broken === undefined ? {} : { broken }),
    });
  }
  return found.sort((left, right) => left.orgId.localeCompare(right.orgId));
}

/**
 * 按优先级序扫描全部根，first-root-wins 按 orgId 去重（DSH discoverPresets 同理念）。
 * @param roots - 根列表，顺序即优先级（前者胜同 id）。
 * @returns 去重后的 roster（含 broken 行——上报而非跳过）。
 */
export async function discoverCustomerConfigPackages(
  roots: readonly CustomerConfigRoot[],
): Promise<CustomerConfigPackage[]> {
  const byId = new Map<string, CustomerConfigPackage>();
  for (const root of roots) {
    for (const pkg of await scanRoot(root)) {
      if (byId.has(pkg.orgId)) continue; // first-root-wins
      byId.set(pkg.orgId, pkg);
    }
  }
  return [...byId.values()];
}

/**
 * 递归收集配置树中的泄漏键（审计口径：顶层保留全局键 + 任意深度原型键）。
 * @param node - 当前节点。
 * @param prefix - `$` 根路径前缀。
 * @param atTop - 是否配置顶层。
 * @param out - 收集器。
 */
function collectLeaks(node: unknown, prefix: string, atTop: boolean, out: LeakedGlobalEntry[]): void {
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      const isPrototype = PROTOTYPE_KEYS.has(key);
      const isReserved = atTop && RESERVED_GLOBAL_KEYS.has(key);
      if (isPrototype || isReserved) {
        out.push({
          path: `${prefix}.${key}`,
          key,
          kind: isPrototype ? 'prototype-key' : 'reserved-global',
        });
        continue;
      }
      collectLeaks(value, `${prefix}.${key}`, false, out);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const [index, entry] of node.entries()) {
      collectLeaks(entry, `${prefix}[${String(index)}]`, false, out);
    }
  }
}

/**
 * 审计客户配置是否试图命名进程级全局物（DSH leakedServices 理念的静态数据版）：
 * 客户配置是数据，不是能力——命名 process/env/require 等全局键或原型污染键即视为
 * 试图把客户层发布为进程级状态，fail-closed 上报。
 * @param config - 待审计配置（plain object）。
 * @returns 泄漏记录列表；空数组 = 干净。
 */
export function leakedGlobalConfig(config: LayerDoc): LeakedGlobalEntry[] {
  const out: LeakedGlobalEntry[] = [];
  collectLeaks(config, '$', true, out);
  return out;
}

/** 递归冻结，保证发出去的解析结果不可被调用方原地改写（detached）。 */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

/**
 * 深度剥离泄漏键，返回净化后的副本（fail-closed per 键：泄漏键剔除，其余保留）。
 * @param node - 净化目标。
 * @param prefix - `$` 根路径前缀。
 * @param atTop - 是否配置顶层。
 * @param stripped - 被剥离记录收集器。
 * @returns 净化后的副本（新对象，不改入参）。
 */
function stripLeaks(
  node: unknown,
  prefix: string,
  atTop: boolean,
  stripped: LeakedGlobalEntry[],
): unknown {
  if (Array.isArray(node)) {
    return node.map((entry, index) => stripLeaks(entry, `${prefix}[${String(index)}]`, false, stripped));
  }
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    const isPrototype = PROTOTYPE_KEYS.has(key);
    const isReserved = atTop && RESERVED_GLOBAL_KEYS.has(key);
    if (isPrototype || isReserved) {
      stripped.push({
        path: `${prefix}.${key}`,
        key,
        kind: isPrototype ? 'prototype-key' : 'reserved-global',
      });
      continue;
    }
    out[key] = stripLeaks(value, `${prefix}.${key}`, false, stripped);
  }
  return out;
}

/** 挂载选项。 */
export interface MountOptions {
  /** 客户配置根列表（优先级序）；缺省 = cwd 下 customer-config/。 */
  roots?: CustomerConfigRoot[];
  /** default 层文档（进程内置默认）；缺省 = 空对象。 */
  defaultLayer?: LayerDoc;
}

/** 挂载结果：per-org detached 解析 + 逐层来源 + 审计 + 降级标记。 */
export interface MountedCustomerConfig {
  /** 挂载的 orgId。 */
  orgId: string;
  /** 四层叠加最终配置（deep frozen，泄漏键已剥离）。 */
  config: LayerDoc;
  /** 逐层来源 provenance（层文档原貌，剥离前）。 */
  provenance: LayerDump[];
  /** 降级标记：无包/broken/可选层损坏/泄漏剥离 任一为 true。 */
  degraded: boolean;
  /** 降级原因（degraded 时提供）。 */
  reason?: string;
  /** 被审计剥离的泄漏键（空 = 无泄漏）。 */
  audit: LeakedGlobalEntry[];
  /** 包 broken 原因透传（discovery 层面）。 */
  broken?: string;
}

/**
 * 挂载一个客户的四层配置（B-09 核心：per-org 隔离，零进程级状态写入）。
 *
 * 流程: discovery roster → 定位 orgId 包 → industry/config/workspace 三层文档读取 →
 * resolveLayers 四层叠加 → leakedGlobalConfig 审计 → 剥离泄漏键 → deepFreeze detached 输出。
 * 无包/broken/可选层损坏 → degraded:true + reason，default 层兜底，不抛错（铁律 24/31）。
 * @param orgId - 客户组织 ID（即包目录名）。
 * @param options - roots / defaultLayer。
 * @returns 挂载结果（config 已 deep frozen）。
 */
export async function mountCustomerConfig(
  orgId: string,
  options?: MountOptions,
): Promise<MountedCustomerConfig> {
  const roots = options?.roots ?? [{ path: join(process.cwd(), DEFAULT_ROOT_NAME), trust: 'customer' as const }];
  const defaultLayer = options?.defaultLayer ?? {};
  const roster = await discoverCustomerConfigPackages(roots);
  const pkg = roster.find((p) => p.orgId === orgId);

  // 组装层输入：default + industry + customer(config) + workspace
  const layers = new Map<LayerName, LayerDoc>();
  layers.set('default', defaultLayer);
  let degraded = false;
  let reason: string | undefined;

  if (pkg === undefined) {
    degraded = true;
    reason = `无客户配置包（orgId=${orgId}，roots=${roots.map((r) => r.path).join(', ')}）— default 层兜底`;
    log.warn({ orgId, roots: roots.map((r) => r.path) }, 'customer-config: 无客户配置包 — default 层兜底（degraded）');
  } else {
    if (pkg.broken !== undefined) {
      degraded = true;
      reason = `客户配置包 broken: ${pkg.broken} — default 层兜底`;
      log.warn({ orgId, broken: pkg.broken }, 'customer-config: 包 broken — default 层兜底（degraded）');
    }
    // 可选层/composition 逐层读取：单层失败只降级该层（broken 时 composition 必败，已兜底）
    const layerFiles: Array<{ name: LayerName; file: string }> = [
      { name: 'industry', file: INDUSTRY_FILE },
      { name: 'customer', file: COMPOSITION_FILE },
      { name: 'workspace', file: WORKSPACE_FILE },
    ];
    for (const { name, file } of layerFiles) {
      if (pkg.broken !== undefined && name === 'customer') continue; // broken 包的 composition 已知坏
      try {
        const doc = await readYamlLayer(join(resolve(pkg.path, '..'), file));
        if (doc !== undefined) layers.set(name, doc);
      } catch (error: unknown) {
        degraded = true;
        const detail = error instanceof Error ? error.message : String(error);
        reason = `${name} 层读取失败: ${detail}`;
        log.warn({ orgId, layer: name, err: error }, 'customer-config: 层读取失败 — 该层跳过（degraded）');
      }
    }
  }

  const layerInput = Object.fromEntries(layers) as Partial<Record<LayerName, LayerDoc>>;
  const dump = dumpLayers(layerInput);
  const audit: LeakedGlobalEntry[] = [];
  const clean = stripLeaks(dump.resolved, '$', true, audit);
  if (audit.length > 0 && !degraded) {
    degraded = true;
    reason = `客户配置含 ${String(audit.length)} 处进程级全局泄漏键，已剥离: ${audit.map((e) => e.path).join(', ')}`;
  }
  if (audit.length > 0) {
    log.warn({ orgId, audit }, 'customer-config: 泄漏键剥离（fail-closed，degraded）');
  }

  return {
    orgId,
    config: deepFreeze(clean) as LayerDoc,
    provenance: dump.layers,
    degraded,
    ...(reason === undefined ? {} : { reason }),
    audit,
    ...(pkg?.broken === undefined ? {} : { broken: pkg.broken }),
  };
}

/**
 * 解析一个客户的四层配置——接线入口（spec §5: routes/diagnosis.ts consult 生产路径消费点）。
 * 与 mountCustomerConfig 同契约（别名导出，语义命名供 L1 路由使用）。
 * @param orgId - 客户组织 ID。
 * @param options - roots / defaultLayer。
 * @returns 挂载结果（degraded 不抛错）。
 */
export async function resolveCustomerConfig(
  orgId: string,
  options?: MountOptions,
): Promise<MountedCustomerConfig> {
  return mountCustomerConfig(orgId, options);
}
