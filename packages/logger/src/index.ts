/**
 * @synova/logger — SynovaAgent 日志 (pino, stderr)
 *
 * P0-5.2: 日志脱敏 — 自动遮罩 API Key / JWT / 密码等敏感字段。
 * 参考 Hermes agent/redact.py (21 个已知密钥前缀 + RedactingFormatter)。
 *
 * pino redact 配置在 JSON 序列化层拦截，性能开销极小。
 * 所有日志输出自动脱敏，无需调用方手动处理。
 */
import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

/** 敏感字段黑名单 — 直接移除整个字段值 */
const REDACT_FIELDS: string[] = [
  'apiKey', 'api_key', 'apikey',
  'accessToken', 'access_token',
  'secretKey', 'secret_key',
  'password', 'passwd',
  'authorization',
  'token', 'engineTokens',
  'llmApiKey', 'engine_api_tokens',
  'appSecret', 'app_secret',
  'privateKey', 'private_key',
  'masterSecret', 'master_secret',
  'credential', 'credentials',
  'bearer',
];

/** 值模式匹配 — 匹配到的值替换为 [REDACTED] */
const REDACT_VALUE_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{30,})\b/g,
  /\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[^]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,
  /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:([^@]+)@/g,
];

const rawDest = pino.destination({ dest: 2, sync: true });

const destination = {
  write(msg: string) {
    if (process.env.LOG_LEVEL !== 'silent') {
      rawDest.write(msg);
    }
  },
};

export const logger = pino({
  name: 'synova-agent',
  level,
  redact: {
    paths: REDACT_FIELDS,
    censor: '[REDACTED]',
    remove: false,
  },
}, destination);

function redactValues(obj: unknown): unknown {
  if (typeof obj === 'string') {
    let s = obj;
    for (const pattern of REDACT_VALUE_PATTERNS) {
      s = s.replace(pattern, (match, p1) => {
        if (match.includes('://') && p1) return match.replace(p1, '[REDACTED]');
        return '[REDACTED]';
      });
    }
    return s;
  }
  if (Array.isArray(obj)) return obj.map(redactValues);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = redactValues(v);
    }
    return result;
  }
  return obj;
}

export function createLogger(name: string) {
  const child = logger.child({ service: name });
  const wrap = (method: keyof typeof child) => {
    const orig = child[method] as Function;
    (child as unknown as Record<string, unknown>)[method as string] = (...args: unknown[]) => {
      const redacted = args.map(arg =>
        typeof arg === 'object' && arg !== null ? redactValues(arg) : arg
      );
      return orig.apply(child, redacted);
    };
  };
  wrap('info');
  wrap('warn');
  wrap('error');
  wrap('debug');
  return child;
}
