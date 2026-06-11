/**
 * services/deepseek-balance.ts — DeepSeek 账户余额查询
 *
 * GET https://api.deepseek.com/user/balance
 * 缓存 5 分钟，/balance 命令手动刷新。
 *
 * 铁律: 不涉及 React/ink，纯数据获取模块。
 */

import { createLogger } from '../logger';

const log = createLogger('services/deepseek-balance');

export interface BalanceResult {
  currency: string;
  total: number;
  fetchedAt: number;
}

let cached: BalanceResult | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/** 获取 DeepSeek 账户余额（自动缓存） */
export async function fetchDeepseekBalance(apiKey?: string): Promise<BalanceResult | null> {
  const key = apiKey || process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  // 缓存命中
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
    const url = `${baseUrl.replace(/\/$/, '')}/user/balance`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, '余额 API 请求失败');
      return null;
    }
    const json = (await res.json()) as {
      is_available: boolean;
      balance_infos: Array<{ currency: string; total_balance: string }>;
    };
    const info = json.balance_infos?.[0];
    if (!info) return null;

    cached = {
      currency: info.currency === 'CNY' ? '¥' : info.currency,
      total: parseFloat(info.total_balance) || 0,
      fetchedAt: Date.now(),
    };
    log.info({ balance: cached.total, currency: cached.currency }, '余额已更新');
    return cached;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, '获取余额失败');
    return cached; // 返回过期缓存作为降级
  }
}

/** 清除缓存（API Key 变更时调用） */
export function clearBalanceCache(): void {
  cached = null;
}

/** 格式化余额显示 */
export function formatBalance(balance: BalanceResult | null): string {
  if (!balance) return '';
  const { currency, total } = balance;
  if (total >= 1000) return `${currency}${total.toFixed(0)}`;
  if (total >= 10) return `${currency}${total.toFixed(1)}`;
  return `${currency}${total.toFixed(2)}`;
}
