/**
 * seven-powers/computes/score.ts — 7Powers 竞争壁垒评估
 *
 * 理论依据: Hamilton Helmer "7 Powers" 框架。
 * 7 种竞争壁垒：
 *   1. 规模经济 (Scale Economies) — 单位成本随产量下降
 *   2. 网络效应 (Network Effects) — 价值随用户量增长
 *   3. 反向定位 (Counter-Positioning) — 独特定位难以复制
 *   4. 转换成本 (Switching Costs) — 用户切换成本高
 *   5. 品牌 (Branding) — 品牌认知和溢价
 *   6. 流程优势 (Process Power) — 独特高效的运营流程
 *   7. 资源垄断 (Cornered Resources) — 独占关键资源
 *
 * 参考: packages/engine-core/src/pipeline/diagnosis/seven-powers.ts
 */

export interface SevenPowersResult {
  value: number;       // 0-1, 综合壁垒强度
  threshold: 'ok' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
}

interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}

const POWERS = [
  'scale_economies', 'network_effects', 'counter_positioning',
  'switching_costs', 'branding', 'process_power', 'cornered_resources',
];

export async function computeSevenPowers(
  store: GraphStoreLike,
  _orgId: string,
): Promise<SevenPowersResult> {
  try {
    const nodes = await store.queryNodes().catch(() => []);
    const edges = await store.queryEdges().catch(() => []);

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        value: 0.5,
        threshold: 'warning',
        metadata: {
          degraded: true,
          reason: 'no graph data available',
          nodeCount: 0,
          edgeCount: 0,
        },
      };
    }

    // Score each power based on available graph evidence
    const powerScores: Record<string, number> = {};
    const powerEvidence: Record<string, string[]> = {};

    for (const power of POWERS) {
      const evidenceEdges = edges.filter((e: Record<string, unknown>) =>
        (e.type as string)?.toLowerCase() === power ||
        (e.power_type as string)?.toLowerCase() === power
      );
      const evidenceNodes = nodes.filter((n: Record<string, unknown>) =>
        (n.power_type as string)?.toLowerCase() === power
      );
      const evidence: string[] = [];
      let score = 0;

      for (const e of evidenceEdges) {
        const weight = e.weight as number ?? e.strength as number ?? 0.5;
        score += weight;
        evidence.push(`edge:${e.type || 'unknown'}=${weight}`);
      }
      for (const n of evidenceNodes) {
        const val = n.strength as number ?? n.score as number ?? 0.5;
        score += val;
        evidence.push(`node:${(n.name || n.id) as string}=${val}`);
      }

      const totalEvidence = evidenceEdges.length + evidenceNodes.length;
      powerScores[power] = totalEvidence > 0
        ? Math.min(score / totalEvidence, 1)
        : 0;
      powerEvidence[power] = evidence;
    }

    const avgScore = POWERS.reduce((s, p) => s + (powerScores[p] || 0), 0) / POWERS.length;

    const threshold: 'ok' | 'warning' | 'critical' =
      avgScore >= 0.5 ? 'ok'
      : avgScore >= 0.25 ? 'warning'
      : 'critical';

    return {
      value: Math.round(avgScore * 100) / 100,
      threshold,
      metadata: {
        powerScores,
        evidenceCounts: Object.fromEntries(
          POWERS.map(p => [p, powerEvidence[p]?.length || 0])
        ),
        strongestPower: POWERS.reduce((a, b) =>
          (powerScores[a] || 0) >= (powerScores[b] || 0) ? a : b
        ),
        weakestPower: POWERS.reduce((a, b) =>
          (powerScores[a] || 0) <= (powerScores[b] || 0) ? a : b
        ),
      },
    };
  } catch (err) {
    return {
      value: 0,
      threshold: 'critical',
      metadata: { degraded: true, error: String(err) },
    };
  }
}
