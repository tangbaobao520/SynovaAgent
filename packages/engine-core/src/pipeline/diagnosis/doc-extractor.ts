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

/** 八维度定义（v2.1 增强——含子维度提示，提升不同行业提取准确度） */
export const EIGHT_DIMENSIONS = [
  { key: 'mission', label: '任务目标', question: '长期愿景是什么？未来1-3年的具体战略目标是什么？（如营收目标、市场地位、产品里程碑）。创始人或CEO的核心意图是什么？' },
  { key: 'businessModel', label: '业务价值', question: '主营业务是什么？怎么收费？（产品/项目/订阅/平台/分销）。价值主张：客户为什么选你而不是竞品？毛利率和净利率大概多少？收入结构：哪些产品/客户贡献主要收入？' },
  { key: 'currentState', label: '现状起点', question: '团队多少人？组织架构是怎样的？核心资产有哪些（设备/技术/品牌/客户关系）？成立多久？目前处于什么发展阶段？' },
  { key: 'resources', label: '资源约束', question: '预算是否紧张？核心人员是否充足？技术或设备有没有瓶颈？时间窗口有没有压力？有什么"想做但没资源做"的事？' },
  { key: 'risks', label: '风险瓶颈', question: '创始人最担心的事是什么？过去踩过什么坑？有没有单一客户/单一供应商/单一人力依赖？现金流有没有压力？竞争对手在做什么？' },
  { key: 'successCriteria', label: '成功标准', question: '怎么定义成功？（营收/利润/市场份额/客户数/续约率）。3年后理想状态是什么样的？有哪些可量化的里程碑？' },
  { key: 'marketPositioning', label: '市场定位', question: '客户怎么评价你们？和竞品比，差异化是什么？（品质/价格/服务/速度/定制化）。差异化是实质性的还是嘴上说的？客户续约率或复购率大概多少？' },
  { key: 'digitalFoundation', label: '数字底座', question: '日常运转用哪些系统和工具？（ERP/CRM/飞书/钉钉/Excel）。数据准不准？系统之间通不通？有没有数字化瓶颈？（如手工排期、数据孤岛）。用AI工具了吗？' },
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

    const prompt = `你是一位资深企业诊断顾问。你正在分析一份企业访谈文档，需要从中提取八个维度的关键信息。

## 文档内容
"""
${content.slice(0, 16000)}
"""

## 需要提取的八个维度
${dimensionList}

## 输出格式
返回 JSON 数组（只返回 JSON，不要 Markdown 代码块包裹）：
[{
  "dimensionKey": "mission",
  "dimensionLabel": "任务目标",
  "content": "提取到的具体信息——引用原文关键句或数据。如果文档中完全没有涉及，写'未提及'",
  "confidence": "high|medium|low",
  "sufficient": true/false
}, ...]

## 置信度标准
- high: 文档中有明确的数字、原话、具体陈述支撑该维度（如"目标3年5000万""毛利率45%"）
- medium: 文档中有模糊提及或可合理推断，但缺乏具体数据
- low: 文档中未涉及或完全基于猜测

## sufficient 标准
- true: 提取到的信息足够支撑一位诊断专家做出有信心的判断
- false: 信息太少或太模糊——即使给诊断专家，也无法据此给出可靠结论

## 提取原则
1. 每个维度独立提取，不交叉污染
2. 优先引用原文中的具体数字和原话（如"王总原话：..."）
3. 不编造文档中没有的信息。如果文档没提到，诚实写"未提及"
4. 注意区分"创始人说的"和"可以从数据推断的"——不要混淆
5. 对于制造业/零售/餐饮等实体行业，特别注意产能利用率、库存周转、翻台率等行业特定指标
6. 对于SaaS/服务业，特别注意续费率、LTV/CAC、核心人依赖等指标

## 高质量提取示例
输入文档片段: "王总说3年要做到西南头部，营收从2000万涨到5000万。我们毛利率45%，但净利只有15%。核心讲师就3个，张老师一个人扛60%的课。"

正确提取:
{
  "dimensionKey": "mission",
  "content": "3年成为西南企业服务头部。年营收2000万→5000万。王总原话：'要做到西南头部'",
  "confidence": "high",
  "sufficient": true
}

错误提取（编造）:
{
  "dimensionKey": "mission",
  "content": "目标3年IPO上市",  ← 文档未提及IPO
  "confidence": "high",
  "sufficient": true
}`;

    const response = await this.llm.complete(prompt,
      '你是一位严谨的企业诊断专家。你的唯一任务是忠实提取文档中的信息——不编造、不遗漏、不推理过度。每条提取要么引用原文，要么诚实标注"未提及"。');

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
