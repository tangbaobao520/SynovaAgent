/**
 * agent/tool-profiles.ts — Tool Profiles 分级系统 (Era E2)
 *
 * 不同角色有不同的工具权限范围。
 * 对标: OpenClaw Tool Profiles (minimal/coding/messaging/full)
 *
 * 铁律 39: L2 编排层 — 控制工具执行权限。
 */

import { createLogger } from '@synova/logger';

const log = createLogger('agent/tool-profiles');

// ═══ Types ═══

export type ToolProfile = 'minimal' | 'diagnosis' | 'full';

export interface ProfileConfig {
  /** 允许的工具名列表 */
  allowedTools: string[];
  /** 最大工具调用轮次 */
  maxRounds: number;
  /** 允许的 ToolGuardrails 级别 */
  guardLevel: 'strict' | 'moderate' | 'permissive';
}

// ═══ Tool Profiles ═══

export const TOOL_PROFILES: Record<ToolProfile, ProfileConfig> = {
  minimal: {
    allowedTools: [
      'web_search',
      'web_fetch',
      'query_ontology',
      'list_sessions',
      'read_document',
      'cross_validate',
      'query_graph',
    ],
    maxRounds: 1,
    guardLevel: 'strict',
  },
  diagnosis: {
    allowedTools: [
      // 内置诊断工具
      'query_ontology',
      'show_diagnosis_progress',
      'explain_finding',
      'list_sessions',
      'read_document',
      'schedule_task',
      'list_scheduled_tasks',
      'install_skill',
      'cross_validate',
      'query_graph',
      'fetch_memory_detail',
      'add_memory',
      // 领域专家工具 (全部)
      'ACCURACY_TOOLS',
      'ORG_EXPERT_TOOLS',
      'TECH_EXPERT_TOOLS',
      'STRATEGY_EXPERT_TOOLS',
      'FINANCE_EXPERT_TOOLS',
      'ACTION_EXPERT_TOOLS',
      'MARKETING_EXPERT_TOOLS',
    ],
    maxRounds: 3,
    guardLevel: 'moderate',
  },
  full: {
    allowedTools: ['*'], // 全部工具
    maxRounds: 10,
    guardLevel: 'permissive',
  },
};

/**
 * 根据角色获取工具配置。
 * admin → full, FDE → diagnosis, employee → minimal
 */
export function getProfileForRole(role: string): ProfileConfig {
  switch (role) {
    case 'admin':
      return TOOL_PROFILES.full;
    case 'FDE':
    case 'manager':
      return TOOL_PROFILES.diagnosis;
    case 'employee':
    case 'viewer':
    default:
      return TOOL_PROFILES.minimal;
  }
}

/**
 * 根据 Profile 过滤可用的工具列表。
 * @param tools — 注册表中的所有工具
 * @param profile — 当前角色的 Profile
 * @returns 过滤后的工具列表
 */
export function filterToolsByProfile(
  tools: string[],
  profile: ProfileConfig,
): string[] {
  if (profile.allowedTools.includes('*')) return tools;

  return tools.filter(t => profile.allowedTools.includes(t));
}

/**
 * 从角色字符串获取 guardLevel。
 */
export function getGuardLevelForRole(role: string): 'strict' | 'moderate' | 'permissive' {
  return getProfileForRole(role).guardLevel;
}
