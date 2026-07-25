/**
 * middleware/auth.ts — JWT 认证中间件 (Phase 0.1, Desktop 实施方案)
 *
 * 使用 Node.js built-in crypto 实现 HMAC-SHA256 JWT。
 * 零外部依赖。v2 可换 jsonwebtoken 库支持 RS256/OIDC。
 *
 * 设计原则:
 * - JWT_SECRET 缺失时降级到 devMode（不自爆），但 log.warn 警告
 * - 撤销 token 通过 in-memory Set 追踪（v2 迁移到 SQLite 持久化）
 * - whitelist 路径跳过认证（同 server.ts 白名单）
 * - 所有错误路径返回统一 JSON 格式 { ok: false, code, message }
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@synova/logger';
import type { WorkspaceRole } from './rbac';

const log = createLogger('auth');

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export interface JwtPayload {
  sub: string;   // userId
  role: string;  // WorkspaceRole | 'ga'
  orgId: string; // tenant/org ID
  iat: number;   // issued at (Unix seconds)
  exp: number;   // expires at (Unix seconds)
  jti: string;   // JWT ID (唯一，用于撤销)
}

export interface AuthRequestContext {
  role: WorkspaceRole | 'ga';
  userId: string;
  orgId: string;
}

// ════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════

/**
 * 获取 JWT 签名密钥。
 * JWT_SECRET 缺失时返回 null——此时中间件降级到 devMode。
 * 生产环境必须设置 JWT_SECRET。
 */
function getSecret(): string | null {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  // 允许 devMode 无 JWT_SECRET（自动降级）
  if (process.env.DEV_MODE === 'true') return null;
  // 非 devMode 且无 JWT_SECRET → 仍然降级但严重警告
  if (!secret) {
    log.error('JWT_SECRET not set! Authentication will be disabled. Set JWT_SECRET for production.');
    return null;
  }
  if (secret.length < 16) {
    log.warn('JWT_SECRET is too short (<16 chars). For demo only. Use a strong secret in production.');
    return secret;
  }
  return secret;
}

/**
 * 获取 Token 有效期（秒）。
 * 默认 7 天。可通过 JWT_EXPIRY 环境变量覆盖。
 */
function getExpiresIn(): number {
  const env = process.env.JWT_EXPIRY;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 7 * 24 * 3600; // 7 天
}

/**
 * 白名单路径——跳过认证。
 * 与 server.ts 的白名单同步。
 */
function isWhitelisted(path: string): boolean {
  return (
    path === '/health' ||
    path === '/' ||
    path === '/api/auth/login' ||
    path.startsWith('/api/status') ||
    path.startsWith('/assets/') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.ico') ||
    path === '/cockpit' ||
    path.startsWith('/api/cockpit/')
  );
}

// ════════════════════════════════════════════════════════════════
// JWT 核心操作（Base64URL + HMAC-SHA256）
// ════════════════════════════════════════════════════════════════

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

/**
 * 签发 JWT。
 * @param payload - 载荷（不含 iat/jti/exp，自动填充）
 * @returns JWT 字符串，或 null（密钥不可用时）
 */
export function signJwtToken(
  payload: Omit<JwtPayload, 'iat' | 'jti' | 'exp'>,
): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = getExpiresIn();

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: randomUUID(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signingInput = `${JWT_HEADER}.${payloadB64}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * 验证 JWT。
 * @param token - JWT 字符串
 * @returns 解析结果：成功返回 payload，失败返回 error 信息
 */
export function verifyJwtToken(token: string): { payload: JwtPayload | null; error?: string } {
  if (!token) {
    return { payload: null, error: 'Token is empty' };
  }

  const secret = getSecret();
  if (!secret) {
    return { payload: null, error: 'JWT_SECRET not configured' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { payload: null, error: 'Invalid token format' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 验证签名（timing-safe 比较，防时序攻击）
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest('base64url');

  try {
    const sigBuffer = Buffer.from(signatureB64, 'base64url');
    const expectedBuffer = Buffer.from(expectedSig, 'base64url');
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { payload: null, error: 'Invalid signature' };
    }
  } catch (sigErr) {
    log.debug({ err: sigErr }, 'Signature verification error');
    return { payload: null, error: 'Signature verification error' };
  }

  // 解码 payload
  let payload: JwtPayload;
  try {
    const decoded = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(decoded) as JwtPayload;
  } catch (decodeErr) {
    log.debug({ err: decodeErr }, 'Invalid payload encoding');
    return { payload: null, error: 'Invalid payload encoding' };
  }

  // 必须字段检查
  if (!payload.sub || !payload.role || !payload.jti) {
    return { payload: null, error: 'Missing required fields in token' };
  }

  // 过期检查
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { payload: null, error: 'Token expired' };
  }

  // 撤销检查
  if (isTokenRevoked(payload.jti)) {
    return { payload: null, error: 'Token revoked' };
  }

  return { payload };
}

// ════════════════════════════════════════════════════════════════
// Token 撤销管理（in-memory，v2 迁移到 SQLite）
// ════════════════════════════════════════════════════════════════

const revokedTokens = new Set<string>();

/**
 * 撤销 JWT。
 * @param token - 完整 JWT 字符串
 * @returns true=撤销成功，false=token 无效
 */
export function revokeToken(token: string): boolean {
  const result = verifyJwtToken(token);
  if (!result.payload) return false;

  revokedTokens.add(result.payload.jti);
  log.warn({ jti: result.payload.jti, sub: result.payload.sub }, 'Token revoked');
  return true;
}

/**
 * 检查 JWT ID 是否已被撤销。
 * @param jti - JWT ID
 */
export function isTokenRevoked(jti: string): boolean {
  return revokedTokens.has(jti);
}

/**
 * 清空撤销列表（用于测试或重置）。
 */
export function clearRevokedTokens(): void {
  revokedTokens.clear();
}

// ════════════════════════════════════════════════════════════════
// Express Middleware
// ════════════════════════════════════════════════════════════════

/**
 * JWT 认证中间件。
 *
 * 替换 server.ts 中的内联 auth 中间件。
 * 与 request-context.ts 的 runWithContext 配合使用。
 */
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // 白名单路径——跳过
    if (isWhitelisted(req.path)) {
      return next();
    }

    // DevMode 无 JWT_SECRET：自动 admin
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.DEV_MODE === 'true') {
      log.warn('DEV_MODE: JWT_SECRET not set, auto-assigning admin role');
      (req as Request & { auth?: JwtPayload }).auth = {
        sub: 'dev-admin',
        role: 'admin',
        orgId: 'default',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
        jti: 'dev-mode-no-jwt',
      };
      return next();
    }

    // 提取 Authorization header
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <token>',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Token is empty' });
      return;
    }

    // 验证 token
    const result = verifyJwtToken(token);
    if (!result.payload) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: result.error || 'Token validation failed',
      });
      return;
    }

    // 注入 auth 到请求对象（下游 RBAC 使用）
    (req as Request & { auth?: JwtPayload }).auth = result.payload;

    // 同步注入 request-context（兼容 runWithContext 模式）
    // request-context 不可用时至少有 req.auth
    try {
      const { runWithContext } = require('../services/request-context');
      runWithContext({
        user: {
          userId: result.payload.sub,
          identity: {
            openId: result.payload.sub,
            email: `${result.payload.sub}@${result.payload.orgId}`,
            name: result.payload.sub,
            source: 'jwt' as const,
          },
          auth: {
            roles: [result.payload.role],
            teamId: result.payload.orgId,
            tenantId: result.payload.orgId,
            sensitivity: 'normal' as const,
          },
          permissions: { version: 1, expiresAt: result.payload.exp * 1000 },
        },
        authProvider: {
          getPermissionFilter: async () => ({ conditions: [] }),
        },
      }, async () => {
        next();
      }).catch((ctxErr: unknown) => {
        log.warn({ err: ctxErr }, 'request-context runWithContext error, continuing with req.auth');
        next();
      });
    } catch (ctxErr: unknown) {
      log.warn({ err: ctxErr }, 'request-context not available, using req.auth only');
      next();
    }
  } catch (err: unknown) {
    log.error({ err }, 'jwtAuthMiddleware 异常');
    res.status(500).json({ ok: false, code: 'AUTH_ERROR', message: 'Authentication error', degraded: true });
  }
}

/**
 * 从请求对象提取认证上下文（供 RBAC 和路由使用）。
 *
 * 优先级:
 *   1. req.auth（JWT 中间件注入）
 *   2. x-synova-token header（向下兼容旧格式）
 *   3. null（未认证）
 */
export function extractAuthFromRequest(req: {
  auth?: JwtPayload;
  headers?: Record<string, unknown>;
}): AuthRequestContext | null {
  // 优先 JWT 中间件注入的 auth
  if (req.auth) {
    return {
      role: req.auth.role as WorkspaceRole | 'ga',
      userId: req.auth.sub,
      orgId: req.auth.orgId,
    };
  }

  // 向下兼容 x-synova-token 格式
  const token = req.headers?.['x-synova-token'] as string | undefined;
  if (token && token.includes(':')) {
    const parts = token.split(':');
    return {
      role: (parts[0] as WorkspaceRole | 'ga') || 'staff',
      userId: parts[2] || 'dev',
      orgId: parts[1] || 'default',
    };
  }

  return null;
}
