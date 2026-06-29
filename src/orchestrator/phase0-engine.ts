/**
 * orchestrator/phase0-engine.ts — Phase 0 顾问式对话引擎 (Iter 3)
 *
 * 借鉴 Novis L0 Consultant Dialogue Final:
 *   - 意图路由 (9 分支)
 *   - 六维诊断地图导航
 *   - 假设驱动追问
 *   - 进度全程可视
 *
 * LLM 是访谈主持人——负责自然对话、信任建立。
 * 维度覆盖和进度由规则引擎 + 维度注册表控制。
 */
import { IntentRouter, type IntentResult } from './intent-router';
import { DimensionRegistry, type DiagnosticDimension, type DimensionCoverage } from './dimension-registry';
import { createLogger } from '@synova/logger';

const log = createLogger('orchestrator/phase0');

// ═══ Types ═══

export interface Phase0State {
  round: number;
  userName?: string;
  userRole?: string;
  orgName?: string;
  industry?: string;
  teamSize?: string;
  painPoints: string[];
  dimensions: DimensionCoverage[];
  hypotheses: Array<{ statement: string; confidence: number }>;
  messages: Array<{ role: 'consultant' | 'user'; content: string }>;
  trustEstablished: boolean;
  completed: boolean;
}

export interface Phase0Response {
  /** Agent 的回复文本 */
  message: string;
  /** 当前覆盖状态 (发送给前端渲染诊断面板) */
  coverage: DimensionCoverage[];
  /** 当前假设 */
  hypotheses: Array<{ statement: string; confidence: number }>;
  /** 本轮是Phase 0最后一轮? */
  readyToAdvance: boolean;
  /** 可进入Phase 1的置信度 */
  precisionEstimate: number;
}

// ═══ System Prompt (借鉴 Novis L0 Consultant Dialogue Final) ═══

const PHASE0_SYSTEM_PROMPT = `你是 Synova 组织诊断引擎的咨询顾问。

## 你的身份
Synova 是一个 AI 驱动的组织诊断平台。我们帮助成长型团队识别组织协作中的隐形问题。

## 对话风格
- 结论先行: 先告诉客户这段对话会产出什么，再解释为什么要聊这些
- 温暖、专业、不傲慢
- 你会认真倾听，然后用自己的话复述客户说的内容，确认你理解对了
- 你会说"这个情况很常见，不是你一家的问题"——降低焦虑
- 你从不编造数据、从不承诺不确定的结果、从不催促客户做决定

## 对话约束
1. 每次发言最多 2-3 个问题
2. 每个问题必须基于客户上一轮说的内容——证明你在听
3. 开放式或选择题，不给客户压力
4. 客户不想回答时，尊重并跳过
5. 发言末尾让客户知道"还剩下什么"

## 假设驱动
- 基于用户已说信息形成假设
- 必须标注: "我的判断是……"
- 必须邀请反驳: "但我可能判断错了，你觉得呢？"

## 每问必带"为什么"
- 追问时解释: "我想了解___，因为这会影响___"

## 禁止
- 客户没充分表达痛点前开始推荐方案
- "根据我们的方法论"、"研究表明"等权威话术
- "这很简单"、"不用担心"
- 不到 3 轮就结束 Phase 0`;

// ═══ Phase0Engine ═══

export class Phase0Engine {
  private intentRouter: IntentRouter;
  private dimensionRegistry: DimensionRegistry;
  private state: Phase0State;
  private minRounds = 3;

  constructor(intentRouter: IntentRouter, dimensionRegistry: DimensionRegistry) {
    this.intentRouter = intentRouter;
    this.dimensionRegistry = dimensionRegistry;
    this.state = this.createInitialState();
  }

  private createInitialState(): Phase0State {
    return {
      round: 0,
      painPoints: [],
      dimensions: this.dimensionRegistry.listAll().map(d => ({
        dimensionId: d.id,
        status: 'uncovered' as const,
        confidence: 0,
        evidenceCount: 0,
      })),
      hypotheses: [],
      messages: [],
      trustEstablished: false,
      completed: false,
    };
  }

  // ═══ Public API ═══

  getState(): Phase0State { return this.state; }

  /**
   * Process user input and generate consultant response.
   * Returns the response message + diagnostic panel state for frontend rendering.
   */
  async processUserInput(userInput: string, industry?: string): Promise<Phase0Response> {
    this.state.round++;
    this.state.messages.push({ role: 'user', content: userInput });

    if (industry && !this.state.industry) {
      this.state.industry = industry;
    }

    // 1. 意图分类 (9 分支)
    const intent = await this.intentRouter.classify(
      userInput,
      this.state.messages.map(m => m.content),
    );

    // 2. 更新维度覆盖状态
    if (intent.category === 'diagnostic' && intent.signals) {
      this.updateCoverage(intent.signals, industry);
    }

    // 3. 提取信号 (简单关键词提取)
    this.extractSignals(userInput);

    // 4. 判断是否可以结束 Phase 0
    const coveredCount = this.state.dimensions.filter(d => d.status === 'covered').length;
    const totalDimensions = this.state.dimensions.filter(d => d.status !== 'skipped').length;
    const readyToAdvance = this.state.round >= this.minRounds && coveredCount >= 4;

    // 5. 计算精确度估计
    const precisionEstimate = totalDimensions > 0
      ? Math.round((coveredCount / Math.max(totalDimensions, 6)) * 100)
      : 50;

    // 6. NL意图分支: 生成适当响应 (简化版, 实际通过 LLM 生成)
    const message = this.generateResponse(intent, readyToAdvance, precisionEstimate);

    this.state.messages.push({ role: 'consultant', content: message });
    log.debug({ round: this.state.round, covered: coveredCount, intent: intent.intent }, 'Phase 0 轮次完成');

    return {
      message,
      coverage: this.state.dimensions,
      hypotheses: this.state.hypotheses,
      readyToAdvance,
      precisionEstimate,
    };
  }

  // ═══ Internal ═══

  private updateCoverage(signals: string[], industry?: string): void {
    const relevantDims = this.dimensionRegistry.selectBySignals(signals, industry);
    for (const dim of relevantDims) {
      const coverage = this.state.dimensions.find(d => d.dimensionId === dim.id);
      if (coverage && coverage.status === 'uncovered') {
        coverage.status = 'partial';
        coverage.confidence = 0.5;
        coverage.evidenceCount = 1;
      } else if (coverage && coverage.status === 'partial') {
        coverage.evidenceCount++;
        if (coverage.evidenceCount >= 2) {
          coverage.status = 'covered';
          coverage.confidence = Math.min(1, coverage.confidence + 0.25);
        }
      }
    }
  }

  private extractSignals(input: string): void {
    // Simple keyword extraction for pain points
    const painKeywords = ['问题', '困难', '瓶颈', '挑战', '不行', '不好', '不够', '缺乏', '缺少'];
    for (const kw of painKeywords) {
      if (input.includes(kw) && !this.state.painPoints.includes(input)) {
        this.state.painPoints.push(input.slice(0, 200));
        break;
      }
    }
  }

  private generateResponse(intent: IntentResult, readyToAdvance: boolean, precision: number): string {
    // Simplified response generation — full version uses LLM per Novis L0 design
    const uncoveredDims = this.state.dimensions
      .filter(d => d.status === 'uncovered')
      .slice(0, 3)
      .map(d => this.dimensionRegistry.get(d.dimensionId)?.name || d.dimensionId);

    switch (intent.intent) {
      case 'greeting':
        return '你好！我是 Synova，专门帮团队做组织诊断。说说你们团队的情况？比如团队规模、业务方向、最近遇到什么让你觉得"不太对"的事？';

      case 'ask_capability':
        return '我可以帮你做六维度的组织诊断：从战略、业务、现状、资源、风险到成功标准，全面扫描组织的潜在问题。背后有六个 AI 专家同时看数据，交叉验证。想试试吗？';

      case 'confusion':
        return '抱歉，我可能没理解对。让我换个方式：你目前团队中，最让你觉得"不太顺畅"的是什么？';

      case 'stalling':
        return `我理解你可能还在思考。目前我们已经覆盖了 ${this.state.dimensions.filter(d => d.status !== 'uncovered').length} 个维度。${readyToAdvance ? '信息已经比较充分了，要不要开始诊断？' : '还需要再了解一些信息'}`;

      case 'single_issue':
        return `你说的这个可能是${intent.suggestedDimensions?.[0] || '一个维度'}的问题，也可能不是。不急着下结论——让我先多了解一些背景。能再多说说你们团队的情况吗？`;

      default: {
        // diagnostic — follow the dimension map
        if (uncoveredDims.length > 0 && !readyToAdvance) {
          return `了解了。我的判断是${intent.signals?.[0] || '你关心的方向'}可能是关键，但我可能判断错了——你觉得呢？另外，我还想了解一下${uncoveredDims.join('、')}方面的情况。`;
        }
        if (readyToAdvance) {
          return `感谢你的耐心！我已经了解了足够的信息（覆盖 ${precision}% 的诊断维度）。现在可以开始六阶段诊断分析了。准备好了吗？`;
        }
        return '好的，请继续。还有哪些方面的情况想告诉我？';
      }
    }
  }
}
