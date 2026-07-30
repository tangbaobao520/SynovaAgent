/**
 * l4/department-memory-store.ts — D284 跨部门信号检测引擎
 *
 * 开发者任务地图 N11: 扫描 AgentMemoryStore 中的 fact 条目，
 * 检测跨部门关联→匿名摘要→CrossDeptSignal[] 输出。
 *
 * 数据流:
 *   agent_memory (fact, tags: ['dept:XX']) → scanCrossDeptSignals()
 *     → 关键词匹配 + 多部门 crossover
 *       → CrossDeptSignal[] → emitSignal() → .codex/signals/cross-dept.json
 *
 * 契约:
 *   @input  — AgentMemoryStore instance + enterpriseId
 *   @output — CrossDeptSignal[]
 *   @degraded — store.list() 返回空 → 返回 [] 不报错
 */
import { createLogger } from '@synova/logger';
import type { MemoryEntry } from './agent-memory-store';

const log = createLogger('l4/department-memory-store');

// ═══ 类型定义 ═══

export interface CrossDeptSignal {
  id: string;
  detectedAt: string;
  enterpriseId: string;
  category: 'customer_complaint' | 'product_defect' | 'process_block' | 'resource_conflict';
  anonymizedSummary: string;
  matchedDeptCount: number;
  confidence: number;
  sourceMemoryKeys: string[];
}

// ═══ 内置关键词表 ═══

interface KeywordRule {
  category: CrossDeptSignal['category'];
  keywords: string[];
  label: string;             // 摘要中用
  deptPatterns: string[];    // 匹配后关注哪些部门（含这些词的条目一起判断）
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'customer_complaint',
    keywords: ['投诉', '不满', '退款', '差评', '客诉', '客户投诉'],
    label: '客户投诉',
    deptPatterns: ['dept:customer', 'dept:sales', 'dept:support', 'dept:service'],
  },
  {
    category: 'product_defect',
    keywords: ['bug', '缺陷', '故障', '崩溃', '产品质量', '产品缺陷'],
    label: '产品缺陷',
    deptPatterns: ['dept:engineering', 'dept:rd', 'dept:product', 'dept:研发', 'dept:技术'],
  },
  {
    category: 'process_block',
    keywords: ['审批慢', '卡住', '等待', '阻塞', '流程慢', '效率低'],
    label: '流程阻塞',
    deptPatterns: ['dept:ops', 'dept:hr', 'dept:admin', 'dept:运营'],
  },
  {
    category: 'resource_conflict',
    keywords: ['预算不足', '人手不够', '资源紧张', '缺人', '缺预算'],
    label: '资源冲突',
    deptPatterns: ['dept:finance', 'dept:hr', 'dept:各'],
  },
];

// ═══ 匿名化 ═══

/** 从 tags 数组中提取部门名 */
function extractDeptName(tags: string[]): string {
  const deptTag = tags.find(t => t.startsWith('dept:'));
  if (!deptTag) return '某团队';
  return deptTag.replace('dept:', '');
}

/** 匿名化摘要：不暴露来源部门名 */
function anonymize(summary: string, involvedDepts: string[]): string {
  let result = summary;
  for (const dept of involvedDepts) {
    if (dept && dept.length > 0) {
      result = result.replace(new RegExp(dept, 'g'), '某部门');
    }
  }
  return result;
}

/** 生成匿名摘要文本 */
function buildSummary(category: CrossDeptSignal['category'], matchCount: number): string {
  const labels: Record<string, string> = {
    customer_complaint: '存在客户投诉类信号',
    product_defect: '存在产品缺陷类信号',
    process_block: '存在流程阻塞类信号',
    resource_conflict: '存在资源冲突类信号',
  };
  return `${labels[category]}，涉及 ${matchCount} 个部门。建议相关团队关注并协调。`;
}

/** 生成唯一 ID */
function nextId(): string {
  return `cds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 检测文本是否包含关键词 */
function matchKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ═══ AgentMemoryStoreLike 接口 ═══
// 只依赖 list() 方法，避免直接 import AgentMemoryStore 类

export interface AgentMemoryStoreLike {
  list(query: {
    orgId: string;
    type?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): MemoryEntry[];
  searchMemory(orgId: string, query: string, limit?: number): MemoryEntry[];
}

// ═══ 跨部门信号检测 ═══

/**
 * 扫描企业记忆，检测跨部门关联信号。
 *
 * @param store        — AgentMemoryStore 实例
 * @param enterpriseId — 企业 ID
 * @param windowDays   — 扫描窗口（默认 30 天）
 * @returns CrossDeptSignal[]
 */
export function scanCrossDeptSignals(
  store: AgentMemoryStoreLike,
  enterpriseId: string,
  windowDays: number = 30,
): CrossDeptSignal[] {
  const signals: CrossDeptSignal[] = [];
  const now = new Date();

  try {
    // 1. 获取企业 fact 条目
    const entries = store.list({
      orgId: enterpriseId,
      type: 'fact',
      limit: 1000,
    });

    if (entries.length === 0) {
      log.info({ enterpriseId }, '跨部门扫描: 无 fact 条目');
      return [];
    }

    // 2. 过滤时间窗口
    const cutoff = new Date(now.getTime() - windowDays * 86_400_000);
    const recent = entries.filter(e => new Date(e.createdAt) >= cutoff);
    log.debug({ enterpriseId, total: entries.length, recent: recent.length, windowDays }, '跨部门扫描: 条目统计');

    if (recent.length === 0) {
      return [];
    }

    // 3. 逐类关键词匹配
    for (const rule of KEYWORD_RULES) {
      const matched = recent.filter(e => {
        const text = `${e.value} ${e.key}`;
        return matchKeywords(text, rule.keywords);
      });

      if (matched.length === 0) continue;

      // 4. 提取涉及的部门
      const deptSet = new Set<string>();
      for (const m of matched) {
        const dept = extractDeptName(m.tags || []);
        if (dept !== '某团队') deptSet.add(dept);
      }

      // 5. 只在跨部门时触发信号（≥2 不同部门）
      if (deptSet.size < 2) continue;

      // 6. 构建匿名摘要
      const involvedDepts = [...deptSet];
      const summary = buildSummary(rule.category, involvedDepts.length);
      const anonymized = anonymize(summary, involvedDepts);

      // 7. 置信度: 匹配条目数 / 总条目数
      const confidence = Math.min(1.0, matched.length / Math.max(recent.length, 1) * 5);

      signals.push({
        id: nextId(),
        detectedAt: now.toISOString(),
        enterpriseId,
        category: rule.category,
        anonymizedSummary: anonymized,
        matchedDeptCount: involvedDepts.length,
        confidence: Math.round(confidence * 100) / 100,
        sourceMemoryKeys: matched.map(m => m.key),
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, enterpriseId }, '跨部门信号扫描失败 — 降级');
    return [];
  }

  // 8. 发射控制塔信号
  if (signals.length > 0) {
    try {
      const { execSync } = require('child_process');
      const path = require('path');
      const script = path.join(process.cwd(), 'scripts/control-tower/emit-signal.py');
      execSync(
        `python "${script}" cross-dept yellow "${signals.length} 个跨部门信号" --p0 0 --p1 ${signals.length}`,
        { timeout: 5000, stdio: 'ignore' },
      );
    } catch (err) {
      log.warn({ err }, '跨部门信号 emitSignal 失败 — 降级');
    }
  }

  log.info({ enterpriseId, signals: signals.length }, '跨部门信号扫描完成');
  return signals;
}
