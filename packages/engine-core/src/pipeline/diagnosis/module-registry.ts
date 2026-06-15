/**
 * diagnosis/module-registry.ts — 诊断模块插件注册表
 *
 * 统一注册所有诊断 compute 函数，支持按需编排执行。
 * 每个模块独立 compute，失败不影响其他模块。
 *
 * 注册表使得：
 *   1. 第三方可通过 registerModule() 接入新诊断维度
 *   2. /plan 端点可按优先级/依赖顺序编排执行
 *   3. 前端可动态列出可用模块及状态
 */

// ── Types ──

export type DiagnosticPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type ConfidenceModel = 'deterministic' | 'statistical' | 'llm_inferred';

export interface DiagnosticDataSourceRequirements {
  /** 需要人类行为事件（HITL、自评等） */
  humanEvents?: boolean;
  /** 需要 Agent 执行事件（任务日志、错误等） */
  agentEvents?: boolean;
  /** 需要 Agent 间交互日志（路由事件） */
  interactionLogs?: boolean;
  /** 需要用户主动填写问卷 */
  questionnaire?: boolean;
}

/** 本体角色 (ARCH-20 Phase A6) */
export type OntologyRole = 'observer' | 'analyzer' | 'hybrid';

/**
 * @deprecated 自 P1-1 Sentinel 接口引入后, DiagnosticModule 不再接受新注册。
 * 新诊断能力应实现 {@link ../../../../../src/sentinel/types.ts#Sentinel} 接口,
 * 通过 SentinelRegistry + SentinelRunner + CronScheduler 调度运行。
 *
 * 迁移路径:
 *   旧: registerModule({ id: 'x', compute: async (teamId) => {...} })
 *   新: getSentinelRegistry().register({ config: {...}, check: async (ctx) => {...} })
 *
 * 存量模块继续工作但不再扩展。pre-commit hook 阻断新增注册。
 */
export interface DiagnosticModule {
  /** 唯一模块 ID */
  id: string;
  /** 语义版本 */
  version: string;
  /** 优先级 */
  priority: DiagnosticPriority;
  /** 所需数据源 */
  requiredDataSources: DiagnosticDataSourceRequirements;
  /** 计算函数 — 返回任意诊断输出 */
  compute: (teamId: string) => Promise<unknown> | unknown;
  /** 置信度模型类型 */
  confidenceModel: ConfidenceModel;
  /** 人类可读标签 */
  label: string;
  /** 简短描述 */
  description: string;
  /** 本体角色 (ARCH-20: observer输出图更新, analyzer消费图输出文本, hybrid两者) */
  ontologyRole?: OntologyRole;
}

export interface ModuleRunResult {
  moduleId: string;
  status: 'ok' | 'degraded' | 'failed';
  error?: string;
  /** 模块输出的摘要（避免序列化完整 report） */
  summary?: string;
}

// ── Registry ──

const registry = new Map<string, DiagnosticModule>();

/**
 * Register a diagnostic module.
 * If a module with the same id already exists, it is replaced.
 */
export function registerModule(module: DiagnosticModule): void {
  registry.set(module.id, module);
}

/**
 * List all registered modules, optionally filtered by priority.
 */
export function listModules(priority?: DiagnosticPriority): DiagnosticModule[] {
  const modules = [...registry.values()];
  if (priority) return modules.filter(m => m.priority === priority);
  return modules.sort(byPriority);
}

/**
 * Get a single module by id.
 */
export function getModule(id: string): DiagnosticModule | undefined {
  return registry.get(id);
}

/**
 * Run a single module by id, returning its result.
 */
export async function runModule(teamId: string, id: string): Promise<ModuleRunResult> {
  const mod = registry.get(id);
  if (!mod) {
    return { moduleId: id, status: 'failed', error: `未知模块: ${id}` };
  }

  try {
    const output = await mod.compute(teamId);
    const summary = buildSummary(mod.id, output);
    return { moduleId: id, status: 'ok', summary };
  } catch (err) {
    return {
      moduleId: id,
      status: 'degraded',
      error: (err as Error).message,
    };
  }
}

/**
 * Run selected modules (or all) in dependency order.
 *
 * Execution order respects logical dependencies:
 *   1. Observation (gaps) + event-based modules run first
 *   2. Derivation modules (dynamics) run next
 *   3. Reasoning modules run last
 *
 * Within each tier, modules run sequentially but independently
 * — failure in one does not block others in the same tier.
 */
export async function runModules(
  teamId: string,
  moduleIds?: string[],
): Promise<ModuleRunResult[]> {
  const ids = moduleIds ?? [...registry.keys()];
  const sorted = topologicalSort(ids);
  const results: ModuleRunResult[] = [];

  // Execute tier by tier
  // Tier 0: no deps (gaps, attention, identity, cpc, hona, capability-spectrum,
  //          intent-alignment, seven-powers)
  // Tier 1: depends on snapshot data (dynamics, self-awareness, hacd, ipu, htm, eob)
  // Tier 2: depends on assembled diagnosis (financial-impact, token-economics)
  const tier0 = sorted.filter(id => !TIER_1_IDS.has(id) && !TIER_2_IDS.has(id));
  const tier1 = sorted.filter(id => TIER_1_IDS.has(id));
  const tier2 = sorted.filter(id => TIER_2_IDS.has(id));

  for (const id of tier0) {
    results.push(await runModule(teamId, id));
  }
  for (const id of tier1) {
    results.push(await runModule(teamId, id));
  }
  for (const id of tier2) {
    results.push(await runModule(teamId, id));
  }

  return results;
}

// ── Module dependency tiers ──

const TIER_1_IDS = new Set([
  'dynamics', 'self-awareness', 'hacd', 'ipu', 'htm', 'eob',
]);

const TIER_2_IDS = new Set([
  'financial-impact', 'token-economics',
]);

// ── Helpers ──

function byPriority(a: DiagnosticModule, b: DiagnosticModule): number {
  const order: Record<DiagnosticPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return order[a.priority] - order[b.priority];
}

function topologicalSort(ids: string[]): string[] {
  // Simple: sort by tier. Modules not in the registry are appended at the end.
  const tiered = [...ids].sort((a, b) => {
    const tierA = TIER_2_IDS.has(a) ? 2 : TIER_1_IDS.has(a) ? 1 : 0;
    const tierB = TIER_2_IDS.has(b) ? 2 : TIER_1_IDS.has(b) ? 1 : 0;
    return tierA - tierB;
  });
  return tiered;
}

function buildSummary(id: string, output: unknown): string | undefined {
  if (output === null || output === undefined) return '无数据';
  if (Array.isArray(output)) return `${output.length} 条记录`;
  if (typeof output === 'object' && output !== null) {
    const o = output as Record<string, unknown>;
    if (typeof o.interpretation === 'string') return o.interpretation;
    if (typeof o.overallCoverage === 'number') return `覆盖度 ${(o.overallCoverage as number * 100).toFixed(0)}%`;
    if (typeof o.overallMoatStrength === 'number') return `壁垒强度 ${(o.overallMoatStrength as number * 100).toFixed(0)}%`;
    if (typeof o.totalInefficiencyCost === 'number') return `低效成本 ¥${o.totalInefficiencyCost}`;
    if (typeof o.totalCost === 'number') return `Token 成本 ¥${o.totalCost}`;
    if (typeof o.boundaryHealth === 'number') return `边界健康度 ${(o.boundaryHealth as number * 100).toFixed(0)}%`;
    if (typeof o.trustHealthScore === 'number') return `信任健康度 ${(o.trustHealthScore as number * 100).toFixed(0)}%`;
    return '已计算';
  }
  return undefined;
}

// ====================================================================
// Auto-register all built-in modules
// ====================================================================

import { getLatestSnapshot } from './gap-recorder';
import { computeDynamics } from './gap-dynamics';
import { computeAttention } from './attention-allocator';
import { extractIdentityMarkers } from './identity-extractor';
import { detectPathDependency } from './path-dependency';
import { computeSelfAwareness } from './self-awareness';
import { computeHACD } from './hacd';
import { computeCPC } from './cpc';
import { computeIPU } from './ipu-overload';
import { computeHONA } from './hona';
import { computeIntentAlignment } from './intent-alignment';
import { computeGoalAlignment } from './goal-alignment';
import { computeRiskAggregation } from './risk-aggregator';

import { computeSevenPowers } from './seven-powers';
import { computeHTM } from './htm';
import { computeEOB } from './eob';
import { computeFinancialImpact, loadFinancialBaseline } from './financial-impact';
import { computeTokenEconomics } from './token-economics';

function registerBuiltinModules(): void {
  const modules: DiagnosticModule[] = [
    {
      id: 'gaps',
      version: '1.0.0',
      priority: 'P0',
      requiredDataSources: {},
      compute: (teamId: string) => getLatestSnapshot(teamId),
      confidenceModel: 'deterministic',
      label: '六缝隙快照',
      description: '六维度协作模式评分（分工、信息流、权限、信任、知识共享、外部接口）',
    },
    {
      id: 'dynamics',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: {},
      compute: (teamId: string) => computeDynamics(teamId) ?? null,
      confidenceModel: 'statistical',
      label: '时间动态',
      description: '变化速度、加速度、相位耦合、粘性维度检测',
    },
    {
      id: 'attention',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { humanEvents: true },
      compute: (teamId: string) => computeAttention(teamId),
      confidenceModel: 'statistical',
      label: '注意力配置',
      description: '团队注意力主题分布、内外视比例、运营/创新比',
    },
    {
      id: 'identity',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { humanEvents: true },
      compute: (teamId: string) => extractIdentityMarkers(teamId),
      confidenceModel: 'statistical',
      label: '身份标记',
      description: '从团队对话中提取身份标记词及趋势',
    },
    {
      id: 'path-dependency',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: {},
      compute: (teamId: string) => detectPathDependency(teamId),
      confidenceModel: 'statistical',
      label: '路径依赖',
      description: '检测组织维度中的路径锁定及异常',
    },
    {
      id: 'self-awareness',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { questionnaire: true },
      compute: (teamId: string) => computeSelfAwareness(teamId),
      confidenceModel: 'statistical',
      label: '自知偏差',
      description: '引擎观测 vs 团队自评的偏差分析',
    },
    {
      id: 'hacd',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { interactionLogs: true },
      compute: (teamId: string) => computeHACD(teamId),
      confidenceModel: 'statistical',
      label: '人机协作深度',
      description: 'L0-L4 协作等级、人工介入比例、自主性趋势',
    },
    {
      id: 'cpc',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: {},
      compute: (teamId: string) => computeCPC(teamId),
      confidenceModel: 'deterministic',
      label: '协议完备性',
      description: '人机协作协议各维度完备度评估',
    },
    {
      id: 'ipu',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { agentEvents: true, interactionLogs: true },
      compute: (teamId: string) => computeIPU(teamId),
      confidenceModel: 'statistical',
      label: '信息过载',
      description: 'Agent 队列深度、死锁率、瓶颈检测',
    },
    {
      id: 'hona',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { interactionLogs: true },
      compute: (teamId: string) => computeHONA(teamId),
      confidenceModel: 'statistical',
      label: '异质节点网络',
      description: 'Agent 交互网络密度、中心性、结构类型',
    },
    // capability-gap 注册已移除 — compute() 始终返回 null。
    // 文件保留 (analyzeCapabilityGaps() 被 graph-bridge.ts 直接调用)。
    {
      id: 'intent-alignment',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { humanEvents: true, agentEvents: true },
      compute: (teamId: string) => computeIntentAlignment(teamId),
      confidenceModel: 'llm_inferred',
      label: '意图对齐',
      description: '人-组织-Agent 三方目标对齐偏差',
    },
    {
      id: 'seven-powers',
      version: '1.0.0',
      priority: 'P1',
      requiredDataSources: { humanEvents: true },
      compute: (teamId: string) => computeSevenPowers(teamId),
      confidenceModel: 'llm_inferred',
      label: '7 Powers',
      description: '规模经济、网络效应、差异化、转换成本、品牌、独家资源、流程优势',
    },
    {
      id: 'htm',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { interactionLogs: true, agentEvents: true },
      compute: (teamId: string) => computeHTM(teamId),
      confidenceModel: 'statistical',
      label: '混合信任',
      description: '人对Agent信任曲线、Agent间信任、单点依赖风险',
    },
    {
      id: 'eob',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true },
      compute: (teamId: string) => computeEOB(teamId),
      confidenceModel: 'statistical',
      label: '弹性边界',
      description: 'Agent流失率、弹性响应速度、僵尸权限检测',
    },
    {
      id: 'financial-impact',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true },
      compute: (teamId: string) => {
        // Financial impact needs the assembled diagnosis
        const { assembleFullDiagnosisV2 } = require('./diagnosis-assembler');
        const diag = assembleFullDiagnosisV2(teamId);
        const baseline = loadFinancialBaseline(teamId);
        return computeFinancialImpact(diag, baseline ?? undefined);
      },
      confidenceModel: 'deterministic',
      label: '财务影响',
      description: '诊断维度→财务金额映射，改善ROI估算',
    },
    {
      id: 'token-economics',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { agentEvents: true, interactionLogs: true },
      compute: (teamId: string) => {
        const baseline = loadFinancialBaseline(teamId);
        return computeTokenEconomics(teamId, baseline ?? undefined);
      },
      confidenceModel: 'statistical',
      label: 'Token经济学',
      description: 'Token消耗归因、浪费分析、效率指标',
    },
  ];

  for (const mod of modules) {
    registerModule(mod);
  }

  // ── FDE Modules (ARCH-08) ──
  const fdeModules: DiagnosticModule[] = [
    {
      id: 'auto-interpreter',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true },
      compute: async (teamId: string) => {
        const { assembleFullDiagnosisV2 } = await import('./diagnosis-assembler');
        const diag = assembleFullDiagnosisV2(teamId);
        const { generateMultiRoleNarrative } = await import('./auto-interpreter');
        return generateMultiRoleNarrative(diag);
      },
      confidenceModel: 'llm_inferred',
      label: '多角色解读',
      description: 'CEO/团队负责人/HRBP 三视角自动解读诊断结果',
    },
    {
      id: 'auto-action',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true, agentEvents: true },
      compute: async (teamId: string) => {
        const { assembleFullDiagnosisV2 } = await import('./diagnosis-assembler');
        const diag = assembleFullDiagnosisV2(teamId);
        const { generateActionPlan } = await import('./auto-action');
        return generateActionPlan(diag);
      },
      confidenceModel: 'llm_inferred',
      label: '自动行动',
      description: '基于诊断发现自动生成 Jira/Linear 可执行任务',
    },
    {
      id: 'task-integration',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true, agentEvents: true },
      compute: async (teamId: string) => {
        const { assembleFullDiagnosisV2 } = await import('./diagnosis-assembler');
        const diag = assembleFullDiagnosisV2(teamId);
        const { generateActionPlan } = await import('./auto-action');
        const plan = await generateActionPlan(diag);
        const { pushActionItems } = await import('./task-integration');
        return pushActionItems(teamId, plan.items);
      },
      confidenceModel: 'deterministic',
      label: '任务集成',
      description: '将诊断行动建议 push 到 Jira/Linear 外部任务系统',
    },
  ];

  for (const mod of fdeModules) {
    registerModule(mod);
  }

  // ── Marketing Modules (ARCH-19) ──
  // 注意: category-clarity / positioning-consistency / differentiation-validation
  // 的 DiagnosticModule 注册已移除 —— compute() 始终返回 null（需要客户问卷数据）。
  // 模块文件本身保留（导出真实工具函数，被 diagnosis-assembler 等使用）。
  // 对应的哨兵能力在 Phase 2 规划中 (P2-3 市场感知哨兵)。

  // ── SOG v1.0 模块 ──
  // 注意: goal-alignment / risk-aggregator 的 DiagnosticModule 注册已移除
  // —— compute() 始终返回 null（需要 SOG 图数据）。
  // 模块文件本身保留（导出真实算法函数，被 graph-bridge / diagnosis-launcher 使用）。
  // 对应的哨兵能力在 Phase 2 规划中。

  // ── P2 Modules (ARCH-08 Benchmark + Enricher) ──
  const p2Modules: DiagnosticModule[] = [
    {
      id: 'benchmark',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: { humanEvents: true },
      compute: async (teamId: string) => {
        const { computeBenchmark } = await import('./benchmark-engine');
        return computeBenchmark(teamId);
      },
      confidenceModel: 'statistical',
      label: '基准对比',
      description: '跨团队百分位排名，对比同类团队的协作健康度',
    },
    {
      id: 'data-enricher',
      version: '1.0.0',
      priority: 'P2',
      requiredDataSources: {},
      compute: async (teamId: string) => {
        const { enrichDiagnosis } = await import('./data-enricher');
        return enrichDiagnosis(teamId);
      },
      confidenceModel: 'statistical',
      label: '数据富化',
      description: '从本地 Git、软件生态、GitHub API 获取外部上下文',
    },
  ];

  for (const mod of p2Modules) {
    registerModule(mod);
  }
}

// EC-02 Sprint B: 懒注册 — 不再模块级 auto-register
// 调用方必须显式调用 ensureModulesRegistered()
let _modulesRegistered = false;

export function ensureModulesRegistered(): void {
  if (_modulesRegistered) return;
  // @deprecated: ModuleRegistry 已被 Sentinel 接口替代 (P1-1)。
  // 24 个 DiagnosticModule 不再自动注册。新能力请实现 Sentinel 接口。
  // 如需恢复旧行为：取消下面注释
  // registerBuiltinModules();
  _modulesRegistered = true;
}
