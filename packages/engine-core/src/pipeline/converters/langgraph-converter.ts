/**
 * converters/langgraph-converter.ts — Synova.yml → LangGraph JSON 转换器
 *
 * 将 Synova 团队蓝图转换为 LangGraph StateGraph 配置，让用户在不依赖
 * OpenClaw Gateway 的环境中至少能导入团队结构和协作拓扑。
 *
 * 映射规则：
 *   Synova.team.roles[]        → LangGraph nodes (AgentState nodes)
 *   Synova.team.roles[].skills → LangGraph tools
 *   Synova.team.protocol       → LangGraph edges + config
 *   Synova.role.genome         → LangGraph node system_prompt
 *
 * 输出兼容 LangGraph Python SDK (langgraph>=0.2.0)。
 */

import type { SynovaYml, SynovaRole, SynovaSkill } from '../synova-yml-serializer';

// ================================================================
// 输出类型
// ================================================================

export interface LangGraphNode {
  id: string;
  type: 'agent' | 'tool' | 'human';
  label: string;
  systemPrompt: string;
  tools: string[];
  metadata: {
    governanceLayer: number;
    cognitiveMode: string;
    decisionStyle: string;
    antiPatterns: string[];
  };
}

export interface LangGraphEdge {
  source: string;
  target: string;
  condition: string | null;
  label: string;
  weight: number;
}

export interface LangGraphTool {
  name: string;
  description: string;
  category: string;
  steps: string[];
  requiresApproval: string[];
}

export interface LangGraphConfig {
  schemaVersion: string;
  graphName: string;
  description: string;
  nodes: LangGraphNode[];
  edges: LangGraphEdge[];
  tools: LangGraphTool[];
  state: {
    channels: string[];
    sharedKeys: string[];
  };
  entryPoint: string;
  config: {
    mode: string;
    topology: string;
    authorityGovernance: string;
    maxIterations: number;
    approvalChain: string[];
  };
}

// ================================================================
// 主转换入口
// ================================================================

export function synovaToLangGraph(yml: SynovaYml): LangGraphConfig {
  const nodes = buildNodes(yml.team.roles);
  const tools = buildTools(yml.team.roles);
  const edges = buildEdges(yml);
  const entryPoint = findEntryPoint(yml.team.roles);

  return {
    schemaVersion: '1.0',
    graphName: yml.synova.metadata.name || yml.task.summary.slice(0, 60),
    description: yml.synova.metadata.description || yml.task.summary,
    nodes,
    edges,
    tools,
    state: {
      channels: ['messages', 'task_context', 'shared_memory'],
      sharedKeys: ['current_task', 'decisions_log', 'team_context'],
    },
    entryPoint,
    config: {
      mode: yml.team.protocol.mode,
      topology: inferTopology(yml),
      authorityGovernance: yml.team.protocol.authorityGovernance,
      maxIterations: 20,
      approvalChain: yml.team.protocol.safetyBaselines || [],
    },
  };
}

// ================================================================
// Nodes
// ================================================================

function buildNodes(roles: SynovaRole[]): LangGraphNode[] {
  return roles.map((role, index) => {
    const genome = role.genome;
    const sysPrompt = buildSystemPrompt(role);

    return {
      id: role.id,
      type: 'agent' as const,
      label: role.name,
      systemPrompt: sysPrompt,
      tools: role.skills.map((s) => s.name),
      metadata: {
        governanceLayer: inferGovernanceLayer(role, index, roles.length),
        cognitiveMode: genome.cognitiveProfile.primaryMode,
        decisionStyle: genome.cognitiveProfile.decisionStyle,
        antiPatterns: genome.antiPatterns,
      },
    };
  });
}

function buildSystemPrompt(role: SynovaRole): string {
  const g = role.genome;
  const lines = [
    `You are ${role.name} (${role.title || role.id}).`,
    '',
    '## Cognitive Profile',
    `- Primary mode: ${g.cognitiveProfile.primaryMode}`,
    `- Decision style: ${g.cognitiveProfile.decisionStyle}`,
    `- Communication: ${g.expressionDNA.communicationStyle}`,
    `- Proactiveness: ${(g.expressionDNA.proactiveness * 100).toFixed(0)}%`,
    `- Detail orientation: ${(g.expressionDNA.detailOrientation * 100).toFixed(0)}%`,
  ];

  if (g.mentalModels.length > 0) {
    lines.push('', '## Mental Models');
    for (const m of g.mentalModels) {
      lines.push(`- **${m.name}** (${m.source}): ${m.application}`);
      if (m.limitation) lines.push(`  Limitation: ${m.limitation}`);
    }
  }

  if (g.antiPatterns.length > 0) {
    lines.push('', '## Anti-Patterns (NEVER do)');
    for (const ap of g.antiPatterns) {
      lines.push(`- ${ap}`);
    }
  }

  if (g.cognitiveProfile.biasVulnerabilities?.length) {
    lines.push('', '## Bias Vulnerabilities');
    for (const bv of g.cognitiveProfile.biasVulnerabilities) {
      lines.push(`- ${bv}`);
    }
  }

  lines.push('', '## Skills');
  for (const skill of role.skills) {
    lines.push(`- **${skill.name}** (${skill.category})`);
    if (skill.steps.length > 0) {
      lines.push(`  Steps: ${skill.steps.map((s, i) => `${i + 1}. ${s}`).join(' | ')}`);
    }
  }

  lines.push('', '## Rules', '- Always respond in character as ' + role.name);
  lines.push('- Flag uncertainty explicitly — never fabricate data or sources');
  lines.push('- Escalate decisions matching the approval chain to a human');

  return lines.join('\n');
}

function inferGovernanceLayer(role: SynovaRole, index: number, total: number): number {
  // 基于角色在列表中的位置和名称推断治理层级
  const name = (role.name + role.id).toLowerCase();
  if (/战略|决策|ceo|director|exec|board|govern/i.test(name)) return 3;
  if (/管理|协调|orchestrat|manager|lead/i.test(name)) return 2;
  if (/执行|开发|运营|design|dev|ops/i.test(name)) return 1;
  // 默认：第一个=3 (strategy), 中间=2, 最后=1
  if (index === 0) return 3;
  if (index === total - 1) return 1;
  return 2;
}

// ================================================================
// Tools
// ================================================================

function buildTools(roles: SynovaRole[]): LangGraphTool[] {
  const seen = new Set<string>();
  const tools: LangGraphTool[] = [];

  for (const role of roles) {
    for (const skill of role.skills) {
      const key = `${role.id}:${skill.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      tools.push({
        name: skill.name,
        description: `${role.name}: ${skill.category}`,
        category: skill.category,
        steps: skill.steps,
        requiresApproval: skill.approvalRequired || [],
      });
    }
  }

  return tools;
}

// ================================================================
// Edges — 基于协议拓扑推导
// ================================================================

function buildEdges(yml: SynovaYml): LangGraphEdge[] {
  const roles = yml.team.roles;
  const topology = inferTopology(yml);

  switch (topology) {
    case 'star':
      return buildStarEdges(roles);
    case 'chain':
      return buildChainEdges(roles);
    case 'full_mesh':
      return buildFullMeshEdges(roles);
    case 'hierarchical':
      return buildHierarchicalEdges(roles);
    default:
      return buildFullMeshEdges(roles); // 默认全连接
  }
}

function inferTopology(yml: SynovaYml): string {
  const mode = yml.team.protocol.mode;
  const powerDist = yml.team.protocol.authorityGovernance;

  // 从协作模式推断拓扑
  if (mode === 'iron_captain' || mode === 'bytedance_flat') return 'star';
  if (mode === 'loose_federation') return 'chain';
  if (mode === 'democratic_council') return 'full_mesh';
  if (mode === 'cross_check_balance') return 'full_mesh';
  if (mode === 'haier_ren_dan_he_yi' || mode === 'haidilao_frontline_auth') return 'hierarchical';
  if (mode === 'mckinsey_partnership') return 'full_mesh';
  if (mode === 'tencent_internal_race') return 'star';

  // 从权力分布推断
  if (powerDist === 'hierarchical' || powerDist === 'centralized') return 'star';
  return 'full_mesh';
}

function buildStarEdges(roles: SynovaRole[]): LangGraphEdge[] {
  if (roles.length < 2) return [];
  const center = roles[0]; // 第一个角色为中心节点
  const edges: LangGraphEdge[] = [];

  for (let i = 1; i < roles.length; i++) {
    // 中心 → 外围
    edges.push({
      source: center.id,
      target: roles[i].id,
      condition: null,
      label: `delegate to ${roles[i].name}`,
      weight: 0.8,
    });
    // 外围 → 中心
    edges.push({
      source: roles[i].id,
      target: center.id,
      condition: 'requires_approval_or_escalation',
      label: `report to ${center.name}`,
      weight: 0.6,
    });
  }

  return edges;
}

function buildChainEdges(roles: SynovaRole[]): LangGraphEdge[] {
  const edges: LangGraphEdge[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    edges.push({
      source: roles[i].id,
      target: roles[i + 1].id,
      condition: null,
      label: `pass to ${roles[i + 1].name}`,
      weight: 0.7,
    });
    // 逆向边（反馈）
    edges.push({
      source: roles[i + 1].id,
      target: roles[i].id,
      condition: null,
      label: `feedback to ${roles[i].name}`,
      weight: 0.3,
    });
  }
  return edges;
}

function buildFullMeshEdges(roles: SynovaRole[]): LangGraphEdge[] {
  const edges: LangGraphEdge[] = [];
  for (const source of roles) {
    for (const target of roles) {
      if (source.id === target.id) continue;
      edges.push({
        source: source.id,
        target: target.id,
        condition: null,
        label: `${source.name} → ${target.name}`,
        weight: 1.0 / (roles.length - 1),
      });
    }
  }
  return edges;
}

function buildHierarchicalEdges(roles: SynovaRole[]): LangGraphEdge[] {
  const edges: LangGraphEdge[] = [];
  const layers = new Map<number, SynovaRole[]>();

  for (const role of roles) {
    const layer = inferGovernanceLayer(role, roles.indexOf(role), roles.length);
    const list = layers.get(layer) || [];
    list.push(role);
    layers.set(layer, list);
  }

  const sortedLayers = [...layers.keys()].sort((a, b) => b - a); // 高层→低层

  for (let i = 0; i < sortedLayers.length; i++) {
    const upperRoles = layers.get(sortedLayers[i]) || [];
    for (let j = i + 1; j < sortedLayers.length; j++) {
      const lowerRoles = layers.get(sortedLayers[j]) || [];
      for (const upper of upperRoles) {
        for (const lower of lowerRoles) {
          edges.push({
            source: upper.id,
            target: lower.id,
            condition: 'delegation_or_instruction',
            label: `${upper.name} → ${lower.name}`,
            weight: 0.7,
          });
          edges.push({
            source: lower.id,
            target: upper.id,
            condition: 'escalation_or_report',
            label: `${lower.name} → ${upper.name}`,
            weight: 0.4,
          });
        }
      }
    }
  }

  // 同层之间也可协作
  for (const [, sameLayerRoles] of layers) {
    for (const source of sameLayerRoles) {
      for (const target of sameLayerRoles) {
        if (source.id === target.id) continue;
        edges.push({
          source: source.id,
          target: target.id,
          condition: 'peer_collaboration',
          label: `${source.name} ↔ ${target.name}`,
          weight: 0.5,
        });
      }
    }
  }

  return edges;
}

// ================================================================
// Entry point
// ================================================================

function findEntryPoint(roles: SynovaRole[]): string {
  // 优先找 orchestrator
  const orch = roles.find((r) => r.id === 'orchestrator' || r.name.includes('Orchestrator'));
  if (orch) return orch.id;

  // 再找 scenario-parser
  const sp = roles.find((r) => r.id === 'scenario-parser' || r.name.includes('Scenario'));
  if (sp) return sp.id;

  // 默认第一个角色
  return roles[0]?.id || 'agent_0';
}

// ================================================================
// 序列化
// ================================================================

export function langGraphToJSON(config: LangGraphConfig): string {
  return JSON.stringify(config, null, 2);
}

export function langGraphToPython(config: LangGraphConfig): string {
  const lines: string[] = [
    '"""',
    `LangGraph StateGraph — ${config.graphName}`,
    `Generated from Synova.yml by ClawOrg converter`,
    `Schema: ${config.schemaVersion}`,
    '"""',
    '',
    'from langgraph.graph import StateGraph, END',
    'from typing import TypedDict, Annotated, Sequence',
    'import operator',
    '',
    '',
    'class AgentState(TypedDict):',
  ];

  for (const ch of config.state.channels) {
    lines.push(`    ${ch}: Annotated[Sequence[str], operator.add]`);
  }

  lines.push('', '');
  lines.push(`# Graph: ${config.graphName}`);
  lines.push(`# Mode: ${config.config.mode} | Topology: ${config.config.topology}`);
  lines.push(`# Nodes: ${config.nodes.length} | Edges: ${config.edges.length} | Tools: ${config.tools.length}`);
  lines.push('');
  lines.push('def build_graph():');
  lines.push(`    """Build the ${config.graphName} StateGraph."""`);
  lines.push('    workflow = StateGraph(AgentState)');
  lines.push('');

  // Nodes
  for (const node of config.nodes) {
    lines.push(`    # Node: ${node.label} (${node.id})`);
    lines.push(`    #   Layer: ${node.metadata.governanceLayer} | Mode: ${node.metadata.cognitiveMode}`);
    lines.push(`    #   Tools: ${node.tools.join(', ')}`);
    lines.push(`    workflow.add_node("${node.id}", ${node.id}_node)`);
    lines.push('');
  }

  // Edges
  for (const edge of config.edges) {
    const cond = edge.condition ? `, condition=${edge.condition}` : '';
    lines.push(`    workflow.add_edge("${edge.source}", "${edge.target}")  # ${edge.label}${cond}`);
  }

  // Entry/exit
  lines.push('');
  lines.push(`    workflow.set_entry_point("${config.entryPoint}")`);
  lines.push('    workflow.add_edge("__end__", END)');
  lines.push('');
  lines.push('    return workflow.compile()');

  return lines.join('\n');
}
