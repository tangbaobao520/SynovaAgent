/**
 * services/request-context.ts — 请求级上下文 (M2 权限透传)
 *
 * 问题: KnowledgeAgent 工具执行时无法获取当前用户的 UserContext，
 *       导致 search_documents 无法生成 FilterClause，权限过滤失效。
 *
 * 方案: 使用 AsyncLocalStorage 存储请求级上下文。
 *       L1 (routes) 设置 → L3 (tools) 读取，不通过 LLM 参数传递。
 */
import { AsyncLocalStorage } from 'async_hooks';
// 内联类型 — 避免跨包 tsc 路径解析问题 (engine-auth 不在 tsc include 范围内)
interface UserContext { userId: string; identity: { openId: string; email: string; name: string; source: string }; auth: { roles: string[]; teamId: string; tenantId: string; sensitivity: string }; permissions: { version: number; expiresAt: number }; }
interface AuthProvider { getPermissionFilter(ctx: UserContext, resourceType: string, action: string): Promise<FilterClause>; }
interface FilterClause { conditions: Array<{ field: string; operator: string; value: unknown }>; }

const storage = new AsyncLocalStorage<RequestContext>();

export interface RequestContext {
  user?: UserContext;
  authProvider?: AuthProvider;
}

/** L1 调用: 设置当前请求的上下文 */
export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** L3 调用: 获取当前请求的用户身份 */
export function getCurrentUser(): UserContext | undefined {
  return storage.getStore()?.user;
}

/** L3 调用: 获取当前请求的 AuthProvider */
export function getCurrentAuthProvider(): AuthProvider | undefined {
  return storage.getStore()?.authProvider;
}

/** L3 调用: 生成当前用户的权限过滤条件 */
export async function getCurrentFilterClause(resourceType: string): Promise<FilterClause> {
  const ctx = storage.getStore();
  if (!ctx?.user || !ctx?.authProvider) return { conditions: [] };
  return ctx.authProvider.getPermissionFilter(ctx.user, resourceType, 'read');
}
