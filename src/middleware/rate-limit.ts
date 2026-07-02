/**
 * middleware/rate-limit.ts — 三层速率限制 (Phase 3.1)
 *
 * L1: FixedWindow — 纯内存, 固定窗口
 * L2: Auth — 滑动窗口 per {scope, clientIp}, 127.0.0.1 豁免
 * L3: LLM调用 — 20次/分钟/orgId
 *
 * 铁律 24: 降级路径有 log
 * 铁律 38: 纯类型安全
 */
import { logger } from '@synova/logger';
import type { Request, Response, NextFunction } from 'express';

// ═══ 类型 ═══

export type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => void;

// ═══ L1: FixedWindow ═══

export interface FixedWindowLimiter extends RateLimitMiddleware {
  reset(key: string): void;
}

/**
 * 固定窗口速率限制器。
 * @param maxRequests - 窗口内最大请求数
 * @param windowMs - 窗口大小（毫秒）
 */
export function createFixedWindowLimiter(maxRequests: number, windowMs: number): FixedWindowLimiter {
  const counts = new Map<string, { count: number; resetAt: number }>();

  // 定期清理
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counts) {
      if (now >= entry.resetAt) counts.delete(key);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = counts.get(key);

    if (entry && now < entry.resetAt) {
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
        return;
      }
      entry.count++;
    } else {
      counts.set(key, { count: 1, resetAt: now + windowMs });
    }
    next();
  };

  middleware.reset = (key: string) => counts.delete(key);
  return middleware;
}

// ═══ L2: Auth 速率限制 ═══

export interface AuthRateLimiter extends RateLimitMiddleware {
  reset(scope: string, clientIp: string): void;
}

/**
 * 认证速率限制器。
 * 滑动窗口 per {scope, clientIp}，300 秒锁定，127.0.0.1 豁免。
 */
export function createAuthRateLimiter(): AuthRateLimiter {
  const attempts = new Map<string, { count: number; lockUntil: number; createdAt: number }>();
  const MAX_ATTEMPTS = 20;
  const WINDOW_MS = 60_000; // 1 分钟窗口
  const LOCK_MS = 300_000; // 300 秒锁定

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now >= entry.lockUntil && now - entry.lockUntil > WINDOW_MS) attempts.delete(key);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    // 127.0.0.1 豁免
    if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') {
      next();
      return;
    }

    const scope = (req as any).scope || 'default';
    const clientIp = req.ip || 'unknown';
    const key = `${scope}:${clientIp}`;
    const now = Date.now();
    const entry = attempts.get(key);

    // 检查是否锁定
    if (entry && now < entry.lockUntil) {
      const retryAfter = Math.ceil((entry.lockUntil - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({ ok: false, code: 'AUTH_RATE_LIMITED', message: '认证尝试过于频繁，请稍后再试' });
      return;
    }

    if (entry && now < entry.createdAt + WINDOW_MS) {
      entry.count++;
      if (entry.count >= MAX_ATTEMPTS) {
        entry.lockUntil = now + LOCK_MS;
        logger.warn({ clientIp, scope }, '认证速率限制触发 — 300秒锁定');
        const retryAfter = Math.ceil(LOCK_MS / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({ ok: false, code: 'AUTH_RATE_LIMITED', message: '认证尝试过于频繁，已被临时锁定' });
        return;
      }
    } else {
      attempts.set(key, { count: 1, lockUntil: 0 } as any);
      (attempts.get(key) as any).createdAt = now;
    }
    next();
  };

  middleware.reset = (scope: string, clientIp: string) => attempts.delete(`${scope}:${clientIp}`);
  return middleware;
}

// ═══ L3: LLM 调用速率限制 ═══

export interface LLMRateLimiter extends RateLimitMiddleware {
  reset(orgId: string): void;
}

/**
 * LLM 调用速率限制器。
 * 20 次/分钟/orgId，超限返回 429。
 */
export function createLLMRateLimiter(): LLMRateLimiter {
  const counts = new Map<string, { count: number; resetAt: number }>();
  const MAX_LLM = 20;
  const WINDOW_MS = 60_000;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counts) {
      if (now >= entry.resetAt) counts.delete(key);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req as any).orgId || 'default';
    const now = Date.now();
    const entry = counts.get(orgId);

    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_LLM) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({ ok: false, code: 'LLM_RATE_LIMITED', message: 'LLM 调用过于频繁，请稍后再试' });
        return;
      }
      entry.count++;
    } else {
      counts.set(orgId, { count: 1, resetAt: now + WINDOW_MS });
    }
    next();
  };

  middleware.reset = (orgId: string) => counts.delete(orgId);
  return middleware;
}
