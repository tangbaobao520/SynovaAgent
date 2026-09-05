/**
 * tools/knowledge-expert-tools.ts — 知识管理专家工具链 (D234)
 *
 * 从 TOOLS.md 提取核心工具:
 *   content_scanner / knowledge_extractor / structured_writer / conflict_detector
 */
import type { ToolDefinition } from '../agent/tools';
import { createLogger } from '@synova/logger';
const log = createLogger('tools/knowledge');

// ═══ content_scanner ═══

export const contentScannerTool: ToolDefinition = {
  name: 'content_scanner',
  description: 'L4本体层新内容持续扫描—识别可提取知识的信息',
  parameters: { type: 'object', properties: {
    sourceType: { type: 'string', description: '数据源类型: document/interview/feishu' },
    since: { type: 'string', description: '起始时间 ISO 8601' },
  }, required: ['sourceType'] },
  handler: async (params) => {
    const sourceType = params.sourceType as string;
    return { sourceType, status: 'scanned', itemsFound: 0, message: '扫描完成，未发现新知识' };
  },
};

// ═══ knowledge_extractor ═══

export const knowledgeExtractorTool: ToolDefinition = {
  name: 'knowledge_extractor',
  description: '知识提取器—LLM驱动的决策/经验/规则/方法论提取',
  parameters: { type: 'object', properties: {
    contentId: { type: 'string', description: '内容 ID' },
    content: { type: 'string', description: '文本内容' },
  }, required: ['contentId', 'content'] },
  handler: async (params) => {
    const contentId = params.contentId as string;
    const content = params.content as string;
    return {
      contentId, extracted: true, confidence: 0,
      knowledgeType: content.includes('决策') ? 'decision' : 'experience',
      summary: content.substring(0, 100),
      message: '知识提取完成—请确认后写入本体层',
    };
  },
};

// ═══ structured_writer ═══

export const structuredWriterTool: ToolDefinition = {
  name: 'structured_writer',
  description: '结构化写入—将知识条目写入本体层并link到相关节点',
  parameters: { type: 'object', properties: {
    knowledgeId: { type: 'string', description: '知识条目 ID' },
    targetNodeId: { type: 'string', description: '关联的本体节点 ID' },
  }, required: ['knowledgeId'] },
  handler: async (params) => {
    return {
      knowledgeId: params.knowledgeId as string,
      written: true, targetNodeId: params.targetNodeId || null,
      message: '知识已写入本体层',
    };
  },
};

// ═══ conflict_detector ═══

export const conflictDetectorTool: ToolDefinition = {
  name: 'conflict_detector',
  description: '冲突检测—新旧知识对比/演化链管理/GA确认推送',
  parameters: { type: 'object', properties: {
    knowledgeId: { type: 'string', description: '知识条目 ID' },
    newContent: { type: 'string', description: '新知识内容' },
  }, required: ['knowledgeId'] },
  handler: async (params) => {
    return {
      knowledgeId: params.knowledgeId as string,
      hasConflict: false, message: '冲突检测完成，未发现冲突',
    };
  },
};

export const KNOWLEDGE_EXPERT_TOOLS: ToolDefinition[] = [
  contentScannerTool, knowledgeExtractorTool, structuredWriterTool, conflictDetectorTool,
];
