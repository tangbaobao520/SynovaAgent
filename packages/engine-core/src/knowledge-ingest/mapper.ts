/**
 * knowledge-ingest/mapper.ts — Phase K3: AmmoEntry → Agent 分拣
 *
 * 基于关键词匹配自动将知识条目分配给最相关的 Agent。
 * 分配策略三档：直接分配 / 分配+进共享库 / 仅共享库。
 */

import type { KnowledgeAmmoEntry } from './refiner';

export interface AgentKnowledgeAssignment {
  agentName: string;
  entries: KnowledgeAmmoEntry[];
  score: number; // 平均匹配分
}

export interface KnowledgeDistributionResult {
  agentAssignments: AgentKnowledgeAssignment[];
  sharedLibrary: KnowledgeAmmoEntry[];
  unassigned: KnowledgeAmmoEntry[];
}

export function distributeKnowledge(
  entries: KnowledgeAmmoEntry[],
  agents: Array<{
    name: string;
    role: string;
    description: string;
    responsibilities?: string[];
    skillsRequired?: string[];
  }>,
): KnowledgeDistributionResult {
  const assignments = new Map<string, { entries: KnowledgeAmmoEntry[]; scores: number[] }>();

  for (const agent of agents) {
    assignments.set(agent.name, { entries: [], scores: [] });
  }

  const shared: KnowledgeAmmoEntry[] = [];
  const unassigned: KnowledgeAmmoEntry[] = [];

  for (const entry of entries) {
    let bestAgent: string | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      const score = computeMatchScore(entry, agent);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent.name;
      }
    }

    if (bestScore >= 0.5 && bestAgent) {
      // 高分 → 直接分配
      const a = assignments.get(bestAgent)!;
      a.entries.push(entry);
      a.scores.push(bestScore);
    } else if (bestScore >= 0.3 && bestAgent) {
      // 中分 → 分配 + 共享
      const a = assignments.get(bestAgent)!;
      a.entries.push(entry);
      a.scores.push(bestScore);
      shared.push(entry);
    } else {
      // 低分 → 仅共享
      shared.push(entry);
    }
  }

  const agentAssignments: AgentKnowledgeAssignment[] = agents
    .map(a => {
      const data = assignments.get(a.name)!;
      return {
        agentName: a.name,
        entries: data.entries,
        score: data.scores.length > 0
          ? data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
          : 0,
      };
    })
    .filter(a => a.entries.length > 0);

  return { agentAssignments, sharedLibrary: shared, unassigned };
}

function computeMatchScore(
  entry: KnowledgeAmmoEntry,
  agent: { name: string; role: string; description: string; responsibilities?: string[]; skillsRequired?: string[] },
): number {
  if (entry.keywords.length === 0) return 0;

  const agentName = agent.name.toLowerCase();
  const agentRole = agent.role.toLowerCase();
  const agentDesc = agent.description.toLowerCase();
  const respText = (agent.responsibilities || []).join(' ').toLowerCase();
  const skillsText = (agent.skillsRequired || []).join(' ').toLowerCase();

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const kw of entry.keywords) {
    const kwLower = kw.toLowerCase();
    totalWeight += 1;

    // 角色名/职责是最强信号（权重 1.0）
    if (agentName.includes(kwLower) || agentRole.includes(kwLower)) {
      matchedWeight += 1.0;
      continue;
    }

    // 职责描述（权重 0.8）
    if (respText.includes(kwLower)) {
      matchedWeight += 0.8;
      continue;
    }

    // 技能要求（权重 0.5）
    if (skillsText.includes(kwLower)) {
      matchedWeight += 0.5;
      continue;
    }

    // 描述文本（权重 0.3）
    if (agentDesc.includes(kwLower)) {
      matchedWeight += 0.3;
    }
  }

  // 文件名包含角色名 → 额外加成，但不单独计为 keyword
  if (entry.sourceFileName.toLowerCase().includes(agentName)) {
    totalWeight += 1;
    matchedWeight += 0.8;
  }

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}
