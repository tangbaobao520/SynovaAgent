/**
 * ontology-errors.test.ts — 本体层错误类型测试 (iron law 0-2 Step 2: 测试先行)
 *
 * 验证 5 个 Error 子类的 .code / .retryable / .phase / instanceof 行为。
 * Given/When/Then 格式。
 */
import {
  GraphStoreError,
  IngestionError,
  EntityNotFoundError,
  QueryTimeoutError,
  VersionConflictError,
  isRetryableOntologyError,
} from '../ontology-errors';
import { DiagnosticAgentError } from '../diagnosis-error';

// ═══ GraphStoreError ═══
describe('GraphStoreError', () => {
  it('Given GraphStoreError, When created, Then has code GRAPH_DB and is retryable', () => {
    const err = new GraphStoreError('DB connection lost');
    expect(err).toBeInstanceOf(DiagnosticAgentError);
    expect(err.code).toBe('GRAPH_DB');
    expect(err.retryable).toBe(true);
    expect(err.phase).toBe(-1);
    expect(err.message).toBe('DB connection lost');
  });
});

// ═══ IngestionError ═══
describe('IngestionError', () => {
  it('Given IngestionError, When created, Then has code INGEST_INVALID and is NOT retryable', () => {
    const err = new IngestionError('Missing required field: name');
    expect(err).toBeInstanceOf(DiagnosticAgentError);
    expect(err.code).toBe('INGEST_INVALID');
    expect(err.retryable).toBe(false);
    expect(err.phase).toBe(0);
  });

  it('Given IngestionError with cause, When created, Then preserves cause', () => {
    const cause = new Error('underlying parse failure');
    const err = new IngestionError('Invalid document format', cause);
    expect(err.cause).toBe(cause);
  });
});

// ═══ EntityNotFoundError ═══
describe('EntityNotFoundError', () => {
  it('Given EntityNotFoundError, When created, Then has code ENTITY_NOT_FOUND and is NOT retryable', () => {
    const err = new EntityNotFoundError('Snapshot snap_xxx not found');
    expect(err.code).toBe('ENTITY_NOT_FOUND');
    expect(err.retryable).toBe(false);
    expect(err.phase).toBe(-1);
  });
});

// ═══ QueryTimeoutError ═══
describe('QueryTimeoutError', () => {
  it('Given QueryTimeoutError, When created, Then has code QUERY_TIMEOUT and IS retryable', () => {
    const err = new QueryTimeoutError('shortestPath exceeded 5000ms');
    expect(err.code).toBe('QUERY_TIMEOUT');
    expect(err.retryable).toBe(true);
    expect(err.phase).toBe(-1);
  });
});

// ═══ VersionConflictError ═══
describe('VersionConflictError', () => {
  it('Given VersionConflictError, When created, Then has code VERSION_CONFLICT and is NOT retryable', () => {
    const err = new VersionConflictError('Entity Person: keyAspect mismatch (base=name, patch=email)');
    expect(err.code).toBe('VERSION_CONFLICT');
    expect(err.retryable).toBe(false);
    expect(err.phase).toBe(-1);
  });
});

// ═══ Type Guard ═══
describe('isRetryableOntologyError', () => {
  it('Given GraphStoreError, When checked, Then returns true', () => {
    expect(isRetryableOntologyError(new GraphStoreError('x'))).toBe(true);
  });

  it('Given IngestionError, When checked, Then returns false', () => {
    expect(isRetryableOntologyError(new IngestionError('x'))).toBe(false);
  });

  it('Given null, When checked, Then returns false (safe on unknown)', () => {
    expect(isRetryableOntologyError(null)).toBe(false);
  });

  it('Given plain Error, When checked, Then returns false', () => {
    expect(isRetryableOntologyError(new Error('plain'))).toBe(false);
  });
});

// ═══ instanceof chain ═══
describe('instanceof chain', () => {
  it('All ontology errors are instanceof DiagnosticAgentError', () => {
    expect(new GraphStoreError('x')).toBeInstanceOf(DiagnosticAgentError);
    expect(new IngestionError('x')).toBeInstanceOf(DiagnosticAgentError);
    expect(new EntityNotFoundError('x')).toBeInstanceOf(DiagnosticAgentError);
    expect(new QueryTimeoutError('x')).toBeInstanceOf(DiagnosticAgentError);
    expect(new VersionConflictError('x')).toBeInstanceOf(DiagnosticAgentError);
  });

  it('All ontology errors are instanceof Error', () => {
    expect(new GraphStoreError('x')).toBeInstanceOf(Error);
    expect(new IngestionError('x')).toBeInstanceOf(Error);
  });
});

// ═══ Error properties accessible at runtime ═══
describe('Error property access', () => {
  it('Given GraphStoreError, When properties accessed, Then code/message/name are correct', () => {
    const err = new GraphStoreError('test message');
    // Note: JSON.stringify(err) only serializes message/stack by default (Error contract).
    // Runtime property access on the instance is the primary contract.
    expect(err.code).toBe('GRAPH_DB');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('GraphStoreError');
    expect(err.retryable).toBe(true);
  });
});
