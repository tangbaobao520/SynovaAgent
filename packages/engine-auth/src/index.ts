/**
 * @synova/engine-auth — Synova 权限管理
 *
 * 横切关注点，不归属 L1-L5 任何单层。
 *
 * 用法:
 *   import { createRBACProvider, type AuthProvider, type UserContext } from '@synova/engine-auth';
 *
 *   const auth = createRBACProvider({ resolveUser: async (token) => ({...}) });
 *   const ctx = await auth.getUserContext('token-xxx');
 *   const filter = await auth.getPermissionFilter(ctx, 'KnowledgeChunk', 'read');
 */

// Types
export type {
  UserIdentity,
  UserAuth,
  UserContext,
  FilterClause,
  FilterCondition,
  ResourceRef,
  AccessTags,
  AuditEntry,
  PermissionAction,
  IdentitySource,
  AuthRole,
  UserSensitivity,
  AccessLevel,
  DataSensitivity,
  AuthorityLevel,
  AuditEventType,
  PermissionMeta,
} from './types';

// AuthProvider interface
export type { AuthProvider } from './auth-provider';

// RBAC implementation
export { createRBACProvider, type RBACConfig } from './rbac';

// User cache
export { createUserCache, type UserCache } from './cache';
