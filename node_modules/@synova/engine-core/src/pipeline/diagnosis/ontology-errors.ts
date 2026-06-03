/**
 * ontology-errors.ts — 本体层错误类型体系 (Phase 2: iron law 32 落地)
 *
 * 对标 diagnosis-error.ts 的 DiagnosticAgentError 基类。
 * 5 个 Error 子类覆盖本体的 5 种失败模式:
 *   存储错误 / 摄取校验失败 / 实体未找到 / 查询超时 / 版本冲突
 *
 * 每个子类携带 .code / .retryable / .phase，调用方可做差异化恢复。
 */
import { DiagnosisErrorCode } from './types';
import { DiagnosticAgentError } from './diagnosis-error';

// ═══ Error Subclasses ═══

/** 图数据库操作失败 (SQLite 锁、连接断开、磁盘满) — 可重试 */
export class GraphStoreError extends DiagnosticAgentError {
  constructor(message: string, cause?: Error) {
    super(DiagnosisErrorCode.GRAPH_DB, message, -1, true, cause);
    this.name = 'GraphStoreError';
  }
}

/** 文档摄取校验失败 (缺少必填字段、格式不合法) — 不可重试 */
export class IngestionError extends DiagnosticAgentError {
  constructor(message: string, cause?: Error) {
    super(DiagnosisErrorCode.INGEST_INVALID, message, 0, false, cause);
    this.name = 'IngestionError';
  }
}

/** 请求的实体不存在 (快照未找到、节点已删除) — 不可重试 */
export class EntityNotFoundError extends DiagnosticAgentError {
  constructor(message: string, cause?: Error) {
    super(DiagnosisErrorCode.ENTITY_NOT_FOUND, message, -1, false, cause);
    this.name = 'EntityNotFoundError';
  }
}

/** 图查询超时 (遍历深度过大、图规模超限) — 可重试 (减小范围) */
export class QueryTimeoutError extends DiagnosticAgentError {
  constructor(message: string, cause?: Error) {
    super(DiagnosisErrorCode.QUERY_TIMEOUT, message, -1, true, cause);
    this.name = 'QueryTimeoutError';
  }
}

/** 实体合并版本冲突 (keyAspect 不匹配) — 不可重试 */
export class VersionConflictError extends DiagnosticAgentError {
  constructor(message: string, cause?: Error) {
    super(DiagnosisErrorCode.VERSION_CONFLICT, message, -1, false, cause);
    this.name = 'VersionConflictError';
  }
}

// ═══ Type Guard ═══

/** 检查错误是否为可重试的本体错误。对 unknown 安全。 */
export function isRetryableOntologyError(err: unknown): boolean {
  return err instanceof DiagnosticAgentError && err.retryable === true;
}
