/**
 * sub-agent-isolator.ts — 子 Agent 隔离执行器
 *
 * 6 个专家子 Agent，各自独立 LLM 会话：
 *   strategic_analyst  — 战略分析师（竞争定位、7 Powers、姿态适配）
 *   org_diagnostician  — 组织诊断师（缝隙、动态、协作健康度）
 *   financial_analyst  — 财务分析师（财务影响、Token 经济学、成本拆解）
 *   tech_architect      — 技术架构师（能力谱系、基准对比、技术缺口）
 *   action_advisor     — 行动顾问（可执行建议生成、任务集成）
 *
 * 隔离机制：
 *   - 每个子 Agent 独立 Promise.race 超时（默认 60s）
 *   - AbortController 级联清理：cancelAll() 终止全部在途调用
 *   - 任一子 Agent 超时/失败不影响其他子 Agent
 *   - 遵循 SessionTracer 模式记录追踪事件
 *
 * 对标 Claw-Code subagent spawn + isolation 模式。
 */

import type { DiagnosisLLMClient, LLMResponse, SessionTracer } from './diagnosis-orchestrator';
import { DiagnosisPromptBuilder } from './diagnosis-prompt-builder';
import type { AgentRoleDefinition } from './diagnosis-prompt-builder';
import { normalizeDiagnosisError, RECOVERABLE_CODES } from './diagnosis-error';
import { DiagnosisErrorCode } from './types';
import type { FullDiagnosisV2, DiagnosisEvidence, DiagnosisHypothesis } from './types';

// ====================================================================
// Types
// ====================================================================

import type { ExpertType } from './types';
export type SubAgentType = ExpertType;

export interface SubAgentResult {
  agentType: SubAgentType;
  content: string;
  model: string;
  durationMs: number;
  retries: number;
  error?: string;
  degraded: boolean;
}

export interface SubAgentContext {
  teamId: string;
  phase: number;
  diagnosis?: FullDiagnosisV2;
  evidence?: DiagnosisEvidence[];
  hypotheses?: DiagnosisHypothesis[];
}

export interface SubAgentRunOptions {
  /** 覆盖默认超时 (ms) */
  timeoutMs?: number;
  /** 最大重试次数（默认 1） */
  maxRetries?: number;
  /** 外部 AbortSignal */
  signal?: AbortSignal;
}

// ====================================================================
// Role Definitions
// ====================================================================

const ROLES: Record<SubAgentType, AgentRoleDefinition> = {
  strategic_analyst: {
    name: '战略分析师',
    description: '企业战略分析专家，擅长竞争定位评估、7 Powers 框架分析、战略姿态适配',
    tone: '宏观、锐利、前瞻性。用数据支撑判断，不回避风险信号，给出清晰的方向选择。',
    boundaries: [
      '不评价创始人个人能力',
      '不预测市场涨跌',
      '不确定的判断标注置信度',
      '战略建议必须附带可验证的假设条件',
    ],
  },
  org_diagnostician: {
    name: '组织诊断师',
    description: '组织健康诊断专家，擅长六缝隙分析、团队动态评估、协作模式诊断',
    tone: '系统化、客观、数据驱动。关注模式而非个例，关注交互而非个体。',
    boundaries: [
      '不点名具体个人',
      '不归因于个人动机（用系统因素解释）',
      '不泄露隐私数据',
      '对比基准时注明数据来源',
    ],
  },
  financial_analyst: {
    name: '财务分析师',
    description: '技术财务分析专家，擅长诊断维度→财务金额映射、Token 经济学分析、ROI 估算',
    tone: '精确、审慎、量化。每一项金额估算必须标明假设和误差范围。',
    boundaries: [
      '所有金额标注币种和估算误差范围',
      '不替代专业财务审计',
      'Token 成本拆解归因到具体模块',
      '改善 ROI 必须标注回本周期假设',
    ],
  },
  tech_architect: {
    name: '技术架构师',
    description: '技术架构评估专家，擅长能力谱系分析、基准对比、技术栈缺口检测',
    tone: '务实、深入、工程视角。关注可实现性和技术债务，不追求技术时尚。',
    boundaries: [
      '技术建议必须考虑团队当前能力',
      '不推荐团队无法维护的技术栈',
      '基准对比标明同类团队样本量',
      '迁移建议附带阶梯式路线图',
    ],
  },
  action_advisor: {
    name: '行动顾问',
    description: '执行落地专家，擅长将诊断发现转化为可执行行动方案，按优先级排列',
    tone: '务实、具体、行动导向。每一项建议必须回答"谁、做什么、多久、怎么验证"。',
    boundaries: [
      '每项行动必须指定负责人角色（非个人名）',
      '估算工时必须基于团队规模',
      '必须包含验证标准（怎么算完成）',
      '不推荐团队当前无法执行的行动',
    ],
  },
  marketing_analyst: {
    name: '营销分析师',
    description: '营销效能诊断专家，擅长定位一致性评估、获客渠道分析、品牌健康度诊断、服务体验审计',
    tone: '具体、量化、行动导向。用数据支撑判断，区分"事实"和"推断"。不追求理论完整性，聚焦可验证的结论。',
    boundaries: [
      '不确定的判断必须标注置信度（高/中/低）',
      '数据不足时显式标注"需要客户访谈/问卷数据"而非推测',
      '定位建议必须附带兑现该定位所需的前提条件',
      '生存突破型战略不推荐大规模广告投放',
      '所有差异化声称必须与组织能力诊断模块交叉验证——声称"品质最好"但返工率高→虚假定位',
      '拒绝"认知大于事实"——品牌承诺与客户体验显著偏差时优先告警',
    ],
  },
};

// ====================================================================
// SubAgentIsolator
// ====================================================================

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;

export class SubAgentIsolator {
  private llmClient: DiagnosisLLMClient;
  private tracer: SessionTracer | null = null;
  private promptBuilder: DiagnosisPromptBuilder;
  private defaultTimeoutMs: number;
  private defaultMaxRetries: number;
  private controllers: Set<AbortController> = new Set();

  constructor(llmClient: DiagnosisLLMClient) {
    this.llmClient = llmClient;
    this.promptBuilder = new DiagnosisPromptBuilder();
    this.defaultTimeoutMs = DEFAULT_TIMEOUT_MS;
    this.defaultMaxRetries = DEFAULT_MAX_RETRIES;
  }

  // ── Builder ──

  withTracer(tracer: SessionTracer): this {
    this.tracer = tracer;
    return this;
  }

  withPromptBuilder(builder: DiagnosisPromptBuilder): this {
    this.promptBuilder = builder;
    return this;
  }

  withDefaultTimeout(ms: number): this {
    this.defaultTimeoutMs = ms;
    return this;
  }

  withDefaultMaxRetries(n: number): this {
    this.defaultMaxRetries = n;
    return this;
  }

  // ── Public API ──

  /**
   * 运行单个子 Agent。
   * 独立 LLM 会话，超时隔离，自动重试。
   */
  async runAgent(
    type: SubAgentType,
    context: SubAgentContext,
    options: SubAgentRunOptions = {},
  ): Promise<SubAgentResult> {
    const role = ROLES[type];
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.maxRetries ?? this.defaultMaxRetries;
    const startTime = Date.now();
    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      retries = attempt;
      const controller = new AbortController();
      this.controllers.add(controller);

      // 外部信号传播
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const { systemPrompt, userMessage } = this.buildPrompt(type, role, context);

        this.trace(`subagent_${type}_started`, { attempt, teamId: context.teamId });

        const result = await this.executeWithTimeout(
          type,
          systemPrompt,
          userMessage,
          timeoutMs,
          controller.signal,
        );

        this.controllers.delete(controller);

        const durationMs = Date.now() - startTime;
        this.trace(`subagent_${type}_completed`, { durationMs, retries, model: result.model });

        return {
          agentType: type,
          content: result.content,
          model: result.model,
          durationMs,
          retries,
          degraded: false,
        };
      } catch (err) {
        this.controllers.delete(controller);
        lastError = (err as Error).message;

        const normalized = normalizeDiagnosisError(err);
        const isRecoverable = RECOVERABLE_CODES.has(normalized.code);

        this.trace(`subagent_${type}_error`, {
          code: normalized.code,
          message: normalized.message,
          recoverable: isRecoverable,
          attempt,
        });

        if (!isRecoverable || attempt >= maxRetries) break;

        // 指数退避
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
      }
    }

    return {
      agentType: type,
      content: '',
      model: 'none',
      durationMs: Date.now() - startTime,
      retries,
      error: lastError,
      degraded: true,
    };
  }

  /**
   * 并行运行多个子 Agent（真正的隔离执行）。
   * 使用 Promise.allSettled——任一失败不影响其他。
   */
  async runAgents(
    types: SubAgentType[],
    context: SubAgentContext,
    options: SubAgentRunOptions = {},
  ): Promise<SubAgentResult[]> {
    const results = await Promise.allSettled(
      types.map(type => this.runAgent(type, context, options)),
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        agentType: types[i],
        content: '',
        model: 'none',
        durationMs: 0,
        retries: 0,
        error: r.reason?.message ?? '子 Agent 崩溃',
        degraded: true,
      };
    });
  }

  /**
   * 级联清理：终止全部在途子 Agent 调用。
   */
  cancelAll(): void {
    const count = this.controllers.size;
    for (const ctrl of this.controllers) {
      try { ctrl.abort(); } catch { /* 忽略重复 abort */ }
    }
    this.controllers.clear();
    if (this.tracer && count > 0) {
      this.tracer.trace({
        type: 'error',
        code: DiagnosisErrorCode.SUBAGENT_LOST,
        message: `级联清理: 终止了 ${count} 个在途子 Agent`,
        recoverable: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /** 获取当前在途的子 Agent 数量 */
  get activeCount(): number {
    return this.controllers.size;
  }

  // ── Internal ──

  private buildPrompt(
    type: SubAgentType,
    role: AgentRoleDefinition,
    context: SubAgentContext,
  ): { systemPrompt: string; userMessage: string } {
    const builder = new DiagnosisPromptBuilder()
      .withPhase(context.phase)
      .withRole(role);

    const systemPrompt = builder.build();

    let userMessage = `团队 ID: ${context.teamId}\n`;
    userMessage += `分析阶段: Phase ${context.phase}\n\n`;

    if (context.evidence && context.evidence.length > 0) {
      userMessage += `## 证据池 (${context.evidence.length} 条)\n`;
      for (const e of context.evidence.slice(0, 10)) {
        userMessage += `- [${e.dimension}] (置信度 ${(e.confidence * 100).toFixed(0)}%) ${e.content.slice(0, 200)}\n`;
      }
    }

    if (context.hypotheses && context.hypotheses.length > 0) {
      userMessage += `\n## 已有假设 (${context.hypotheses.length} 条)\n`;
      for (const h of context.hypotheses.slice(0, 5)) {
        userMessage += `- [${h.confidence.toFixed(0)}%] ${h.statement.slice(0, 300)}\n`;
      }
    }

    // Add type-specific focus instructions
    userMessage += `\n## 分析任务\n${this.getFocusInstruction(type)}\n`;

    return { systemPrompt, userMessage };
  }

  private getFocusInstruction(type: SubAgentType): string {
    switch (type) {
      case 'strategic_analyst':
        return '请从竞争战略角度分析该团队的诊断数据。关注：战略姿态是否与竞争环境匹配？7 Powers 中哪些正在增强/衰减？最大的战略风险是什么？给出不超过 3 条战略建议。';
      case 'org_diagnostician':
        return '请从组织健康角度分析。关注：六缝隙中哪些在恶化？团队协作模式是否存在系统性缺陷？信息流和决策权是否匹配？给出不超过 3 条组织改进建议。';
      case 'financial_analyst':
        return '请从技术财务角度分析。关注：当前低效的财务量化影响？Token 浪费的主要来源？改善投入的优先级排序（按 ROI）？给出不超过 3 条财务优化建议，每条标注估算金额范围。';
      case 'tech_architect':
        return '请从技术架构角度分析。关注：能力谱系中哪些缺口最致命？与同类团队相比的基准位置？技术栈是否存在维护风险？给出不超过 3 条技术改进建议。';
      case 'action_advisor':
        return '请基于上述分析生成具体可执行的行动方案。每项行动必须包含：负责人角色、预估工时、优先级（critical/high/medium/low）、目标系统（jira/linear/manual）、验证标准。按优先级排序。';
      case 'marketing_analyst':
        return '请从营销效能角度分析该团队的诊断数据。关注：\n1. 定位一致性——对外声称、内部共识、客户感知三方是否对齐？\n2. 差异化是否实质——声称的独特优势是否有组织能力支撑？\n3. 品类认知——客户用什么词描述我们？是否清晰？\n4. 交叉验证——差异化主张与六缝隙返工率/quality_gate 是否存在矛盾？\n\n' +
          '分析原则：\n- 区分"事实"（来自数据）和"推断"（来自你的判断），推断必须标注置信度\n- 数据不足时显式标注缺失项，不推测\n- 定位建议必须附带"兑现这个概念需要的前提条件"\n- 生存突破型团队不推荐大规模广告投放\n' +
          '给出不超过 3 条营销改进建议，每条标注置信度和预期影响。';
    }
  }

  private async executeWithTimeout(
    type: SubAgentType,
    systemPrompt: string,
    userMessage: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LLMResponse> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timer = null;
        reject(new Error(`SUBAGENT_LOST: ${type} 超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      signal.addEventListener('abort', () => {
        if (timer) { clearTimeout(timer); timer = null; }
        reject(new Error(`SUBAGENT_LOST: ${type} 被取消`));
      }, { once: true });
    });

    const llmPromise = this.llmClient.consult(systemPrompt, userMessage);

    try {
      return await Promise.race([llmPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private trace(eventType: string, meta: Record<string, unknown>): void {
    if (!this.tracer) return;
    this.tracer.trace({
      type: 'evidence_added',
      evidence: {
        id: `${eventType}-${Date.now()}`,
        source: 'module',
        content: `${eventType}: ${JSON.stringify(meta)}`,
        confidence: 1.0,
        timestamp: new Date().toISOString(),
        phase: 0,
        dimension: 'subagent',
        isPrivate: false,
        moduleId: 'sub-agent-isolator',
      },
      timestamp: new Date().toISOString(),
    });
  }
}
