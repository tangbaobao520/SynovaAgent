/**
 * l3/tone-enforcer.ts — Tone后处理管线 (D57)
 *
 * 在报告输出管线上做确定性规则后处理，确保专家输出符合Tone规范。
 * 纯正则检测，不依赖LLM。
 *
 * 第10份权威文档 第五章:
 *   §5.1: Tone优先级 — P0(Professional objectivity) > P1(温暖度) > P2(性格表达)
 *   §5.3: 角色一致性 — 财务专家不说战略专家的语言
 *   §5.4: 报告输出格式 — 散文而非Markdown列表
 *
 * 铁律 24+31: catch + log.warn + degraded 信号
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l3/tone-enforcer');

// ═══ Types ═══

export interface EnforceReportResult {
  text: string;
  degraded: boolean;
}

export interface EnforceConversationResult {
  text: string;
  multiQuestion: boolean;
}

export interface EnforceRoleConsistencyResult {
  text: string;
  warnings: string[];
}

// ═══ Helpers ═══

/** 判断行是否为列表项（-, *, 数字. 开头） */
function isListItem(line: string): boolean {
  return /^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line);
}

/** 从列表行提取内容（去掉前缀标记） */
function extractListItemContent(line: string): string {
  return line.replace(/^\s*[-*]\s/, '').replace(/^\s*\d+\.\s/, '').trim();
}

// ═══ enforceReport ═══

/**
 * 将报告中的列表格式转换为散文段落。
 *
 * 检测策略:
 *   逐行扫描，遇到列表项行开始收集连续的列表块。
 * 转换策略:
 *   2-3个列表项 → "几个因素同时作用：{item1}。{item2}。"
 *   4+个列表项 → 分段，每段以自然语言引导
 *
 * @param text - 输入文本
 * @returns 转换后的文本 + degraded标记
 */
export function enforceReport(text: string): EnforceReportResult {
  if (!text || typeof text !== 'string') {
    return { text: text ?? '', degraded: true };
  }

  try {
    const lines = text.split('\n');
    const result: string[] = [];
    let listBuffer: string[] = [];
    let inList = false;

    function flushList(): void {
      if (listBuffer.length === 0) return;

      if (listBuffer.length <= 3) {
        // 2-3项: 合并为一句
        const joined = listBuffer.join('。');
        result.push(`几个因素同时作用：${joined}。`);
      } else {
        // 4+项: 分段，每段自然语言引导
        const first = listBuffer.slice(0, Math.ceil(listBuffer.length / 2));
        const second = listBuffer.slice(Math.ceil(listBuffer.length / 2));
        result.push(`多个因素共同影响：${first.join('、')}。`);
        result.push(`此外，${second.join('、')}也起到了作用。`);
      }
      listBuffer = [];
      inList = false;
    }

    for (const line of lines) {
      if (isListItem(line)) {
        listBuffer.push(extractListItemContent(line));
        inList = true;
      } else {
        if (inList) flushList();
        result.push(line);
      }
    }
    if (inList) flushList();

    const output = result.join('\n');
    return { text: output, degraded: output === text ? false : true };
  } catch (err) {
    log.warn({ err }, 'enforceReport 异常 — 返回原文本 degraded');
    return { text, degraded: true };
  }
}

// ═══ enforceConversation ═══

/**
 * 检测对话文本中是否包含连续多个问号。
 * 仅标记，不截断原文。
 *
 * @param text - 输入文本
 * @returns 原文 + multiQuestion标记
 */
export function enforceConversation(text: string): EnforceConversationResult {
  if (!text || typeof text !== 'string') {
    return { text: text ?? '', multiQuestion: false };
  }

  try {
    // 检测相邻的两个或以上 ? 或 ？
    const multiQuestion = /[?？]{2,}/.test(text);
    return { text, multiQuestion };
  } catch {
    return { text, multiQuestion: false };
  }
}

// ═══ Role consistency keywords ═══

/**
 * 按专家领域的领域关键词映射。
 * enforceRoleConsistency 使用此映射检测跨域术语混用。
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: ['现金流', '毛利率', 'ROI', '成本结构', '资本效率', '杜邦分析', '盈亏平衡', '杠杆', '折旧'],
  strategy: ['竞争壁垒', '波特五力', 'S曲线', '利润池', '护城河', '市场定位', '差异化'],
  marketing: ['品牌', '客户获取', 'LTV', 'CAC', '渠道', '转化率', '市场份额', '定价'],
  org: ['组织架构', '激励机制', '委托代理', '人才密度', 'Bus Factor', '杨三角'],
  tech: ['技术栈', 'API', 'MCP', 'Agent就绪', '技术债务', '连接器', '软件生态'],
  business_model: ['商业模式', '收入模型', '单位经济学', '飞轮', '网络效应', '规模效应'],
  action: ['行动清单', '优先级', '依赖链', '约束理论', '执行跟踪'],
  knowledge: ['知识', '文档', '方法论'],
  host: ['主持人', '调度', '转述'],
};

/**
 * 检测专家输出中是否使用了其他领域的专业术语。
 * 不修改文本，仅返回 warnings。
 *
 * @param text      - 专家输出文本
 * @param expertTone - 当前专家的tone描述（含领域名或专业特征）
 * @returns 原文 + warnings[]
 */
export function enforceRoleConsistency(
  text: string,
  expertTone: string,
): EnforceRoleConsistencyResult {
  const warnings: string[] = [];

  if (!text || typeof text !== 'string') {
    return { text: text ?? '', warnings };
  }

  try {
    // 从tone描述中推断当前专家类型
    const toneLower = expertTone.toLowerCase();
    let currentDomain = '';
    for (const [domain] of Object.entries(DOMAIN_KEYWORDS)) {
      if (toneLower.includes(domain)) {
        currentDomain = domain;
        break;
      }
    }
    if (!currentDomain) return { text, warnings };

    // 检查文本中是否包含其他领域的专业术语
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      if (domain === currentDomain) continue;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          warnings.push(`检测到${domain}领域术语"${kw}"，当前专家可能使用了不属于本领域的表达`);
          break; // 每个域只报一次
        }
      }
    }

    return { text, warnings };
  } catch (err) {
    log.warn({ err }, 'enforceRoleConsistency 异常');
    return { text, warnings };
  }
}
