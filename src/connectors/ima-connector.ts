/**
 * connectors/ima-connector.ts — IMA 知识库适配器 (M3)
 *
 * 用户使用自己的 IMA API Key 接入腾讯 IMA 知识库。
 * 适配器不存储 API Key — 每次调用时从 CredentialVault 读取。
 *
 * 架构:
 *   用户配置 IMA 凭证 → CredentialVault 加密存储
 *   → KnowledgeAgent 调用 imaConnector.search()
 *   → POST https://ima.qq.com/openapi/wiki/v1/search_knowledge
 *   → 结果写入 KnowledgeStore
 *
 * API 文档: https://ima.qq.com/agent-interface
 */
import { createLogger } from '@synova/logger';

const log = createLogger('connectors/ima');

// ═══ Types ═══

export interface ImaConfig {
  clientId: string;
  apiKey: string;
  baseUrl?: string;       // default: https://ima.qq.com
}

export interface ImaKnowledgeBase {
  id: string;
  name: string;
  coverUrl?: string;
  description?: string;
}

export interface ImaSearchResult {
  mediaId: string;
  title: string;
  parentFolderId?: string;
  highlightContent?: string;
}

export interface ImaConnector {
  /** 获取用户的知识库列表 */
  getKnowledgeBases(): Promise<ImaKnowledgeBase[]>;
  /** 搜索知识库 */
  search(knowledgeBaseId: string, query: string, cursor?: string): Promise<{ results: ImaSearchResult[]; hasMore: boolean; nextCursor: string }>;
  /** 获取单个媒体的原文 */
  getMediaInfo(mediaId: string): Promise<{ url?: string; mediaType?: number; headers?: Record<string, string> } | null>;
}

// ═══ 工厂 ═══

export function createImaConnector(config: ImaConfig): ImaConnector {
  const baseUrl = config.baseUrl || 'https://ima.qq.com';

  async function imaPost<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ima-openapi-clientid': config.clientId,
          'ima-openapi-apikey': config.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { log.warn({ status: res.status, path }, 'IMA API 请求失败'); return null; }
      const json = await res.json() as { code: number; msg: string; data: T };
      if (json.code !== 0) { log.warn({ code: json.code, msg: json.msg }, 'IMA API 返回错误'); return null; }
      return json.data;
    } catch (err: unknown) {
      log.warn({ err, path }, 'IMA API 网络错误');
      return null;
    }
  }

  return {
    async getKnowledgeBases(): Promise<ImaKnowledgeBase[]> {
      const all: ImaKnowledgeBase[] = [];
      let cursor = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const data = await imaPost<{
          addable_knowledge_base_list: Array<{ id: string; name: string }>;
          next_cursor: string;
          is_end: boolean;
        }>('/openapi/wiki/v1/get_addable_knowledge_base_list', { cursor, limit: 50 });
        if (!data) break;
        all.push(...data.addable_knowledge_base_list.map(b => ({ id: b.id, name: b.name })));
        if (data.is_end) break;
        cursor = data.next_cursor;
      }
      return all;
    },

    async search(knowledgeBaseId: string, query: string, cursor = '') {
      const data = await imaPost<{
        info_list: Array<{ media_id: string; title: string; parent_folder_id?: string; highlight_content?: string }>;
        is_end: boolean;
        next_cursor: string;
      }>('/openapi/wiki/v1/search_knowledge', { query, knowledge_base_id: knowledgeBaseId, cursor });
      if (!data) return { results: [], hasMore: false, nextCursor: '' };
      return {
        results: data.info_list.map(r => ({
          mediaId: r.media_id,
          title: r.title,
          parentFolderId: r.parent_folder_id,
          highlightContent: r.highlight_content,
        })),
        hasMore: !data.is_end,
        nextCursor: data.next_cursor,
      };
    },

    async getMediaInfo(mediaId: string) {
      const data = await imaPost<{ media_type: number; url_info?: { url: string; headers?: Record<string, string> } }>(
        '/openapi/wiki/v1/get_media_info', { media_id: mediaId },
      );
      if (!data?.url_info) return null;
      return { url: data.url_info.url, mediaType: data.media_type, headers: data.url_info.headers };
    },
  };
}

/**
 * 将 IMA 搜索结果转换为 KnowledgeChunk 格式并写入知识库。
 * 每个搜索结果生成一个 chunk，按用户团队权限存储。
 */
export async function ingestImaResults(
  store: { insert: (chunk: { text: string; sourceType: string; sourceId: string; authorityLevel: 'external_official'; accessLevel: 'team'; accessTeamId: string; accessSensitivity: 'normal' }) => string },
  results: ImaSearchResult[],
  teamId: string,
  sourceName: string,
): Promise<number> {
  let count = 0;
  for (const r of results) {
    try {
      const text = [r.title, r.highlightContent || ''].filter(Boolean).join('\n');
      if (text.trim().length < 10) continue;
      store.insert({
        text: text.slice(0, 2000),
        sourceType: 'external',
        sourceId: `ima:${r.mediaId}`,
        authorityLevel: 'external_official',
        accessLevel: 'team',
        accessTeamId: teamId,
        accessSensitivity: 'normal',
      });
      count++;
    } catch { log.debug('IMA 结果写入知识库失败 — 跳过'); }
  }
  log.info({ count, source: sourceName }, 'IMA 搜索结果已写入知识库');
  return count;
}
