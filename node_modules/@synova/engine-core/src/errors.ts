/**
 * engine-server/errors.ts — 统一 ApiErrorResponse 结构
 *
 * 9 种错误码，严格对齐 CONTRACT-01 错误码总表。
 * 所有错误通过工厂函数创建，确保结构统一。
 */

import type { ApiErrorResponse, ApiErrorDetail, ErrorCode } from './types';

// ================================================================
// 错误消息常量
// ================================================================

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST_ID: 'X-Request-Id header is missing or invalid',
  INVALID_SCHEMA_VERSION: 'Unsupported taskDefSchemaVersion',
  INVALID_TASKDEF: 'TaskDefinition validation failed',
  INSUFFICIENT_SANITIZATION: 'TaskDefinition contains unsanitized sensitive information',
  UNAUTHORIZED: 'Invalid or expired token',
  FORBIDDEN: 'Insufficient permissions for this operation',
  TASK_REQUEST_NOT_FOUND: 'Task request not found or expired',
  RATE_LIMIT: 'Request rate limit exceeded',
  ENGINE_ERROR: 'Engine internal error',
  ENGINE_UNAVAILABLE: 'Engine is starting or overloaded',
  TIMEOUT: 'Operation timed out',
  EXPIRED: 'Task request has expired',
};

// ================================================================
// 工厂函数
// ================================================================

/**
 * 创建统一错误响应
 */
export function createApiError(
  code: ErrorCode,
  requestId: string,
  details?: ApiErrorDetail[],
  messageOverride?: string,
): ApiErrorResponse {
  return {
    code,
    message: messageOverride || ERROR_MESSAGES[code] || 'Unknown error',
    requestId,
    ...(details && details.length > 0 ? { details } : {}),
  };
}

/**
 * 便捷工厂函数
 */
export const errors = {
  invalidRequestId: (requestId: string) =>
    createApiError('INVALID_REQUEST_ID', requestId || 'unknown'),

  invalidSchemaVersion: (requestId: string) =>
    createApiError('INVALID_SCHEMA_VERSION', requestId),

  invalidTaskDef: (requestId: string, details?: ApiErrorDetail[]) =>
    createApiError('INVALID_TASKDEF', requestId, details),

  insufficientSanitization: (requestId: string, details: ApiErrorDetail[]) =>
    createApiError('INSUFFICIENT_SANITIZATION', requestId, details),

  unauthorized: (requestId: string) =>
    createApiError('UNAUTHORIZED', requestId),

  forbidden: (requestId: string) =>
    createApiError('FORBIDDEN', requestId),

  taskRequestNotFound: (requestId: string) =>
    createApiError('TASK_REQUEST_NOT_FOUND', requestId),

  rateLimit: (requestId: string) =>
    createApiError('RATE_LIMIT', requestId),

  engineError: (requestId: string, messageOverride?: string) =>
    createApiError('ENGINE_ERROR', requestId, undefined, messageOverride),

  engineUnavailable: (requestId: string) =>
    createApiError('ENGINE_UNAVAILABLE', requestId),
};

/**
 * 获取错误对应的 HTTP 状态码
 */
export function getHttpStatus(code: ErrorCode): number {
  const statusMap: Record<ErrorCode, number> = {
    INVALID_REQUEST_ID: 400,
    INVALID_SCHEMA_VERSION: 400,
    INVALID_TASKDEF: 400,
    INSUFFICIENT_SANITIZATION: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    TASK_REQUEST_NOT_FOUND: 404,
    RATE_LIMIT: 429,
    ENGINE_ERROR: 500,
    ENGINE_UNAVAILABLE: 503,
    TIMEOUT: 408,
    EXPIRED: 410,
  };
  return statusMap[code] || 500;
}
