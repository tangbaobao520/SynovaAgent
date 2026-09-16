/**
 * tests/expert/compute-map-consistency.test.ts — D663: 专家 tools 对齐 compute seam
 *
 * 权威: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章
 *   - §6.9.4 问题域专家 → compute 的 seam 映射（compute-map.yaml = 「专家 tools 重对齐」的具体载体）
 *   - §6.7 P1 部署期「专家 tools 重对齐到 extensions compute（seam 化）」
 *
 * D663 收口两件事（dev doc SYNOVA-IMPL-D663 §3.1）:
 *   ① 删 5 个问题域 manifest.json 的死字段 "tools"——值为 compute-break-even 等无实现
 *      工具名（小写、无 COMPUTE- 前缀、无版本号），且 .tools\b 在 src/l3/expert-dispatcher.ts /
 *      src/agent/expert-router.ts / src/orchestrator/subagent-coordinator.ts 零命中（铁律 37）
 *   ② 建 5 个 expert/{问题域}/compute-map.yaml——computes 复制 manifest.computes（真实 ID）+
 *      edges 复制 manifest.edges（42 边骨架 E-01..E-42 口径，实现时对齐 extensions/ontology/
 *      edge-types 与 edge-consumption-map，不凭记忆）
 *
 * 红线: 只删 tools 不删 computes——computes 是真实 seam（src/agent/expert-router.ts
 * loadExpertManifest 消费 data.computes），删 tools 后 computes 消费不受影响。
 *
 * 接线（dev doc §5）: seam 生产消费（expert-dispatcher 读 compute-map）descope 后续卡，
 * 本测试是本卡唯一消费方——文件存在性 + 内容一致性全部在此锁定。
 *
 * 测试覆盖(>=5):
 * - 5 个 compute-map.yaml 存在
 * - 每个 map 顶层键 = 目录名，且 ∈ 新 6 名问题域专家（第六章 §6.6「专家名禁含 cycle」/§7.4）
 * - computes ⊆ manifest.computes（真实 ID，不造新名）
 * - edges 全部命中 42 边骨架口径（E-01..E-42 格式与范围）
 * - 死 tools 字段零残留（数组形态 regex + 顶层键双断言）
 * - computes 红线：manifest.computes 保留（有声明的问题域非空）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXPERT_DIR = join(import.meta.dirname, '..', '..', 'expert');

/** 新 6 名问题域专家（D650 registry v3.0 口径：5 问题域 + host，第六章 §6.6/§7.4） */
const NEW_DOMAIN_EXPERTS: readonly string[] = [
  'fundamental-efficiency',
  'customer-growth',
  'organizational-capability',
  'technology-foundation',
  'competitive-strategy',
  'host',
];

/** 本卡写集 = 5 个问题域（host 不在写集） */
const SEAM_DOMAINS: readonly string[] = [
  'fundamental-efficiency',
  'customer-growth',
  'organizational-capability',
  'technology-foundation',
  'competitive-strategy',
];

/** manifest.json 中有 computes 声明的问题域（competitive-strategy 极简 manifest 无声明，如实空映射） */
const DOMAINS_WITH_COMPUTES: readonly string[] = [
  'fundamental-efficiency',
  'customer-growth',
  'organizational-capability',
  'technology-foundation',
];

/** compute-map.yaml 顶层结构（§6.9.4 规格：问题域键 + computes + edges 两个列表） */
interface ComputeMap {
  domain: string;
  computes: string[];
  edges: string[];
}

/** expert manifest.json 中与本测试相关的字段 */
interface ExpertManifest {
  name: string;
  computes?: string[];
  edges?: string[];
}

/**
 * 解析 §6.9.4 flow 风格 compute-map.yaml：
 *   {domain}:
 *     computes: [ID, ID, ...]
 *     edges: [E-NN, E-NN, ...]
 * 仅支持本规格固定形态（顶层域键 + 两个单行 flow 列表）；解析不出域键视为格式非法。
 * 契约: @input yaml 全文; @output ComputeMap; @error 域键缺失时抛 Error（测试断言格式合法）
 */
function parseComputeMapYaml(content: string, expectedDomain: string): ComputeMap {
  const lines = content.split(/\r?\n/);
  let domain = '';
  let computes: string[] = [];
  let edges: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;
    const domainMatch = /^([A-Za-z0-9-]+):\s*$/.exec(trimmed);
    if (domainMatch) {
      domain = domainMatch[1];
      continue;
    }
    const listMatch = /^(computes|edges):\s*\[(.*)\]\s*$/.exec(trimmed);
    if (listMatch) {
      const items = listMatch[2]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (listMatch[1] === 'computes') computes = items;
      else edges = items;
    }
  }
  if (domain === '') {
    throw new Error(`compute-map.yaml 缺少顶层问题域键（期望 ${expectedDomain}）`);
  }
  return { domain, computes, edges };
}

function loadComputeMap(domain: string): ComputeMap {
  const path = join(EXPERT_DIR, domain, 'compute-map.yaml');
  const raw = readFileSync(path, 'utf-8');
  return parseComputeMapYaml(raw, domain);
}

function loadManifest(domain: string): ExpertManifest {
  const path = join(EXPERT_DIR, domain, 'manifest.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as ExpertManifest;
}

describe('D663: 专家 tools 对齐 compute seam（第六章 §6.9.4）', () => {
  it('DS2: 5 个问题域 compute-map.yaml 存在', () => {
    for (const domain of SEAM_DOMAINS) {
      const path = join(EXPERT_DIR, domain, 'compute-map.yaml');
      expect(existsSync(path), `${domain}/compute-map.yaml 应存在（§6.9.4 seam 映射载体）`).toBe(true);
    }
  });

  it('每个 map 顶层键 = 目录名，且 ∈ 新 6 名问题域专家（禁 cycle 命名）', () => {
    for (const domain of SEAM_DOMAINS) {
      const map = loadComputeMap(domain);
      expect(map.domain, `${domain}/compute-map.yaml 顶层键应与目录名一致`).toBe(domain);
      expect(NEW_DOMAIN_EXPERTS, `${domain} 应 ∈ 新 6 名问题域专家`).toContain(map.domain);
      expect(map.domain.includes('cycle'), `专家名 "${map.domain}" 含 cycle，违反第六章 §6.6`).toBe(false);
    }
  });

  it('computes ⊆ manifest.computes（真实 ID，不造新名）', () => {
    for (const domain of SEAM_DOMAINS) {
      const map = loadComputeMap(domain);
      const manifest = loadManifest(domain);
      const manifestComputes = manifest.computes ?? [];
      for (const id of map.computes) {
        expect(
          manifestComputes,
          `${domain}: compute-map computes 项 "${id}" 必须在 manifest.computes 中（复制关系，不造新名）`,
        ).toContain(id);
      }
    }
  });

  it('有 computes 声明的问题域：map.computes 非空（seam 载体不得退化为空表）', () => {
    for (const domain of DOMAINS_WITH_COMPUTES) {
      const map = loadComputeMap(domain);
      const manifest = loadManifest(domain);
      expect(
        map.computes.length,
        `${domain}: manifest 声明了 ${manifest.computes?.length ?? 0} 个 computes，map 应如复制非空`,
      ).toBeGreaterThan(0);
      expect(map.computes.length, `${domain}: map.computes 应与 manifest.computes 数量一致（全量复制）`).toBe(
        manifest.computes?.length ?? 0,
      );
    }
  });

  it('edges 全部命中 42 边骨架口径（E-01..E-42，实现时对齐 extensions/ontology 实读）', () => {
    for (const domain of SEAM_DOMAINS) {
      const map = loadComputeMap(domain);
      const manifest = loadManifest(domain);
      for (const edgeId of map.edges) {
        expect(edgeId, `${domain}: 边 ID "${edgeId}" 应匹配 E-NN 格式`).toMatch(/^E-\d{2}$/);
        const n = parseInt(edgeId.slice(2), 10);
        expect(n, `${domain}: 边 ID "${edgeId}" 应在 42 边骨架范围内`).toBeGreaterThanOrEqual(1);
        expect(n, `${domain}: 边 ID "${edgeId}" 应在 42 边骨架范围内`).toBeLessThanOrEqual(42);
      }
      // map.edges 与 manifest.edges 同源复制（有 edges 声明时数量一致）
      if (manifest.edges !== undefined) {
        expect(map.edges.length, `${domain}: map.edges 应与 manifest.edges 数量一致`).toBe(manifest.edges.length);
      }
    }
  });

  it('DS1: 死 tools 字段零残留（数组形态 regex + 顶层键双断言）', () => {
    for (const domain of SEAM_DOMAINS) {
      const path = join(EXPERT_DIR, domain, 'manifest.json');
      const raw = readFileSync(path, 'utf-8');
      expect(raw, `${domain}/manifest.json 不应含数组形态 "tools": [...]（死代码，铁律 37）`).not.toMatch(/"tools"\s*:\s*\[/);
      const manifest: unknown = JSON.parse(raw);
      expect(
        Object.keys(manifest as Record<string, unknown>),
        `${domain}/manifest.json 顶层不应有 tools 键（entryPoints.tools 等嵌套路径引用除外）`,
      ).not.toContain('tools');
    }
  });

  it('红线: 只删 tools 不删 computes——manifest.computes 保留（真实 seam，expert-router 消费）', () => {
    for (const domain of DOMAINS_WITH_COMPUTES) {
      const manifest = loadManifest(domain);
      expect(
        Array.isArray(manifest.computes) && manifest.computes.length > 0,
        `${domain}/manifest.json 的 computes 字段必须保留且非空（真实 seam，禁止连带删除）`,
      ).toBe(true);
    }
  });
});
