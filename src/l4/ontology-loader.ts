/**
 * src/l4/ontology-loader.ts — 本体类型加载器
 *
 * 从 extensions/ontology/node-types/*.json + edge-types/*.json 加载类型定义。
 * 动态构建 NODE_VALIDATORS / EDGE_VALIDATORS / EDGE_ENDPOINT_MAP。
 * 旧 sog-core-schema.ts 枚举保留为 source of truth。
 *
 * V3.8 Batch 4 — 本体类型文件化
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('l4/ontology-loader');

export interface NodeTypeDef {
  $id: string;
  label: string;
  tags: string[];
  requiredProps: string[];
  optionalProps: Record<string, unknown>;
  description: string;
}

export interface EdgeTypeDef {
  $id: string;
  label: string;
  tags: string[];
  allowedFrom: string[];
  allowedTo: string[];
  requiredProps?: string[];
  optionalProps?: Record<string, unknown>;
  description: string;
}

export interface LoadedOntology {
  nodeTypes: NodeTypeDef[];
  edgeTypes: EdgeTypeDef[];
  /** 从 nodeTypes 动态构建的端点矩阵 */
  edgeEndpointMap: Record<string, { from: string[]; to: string[] }>;
}

const ONTOLOGY_DIR = join(process.cwd(), 'extensions', 'ontology');

// ═══ Cache ═══
let cache: LoadedOntology | null = null;

function readJSON<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch (err: any) {
    // JSON 解析失败 — 跳过损坏文件
    return null;
  }
}

function scanDir<T>(dir: string): T[] {
  const results: T[] = [];
  if (!existsSync(dir)) return results;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const item = readJSON<T>(join(dir, file));
    if (item) results.push(item);
  }
  return results;
}

/**
 * 加载本体类型定义。
 */
export function loadOntology(): { ontology: LoadedOntology; degraded: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cache) return { ontology: cache, degraded: false, errors: [] };

  try {
    const nodeTypes = scanDir<NodeTypeDef>(join(ONTOLOGY_DIR, 'node-types'));
    const edgeTypes = scanDir<EdgeTypeDef>(join(ONTOLOGY_DIR, 'edge-types'));

    // 从 edgeTypes 动态构建 EDGE_ENDPOINT_MAP
    const edgeEndpointMap: Record<string, { from: string[]; to: string[] }> = {};
    for (const e of edgeTypes) {
      edgeEndpointMap[e.label] = {
        from: e.allowedFrom,
        to: e.allowedTo,
      };
    }

    const ontology: LoadedOntology = { nodeTypes, edgeTypes, edgeEndpointMap };
    log.info({ nodes: nodeTypes.length, edges: edgeTypes.length }, '本体类型加载完成');
    cache = ontology;
    return { ontology, degraded: errors.length > 0, errors };
  } catch (err: any) {
    log.error({ err }, '本体类型加载失败 — degraded');
    errors.push(`本体类型加载失败: ${err.message}`);
    return { ontology: { nodeTypes: [], edgeTypes: [], edgeEndpointMap: {} }, degraded: true, errors };
  }
}

/**
 * 按标签查询节点/边类型。
 */
export function getTypesByTags(tags: string[], matchMode: 'any' | 'all' = 'any'): { nodes: NodeTypeDef[]; edges: EdgeTypeDef[] } {
  const { ontology } = loadOntology();
  const matchFn = matchMode === 'all'
    ? (t: string[]) => tags.every(tag => t.includes(tag))
    : (t: string[]) => tags.some(tag => t.includes(tag));

  return {
    nodes: ontology.nodeTypes.filter(n => matchFn(n.tags)),
    edges: ontology.edgeTypes.filter(e => matchFn(e.tags)),
  };
}

/**
 * 验证端点约束。
 */
export function validateEdgeEndpoints(edgeLabel: string, fromLabel: string, toLabel: string): boolean {
  const { ontology } = loadOntology();
  const rule = ontology.edgeEndpointMap[edgeLabel];
  if (!rule) return false;
  return rule.from.includes(fromLabel) && rule.to.includes(toLabel);
}

export function clearOntologyCache(): void {
  cache = null;
}
