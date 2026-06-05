/**
 * l3/expert-autonomy.ts — 专家自主权引擎 (Gear 1)
 *
 * ReAct 循环: Think → Query(权限检查) → Observe → 循环
 * 智能终止: 信息增益=0 / finalize信号 / 最大5轮
 * 权限控制: DataAccessPolicy 限制可调用的图查询函数
 */
import type { LLMClient } from '../orchestrator/diagnosis-orchestrator';
import type { DataAccessPolicy } from '../orchestrator/subagent-coordinator';
import { createLogger } from '../logger';

const log = createLogger('l3/expert-autonomy');

// ═══ Types ═══

export interface QueryAPI {
  findDiagnosticPaths(fromType: string, toType: string): Promise<unknown>;
  summarizeSubgraph(rootId: string, maxDepth?: number): Promise<unknown>;
  findCrossDimensionalBrokers(): Promise<unknown>;
  /** Pattern engine: match signals against known diagnostic patterns */
  matchPattern?(signals: string[]): Promise<unknown>;
  /** EC-08: Upsert node into graph store (non-destructive) */
  upsertNode?(type: string, props: Record<string, unknown>): Promise<unknown>;
}

export interface AutonomyConfig { maxRounds: number }

/** EC-08: 结构化本体补丁 — expert 可用图查询替代纯文本推断 */
export interface OntologyPatch {
  action: 'create' | 'update';
  nodeType: string;
  props: Record<string, unknown>;
  evidence: string;
  confidence: number;
}

export interface AutonomyInput {
  evidence: string[];
  expertType: string;
  /** EC-08: 结构化本体补丁 — 优先用于图查询 */
  patches?: OntologyPatch[];
}

export interface AutonomyResult {
  hypothesis: string;
  confidence: number;
  roundsUsed: number;
  action: string;
  queryHistory: string[];
}

export interface LLMReActResponse {
  thought: string;
  action: 'query_graph' | 'finalize';
  function?: string;
  hypothesis?: string;
  confidence?: number;
}

// ═══ ExpertAutonomyEngine ═══

export class ExpertAutonomyEngine {
  private llm: LLMClient;
  private queryApi: QueryAPI;
  private policy: DataAccessPolicy;
  private config: AutonomyConfig;

  constructor(llm: LLMClient, queryApi: QueryAPI, policy: DataAccessPolicy, config: Partial<AutonomyConfig> = {}) {
    this.llm = llm;
    this.queryApi = queryApi;
    this.policy = policy;
    this.config = { maxRounds: config.maxRounds ?? 5 };
  }

  /** Check if a query function is allowed for this expert */
  isQueryAllowed(functionName: string): boolean {
    if (!this.policy.allowedQueryFunctions || this.policy.allowedQueryFunctions.length === 0) return true;
    return this.policy.allowedQueryFunctions.includes(functionName);
  }

  /** Run the ReAct autonomy loop */
  async run(input: AutonomyInput): Promise<AutonomyResult> {
    const queryHistory: string[] = [];
    let previousResults = new Set<string>();

    // EC-08: patches 输入 → 优先用于图查询, 文本 evidence 作为补充
    if (input.patches && input.patches.length > 0) {
      try {
        for (const p of input.patches) {
          this.queryApi.upsertNode?.(p.nodeType, p.props);
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'patches GraphStore upsert 失败 — 继续文本模式');
      }
    }
    const patchContext = input.patches?.length
      ? `\n结构化本体数据 (已写入图): ${input.patches.map(p => `${p.nodeType}: ${JSON.stringify(p.props)}`).join('; ')}`
      : '';

    // Build tool list for LLM context
    const availableTools = this.toolRegistry
      ? this.buildToolList()
      : (this.policy.allowedQueryFunctions || []).join(', ');

    for (let round = 0; round < this.config.maxRounds; round++) {
      const context = [
        `你是${input.expertType}专家。`,
        `可用证据: ${input.evidence.join('; ') || '(无)'}${patchContext}`,
        `已查询历史: ${queryHistory.join('; ') || '(无)'}`,
        `可用工具 (通过 function 字段调用):`,
        availableTools,
        `输出 JSON: {"thought":"简短推理","action":"query_graph"|"finalize","function":"工具名","hypothesis":"发现(仅finalize时)","confidence":0.0-1.0}`,
        `规则: 优先使用工具查数据而非猜测。query_graph 可多次调用不同 tool。信息足够或连续2次无新信息时输出 finalize。`,
      ].join('\n');

      try {
        const response = await this.llm.consult(
          '你是组织诊断专家。分析证据，决定下一步行动。',
          context,
          { temperature: 0.3, maxTokens: 500 },
        );

        const parsed = this.parseResponse(response.content);

        // Smart termination: finalize signal
        if (parsed.action === 'finalize') {
          return {
            hypothesis: parsed.hypothesis || '分析完成',
            confidence: parsed.confidence || 0.5,
            roundsUsed: round + 1,
            action: 'finalize',
            queryHistory,
          };
        }

        // Smart termination: check if query function is allowed
        if (parsed.function && !this.isQueryAllowed(parsed.function)) {
          queryHistory.push(`REJECTED: ${parsed.function} (权限不足)`);
          log.warn({ expertType: input.expertType, fn: parsed.function }, '查询被权限策略拒绝');
          continue;
        }

        // Execute query
        if (parsed.action === 'query_graph' && parsed.function) {
          // Pass empty params — ToolRegistry tools handle defaults internally
          const result = await this.executeQuery(parsed.function, {});
          const resultKey = JSON.stringify(result).slice(0, 200);

          // Smart termination: zero information gain
          if (previousResults.has(resultKey)) {
            log.debug('信息增益为零, 终止循环');
            return {
              hypothesis: parsed.thought || '分析完成(无新信息)',
              confidence: 0.4,
              roundsUsed: round + 1,
              action: 'auto_terminate_zero_gain',
              queryHistory,
            };
          }

          previousResults.add(resultKey);
          queryHistory.push(`${parsed.function}: ${resultKey.slice(0, 80)}`);
        }
      } catch (err: any) {
        log.warn({ err, round }, 'ReAct 循环异常');
        queryHistory.push(`ERROR: ${err.message}`);
      }
    }

    // Max rounds reached — forced output
    log.info({ rounds: this.config.maxRounds }, '达到最大轮次, 强制输出');
    try {
      const final = await this.llm.consult(
        '基于以下查询历史, 给出当前最佳假设。只输出 JSON: {"hypothesis":"...","confidence":0.0-1.0}',
        `查询历史: ${queryHistory.join('; ')}`,
        { temperature: 0.3, maxTokens: 300 },
      );
      const parsed = JSON.parse(final.content) as { hypothesis: string; confidence: number };
      return {
        hypothesis: parsed.hypothesis || '无法确定根因',
        confidence: parsed.confidence || 0.3,
        roundsUsed: this.config.maxRounds,
        action: 'max_rounds_forced',
        queryHistory,
      };
    } catch (err) {
      log.warn({ err }, 'LLM 最终调用也失败 — degraded');
      return {
        hypothesis: '分析未完成(达到最大轮次)',
        confidence: 0.2,
        roundsUsed: this.config.maxRounds,
        action: 'max_rounds_forced',
        queryHistory,
      };
    }
  }

  /** Build a human-readable tool list for the LLM prompt */
  private buildToolList(): string {
    if (!this.toolRegistry) return '无可用工具';
    try {
      const tools = (this.toolRegistry as { listTools(): Array<{ name: string; description: string }> }).listTools();
      const readTools = tools.filter(t =>
        !t.name.startsWith('brave_') && !t.name.startsWith('github_')
        || this.policy.allowedQueryFunctions?.includes(t.name)
        || !this.policy.allowedQueryFunctions
      );
      if (readTools.length === 0) return '无可用工具';
      return readTools.slice(0, 15).map(t =>
        `  - ${t.name}: ${t.description.slice(0, 80)}`
      ).join('\n');
    } catch (err) {
      log.warn({ err }, '工具列表获取失败 — degraded');
      return '工具列表不可用';
    }
  }

  private parseResponse(content: string): LLMReActResponse {
    try { return JSON.parse(content); } catch {
      // Direct parse failed — attempt regex extraction, non-critical fallback
      log.debug('LLM response JSON parse failed, attempting regex extraction');
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
    return { thought: content.slice(0, 200), action: 'finalize', confidence: 0.3 };
  }

  // ToolRegistry 注入 (替代硬编码 switch)
  private toolRegistry?: { execute(name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> };

  withToolRegistry(registry: { execute(name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> }): this {
    this.toolRegistry = registry;
    return this;
  }

  private async executeQuery(functionName: string, params?: Record<string, unknown>): Promise<unknown> {
    // Path 1: ToolRegistry (优先 — 统一工具系统, 含 MCP/图查询/专家工具)
    if (this.toolRegistry) {
      const result = await this.toolRegistry.execute(functionName, params || {});
      if (result.error) return { error: result.error };
      return result;
    }

    // Path 2: QueryAPI fallback (向后兼容)
    switch (functionName) {
      case 'findDiagnosticPaths':
        return this.queryApi.findDiagnosticPaths(
          String(params?.fromType || 'Risk'),
          String(params?.toType || 'Person'),
        );
      case 'summarizeSubgraph':
        return this.queryApi.summarizeSubgraph(
          String(params?.rootId || 'root'),
          Number(params?.maxDepth || 3),
        );
      case 'findCrossDimensionalBrokers':
        return this.queryApi.findCrossDimensionalBrokers();
      case 'match_pattern':
        return this.queryApi.matchPattern
          ? this.queryApi.matchPattern((params?.signals as string[]) || [])
          : { error: 'matchPattern not configured' };
      default:
        // Forward unknown tools to query_sog_graph (动态 L4 查询)
        if (this.toolRegistry) {
          return this.toolRegistry.execute('query_sog_graph', { operation: functionName, ...params });
        }
        return { error: `未知查询: ${functionName}` };
    }
  }
}
