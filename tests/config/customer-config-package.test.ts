/**
 * tests/config/customer-config-package.test.ts — D599（DSH 借鉴卡 B-09）客户配置包机制单测
 *
 * spec: docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md §4
 * 覆盖（≥6 用例，每用例 ≥3 expect，正常 + 降级 + 边界）:
 *   ① discovery first-root-wins：多 root 同 orgId 去重且首 root 胜（roster + 值级）
 *   ② discovery broken 上报不跳过：缺 composition / 坏 YAML / 非对象 YAML → broken 非空仍在 roster
 *   ③ discovery 空 root / 不存在 root → 空数组不抛；非法目录名跳过不占 id
 *   ④ mount per-org 隔离：A 客户配置不泄漏到 B；返回值 frozen（detached）
 *   ⑤ mount 四层叠加 end-to-end：defaultLayer + industry.yml + config.yml + workspace.yml
 *   ⑥ leakedGlobalConfig 审计：进程级全局键 / 原型污染键 / 干净配置
 *   ⑦ mount 泄漏拒绝：泄漏键剥离 + degraded 传播（铁律 24/31）
 *   ⑧ broken 包 mount 降级：degraded + broken 原因 + default 层兜底
 *
 * 借鉴自读源码自研（DSH agent-presets discovery/mount），零 DSH 代码依赖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverCustomerConfigPackages,
  mountCustomerConfig,
  resolveCustomerConfig,
  leakedGlobalConfig,
  COMPOSITION_FILE,
  type CustomerConfigRoot,
} from '../../src/config/customer-config-package';

let base: string;
let rootA: string;
let rootB: string;

async function writePackage(
  root: string,
  orgId: string,
  files: Record<string, string>,
): Promise<void> {
  const dir = join(root, orgId);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8');
  }
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'd599-ccp-'));
  rootA = join(base, 'root-a', 'customer-config');
  rootB = join(base, 'root-b', 'customer-config');
  await mkdir(rootA, { recursive: true });
  await mkdir(rootB, { recursive: true });
  // rootA: org-acme（customer 层深度 deep）+ org-broken（缺 composition）+ org-badyaml + org-nonobj + org-leak + org-full
  await writePackage(rootA, 'org-acme', { 'config.yml': 'diagnosis:\n  depth: deep\n' });
  await mkdir(join(rootA, 'org-broken'), { recursive: true });
  await writePackage(rootA, 'org-badyaml', { 'config.yml': '{unclosed: [debug\n' });
  await writePackage(rootA, 'org-nonobj', { 'config.yml': '- a\n- b\n' });
  await writePackage(rootA, 'org-leak', {
    'config.yml': 'process:\n  env: leak\nok:\n  v: 1\n',
  });
  await writePackage(rootA, 'org-full', {
    'config.yml': 'svc:\n  key: customer\n',
    'industry.yml': 'svc:\n  key: industry\n',
    'workspace.yml': 'svc:\n  key: workspace\n',
  });
  // rootB: org-acme（不同内容，验证 first-root-wins 值级）+ org-solo（仅 B 有）
  await writePackage(rootB, 'org-acme', { 'config.yml': 'diagnosis:\n  depth: shallow\n' });
  await writePackage(rootB, 'org-solo', { 'config.yml': 'solo: true\n' });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const rootsOf = (): CustomerConfigRoot[] => [
  { path: rootA, trust: 'customer' },
  { path: rootB, trust: 'workspace' },
];

describe('D599 customer-config-package: discoverCustomerConfigPackages', () => {
  it('first-root-wins：多 root 同 orgId 只留首 root 的包（roster 去重 + path 归属）', async () => {
    const roster = await discoverCustomerConfigPackages(rootsOf());
    const acme = roster.filter((p) => p.orgId === 'org-acme');
    expect(acme).toHaveLength(1);
    expect(acme[0].path.startsWith(rootA)).toBe(true);
    expect(acme[0].trust).toBe('customer');
    // 仅 B 独有的包仍被发现
    expect(roster.some((p) => p.orgId === 'org-solo')).toBe(true);
  });

  it('broken 上报不跳过：缺 composition / 坏 YAML / 非对象 YAML 都在 roster 且 broken 非空', async () => {
    const roster = await discoverCustomerConfigPackages(rootsOf());
    const byId = new Map(roster.map((p) => [p.orgId, p]));
    // 缺 config.yml：目录仍占 id，上报 broken
    const missing = byId.get('org-broken');
    expect(missing).toBeDefined();
    expect(missing?.broken).toBeTruthy();
    // 坏 YAML：不可解析 → broken
    expect(byId.get('org-badyaml')?.broken).toBeTruthy();
    // 合法 YAML 但顶层非对象 → broken
    expect(byId.get('org-nonobj')?.broken).toBeTruthy();
    // 健康包无 broken 字段
    expect(byId.get('org-acme')?.broken).toBeUndefined();
  });

  it('空 root / 不存在 root → 空数组不抛；非法目录名跳过且不报 broken', async () => {
    expect(await discoverCustomerConfigPackages([])).toEqual([]);
    const absent = await discoverCustomerConfigPackages([
      { path: join(base, 'no-such-root'), trust: 'customer' },
    ]);
    expect(absent).toEqual([]);
    // 非法目录名（非 org 模式）：既不进 roster 也不 broken
    const rogue = join(rootA, 'Not A Package!');
    await mkdir(rogue, { recursive: true });
    try {
      const roster = await discoverCustomerConfigPackages([{ path: rootA, trust: 'customer' }]);
      expect(roster.some((p) => p.orgId.includes('Not A Package'))).toBe(false);
      expect(roster.every((p) => p.broken === undefined || p.broken.length > 0)).toBe(true);
    } finally {
      await rm(rogue, { recursive: true, force: true });
    }
    expect(COMPOSITION_FILE).toBe('config.yml');
  });
});

describe('D599 customer-config-package: mount per-org 隔离', () => {
  it('A 客户配置不泄漏到 B：org-acme 拿到 deep，无包 org degraded 且 config 为空', async () => {
    const a = await mountCustomerConfig('org-acme', { roots: rootsOf() });
    expect(a.orgId).toBe('org-acme');
    expect(a.degraded).toBe(false);
    const diag = a.config.diagnosis as Record<string, unknown>;
    expect(diag.depth).toBe('deep');
    // B 独有配置不得出现在 A 的解析结果
    expect(a.config.solo).toBeUndefined();
    // 无包客户：降级而非抛错（铁律 24/31）
    const ghost = await mountCustomerConfig('org-ghost', { roots: rootsOf() });
    expect(ghost.degraded).toBe(true);
    expect(ghost.config).toEqual({});
    expect(ghost.reason).toBeTruthy();
    // detached：返回值 frozen，原地改写被拒
    expect(Object.isFrozen(a.config)).toBe(true);
  });

  it('四层叠加 end-to-end：workspace > customer > industry > default，provenance 全 present', async () => {
    const m = await mountCustomerConfig('org-full', {
      roots: rootsOf(),
      defaultLayer: { svc: { key: 'default', base: 1 } },
    });
    expect(m.degraded).toBe(false);
    const svc = m.config.svc as Record<string, unknown>;
    expect(svc.key).toBe('workspace');
    expect(svc.base).toBe(1); // 仅 default 提供的键保留
    // provenance 四层齐全且各层 present
    const presentLayers = m.provenance.filter((l) => l.present).map((l) => l.layer);
    expect(presentLayers).toContain('default');
    expect(presentLayers).toContain('industry');
    expect(presentLayers).toContain('customer');
    expect(presentLayers).toContain('workspace');
    // resolveCustomerConfig 与 mountCustomerConfig 同契约（接线入口别名）
    const r = await resolveCustomerConfig('org-full', { roots: rootsOf() });
    expect((r.config.svc as Record<string, unknown>).key).toBe('workspace');
    expect(r.orgId).toBe('org-full');
  });

  it('broken 包 mount 降级：degraded + broken 原因 + default 层兜底不抛', async () => {
    const m = await mountCustomerConfig('org-broken', {
      roots: rootsOf(),
      defaultLayer: { fallback: true },
    });
    expect(m.degraded).toBe(true);
    expect(m.broken).toBeTruthy();
    expect(m.config).toEqual({ fallback: true });
    // 坏 YAML 包同样降级（broken 原因透传，不让单客户坏包拖垮进程）
    const bad = await mountCustomerConfig('org-badyaml', { roots: rootsOf() });
    expect(bad.degraded).toBe(true);
    expect(bad.broken).toBeTruthy();
  });
});

describe('D599 customer-config-package: leakedGlobalConfig 审计（决策点 3）', () => {
  it('进程级全局键与原型污染键上报（路径 + kind），干净配置返回空', () => {
    // 计算键构造名为 __proto__ 的 own property（字面量 __proto__: 会误设原型）
    const protoPoison: Record<string, unknown> = JSON.parse('{"__proto__":{}}') as Record<string, unknown>;
    const leaked = leakedGlobalConfig({ process: { env: 1 }, llm: protoPoison });
    expect(leaked.length).toBeGreaterThanOrEqual(2);
    const kinds = leaked.map((e) => e.kind);
    expect(kinds).toContain('reserved-global');
    expect(kinds).toContain('prototype-key');
    const paths = leaked.map((e) => e.path);
    expect(paths).toContain('$.process');
    // 干净配置零泄漏
    expect(leakedGlobalConfig({ diagnosis: { depth: 'deep' }, ok: [1, 2] })).toEqual([]);
    expect(leakedGlobalConfig({})).toEqual([]);
  });

  it('mount 集成审计：泄漏键剥离 + degraded 传播 + 干净键保留', async () => {
    const m = await mountCustomerConfig('org-leak', { roots: rootsOf() });
    expect(m.degraded).toBe(true);
    expect(m.config.process).toBeUndefined(); // 泄漏键被剥离（fail-closed）
    const ok = m.config.ok as Record<string, unknown>;
    expect(ok.v).toBe(1); // 干净键保留
    expect(m.audit.length).toBeGreaterThanOrEqual(1);
    expect(m.audit.some((e) => e.kind === 'reserved-global')).toBe(true);
  });
});
