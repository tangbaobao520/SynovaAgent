/**
 * doc-extractor.ts — 八维度文档提取器 (MVP Phase 0)
 * @state: skeleton — 代码逻辑正确，但 LLM API 未在生产环境通过真实管线验证
 *
 * L3 模块：消费文档文本 → LLM 提取八维度信息 → 写入 GraphStore
 * 架构边界：只依赖 L4 (GraphStore) + LLM Client，不依赖 L2/L1
 */

import type { GraphStore } from './graph-store';
import { SOGNodeType } from '@synova/sog-core';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/doc-extractor');

// ═══ Types ═══

/** 八维度定义 */
export const EIGHT_DIMENSIONS = [
  { key: 'mission',          label: '任务目标',   question: '长期愿景和近期战略目标是什么？' },
  { key: 'businessModel',    label: '业务价值',   question: '主营业务、价值主张、盈利模式？' },
  { key: 'currentState',     label: '现状起点',   question: '现有组织架构、已有资产、团队规模？' },
  { key: 'resources',        label: '资源约束',   question: '预算、人员、技术栈限制？' },
  { key: 'risks',            label: '风险瓶颈',   question: '最担心什么？踩过哪些坑？' },
  { key: 'successCriteria',  label: '成功标准',   question: '北极星指标是什么？怎么衡量成功？' },
  { key: 'marketPositioning',label: '市场定位',   question: '客户用什么词描述你？差异化是否实质？' },
  { key: 'digitalFoundation',label: '数字底座',   question: '日常运转用哪些系统和工具？效率如何？' },
] as const;

export interface DimensionExtraction {
  dimensionKey: string;
  dimensionLabel: string;
  content: string;          // 提取到的具体信息
  confidence: 'high' | 'medium' | 'low';
  sufficient: boolean;      // 信息是否足够支撑诊断
}

export interface ExtractionResult {
  documentId: string;
  extractedAt: string;      // ISO-8601
  dimensions: DimensionExtraction[];
  coveredCount: number;     // 足够支撑诊断的维度数
  totalCount: number;       // 8
  /** 缺失/不足的维度 */
  insufficientDimensions: string[];
}

// ═══ LLM Client Interface ═══

export interface LLMClient {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

// ═══ Extractor ═══

export class DocExtractor {
  constructor(
    private graphStore: GraphStore,
    private llm: LLMClient,
  ) {}

  /**
   * 提取文档中的八维度信息。
   * Step 1: LLM 读取全文 → 按八维度分类提取
   * Step 2: 写入 GraphStore：更新 Document 节点 props + 创建维度节点 + 边
   */
  async extract(
    documentId: string,
    content: string,
    graph: string, // orgId / teamId
  ): Promise<ExtractionResult> {
    log.info({ documentId, contentLen: content.length }, '开始八维度提取');

    // Step 1: LLM extraction
    const dimensions = await this.llmExtract(content);

    // Step 2: Write to GraphStore
    await this.persistExtraction(documentId, dimensions, graph);

    const covered = dimensions.filter(d => d.sufficient);

    const result: ExtractionResult = {
      documentId,
      extractedAt: new Date().toISOString(),
      dimensions,
      coveredCount: covered.length,
      totalCount: EIGHT_DIMENSIONS.length,
      insufficientDimensions: dimensions
        .filter(d => !d.sufficient)
        .map(d => d.dimensionLabel),
    };

    log.info({ documentId, coveredCount: covered.length, total: EIGHT_DIMENSIONS.length },
      '八维度提取完成');

    return result;
  }

  private async llmExtract(content: string): Promise<DimensionExtraction[]> {
    const dimensionList = EIGHT_DIMENSIONS
      .map(d => `${d.label}(${d.key}): ${d.question}`)
      .join('\n');

    const prompt = `你是一位企业诊断顾问。请从以下文档中提取八维度关键信息。

文档内容：
"""
${content.slice(0, 16000)}
"""

你要提取的八个维度：
${dimensionList}

返回 JSON 数组（只返回 JSON，不要其他文字）：
[{
  "dimensionKey": "mission",
  "dimensionLabel": "任务目标",
  "content": "提取到的具体信息（引用原文关键句）",
  "confidence": "high|medium|low",
  "sufficient": true/false
}, ...]

规则：
- 每个维度独立提取。如果文档中没有涉及该维度的信息，content 写"未提及"，confidence 为"low"，sufficient 为 false
- 不要编造文档中没有的信息
- 置信度 high = 有明确数据或陈述，medium = 有模糊提及，low = 推断或未提及`;

    const response = await this.llm.complete(prompt,
      '你是一位严谨的企业诊断专家。只提取文档中实际存在的信息，不编造。');

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        log.warn({ response: response.slice(0, 200) }, 'LLM 返回未包含 JSON 数组');
        return this.emptyExtraction();
      }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return this.emptyExtraction();

      // Validate and fill missing dimensions
      const resultMap = new Map(parsed.map((d: DimensionExtraction) => [d.dimensionKey, d]));
      return EIGHT_DIMENSIONS.map(d => {
        const existing = resultMap.get(d.key);
        return existing || {
          dimensionKey: d.key,
          dimensionLabel: d.label,
          content: '提取失败',
          confidence: 'low' as const,
          sufficient: false,
        };
      });
    } catch (e) {
      log.error({ err: e }, '解析 LLM 提取结果失败');
      return this.emptyExtraction();
    }
  }

  private emptyExtraction(): DimensionExtraction[] {
    return EIGHT_DIMENSIONS.map(d => ({
      dimensionKey: d.key,
      dimensionLabel: d.label,
      content: '解析失败',
      confidence: 'low' as const,
      sufficient: false,
    }));
  }

  private async persistExtraction(
    documentId: string,
    dimensions: DimensionExtraction[],
    graph: string,
  ): Promise<void> {
    // Update Document node props with extraction results
    try {
      this.graphStore.updateNode(documentId, {
        extraction_dimensions: dimensions.map(d => ({
          key: d.dimensionKey,
          label: d.dimensionLabel,
          confidence: d.confidence,
          sufficient: d.sufficient,
        })),
        extraction_content: dimensions.reduce((acc, d) => {
          acc[d.dimensionKey] = d.content;
          return acc;
        }, {} as Record<string, string>),
        extraction_completed_at: new Date().toISOString(),
        covered_count: dimensions.filter(d => d.sufficient).length,
        total_count: EIGHT_DIMENSIONS.length,
      }, graph);
    } catch (e) {
      log.warn({ documentId, err: e }, 'updateNode for extraction failed — attempting createNode path');
      // If the document node doesn't exist (first upload), create it
      this.graphStore.createNode(
        SOGNodeType.DOCUMENT,
        {
          name: `diagnosis_doc_${documentId}`,
          extraction_dimensions: dimensions.map(d => ({
            key: d.dimensionKey,
            label: d.dimensionLabel,
            confidence: d.confidence,
            sufficient: d.sufficient,
          })),
          extraction_content: dimensions.reduce((acc, d) => {
            acc[d.dimensionKey] = d.content;
            return acc;
          }, {} as Record<string, string>),
          extraction_completed_at: new Date().toISOString(),
          covered_count: dimensions.filter(d => d.sufficient).length,
          total_count: EIGHT_DIMENSIONS.length,
        },
        graph,
      );
    }
  }
}
