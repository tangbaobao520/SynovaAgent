/**
 * evolution/l0-adaptation.ts — L0 本体自适应 (Phase 4.1a)
 *
 * 诊断结果 → ontologyPatches → 本体自动更新 (新节点/边、属性修正)
 * 参考: engine-core evolution/ 模块
 */
import { createLogger } from '../logger';

const log = createLogger('evolution/l0');

export interface OntologyPatch {
  action: 'create' | 'update' | 'delete';
  nodeType?: string;
  edgeType?: string;
  from?: string;
  to?: string;
  props?: Record<string, unknown>;
  evidence?: string;
  confidence?: number;
}

export interface DiagnosisResult {
  findings: Array<{
    type: string;
    entity: string;
    confidence: number;
    dimension: string;
  }>;
  orgId: string;
}

/**
 * Generate ontology patches from diagnosis findings.
 * Only high-confidence (>=0.7) findings trigger patches.
 */
export function generateOntologyPatches(result: DiagnosisResult): OntologyPatch[] {
  const patches: OntologyPatch[] = [];

  for (const finding of result.findings) {
    if (finding.confidence < 0.7) continue;

    patches.push({
      action: 'create',
      nodeType: finding.type,
      props: { name: finding.entity, dimension: finding.dimension },
      evidence: `诊断发现: ${finding.type}=${finding.entity} (${finding.dimension}, 置信度=${finding.confidence})`,
      confidence: finding.confidence,
    });

    log.debug({ type: finding.type, entity: finding.entity }, 'L0: 本体补丁生成');
  }

  return patches;
}

/**
 * Apply ontology patches to GraphStore.
 * Requires engine-core GraphStore — loaded dynamically.
 */
export async function applyOntologyPatches(
  orgId: string,
  patches: OntologyPatch[],
): Promise<{ applied: number; errors: number }> {
  let applied = 0;
  let errors = 0;

  try {
    // 铁律 39: 通过 adapter 获取 GraphStore
    const { EngineCoreVendorAdapter } = await import('../adapters/engine-core-adapter');
    const { SOGNodeType } = await import('@synova/sog-core');
    const { getDatabase } = await import('../init/engine-context');
    const db = getDatabase();
    const store = await EngineCoreVendorAdapter.createGraphStore(db) as Record<string, unknown>;

    for (const patch of patches) {
      try {
        if (patch.action === 'create' && patch.nodeType) {
          // Map string type to SOGNodeType enum
          const nodeType = (SOGNodeType as Record<string, string>)[patch.nodeType.toUpperCase()] || patch.nodeType;
          store.createNode(nodeType, patch.props || {}, orgId);
          applied++;
        }
      } catch (err: any) {
        log.warn({ err, patch }, 'L0: 补丁应用失败');
        errors++;
      }
    }
  } catch (err: any) {
    log.warn({ err }, 'L0: engine-core 不可用，跳过本体更新');
    errors = patches.length;
  }

  log.info({ applied, errors, totalPatches: patches.length }, 'L0: 本体更新完成');
  return { applied, errors };
}
