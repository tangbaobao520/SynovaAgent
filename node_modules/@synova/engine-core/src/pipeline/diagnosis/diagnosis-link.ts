/**
 * diagnosis-link.ts — 诊断链接生成与解析
 *
 * 知识手艺人 / 咨询顾问为客户生成诊断链接，链接内嵌预填的
 * 组织信息、诊断范围、推荐人备注。客户点击后直接进入快速启动模式。
 *
 * 不依赖后端 API——纯前端可生成和解析。
 * base64url 编码的 JSON payload 嵌入 URL 参数。
 */

// ====================================================================
// Types
// ====================================================================

export interface DiagnosisLinkPayload {
  /** 组织 ID */
  orgId: string;
  /** 组织名称 */
  orgName?: string;
  /** 推荐人 ID（手艺人或咨询公司） */
  referrer: string;
  /** 推荐人备注（注入 Phase 0 开场白） */
  referrerNote?: string;
  /** 预填诊断维度 */
  dimensions?: string[];
  /** 预填诊断深度 */
  depth?: 'quick' | 'standard' | 'deep';
  /** 链接生成时间 */
  generatedAt: string;
  /** 链接有效期（天），默认 30 */
  expiresInDays?: number;
}

export interface DiagnosisLink {
  /** 完整 URL */
  url: string;
  /** 链接 ID（用于追踪状态） */
  linkId: string;
  /** 是否已过期 */
  expired: boolean;
  /** 过期日期 */
  expiresAt: string;
}

// ====================================================================
// Link Generator（手艺人工作台使用）
// ====================================================================

/**
 * 生成诊断链接。
 *
 * @param baseUrl 诊断页面基 URL（如 https://synova.app/diagnosis）
 * @param payload 预填的诊断信息
 * @returns 完整的诊断链接
 */
export function generateDiagnosisLink(
  baseUrl: string,
  payload: Omit<DiagnosisLinkPayload, 'generatedAt'>,
): DiagnosisLink {
  const linkId = `link_${Date.now().toString(36)}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2, 7)}`;
  const expiresInDays = payload.expiresInDays ?? 30;
  const generatedAt = new Date().toISOString();

  const fullPayload: DiagnosisLinkPayload = {
    ...payload,
    generatedAt,
    expiresInDays,
  };

  // base64url 编码（URL-safe）
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = `${baseUrl}?quick_start=true&payload=${encoded}&ref=${encodeURIComponent(payload.referrer)}`;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  return {
    url,
    linkId,
    expired: false,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * 解析诊断链接的 payload。
 * 前端在 Phase 0 初始化时调用，提取预填信息。
 *
 * @param urlParams URL 查询参数（如 { quick_start: 'true', payload: 'eyJvcmdJZCI6...', ref: 'xxx' }）
 * @returns 解析后的 payload，或 null（如果 payload 无效或已过期）
 */
export function parseDiagnosisLink(
  urlParams: Record<string, string>,
): DiagnosisLinkPayload | null {
  const encoded = urlParams['payload'];
  if (!encoded) return null;

  try {
    // base64url 解码
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    const payload: DiagnosisLinkPayload = JSON.parse(json);

    // 检查过期
    const expiresInDays = payload.expiresInDays ?? 30;
    const generatedAt = new Date(payload.generatedAt);
    const expiresAt = new Date(generatedAt);
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    if (new Date() > expiresAt) {
      return null; // 已过期
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * 检查链接是否已过期。
 */
export function isLinkExpired(payload: DiagnosisLinkPayload): boolean {
  const expiresInDays = payload.expiresInDays ?? 30;
  const generatedAt = new Date(payload.generatedAt);
  const expiresAt = new Date(generatedAt);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return new Date() > expiresAt;
}

// ====================================================================
// Link State Tracking (内存存储，后续可持久化到 SQLite)
// ====================================================================

export type LinkStatus = 'sent' | 'viewed' | 'completed' | 'expired';

export interface LinkState {
  linkId: string;
  orgId: string;
  referrer: string;
  status: LinkStatus;
  sentAt: string;
  viewedAt?: string;
  completedAt?: string;
}

const linkStates = new Map<string, LinkState>();

export function trackLinkSent(linkId: string, orgId: string, referrer: string): void {
  linkStates.set(linkId, {
    linkId,
    orgId,
    referrer,
    status: 'sent',
    sentAt: new Date().toISOString(),
  });
}

export function trackLinkViewed(linkId: string): void {
  const state = linkStates.get(linkId);
  if (state && state.status === 'sent') {
    state.status = 'viewed';
    state.viewedAt = new Date().toISOString();
  }
}

export function trackLinkCompleted(linkId: string): void {
  const state = linkStates.get(linkId);
  if (state) {
    state.status = 'completed';
    state.completedAt = new Date().toISOString();
  }
}

export function getLinkState(linkId: string): LinkState | undefined {
  return linkStates.get(linkId);
}

export function getCraftsmanLinks(referrer: string): LinkState[] {
  return [...linkStates.values()].filter(l => l.referrer === referrer);
}
