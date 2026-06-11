/**
 * sensitivity-rules.ts — 诊断隐私控制
 *
 * 对标 Claw-Code permissions.rs 的层级可见性：
 *   - 敏感字段自动检测（薪资/绩效/健康/身份）
 *   - 按 DiagnosisPermissionLevel 脱敏
 *   - 字段级标注（redact / anonymize / allow）
 *   - 审计日志记录每次脱敏决策
 *
 * 敏感度分类：
 *   PII        — 个人身份信息（姓名、手机、邮箱）
 *   FINANCIAL  — 财务数据（薪资、股权、奖金）
 *   PERFORMANCE — 绩效评估（评级、360 反馈原文）
 *   HEALTH     — 健康/心理状态
 *   CONFLICT   — 人际冲突细节
 *   STRATEGIC  — 战略/商业机密
 */

import { DiagnosisPermissionLevel } from './types';

// ====================================================================
// 类型定义
// ====================================================================

/** 敏感度类别 */
export type SensitivityCategory =
  | 'pii'
  | 'financial'
  | 'performance'
  | 'health'
  | 'conflict'
  | 'strategic';

/** 脱敏动作 */
export type RedactAction = 'allow' | 'anonymize' | 'redact' | 'summarize';

/** 敏感字段检测结果 */
export interface SensitivityMatch {
  /** 字段名或路径 */
  field: string;
  /** 敏感度类别 */
  category: SensitivityCategory;
  /** 匹配到的敏感关键词 */
  matchedKeyword: string;
  /** 所需的最低查看权限 */
  minLevel: DiagnosisPermissionLevel;
}

/** 脱敏规则 */
export interface SensitivityRule {
  /** 规则名 */
  name: string;
  /** 敏感度类别 */
  category: SensitivityCategory;
  /** 触发关键词（支持中文和英文） */
  keywords: string[];
  /** 最低查看权限 */
  minLevel: DiagnosisPermissionLevel;
  /** 低于权限时的默认动作 */
  defaultAction: RedactAction;
}

/** 脱敏后的字段 */
export interface RedactedField {
  field: string;
  originalCategory: SensitivityCategory;
  action: RedactAction;
  /** 脱敏后的值（redact = "***"，anonymize = 替换标识符，summarize = 摘要） */
  sanitizedValue?: string;
}

/** 脱敏审计记录 */
export interface RedactionAuditEntry {
  field: string;
  category: SensitivityCategory;
  action: RedactAction;
  requesterLevel: DiagnosisPermissionLevel;
  requiredLevel: DiagnosisPermissionLevel;
  timestamp: string;
}

// ====================================================================
// 内置敏感规则库
// ====================================================================

const BUILTIN_RULES: SensitivityRule[] = [
  // PII
  {
    name: 'pii-name',
    category: 'pii',
    keywords: ['姓名', '名字', 'name', '身份证', '手机号', '电话', '邮箱', 'email', '地址', '住址'],
    minLevel: DiagnosisPermissionLevel.INITIATOR_ONLY,
    defaultAction: 'redact',
  },
  // Financial
  {
    name: 'financial-salary',
    category: 'financial',
    keywords: ['薪资', '工资', 'salary', '年薪', 'compensation', '奖金', 'bonus', '股权', '期权', 'stock option', 'equity', '分红'],
    minLevel: DiagnosisPermissionLevel.INITIATOR_ONLY,
    defaultAction: 'redact',
  },
  // Performance
  {
    name: 'performance-review',
    category: 'performance',
    keywords: ['绩效', '评级', '考核', 'performance review', '360', '打分', '评分', '末位', '淘汰', 'pip', 'improvement plan'],
    minLevel: DiagnosisPermissionLevel.INITIATOR_ONLY,
    defaultAction: 'summarize',
  },
  // Health
  {
    name: 'health-status',
    category: 'health',
    keywords: ['健康', '心理', '压力', 'burnout', '抑郁', '焦虑', '病假', 'health', 'mental', 'stress', '倦怠'],
    minLevel: DiagnosisPermissionLevel.NEVER,
    defaultAction: 'redact',
  },
  // Conflict
  {
    name: 'conflict-detail',
    category: 'conflict',
    keywords: ['冲突', '矛盾', '争吵', '对立', 'conflict', '争执', '不满', '抱怨', '投诉', '举报'],
    minLevel: DiagnosisPermissionLevel.ADMIN_ONLY,
    defaultAction: 'summarize',
  },
  // Strategic
  {
    name: 'strategic-secret',
    category: 'strategic',
    keywords: ['战略', '融资', '估值', '收购', '并购', '上市', 'IPO', '商业机密', '专利', '核心算法', '路线图'],
    minLevel: DiagnosisPermissionLevel.ADMIN_ONLY,
    defaultAction: 'summarize',
  },
];

// ====================================================================
// 敏感字段检测器
// ====================================================================

/** 扫描字段名，返回匹配的敏感规则 */
export function detectSensitiveFields(
  fieldNames: string[],
  customRules: SensitivityRule[] = [],
): SensitivityMatch[] {
  const allRules = [...BUILTIN_RULES, ...customRules];
  const matches: SensitivityMatch[] = [];

  for (const field of fieldNames) {
    const fieldLower = field.toLowerCase();
    for (const rule of allRules) {
      for (const keyword of rule.keywords) {
        if (matchKeyword(fieldLower, keyword.toLowerCase())) {
          matches.push({
            field,
            category: rule.category,
            matchedKeyword: keyword,
            minLevel: rule.minLevel,
          });
          break; // 每个字段只匹配第一个命中规则
        }
      }
    }
  }

  return matches;
}

/** 扫描文本内容中是否包含敏感关键词 */
export function scanContentForSensitivity(
  content: string,
  customRules: SensitivityRule[] = [],
): SensitivityMatch[] {
  const allRules = [...BUILTIN_RULES, ...customRules];
  const matches: SensitivityMatch[] = [];
  const contentLower = content.toLowerCase();

  for (const rule of allRules) {
    for (const keyword of rule.keywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        matches.push({
          field: `content:${rule.category}`,
          category: rule.category,
          matchedKeyword: keyword,
          minLevel: rule.minLevel,
        });
        break;
      }
    }
  }

  return matches;
}

// ====================================================================
// 脱敏引擎
// ====================================================================

/** 对单个字段值执行脱敏 */
export function redactField(
  field: string,
  value: string,
  match: SensitivityMatch,
  requesterLevel: DiagnosisPermissionLevel,
): RedactedField {
  if (requesterLevel >= match.minLevel) {
    return { field, originalCategory: match.category, action: 'allow', sanitizedValue: value };
  }

  const rule = [...BUILTIN_RULES].find(r => r.category === match.category);
  const action = rule?.defaultAction ?? 'redact';

  switch (action) {
    case 'redact':
      return { field, originalCategory: match.category, action: 'redact', sanitizedValue: '***' };
    case 'anonymize':
      return { field, originalCategory: match.category, action: 'anonymize', sanitizedValue: anonymize(value, match.category) };
    case 'summarize':
      return { field, originalCategory: match.category, action: 'summarize', sanitizedValue: summarize(value) };
    default:
      return { field, originalCategory: match.category, action: 'allow', sanitizedValue: value };
  }
}

/** 批量脱敏对象中的所有敏感字段 */
export function redactObject(
  obj: Record<string, unknown>,
  requesterLevel: DiagnosisPermissionLevel,
  customRules: SensitivityRule[] = [],
): { redacted: Record<string, unknown>; audit: RedactionAuditEntry[] } {
  const fields = Object.keys(obj);
  const matches = detectSensitiveFields(fields, customRules);
  const matchMap = new Map(matches.map(m => [m.field, m]));

  const redacted: Record<string, unknown> = {};
  const audit: RedactionAuditEntry[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const match = matchMap.get(key);
    if (match && typeof value === 'string') {
      const result = redactField(key, value, match, requesterLevel);
      redacted[key] = result.sanitizedValue ?? value;
      audit.push({
        field: key,
        category: match.category,
        action: result.action,
        requesterLevel,
        requiredLevel: match.minLevel,
        timestamp: new Date().toISOString(),
      });
    } else {
      redacted[key] = value;
    }
  }

  return { redacted, audit };
}

// ====================================================================
// 辅助函数
// ====================================================================

/** 匿名化：保留首字符 + 类别标签 */
function anonymize(value: string, category: SensitivityCategory): string {
  if (value.length <= 1) return '*';
  const prefix = value.slice(0, 1);
  const labels: Record<SensitivityCategory, string> = {
    pii: '用户',
    financial: '财务数据',
    performance: '绩效数据',
    health: '健康数据',
    conflict: '冲突记录',
    strategic: '战略信息',
  };
  return `${prefix}***[${labels[category]}]`;
}

/** 摘要化：保留第一句或前 20 个字符 */
function summarize(value: string): string {
  const firstSentence = value.split(/[。！？.!?]/)[0];
  if (firstSentence && firstSentence.length <= 100) {
    return `[摘要] ${firstSentence}`;
  }
  return `[摘要] ${value.slice(0, 80)}...`;
}

/** 获取内置规则列表（供扩展用） */
export function getBuiltinRules(): SensitivityRule[] {
  return [...BUILTIN_RULES];
}

/**
 * 关键词匹配：ASCII 用词边界，CJK 用子串匹配。
 * 防止 "name" 误匹配 "teamName"。
 */
function matchKeyword(field: string, keyword: string): boolean {
  const isAscii = /^[a-z0-9\s]+$/.test(keyword);
  if (isAscii) {
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(keyword)}($|[^a-zA-Z0-9])`);
    return regex.test(field);
  }
  return field.includes(keyword);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 添加自定义敏感规则 */
export function createCustomRule(
  name: string,
  category: SensitivityCategory,
  keywords: string[],
  minLevel: DiagnosisPermissionLevel,
  defaultAction: RedactAction = 'redact',
): SensitivityRule {
  return { name, category, keywords, minLevel, defaultAction };
}
