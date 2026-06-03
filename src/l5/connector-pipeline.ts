/**
 * l5/connector-pipeline.ts — L5 完整数据管线
 *
 * Python 连接器 → PythonBridge → OntologyEvent[] → OntologyEventBus → GraphStore
 * 从"三层代码零层打通"到"一条完整的数据通路"。
 */
import { getPythonBridge } from '../providers/python-bridge';
import { getOntologyEventBus } from './ontology-event-bus';
import type { OntologyEvent } from './ontology-event-bus';
import { createLogger } from '../logger';

const log = createLogger('l5/connector-pipeline');

export interface PipelineResult {
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
  degraded: boolean;
  durationMs: number;
}

/**
 * Run the full pipeline: Python connector → SOG events → GraphStore
 *
 * @param module Python module name (e.g. 'connectors.feishu')
 * @param orgId Organization ID for multi-tenant isolation
 * @param credentials Connector credentials (encrypted at rest, decrypted for subprocess)
 */
export async function runConnectorPipeline(
  module: string,
  orgId: string,
  credentials: Record<string, string>,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const result: PipelineResult = { nodesCreated: 0, edgesCreated: 0, errors: [], degraded: false, durationMs: 0 };

  try {
    const bridge = getPythonBridge();
    const eventBus = getOntologyEventBus();

    // Step 1: Python connector → fetch data → SOG mapper → OntologyEvent[]
    const events = await bridge.run<OntologyEvent[]>(
      `connectors.${module}`,
      `connector_${module}_read`,
      { ...credentials, orgId },
    );

    // Step 2: OntologyEventBus → GraphStore
    for (const event of events) {
      if (event.type === 'node_created') result.nodesCreated++;
      else if (event.type === 'edge_created') result.edgesCreated++;
    }

    await eventBus.batchPublish(events);
    const health = eventBus.health();

    if (health.status === 'degraded' || health.status === 'unhealthy') {
      result.degraded = true;
      result.errors.push(`EventBus health: ${health.status}`);
    }

    log.info({ module, orgId, nodes: result.nodesCreated, edges: result.edgesCreated, degraded: result.degraded },
      '连接器管线完成');
  } catch (err: any) {
    result.degraded = true;
    result.errors.push(err.message);
    log.warn({ err, module, orgId }, '连接器管线失败');
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Run pipeline via cron — scheduled connector sync
 * Returns degraded status for monitoring
 */
export async function scheduledConnectorSync(
  module: string,
  orgId: string,
  credentials: Record<string, string>,
): Promise<{ ok: boolean; degraded: boolean }> {
  const result = await runConnectorPipeline(module, orgId, credentials);
  return { ok: !result.degraded, degraded: result.degraded };
}
