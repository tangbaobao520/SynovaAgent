// 裁决缓存 — 语义 hash + TTL + 协议版本关联
// 位置: E:\scenario-forge-v2\src\protocol-engine\cache.ts
// Phase B

import type { ProtocolInterceptResult, AgentMessage, TeamProtocol, CollaborationContext } from './types';
import type { CacheEntry } from './types';
import { createHash } from 'crypto';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

export class RulingCache {
  private store = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private versionIndex = new Map<string, Set<string>>(); // version → keys

  /**
   * 生成缓存 key:
   *   SHA256(semanticHash(content) + protocol.version + context.sessionId)
   */
  buildKey(
    message: AgentMessage,
    protocol: TeamProtocol,
    context: CollaborationContext
  ): string {
    const contentHash = this.semanticHash(message.content);
    const raw = `${contentHash}|${protocol.version}|${context.sessionId}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 64);
  }

  /** 语义 hash：去空白 + 去标点 + 小写化 */
  semanticHash(content: string): string {
    const normalized = content
      .replace(/\s+/g, '')
      .replace(/[，。！？、；：""''【】《》（）…—,\.!\?;:'"\(\)\[\]{}]/g, '')
      .toLowerCase();
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  /** 查询缓存 */
  get(key: string): ProtocolInterceptResult | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.ttlMs > 0 && Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      this.removeFromLRU(key);
      return null;
    }

    entry.hits++;
    this.touchLRU(key);
    return entry.result;
  }

  /**
   * 写入缓存
   * rule/llm 路径写入，fallback 路径不写入
   */
  set(
    key: string,
    result: ProtocolInterceptResult,
    protocolVersion?: string | number,
    ttlMs: number = DEFAULT_TTL_MS
  ): void {
    if (result.source === 'fallback') return;

    if (this.store.size >= MAX_ENTRIES) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.store.delete(oldest);
        // 清理版本索引
        for (const [v, keys] of this.versionIndex) {
          keys.delete(oldest);
          if (keys.size === 0) this.versionIndex.delete(v);
        }
      }
    }

    this.store.set(key, { result, createdAt: Date.now(), ttlMs, hits: 1 });
    this.accessOrder.push(key);

    if (protocolVersion !== undefined) {
      const vKey = String(protocolVersion);
      if (!this.versionIndex.has(vKey)) {
        this.versionIndex.set(vKey, new Set());
      }
      this.versionIndex.get(vKey)!.add(key);
    }
  }

  /** 按协议版本全量失效 */
  invalidateByVersion(protocolVersion: string): number {
    const keys = this.versionIndex.get(protocolVersion);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      this.store.delete(key);
      this.removeFromLRU(key);
      count++;
    }
    this.versionIndex.delete(protocolVersion);
    return count;
  }

  /** 手动失效指定 key */
  invalidate(key: string): boolean {
    const existed = this.store.delete(key);
    if (existed) this.removeFromLRU(key);
    return existed;
  }

  /** 清空全部缓存 */
  clear(): void {
    this.store.clear();
    this.accessOrder = [];
    this.versionIndex.clear();
  }

  get stats() {
    const totalHits = [...this.store.values()].reduce((sum, e) => sum + e.hits, 0);
    return { size: this.store.size, totalHits, maxEntries: MAX_ENTRIES };
  }

  private touchLRU(key: string): void {
    this.removeFromLRU(key);
    this.accessOrder.push(key);
  }

  private removeFromLRU(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
  }
}
