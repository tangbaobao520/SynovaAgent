/**
 * middleware/sanitize-check.ts — 输入脱敏检查中间件 (P1-1.3)
 *
 * 参考 OpenClaw engine-server/middleware/sanitize-check.ts:
 *   9 类中文敏感数据正则规则，逐字段扫描请求体。
 *   命中 → 400 INSUFFICIENT_SANITIZATION + details[]。
 *
 * 与 PIIScrubber 互补:
 *   sanitize-check (输入侧) → 对话处理 → LLM 调用 → PIIScrubber (输出侧)
 *
 * 只对 POST/PUT/PATCH 请求体生效。GET 请求跳过。
 * 白名单: /health, /api/status 不检查。
 */
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('middleware/sanitize-check');

// ═══ 9 类中文敏感数据正则 (OpenClaw 模式) ═══

interface SensitivePattern {
  category: string;
  regex: RegExp;
  description: string;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  { category: 'phone', regex: /\b1[3-9]\d{9}\b/, description: '手机号' },
  { category: 'id_card', regex: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/, description: '身份证号' },
  { category: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, description: '邮箱' },
  { category: 'bank_card', regex: /\b\d{16,19}\b/, description: '银行卡号' },
  { category: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, description: 'IP 地址' },
  { category: 'url', regex: /https?:\/\/[^\s]{1,200}/, description: 'URL' },
  { category: 'api_key', regex: /\b(sk-[a-zA-Z0-9]{20,})\b/, description: 'API Key' },
  { category: 'token', regex: /\b(ghp_[a-zA-Z0-9]{30,})\b/, description: 'Personal Token' },
  { category: 'jwt', regex: /\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/, description: 'JWT Token' },
];

// ═══ 白名单路径 ═══

const WHITELIST = ['/health', '/api/status', '/'];

function isWhitelisted(path: string): boolean {
  return WHITELIST.some(p => path === p || path.startsWith(p + '/'));
}

// ═══ Match Result ═══

interface SensitiveMatch {
  field: string;
  category: string;
  description: string;
  snippet: string; // First 20 chars of matched content
}

/**
 * Scan a string value for sensitive patterns.
 * Returns array of matches.
 */
function checkString(value: string, fieldPath: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(value)) !== null) {
      matches.push({
        field: fieldPath,
        category: pattern.category,
        description: pattern.description,
        snippet: m[0].slice(0, 20),
      });
      // Stop after 3 matches per field to avoid flooding
      if (matches.length >= 3) return matches;
    }
  }
  return matches;
}

/**
 * Recursively scan an object for sensitive values.
 */
function checkObject(obj: unknown, prefix = ''): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  if (!obj || typeof obj !== 'object') return matches;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      matches.push(...checkString(value, fieldPath));
    } else if (typeof value === 'object' && value !== null) {
      matches.push(...checkObject(value, fieldPath));
    }
  }
  return matches;
}

// ═══ Middleware ═══

export function sanitizeCheckMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only check mutation methods
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  // Skip whitelisted paths
  if (isWhitelisted(req.path)) {
    return next();
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return next();
  }

  const matches = checkObject(body);
  if (matches.length > 0) {
    // S4 (API Key/Token/JWT): hard block
    const s4Matches = matches.filter(m =>
      ['api_key', 'token', 'jwt'].includes(m.category));

    if (s4Matches.length > 0) {
      log.warn({ path: req.path, matches: s4Matches.map(m => `${m.field}:${m.category}`) },
        'S4 敏感数据拦截');
      res.status(400).json({
        ok: false,
        code: 'INSUFFICIENT_SANITIZATION',
        message: '请求体包含不应传输的敏感数据 (API Key/Token/JWT)。请使用环境变量配置凭据。',
        details: s4Matches.map(m => ({ field: m.field, category: m.category, description: m.description })),
      });
      return;
    }

    // S2-S3 (phone/email/id/bank): warn but allow through
    // These should be scrubbed by PIIScrubber on the output side
    log.warn({ path: req.path, count: matches.length },
      `请求体含 ${matches.length} 处敏感数据 — 允许通过 (输出侧 PIIScrubber 会脱敏)`);
  }

  next();
}
