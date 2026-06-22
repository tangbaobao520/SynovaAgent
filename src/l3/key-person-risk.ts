/**
 * key-person-risk.ts — 关键人风险哨兵 (L3)
 *
 * 端到端切片验证。不 import engine-core。不直接查 SQLite。
 * 通过 L4 GraphStore 接口查询 Person 节点，计算 Bus Factor。
 *
 * 注意: 哨兵内部类型 (PersonInfo/RiskEntry) 非本体类型定义。
 * 本体类型通过 extensions/ontology/ manifest.json 定义。
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';
import type { SentinelFinding } from '../sentinel/types';

const log = createLogger('l3/key-person-risk');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

interface PersonInfo {
  id: string; name: string; teamId: string;
  knowledgeDomains: string[]; role?: string;
}

interface RiskEntry {
  personId: string; personName: string; busFactor: number;
  orphanedDomains: string[]; riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface KeyPersonRiskResult {
  findings: SentinelFinding[];
  assessments: RiskEntry[];
}

function parseDomains(props: Record<string, unknown>): string[] {
  if (Array.isArray(props.knowledge)) return props.knowledge.filter((k): k is string => typeof k === 'string');
  if (Array.isArray(props.domains)) return props.domains.filter((d): d is string => typeof d === 'string');
  if (typeof props.skills === 'string') return props.skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function extractPersons(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>): PersonInfo[] {
  return nodes.filter(n => n.type === 'Person').map(n => ({
    id: n.id, name: (n.props.name as string) || 'Unknown',
    teamId: (n.props.teamId as string) || 'default',
    knowledgeDomains: parseDomains(n.props), role: n.props.role as string | undefined,
  }));
}

export function computeBusFactor(persons: PersonInfo[]): RiskEntry[] {
  const owners = new Map<string, string[]>();
  for (const p of persons) for (const d of p.knowledgeDomains) {
    if (!owners.has(d)) owners.set(d, []);
    owners.get(d)!.push(p.id);
  }
  return persons.map(p => {
    const orphaned = p.knowledgeDomains.filter(d => (owners.get(d) || []).length === 1);
    const total = p.knowledgeDomains.length;
    const bf = total === 0 ? 99 : total - orphaned.length + 1;
    return { personId: p.id, personName: p.name, busFactor: bf, orphanedDomains: orphaned,
      riskLevel: orphaned.length >= 3 ? 'critical' : orphaned.length >= 2 ? 'high' : orphaned.length >= 1 ? 'medium' : 'low' };
  });
}

export function checkKeyPersonRisk(store: GraphStoreReader, teamId: string): KeyPersonRiskResult {
  try {
    const nodes = store.queryNodes('Person', { teamId });
    const persons = extractPersons(nodes);
    if (persons.length === 0) return { findings: [], assessments: [] };
    const assessments = computeBusFactor(persons);
    const atRisk = assessments.filter(a => a.riskLevel === 'critical' || a.riskLevel === 'high');
    const findings: SentinelFinding[] = atRisk.map(a => ({
      id: `kpr_${a.personId}`, severity: a.riskLevel === 'critical' ? 'critical' : 'warning',
      title: `关键人: ${a.personName}`,
      description: `${a.personName} 独占 ${a.orphanedDomains.length} 个领域: ${a.orphanedDomains.join(', ')}。Bus Factor=${a.busFactor}`,
      evidence: a.orphanedDomains.map(d => `独占: ${d}`),
      suggestion: a.orphanedDomains.length > 0 ? `为 ${a.orphanedDomains.join(', ')} 安排备份` : '定期审查',
      detectedAt: new Date().toISOString(),
    }));
    if (findings.length > 0) log.info({ teamId, atRisk: atRisk.length }, '关键人风险完成');
    return { findings, assessments };
  } catch (err: unknown) {
    log.warn({ err, teamId }, '关键人风险失败 — degraded');
    return { findings: [], assessments: [] };
  }
}

export function formatRiskForLLM(result: KeyPersonRiskResult): string {
  if (result.assessments.length === 0) return '暂无关键人风险数据。';
  const atRisk = result.assessments.filter(a => a.riskLevel !== 'low');
  if (atRisk.length === 0) return '关键人风险在可接受范围内。';
  const lines = ['## 关键人风险分析\n'];
  for (const a of atRisk) lines.push(`- ${a.personName}: Bus Factor ${a.busFactor}, 独占: ${a.orphanedDomains.join(', ') || '无'}`);
  lines.push(`\n共 ${atRisk.length} 人需关注。`);
  return lines.join('\n');
}
