/**
 * services/solution-generator.ts — 方案生成引擎 (Phase 3.4)
 *
 * 诊断完成后，从 recommendations + sentinelIds 生成落地解决方案包。
 * 写入 AgentMemoryStore (type=implementation_plan)。
 * 支持将方案推送通知给对接人（Electron 通知 + 邮件）。
 *
 * 铁律 24+31: 每步独立 try/catch, degraded 传播。
 * 铁律 38: 禁用不安全类型断言。
 */
import { createLogger } from '@synova/logger';
import { matchPatterns } from './pattern-matcher';
import type { ImplementationPattern } from './pattern-matcher';

const log = createLogger('services/solution-generator');

// ═══ 类型定义 ═══

export type SolutionStatus = string;

/** 合法的方案状态值（运行时校验用） */
export const VALID_SOLUTION_STATUSES = [
  'draft', 'confirmed', 'executing', 'completed', 'rejected',
] as const;

export interface RecommendationInput {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  expert: string;
}

export interface Skill {
  name: string;
  duration: string;
  owner: string;
}

export interface EstimatedImpact {
  improvement: string;
  timeline: string;
}

export interface SolutionPackage {
  id: string;
  reportId: string;
  teamId: string;
  title: string;
  description: string;
  patternName: string;
  sentinelIds: string[];
  recommendations: RecommendationInput[];
  status: SolutionStatus;
  skills: Skill[];
  prerequisites: string[];
  riskFactors: string[];
  estimatedImpact: EstimatedImpact;
  pushedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ═══ 内部存储 (内存缓存 + AgentMemoryStore 持久化) ═══

const solutionsCache = new Map<string, SolutionPackage>();

async function getMemStore() {
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  return getAgentMemoryStore(getDatabase());
}

function persistSolution(pkg: SolutionPackage): void {
  try {
    getMemStore().then(store => {
      store.remember({
        orgId: pkg.teamId,
        key: `solution_${pkg.id}`,
        value: JSON.stringify(pkg),
        type: 'implementation_plan',
        confidence: 0.9,
        source: 'solution-generator',
        tags: ['implementation_plan', pkg.reportId, pkg.status],
        expiresAt: null,
      });
    }).catch(err => {
      log.warn({ err: (err as Error).message, id: pkg.id }, 'AgentMemoryStore 持久化失败 — degraded');
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, '持久化方案异常 — degraded');
  }
}

function restoreFromMemStore(teamId: string, reportId: string): void {
  try {
    getMemStore().then(store => {
      const records = store.list({ orgId: teamId, tags: ['implementation_plan', reportId] });
      for (const entry of records) {
        try {
          const pkg = JSON.parse(entry.value) as SolutionPackage;
          if (pkg.id && !solutionsCache.has(pkg.id)) {
            solutionsCache.set(pkg.id, pkg);
          }
        } catch { /* skip corrupt */ }
      }
    }).catch(() => { /* AgentMemoryStore 不可用 — 仅内存 */ });
  } catch { /* 静默降级 */ }
}

// ═══ 核心函数 ═══

/**
 * 从诊断报告生成方案包。
 * 匹配 implementation patterns → 组装方案 → 写入 AgentMemoryStore。
 */
export async function generateSolutions(
  reportId: string,
  teamId: string,
  recommendations: RecommendationInput[],
  sentinelIds: string[],
): Promise<{ solutions: SolutionPackage[]; degraded: boolean }> {
  const solutions: SolutionPackage[] = [];
  let degraded = false;

  try {
    // 1. 匹配落地模式
    const patterns: ImplementationPattern[] = [];
    try {
      const matched = matchPatterns(sentinelIds);
      patterns.push(...matched);
    } catch (err) {
      log.warn({ err: (err as Error).message }, '模式匹配失败 — degraded');
      degraded = true;
    }

    // 2. 每个匹配模式生成一个方案包
    const now = new Date().toISOString();

    if (patterns.length === 0) {
      // 无匹配模式时，从 recommendations 直接生成通用方案
      const id = `sol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const title = recommendations.length > 0 ? '综合诊断建议' : '诊断方案';
      const description = recommendations.length > 0
        ? '基于诊断发现生成的综合行动建议'
        : '待补充诊断数据后生成详细方案';
      const pkg: SolutionPackage = {
        id,
        reportId,
        teamId,
        title,
        description,
        patternName: 'general',
        sentinelIds: [...sentinelIds],
        recommendations: [...recommendations],
        status: 'draft',
        skills: [],
        prerequisites: [],
        riskFactors: [],
        estimatedImpact: { improvement: '待评估', timeline: '待评估' },
        pushedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      solutions.push(pkg);
      solutionsCache.set(id, pkg);
      persistSolution(pkg);
    } else {
      for (const pattern of patterns) {
        // 过滤与此模式相关的 recommendations
        const relatedRecs = recommendations.filter(r => {
          // 按 sentinelId 归属的 expert 映射
          return r.expert === 'action' || r.expert === 'org' || r.expert === 'strategy';
        });

        const id = `sol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const pkg: SolutionPackage = {
          id,
          reportId,
          teamId,
          title: pattern.description.slice(0, 60),
          description: pattern.description,
          patternName: pattern.name,
          sentinelIds: [...pattern.sentinelIds],
          recommendations: relatedRecs.length > 0 ? relatedRecs : [...recommendations],
          status: 'draft',
          skills: pattern.skills.map(s => ({ ...s })),
          prerequisites: [...pattern.prerequisites],
          riskFactors: [...pattern.riskFactors],
          estimatedImpact: { ...pattern.estimatedImpact },
          pushedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        solutions.push(pkg);
        solutionsCache.set(id, pkg);
        persistSolution(pkg);
      }
    }

    log.info({ reportId, count: solutions.length, degraded }, '方案生成完成');
    return { solutions, degraded };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, reportId }, '方案生成异常 — degraded');
    return { solutions: [], degraded: true };
  }
}

/**
 * 获取指定报告的方案列表。
 */
export async function getSolutions(
  reportId?: string,
  teamId?: string,
): Promise<{ solutions: SolutionPackage[]; degraded: boolean }> {
  let degraded = false;
  try {
    // 尝试从 AgentMemoryStore 恢复
    if (solutionsCache.size === 0 && teamId && reportId) {
      restoreFromMemStore(teamId, reportId);
    }

    let list = Array.from(solutionsCache.values());
    if (reportId) list = list.filter(s => s.reportId === reportId);
    if (teamId) list = list.filter(s => s.teamId === teamId);
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { solutions: list, degraded };
  } catch (err) {
    log.warn({ err: (err as Error).message }, '获取方案列表失败 — degraded');
    return { solutions: [], degraded: true };
  }
}

/**
 * 获取单个方案详情。
 */
export async function getSolutionById(id: string): Promise<{ solution: SolutionPackage | null; degraded: boolean }> {
  try {
    const pkg = solutionsCache.get(id) || null;
    return { solution: pkg, degraded: false };
  } catch (err) {
    log.warn({ err: (err as Error).message, id }, '获取方案失败 — degraded');
    return { solution: null, degraded: true };
  }
}

/**
 * 更新方案执行状态。
 * 状态流: draft → confirmed → executing → completed | rejected
 */
export async function updateSolutionStatus(
  id: string,
  status: SolutionStatus,
): Promise<{ success: boolean; degraded: boolean }> {
  try {
    const pkg = solutionsCache.get(id);
    if (!pkg) return { success: false, degraded: false };

    // 验证状态流转合法性
    const validTransitions: Record<SolutionStatus, SolutionStatus[]> = {
      draft: ['confirmed'],
      confirmed: ['executing', 'rejected'],
      executing: ['completed', 'rejected'],
      completed: [],
      rejected: [],
    };

    const allowed = validTransitions[pkg.status] || [];
    if (!allowed.includes(status)) {
      log.warn({ from: pkg.status, to: status, id }, '非法状态流转');
      return { success: false, degraded: false };
    }

    pkg.status = status;
    pkg.updatedAt = new Date().toISOString();
    solutionsCache.set(id, pkg);
    persistSolution(pkg);

    log.info({ id, status }, '方案状态已更新');
    return { success: true, degraded: false };
  } catch (err) {
    log.warn({ err: (err as Error).message, id }, '更新状态失败 — degraded');
    return { success: false, degraded: true };
  }
}

/**
 * 推送方案给对接人。
 * 通过 notification registry 分发通知 + 可选邮件。
 */
export async function pushToLiaison(
  solutionId: string,
  channels: string[] = ['electron'],
): Promise<{ pushed: boolean; note: string; degraded: boolean }> {
  let degraded = false;

  try {
    const pkg = solutionsCache.get(solutionId);
    if (!pkg) return { pushed: false, note: '方案不存在', degraded: false };

    // 1. 通过通知分发
    try {
      const { dispatchNotification } = await import('../notifications/registry');
      const result = await dispatchNotification({
        id: `push_${solutionId}_${Date.now()}`,
        orgId: pkg.teamId,
        title: `新方案: ${pkg.title}`,
        description: `诊断报告 ${pkg.reportId} 的落地解决方案已就绪`,
        priority: 'P1',
        targetSystem: channels.includes('electron') ? 'electron' : 'default',
        assignee: 'liaison',
        reportId: pkg.reportId,
        metadata: { solutionId, patternName: pkg.patternName, skills: pkg.skills },
        createdAt: new Date().toISOString(),
      });
      if (result.degraded) degraded = true;
    } catch (err) {
      log.warn({ err: (err as Error).message }, '通知分发失败 — degraded');
      degraded = true;
    }

    // 2. 可选邮件推送
    if (channels.includes('email')) {
      try {
        const { sendEmail } = await import('./email-service');
        const liaisonEmail = process.env.LIAISON_EMAIL;
        if (liaisonEmail) {
          const emailSent = await sendEmail({
            to: liaisonEmail,
            subject: `[Synova] 新方案: ${pkg.title}`,
            text: [
              `诊断报告: ${pkg.reportId}`,
              `方案: ${pkg.title}`,
              `描述: ${pkg.description}`,
              '',
              '技能清单:',
              ...pkg.skills.map(s => `  - ${s.name} (${s.duration}, ${s.owner})`),
              '',
              '前置条件:',
              ...pkg.prerequisites.map(p => `  - ${p}`),
              '',
              '风险因素:',
              ...pkg.riskFactors.map(r => `  - ${r}`),
              '',
              `预期效果: ${pkg.estimatedImpact.improvement}`,
              `时间线: ${pkg.estimatedImpact.timeline}`,
            ].join('\n'),
          });
          if (!emailSent) {
            log.warn('邮件发送失败 — degraded');
            degraded = true;
          }
        }
      } catch (err) {
        log.warn({ err: (err as Error).message }, '邮件推送失败 — degraded');
        degraded = true;
      }
    }

    // 3. 更新推送状态
    pkg.pushedAt = new Date().toISOString();
    pkg.updatedAt = pkg.pushedAt;
    if (pkg.status === 'draft') pkg.status = 'confirmed';
    solutionsCache.set(solutionId, pkg);
    persistSolution(pkg);

    log.info({ solutionId, channels, degraded }, '方案已推送');
    return { pushed: true, note: '方案已推送', degraded };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, solutionId }, '推送方案异常 — degraded');
    return { pushed: false, note: msg, degraded: true };
  }
}
