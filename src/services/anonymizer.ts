/**
 * src/services/anonymizer.ts — 联邦知识脱敏引擎 (D244)
 *
 * 模块四 §二-§四: 跨企业知识共享前脱敏。
 * 企业名→[企业A], 地区→[华东], 精确数字→区间。
 *
 * 契约:
 *   @input  — KnowledgeChunk (含 text, orgId, metadata)
 *   @output — { anonymizedText, replacedCount }
 *   @degraded — 文本为空 → 原样返回 + degraded
 */
import { createLogger } from "@synova/logger";

const log = createLogger("services/anonymizer");

// ═══ 模式 ═══

/** 企业名称模式: 中文/英文公司名 */
const COMPANY_PATTERNS = [
  /\b[A-Z][a-zA-Z]{2,}(?:Inc|Corp|Ltd|LLC|GmbH|Co|Group|Tech|AI|Data|System|Solution|Global|Digital|Cloud|Network|Venture|Capital|Partner|Consulting)\b/g,
  /(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|天津|重庆|厦门|长沙|西安|青岛|大连|宁波|东莞)[一-鿿]{1,10}(?:科技|技术|信息|数据|网络|智能|创新|企业|咨询|服务|管理|投资|贸易|股份|有限公[司]|有限公司)/g,
  /[一-鿿]{2,8}(?:科技|技术|信息|数据|网络|智能|创新|企业|咨询|服务|管理|投资|贸易)/g,
];

/** 地区模式: 省/市/区 */
const REGION_PATTERNS = [
  /(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州)(?:市)?/g,
  /(?:华东|华北|华南|华中|西南|西北|东北)/g,
];

/** 精确数字→区间: 金额/人数/百分比 */
const NUMBER_PATTERNS = [
  /(\d{2,})(?:万|亿)?元/g,
  /\b(\d{3,})\s*(?:人|名|位)\b/g,
  /(\d{2,}(?:\.\d+)?)\s*%/g,
];

/** 邮箱 */
const EMAIL_PATTERN = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/g;

/** 电话号码 */
const PHONE_PATTERN = /1[3-9]\d{9}|\b0\d{2,3}-?\d{7,8}\b/g;

/** IP 地址 */
const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

// ═══ 替换逻辑 ═══

interface ReplaceResult {
  text: string;
  count: number;
}

function replacePatterns(
  text: string,
  patterns: RegExp[],
  replacement: (match: string, index: number) => string,
): ReplaceResult {
  let count = 0;
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, (match: string) => {
      count++;
      return replacement(match, count);
    });
  }
  return { text: result, count };
}

/** 精确数字→区间映射 */
function numberToRange(num: number): string {
  if (num < 100) return `${Math.floor(num / 10) * 10}-${Math.ceil(num / 10) * 10}`;
  if (num < 1000) return `${Math.floor(num / 100) * 100}-${Math.ceil(num / 100) * 100}`;
  if (num < 10000) return `${Math.floor(num / 1000) * 1000}-${Math.ceil(num / 1000) * 1000}`;
  return `${Math.floor(num / 10000)}万-${Math.ceil(num / 10000)}万`;
}

// ═══ Anonymizer ═══

export interface AnonymizeResult {
  anonymizedText: string;
  replacedCount: number;
  degraded: boolean;
}

export class Anonymizer {
  /**
   * 对知识文本执行脱敏。
   *
   * @param text — 原始知识文本
   * @returns AnonymizeResult
   */
  anonymize(text: string): AnonymizeResult {
    if (!text || !text.trim()) {
      return { anonymizedText: text, replacedCount: 0, degraded: true };
    }

    let totalCount = 0;
    let current = text;

    // 1. 替换企业名称
    const companyResult = replacePatterns(current, COMPANY_PATTERNS, (_, i) => `[企业${String.fromCharCode(64 + i)}]`);
    current = companyResult.text;
    totalCount += companyResult.count;

    // 2. 替换地区
    const regionResult = replacePatterns(current, REGION_PATTERNS, (_match) => {
      const regions = ["华东", "华北", "华南", "华中", "西南", "西北", "东北"];
      return `[${regions[Math.floor(Math.random() * regions.length)]}]`;
    });
    current = regionResult.text;
    totalCount += regionResult.count;

    // 3. 替换精确数字→区间
    current = current.replace(NUMBER_PATTERNS[0], (match) => {
      const numStr = match.replace(/元$/, "").replace(/万$/, "0000").replace(/亿$/, "00000000");
      const num = parseInt(numStr, 10);
      if (isNaN(num)) return match;
      totalCount++;
      const unit = match.endsWith("亿元") ? "亿元" : match.endsWith("万元") ? "万元" : match.endsWith("元") ? "元" : "";
      return `${numberToRange(num)}${unit}`;
    });

    current = current.replace(NUMBER_PATTERNS[1], (match) => {
      const num = parseInt(match.replace(/[^0-9]/g, ""), 10);
      if (isNaN(num)) return match;
      totalCount++;
      return `${numberToRange(num)}人`;
    });

    current = current.replace(NUMBER_PATTERNS[2], (match) => {
      const pct = parseFloat(match.replace("%", ""));
      if (isNaN(pct)) return match;
      totalCount++;
      return `${Math.floor(pct / 10) * 10}-${Math.ceil(pct / 10) * 10}%`;
    });

    // 4. 替换邮箱
    current = current.replace(EMAIL_PATTERN, () => {
      totalCount++;
      return `[邮箱@企业]`;
    });

    // 5. 替换电话号码
    current = current.replace(PHONE_PATTERN, () => {
      totalCount++;
      return `[电话]`;
    });

    // 6. 替换 IP
    current = current.replace(IP_PATTERN, () => {
      totalCount++;
      return `[IP地址]`;
    });

    log.info({ replacedCount: totalCount, originalLen: text.length }, "知识脱敏完成");
    return { anonymizedText: current, replacedCount: totalCount, degraded: false };
  }
}
