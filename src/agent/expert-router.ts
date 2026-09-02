/**
 * src/agent/expert-router.ts — Expert Routing Algorithm (D8c)
 *
 * Auth Doc #4 Agent Engineering Benchmark -- Gap #3.
 * 给定子任务，确定应路由到哪个专家，分派子任务，收集输出。
 *
 * 契约:
 *   @input  — ExpertRequest { subTaskId, expertType, inputFindings, context }
 *   @output — ExpertResponse { subTaskId, analysis, confidence, evidence[], edgeIds[] }
 *   @degraded — 专家 handler 失败 → error response + log.warn
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('agent/expert-router');

// ═══ 类型定义 ═══

/** 专家请求 */
export interface ExpertRequest {
  subTaskId: string;
  expertType: string;
  inputFindings: Array<{ id: string; severity: string; title: string; description: string; sentinel?: string }>;
  context: {
    enterpriseId: string;
    diagnosisId: string;
    previousExpertOutputs?: ExpertResponse[];
  };
}

/** 专家响应 */
export interface ExpertResponse {
  subTaskId: string;
  expertType: string;
  analysis: string;
  confidence: number;
  evidence: string[];
  edgeIds: string[];
  degraded: boolean;
  error?: string;
  durationMs: number;
}

/** 专家 manifest */
export interface ExpertManifest {
  name: string;
  displayName: string;
  description: string;
  tone: string;
  edges: string[];
  computes: string[];
  boundaries: string[];
  frameworks: string[];
}

// ═══ ExpertRouter ═══

/**
 * ExpertRouter — 专家路由算法。
 * 根据子任务的 expertType 选择对应专家，加载 manifest，分派执行。
 */
export class ExpertRouter {
  private expertsDir: string;

  constructor(expertsDir?: string) {
    this.expertsDir = expertsDir ?? path.join(process.cwd(), 'expert');
  }

  /**
   * 分派专家请求。
   * 1. 加载 expert/{type}/manifest.json
   * 2. 验证 manifest + PROMPT.md + IDENTITY.md 存在
   * 3. 调用专家 handler
   * 4. 返回 ExpertResponse
   */
  async dispatch(request: ExpertRequest): Promise<ExpertResponse> {
    const startTime = Date.now();
    const { subTaskId, expertType, inputFindings, context } = request;

    try {
      // 加载 manifest
      const manifest = this.loadExpertManifest(expertType);

      // 验证专家文件存在
      const promptPath = path.join(this.expertsDir, expertType, 'PROMPT.md');
      const identityPath = path.join(this.expertsDir, expertType, 'IDENTITY.md');

      if (!fs.existsSync(promptPath)) {
        log.warn({ expertType, path: promptPath }, '专家 PROMPT.md 不存在 — 降级');
        return {
          subTaskId, expertType, analysis: '', confidence: 0, evidence: [], edgeIds: [],
          degraded: true, error: `专家 ${expertType} PROMPT.md 不存在`, durationMs: Date.now() - startTime,
        };
      }

      // 读取专家提示词
      const promptContent = fs.readFileSync(promptPath, 'utf-8');
      const identityContent = fs.existsSync(identityPath) ? fs.readFileSync(identityPath, 'utf-8') : '';

      // 获取 related edges
      const relatedEdges = manifest?.edges ?? [];

      // 构建分析输出（MVP: 基于 manifest + findings 的文本分析）
      const analysis = this.buildAnalysis(manifest, expertType, inputFindings, promptContent, identityContent);

      const durationMs = Date.now() - startTime;

      log.info({ expertType, subTaskId, durationMs, findingsCount: inputFindings.length }, '专家路由完成');

      return {
        subTaskId,
        expertType,
        analysis,
        confidence: 0.7,
        evidence: inputFindings.map((f) => f.id),
        edgeIds: relatedEdges,
        degraded: false,
        durationMs,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, expertType, subTaskId }, '专家路由失败 — 降级');
      return {
        subTaskId, expertType, analysis: '', confidence: 0, evidence: [], edgeIds: [],
        degraded: true, error: msg, durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 加载专家 manifest。
   * 返回 null 表示 manifest 不存在或解析失败。
   */
  loadExpertManifest(expertType: string): ExpertManifest | null {
    try {
      const manifestPath = path.join(this.expertsDir, expertType, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        log.warn({ expertType }, '专家 manifest.json 不存在');
        return null;
      }
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        name: data.name || expertType,
        displayName: data.displayName || expertType,
        description: data.description || '',
        tone: data.tone || '',
        edges: data.edges || [],
        computes: data.computes || [],
        boundaries: data.boundaries || [],
        frameworks: data.frameworks || [],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, expertType }, '专家 manifest 加载失败 — 降级');
      return null;
    }
  }

  /**
   * 根据输入发现选择最适合的专家类型。
   * MVP: 基于 sentinel ID 的命名惯例匹配。
   * D491: 映射对齐 expert-registry.yaml v2.0 的 7 位专家（D282 删除旧 9 专家命名）。
   * 映射表: docs/plans/codex/implementation/SYNOVA-IMPL-D491-expert-router-test-debt-20260902.md §4.5（按默认表执行，未微调）。
   */
  selectExpert(inputFindings: Array<{ id: string; severity: string; title: string; sentinel?: string }>, fallback = 'host'): string {
    if (!inputFindings || inputFindings.length === 0) return fallback;

    // 从 sentinel ID 推断维度
    for (const f of inputFindings) {
      const s = (f.sentinel || f.id).toLowerCase();
      if (s.includes('finance') || s.includes('cash') || s.includes('margin') || s.includes('cost') || s.includes('revenue') || s.includes('break') || s.includes('dol') || s.includes('npv')) return 'finance-structure';
      if (s.includes('capital')) return 'capital-cycle';
      if (s.includes('market') || s.includes('customer') || s.includes('churn') || s.includes('brand') || s.includes('channel')) return 'customer-cycle';
      if (s.includes('competition') || s.includes('hhi') || s.includes('position') || s.includes('strategy') || s.includes('governance') || s.includes('risk') || s.includes('seven') || s.includes('power')) return 'competitive-strategy';
      if (s.includes('talent') || s.includes('hr') || s.includes('people') || s.includes('org') || s.includes('culture')) return 'talent-cycle';
      if (s.includes('tech') || s.includes('product') || s.includes('innovation') || s.includes('data') || s.includes('system') || s.includes('software') || s.includes('infra')) return 'tech';
    }

    return fallback;
  }

  // ─── 内部方法 ───

  /**
   * 构建专家分析文本（MVP 实现）。
   * 基于 manifest 描述 + 发现组装分析结果。
   */
  private buildAnalysis(
    manifest: ExpertManifest | null,
    expertType: string,
    inputFindings: Array<{ id: string; severity: string; title: string; description: string }>,
    _promptContent: string,
    _identityContent: string,
  ): string {
    const lines: string[] = [];

    // 专家身份
    if (manifest) {
      lines.push(`# ${manifest.displayName} 分析报告`);
      lines.push(`> ${manifest.description}`);
      lines.push('');
      lines.push('## 分析方法论');
      for (const fw of manifest.frameworks) {
        lines.push(`- ${fw}`);
      }
      lines.push('');
    } else {
      lines.push(`# ${expertType} 分析报告`);
      lines.push('');
    }

    // 输入发现
    lines.push('## 输入信号');
    for (const f of inputFindings) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`);
    }
    lines.push('');

    // 分析结果
    lines.push('## 分析结果');
    lines.push(`基于 ${inputFindings.length} 个信号进行分析。`);
    if (manifest) {
      lines.push(`应用 ${manifest.frameworks.length} 个分析框架: ${manifest.frameworks.slice(0, 3).join(', ')}...`);
      lines.push(`参考 ${manifest.edges.length} 条因果边: ${manifest.edges.join(', ')}`);
    }

    return lines.join('\n');
  }
}
