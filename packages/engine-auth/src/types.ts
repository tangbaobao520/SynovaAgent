/**
 * engine-auth/types.ts — 权限系统核心类型
 *
 * 横切关注点，不归属 L1-L5 任何单层。
 * L1 生成 UserContext → L2 透传 → L3 转换为 FilterClause → L4 执行过滤
 */

// ═══ 身份源 ═══

/** 用户身份来源平台 */
export type IdentitySource = 'feishu' | 'wecom' | 'web' | 'api' | 'system';

/** 用户身份标识 (跨平台统一) */
export interface UserIdentity {
  openId: string;          // IM 平台 ID
  email: string;
  name: string;
  source: IdentitySource;
}

// ═══ 认证与授权 ═══

/** 用户敏感级别 */
export type UserSensitivity = 'normal' | 'sensitive';

/** 预定义角色 */
export type AuthRole = 'admin' | 'manager' | 'employee' | 'viewer' | 'external';

/** 用户认证信息 */
export interface UserAuth {
  roles: AuthRole[];
  teamId: string;
  tenantId: string;
  sensitivity: UserSensitivity;
}

/** 权限元数据 */
export interface PermissionMeta {
  version: number;         // 策略版本号，用于缓存刷新
  expiresAt: number;       // 过期时间戳 (Unix ms)
}

/**
 * 用户上下文 — 贯穿整个请求生命周期的不可变对象。
 * L1 创建，L2 透传，L3 消费，不暴露到前端。
 */
export interface UserContext {
  userId: string;
  identity: UserIdentity;
  auth: UserAuth;
  permissions: PermissionMeta;
}

// ═══ 过滤条件 ═══

/** 单个过滤条件 */
export interface FilterCondition {
  field: string;           // 'access.level' | 'access.teamId' | 'access.allowedUsers'
  operator: 'IN' | 'EQ' | 'CONTAINS' | 'NOT_EQ';
  value: unknown;
}

/**
 * FilterClause — L3 通过 AuthProvider 生成，传给 L4 执行。
 * L4 不知道"谁在问"，只知道"要过滤什么"。
 * 权限逻辑完全集中在 AuthProvider 中。
 */
export interface FilterClause {
  conditions: FilterCondition[];
  /** 空数组 = 无条件通过 (admin) */
}

// ═══ 资源与权限 ═══

/** 权限操作类型 */
export type PermissionAction = 'read' | 'write' | 'delete' | 'admin';

/** 资源引用 */
export interface ResourceRef {
  type: string;            // 'KnowledgeChunk' | 'Goal' | 'Alert' | 'Document' | 'User'
  id?: string;             // 可选，为空表示批量
}

// ═══ 数据标签 ═══

/** 数据访问级别 */
export type AccessLevel = 'public' | 'team' | 'private';

/** 数据敏感级别 */
export type DataSensitivity = 'normal' | 'sensitive' | 'restricted';

/** 数据权威等级 */
export type AuthorityLevel = 'internal_stored' | 'external_official' | 'external_reference' | 'reference';

/**
 * 数据访问标签 — 每条进入 SOG 的数据必须携带。
 * 默认: level=private, sensitivity=normal
 */
export interface AccessTags {
  level: AccessLevel;
  teamId?: string;         // level=team 时必填
  ownerId?: string;        // level=private 时必填
  sensitivity: DataSensitivity;
  allowedUsers?: string[]; // 细粒度 ACL (可选)
  authorityLevel: AuthorityLevel;
}

// ═══ 审计 ═══

/** 审计事件类型 */
export type AuditEventType =
  | 'knowledge_query'
  | 'permission_denied'
  | 'privilege_escalation_attempt'
  | 'role_change'
  | 'admin_action';

/** 审计日志条目 */
export interface AuditEntry {
  id: string;
  eventType: AuditEventType;
  userId: string;
  timestamp: string;       // ISO 8601
  resourceType?: string;
  resourceId?: string;
  action?: string;
  detail?: Record<string, unknown>;
  ip?: string;
  severity: 'normal' | 'high' | 'critical';
}
