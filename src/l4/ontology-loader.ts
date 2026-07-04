/**
 * src/l4/ontology-loader.ts — 本体类型加载器
 *
 * 从 extensions/ontology/resource/*.json + activity/*.json + outcome/*.json + edge-types/*.json 加载类型定义。
 * 动态构建 NODE_VALIDATORS / EDGE_VALIDATORS / EDGE_ENDPOINT_MAP。
 *
 * V4.3.0 — 本体层重建: 从 resource/activity/outcome/edge-types 四目录加载
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

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
  consumed_by_sentinels?: string[];
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
    // 1. 加载新本体实体 (extensions/ontology/resource/ + activity/ + outcome/)
    const nodeTypes: NodeTypeDef[] = [];
    const ENTITY_DIRS = ['resource', 'activity', 'outcome'];
    for (const dir of ENTITY_DIRS) {
      const entities = scanDir<NodeTypeDef>(join(ONTOLOGY_DIR, dir));
      nodeTypes.push(...entities);
    }
    const edgeTypes = scanDir<EdgeTypeDef>(join(ONTOLOGY_DIR, 'edge-types'));

    // 2. 加载行业扩展类型 (extensions/industries/{name}/edge-types/)
    // 注意: 行业模板使用新实体 ID 空间，不读旧 node-types/ 目录
    const INDUSTRIES_DIR = join(process.cwd(), 'extensions', 'industries');
    if (existsSync(INDUSTRIES_DIR)) {
      const industryDirs = readdirSync(INDUSTRIES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);
      for (const dir of industryDirs) {
        const indEdgeTypes = scanDir<EdgeTypeDef>(join(INDUSTRIES_DIR, dir, 'edge-types'));
        edgeTypes.push(...indEdgeTypes);
      }
    }

    // 3. 从 edgeTypes 动态构建 EDGE_ENDPOINT_MAP
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
