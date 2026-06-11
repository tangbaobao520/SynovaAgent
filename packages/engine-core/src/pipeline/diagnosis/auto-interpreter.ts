/**
 * diagnosis/auto-interpreter.ts — FDE 自动解读器
 *
 * 将 FDE 的"拿到报告→消化→翻译成人话"编码为 3 路并行 LLM 调用。
 * CEO / TeamLead / HRBP 三个角色视角，共享同一份结构化诊断摘要。
 *
 * 设计原则：
 *   1. 3 路并行 Promise.allSettled，单路失败不影响其他
 *   2. 全断时 fallback 用规则拼接文本
 *   3. 每路独立 8s 超时，总时限 10s
 */

import type { FullDiagnosisV2, MultiRoleNarrative } from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/auto-interpreter');

/** 单路 LLM 超时 ms */
const PER_CALL_TIMEOUT_MS = 8000;
/** 总时限 ms */
const TOTAL_TIMEOUT_MS = 10000;

// ====================================================================
// System prompts — 三个角色卡片
// ====================================================================

const CEO_SYSTEM_PROMPT = `你是 Synova 诊断引擎的 CEO 视角解读器。你的读者是公司 CEO / 创始人。
基于提供的结构化诊断数据，生成一段 150-250 字的中文解读。

要求：
- 第一句是一句话总结（团队整体状态好吗？哪里最需要关注？）
- 然后给出 3 个战略要点，用 "- " 开头
- 用 CEO 能理解的语言——不谈技术细节，谈业务影响
- 如果数据不足，诚实标注"引擎数据尚不完整"
- 语气客观、不制造焦虑也不粉饰太平

输出纯文本，不要 JSON，不要 markdown 标题。`;

const LEAD_SYSTEM_PROMPT = `你是 Synova 诊断引擎的团队负责人视角解读器。你的读者是 Engineering Manager / Team Lead。
基于提供的结构化诊断数据，生成一段 150-250 字的中文行动指导。

要求：
- 指出 2-4 个具体可操作的改进方向
- 每个方向给出"做什么 → 为什么 → 预期效果"的结构
- 优先关注：信任机制、信息流效率、人机协作深度
- 如果某个维度数据不足，标注"需更多数据验证"
- 语气务实、可执行，不说空话

输出纯文本，不要 JSON，不要 markdown 标题。`;

const HRBP_SYSTEM_PROMPT = `你是 Synova 诊断引擎的 HRBP 视角解读器。你的读者是 HRBP / 组织发展负责人。
基于提供的结构化诊断数据，生成一段 150-250 字的中文组织健康建议。

要求：
- 关注人员维度：角色冲突、能力缺口、身份认同、自知偏差
- 给出 2-4 条人员/文化/组织发展建议
- 如果团队自评与引擎观测偏差大，重点指出
- 如果身份标记在弱化或转变，标注文化信号
- 语气温暖、建设性，关注"人"而非"流程"

输出纯文本，不要 JSON，不要 markdown 标题。`;

// ====================================================================
// Build diagnostic summary for LLM prompt
// ====================================================================

interface DiagnosticSummary {
  teamId: string;
  generatedAt: string;
  gaps: Array<{ dimension: string; score: number; confidence: string; mode: string }>;
  topAbnormal: Array<{ dimension: string; score: number; issue: string }>;
  dynamics: { overallChangeRate: number; stickyDimensions: string[]; phaseCouplings: string[] } | null;
  identity: { primaryAnchor: string | null; topMarkers: string[] };
  selfAwareness: { overallGap: number; interpretation: string };
  hacd: { level: string; hitlRatio: number; autoRatio: number } | null;
  degradedModules: string[];
}

function buildSummary(diag: FullDiagnosisV2): DiagnosticSummary {
  const gapEntries = Object.entries(diag.gaps.gaps).map(([dim, s]) => ({
    dimension: dim,
    score: Math.round(s.engineScore * 100),
    confidence: s.confidence,
    mode: s.mode,
  }));

  // Sort by most extreme (furthest from 50%)
  const sorted = [...gapEntries].sort((a, b) => Math.abs(a.score - 50) - Math.abs(b.score - 50));

  const topAbnormal = sorted.slice(0, 4).map(g => {
    const issue = g.score < 35 ? `${g.dimension}协作模式偏弱(${g.mode})`
      : g.score > 75 ? `${g.dimension}协作模式偏强(${g.mode})`
      : `${g.dimension}处于过渡区(${g.mode})`;
    return { dimension: g.dimension, score: g.score, issue };
  });

  return {
    teamId: diag.teamId,
    generatedAt: diag.generatedAt,
    gaps: gapEntries,
    topAbnormal,
    dynamics: diag.dynamics ? {
      overallChangeRate: diag.dynamics.overallChangeRate,
      stickyDimensions: diag.dynamics.stickyDimensions.map(d => d.dimension),
      phaseCouplings: diag.dynamics.phaseCoupling.map(p => `${p.leader}→${p.follower}(滞后${p.lagDays}天)`),
    } : null,
    identity: {
      primaryAnchor: diag.identity.primaryAnchor,
      topMarkers: diag.identity.markers.slice(0, 5),
    },
    selfAwareness: {
      overallGap: diag.selfAwareness.overallGap,
      interpretation: diag.selfAwareness.interpretation,
    },
    hacd: diag.hacd ? {
      level: diag.hacd.level,
      hitlRatio: diag.hacd.hitlRatio,
      autoRatio: diag.hacd.autoRatio,
    } : null,
    degradedModules: diag.degradedModules,
  };
}

// ====================================================================
// Fallback narrative
// ====================================================================

function buildFallbackNarrative(summary: DiagnosticSummary): MultiRoleNarrative {
  const topIssue = summary.topAbnormal[0];
  const fallbackCeo = topIssue
    ? `团队诊断显示，${topIssue.issue}。建议优先关注此维度，积累更多数据后引擎将提供更精准的解读。`
    : '引擎已完成诊断数据采集，但由于 LLM 暂时不可用，无法生成自然语言解读。请查看下方结构化数据。';

  const fallbackLead = summary.dynamics?.stickyDimensions?.length
    ? `以下维度长期未发生显著变化：${summary.dynamics.stickyDimensions.join('、')}。建议对这些维度进行主动干预实验。`
    : '基于当前数据，建议团队定期回顾协作模式，积累至少 3 次快照后引擎可提供趋势分析。';

  const fallbackHrbp = summary.selfAwareness.overallGap > 0.2
    ? `团队自评与引擎观测存在 ${Math.round(summary.selfAwareness.overallGap * 100)}% 的偏差，建议组织匿名 360 评估以校准认知。`
    : '建议团队定期进行自评，以便引擎校准自知偏差。';

  return {
    ceoSummary: fallbackCeo,
    teamLeadGuidance: fallbackLead,
    hrBPActionItems: fallbackHrbp,
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
}

// ====================================================================
// Public API
// ====================================================================

/**
 * 为诊断结果生成多角色解读。
 *
 * 3 路 LLM 调用并行，单路失败不影响其他。
 * 全断时返回 fallback 规则文本（fallback: true）。
 *
 * @param diagnosis 已完成组装的 V2 诊断
 * @returns 多角色解读，或 null（输入数据不足以生成任何解读）
 */
export async function generateMultiRoleNarrative(
  diagnosis: FullDiagnosisV2,
): Promise<MultiRoleNarrative | null> {
  const summary = buildSummary(diagnosis);

  // 至少需要 gaps 数据
  if (summary.gaps.length === 0) {
    log.debug('[auto-interpreter] no gap data, skipping narrative generation');
    return null;
  }

  const summaryJson = JSON.stringify(summary, null, 2);

  const [ceoResult, leadResult, hrbpResult] = await Promise.allSettled([
    callWithTimeout(CEO_SYSTEM_PROMPT, summaryJson, PER_CALL_TIMEOUT_MS),
    callWithTimeout(LEAD_SYSTEM_PROMPT, summaryJson, PER_CALL_TIMEOUT_MS),
    callWithTimeout(HRBP_SYSTEM_PROMPT, summaryJson, PER_CALL_TIMEOUT_MS),
  ]);

  const ceoSummary = unwrapResult(ceoResult, 'CEO');
  const teamLeadGuidance = unwrapResult(leadResult, 'TeamLead');
  const hrBPActionItems = unwrapResult(hrbpResult, 'HRBP');

  const allFailed = ceoResult.status === 'rejected'
    && leadResult.status === 'rejected'
    && hrbpResult.status === 'rejected';

  if (allFailed) {
    log.warn('[auto-interpreter] all 3 LLM calls failed, using fallback');
    return buildFallbackNarrative(summary);
  }

  return {
    ceoSummary: ceoSummary || buildFallbackNarrative(summary).ceoSummary,
    teamLeadGuidance: teamLeadGuidance || buildFallbackNarrative(summary).teamLeadGuidance,
    hrBPActionItems: hrBPActionItems || buildFallbackNarrative(summary).hrBPActionItems,
    generatedAt: new Date().toISOString(),
    fallback: false,
  };
}

// ====================================================================
// Helpers
// ====================================================================

function unwrapResult(
  result: PromiseSettledResult<string>,
  role: string,
): string | null {
  if (result.status === 'fulfilled') return result.value;
  log.warn({ err: result.reason }, `[auto-interpreter] ${role} LLM call failed`);
  return null;
}

async function callWithTimeout(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
): Promise<string> {
  const { chat } = await import('../../llm-client');

  const result = await withTimeout(
    chat({
      systemPrompt,
      userMessage,
      temperature: 0.3,
      maxTokens: 500,
    }),
    timeoutMs,
  );

  return (result.content ?? '').trim().slice(0, 500);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('LLM_CALL_TIMEOUT')), ms),
    ),
  ]);
}
