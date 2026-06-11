/**
 * diagnosis-permissions.test.ts — 7 层权限决策树测试
 *
 * 对标 Claw-Code permissions.rs 的 11 个测试
 */

import {
  DiagnosisPermissionLevel,
  PermissionContext,
  DiagnosisEvidence,
} from '../types';
import {
  PermissionPolicy,
  PermissionRule,
  PermissionRequest,
  RecordingPermissionStore,
  createDefaultPermissionPolicy,
} from '../diagnosis-permissions';

// ====================================================================
// 测试辅助
// ====================================================================

const makeContext = (overrides: Partial<PermissionContext> = {}): PermissionContext => ({
  requesterRole: 'member',
  requesterTeamId: 'team-1',
  targetTeamId: 'team-1',
  isInitiator: false,
  isFDE: false,
  ...overrides,
});

const makeEvidence = (overrides: Partial<DiagnosisEvidence> = {}): DiagnosisEvidence => ({
  id: 'ev-001',
  source: 'module',
  content: 'test evidence',
  confidence: 0.8,
  timestamp: '2026-05-30T10:00:00Z',
  phase: 1,
  dimension: 'knowledge_sharing',
  isPrivate: false,
  ...overrides,
});

const makeRequest = (overrides: Partial<PermissionRequest> = {}): PermissionRequest => ({
  resource: 'evidence:knowledge_sharing',
  context: makeContext(),
  action: 'read',
  ...overrides,
});

// ====================================================================
// 7 层决策树 — 每层至少 1 个测试
// ====================================================================

describe('DiagnosisPermissionPolicy', () => {
  let policy: PermissionPolicy;

  beforeEach(() => {
    policy = createDefaultPermissionPolicy();
  });

  // EVERYONE (0)
  it('EVERYONE: allows access to public benchmark data', () => {
    // Given: a stranger from another org requesting industry benchmark
    const req = makeRequest({
      resource: 'benchmark:knowledge_sharing',
      context: makeContext({ requesterTeamId: 'other-org', isInitiator: false }),
    });

    // When: checking permission
    const result = policy.check(req);

    // Then: access granted — benchmarks are public
    expect(result.allowed).toBe(true);
  });

  // ORG_MEMBER (1)
  it('ORG_MEMBER: denies cross-org access to diagnosis summary', () => {
    // Given: external user requesting org-internal summary
    const req = makeRequest({
      resource: 'summary:team-1',
      context: makeContext({ requesterTeamId: 'other-org', isInitiator: false }),
    });

    // When: checking permission
    const result = policy.check(req);

    // Then: denied — cross-org access requires at least ORG_MEMBER
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('权限不足');
    }
  });

  it('ORG_MEMBER: allows same-org member to read diagnosis summary', () => {
    // Given: a member of the same team requesting the summary
    const req = makeRequest({
      resource: 'summary:team-1',
      context: makeContext({ requesterTeamId: 'team-1', isInitiator: false }),
    });

    // When: checking permission
    const result = policy.check(req);

    // Then: granted — same org member
    expect(result.allowed).toBe(true);
  });

  // DIAGNOSIS_PARTICIPANT (2)
  it('DIAGNOSIS_PARTICIPANT: denies non-participant evidence access', () => {
    // Given: a same-org member who is NOT a diagnosis participant requesting evidence
    // (ORG_MEMBER < PARTICIPANT)
    const req = makeRequest({
      resource: 'evidence:decision_making',
      context: makeContext({ requesterTeamId: 'team-1', isInitiator: false }),
    });

    // When: checking — evidence:* rule requires PARTICIPANT
    const result = policy.check(req);

    // Then: the built-in rule for evidence requires DIAGNOSIS_PARTICIPANT (level 2)
    // An ORG_MEMBER (level 1) is below that threshold
    expect(result.allowed).toBe(false);
  });

  // INITIATOR_ONLY (3)
  it('INITIATOR_ONLY: allows initiator to read full report', () => {
    // Given: the diagnosis initiator requesting full report
    const req = makeRequest({
      resource: 'report:team-1/full',
      context: makeContext({ isInitiator: true }),
    });

    // When: checking permission
    const result = policy.check(req);

    // Then: granted — initiator has INITIATOR_ONLY (3)
    expect(result.allowed).toBe(true);
  });

  it('INITIATOR_ONLY: denies non-initiator full report access', () => {
    // Given: same-org member (not initiator) requesting full report
    const req = makeRequest({
      resource: 'report:team-1/full',
      context: makeContext({ isInitiator: false }),
    });

    // When: checking permission
    const result = policy.check(req);

    // Then: denied — full report requires INITIATOR_ONLY
    expect(result.allowed).toBe(false);
  });

  // FDE_OVERRIDE (4)
  it('FDE_OVERRIDE: FDE can override PARTICIPANT restriction', () => {
    // Given: an FDE (non-initiator) requesting evidence
    const req = makeRequest({
      resource: 'evidence:knowledge_sharing',
      context: makeContext({ isInitiator: false, isFDE: true }),
    });

    // When: checking permission — FDE gets level boost to FDE_OVERRIDE
    const result = policy.check(req);

    // Then: granted — FDE override elevates to FDE_OVERRIDE (4) ≥ PARTICIPANT (2)
    expect(result.allowed).toBe(true);
  });

  // ADMIN_ONLY (5)
  it('ADMIN_ONLY: deny rule blocks non-admin from sensitive resources', () => {
    // Given: a policy with a deny rule requiring ADMIN_ONLY for secrets
    const policy2 = new PermissionPolicy()
      .withRule({
        name: 'deny-secrets',
        resourcePattern: 'secret:*',
        action: 'deny',
        minLevel: DiagnosisPermissionLevel.ADMIN_ONLY,
        priority: 100,
      });

    // When: a same-team member (ORG_MEMBER, not admin) tries to access secrets
    const req = makeRequest({
      resource: 'secret:keys',
      context: makeContext({ isInitiator: false }),
    });

    const result = policy2.check(req);

    // Then: denied — ORG_MEMBER (1) < ADMIN_ONLY (5)
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('deny-secrets');
    }
  });

  // NEVER (6)
  it('NEVER: explicit deny rule cannot be overridden', () => {
    // Given: a policy with an explicit deny-all rule for a resource
    const policy2 = new PermissionPolicy()
      .withRule({
        name: 'never-expose-pii',
        resourcePattern: 'secret:*',
        action: 'deny',
        minLevel: DiagnosisPermissionLevel.NEVER,
        priority: 999,
      });

    // When: even an initiator tries to access
    const req = makeRequest({
      resource: 'secret:pii-data',
      context: makeContext({ isInitiator: true }),
    });

    const result = policy2.check(req);

    // Then: denied — deny > allow, NEVER cannot be reached
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('never-expose-pii');
    }
  });

  // ── 规则优先级 ──

  it('rule-based deny overrides default allow', () => {
    // Given: policy with a specific deny rule and a general allow rule
    const policy2 = new PermissionPolicy()
      .withRule({
        name: 'allow-evidence',
        resourcePattern: 'evidence:*',
        action: 'allow',
        minLevel: DiagnosisPermissionLevel.EVERYONE,
        priority: 10,
      })
      .withRule({
        name: 'deny-financial-evidence',
        resourcePattern: 'evidence:financial_*',
        action: 'deny',
        minLevel: DiagnosisPermissionLevel.INITIATOR_ONLY,
        priority: 50,
      });

    // When: non-initiator requests financial evidence
    const req = makeRequest({
      resource: 'evidence:financial_impact',
      context: makeContext({ isInitiator: false }),
    });

    const result = policy2.check(req);

    // Then: the more specific deny rule takes precedence
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('deny-financial-evidence');
    }
  });

  // ── 私有证据 ──

  it('canReadEvidence: denies private evidence to non-initiator', () => {
    // Given: private evidence with reason
    const evidence = makeEvidence({
      isPrivate: true,
      privateReason: '包含个人身份信息',
    });
    const ctx = makeContext({ isInitiator: false });

    // When: non-initiator tries to read
    const result = policy.canReadEvidence(evidence, ctx);

    // Then: denied
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('私有');
    }
  });

  it('canReadEvidence: allows private evidence to initiator', () => {
    // Given: private evidence
    const evidence = makeEvidence({ isPrivate: true, privateReason: '敏感' });
    const ctx = makeContext({ isInitiator: true });

    // When: initiator reads
    const result = policy.canReadEvidence(evidence, ctx);

    // Then: allowed
    expect(result.allowed).toBe(true);
  });

  it('canReadEvidence: FDE can read private evidence', () => {
    // Given: private evidence
    const evidence = makeEvidence({ isPrivate: true, privateReason: '敏感' });
    const ctx = makeContext({ isInitiator: false, isFDE: true });

    // When: FDE reads
    const result = policy.canReadEvidence(evidence, ctx);

    // Then: allowed — FDE override
    expect(result.allowed).toBe(true);
  });

  // ── 批量过滤 ──

  it('filterReadableEvidence: splits readable from denied', () => {
    // Given: mix of public and private evidence; policy allows evidence at ORG_MEMBER level
    const policy2 = new PermissionPolicy()
      .withRule({
        name: 'allow-evidence',
        resourcePattern: 'evidence:*',
        action: 'allow',
        minLevel: DiagnosisPermissionLevel.ORG_MEMBER,
        priority: 30,
      });

    const evidenceList = [
      makeEvidence({ id: 'ev-001', isPrivate: false }),
      makeEvidence({ id: 'ev-002', isPrivate: true, privateReason: 'PII' }),
      makeEvidence({ id: 'ev-003', isPrivate: false }),
    ];
    const ctx = makeContext({ isInitiator: false });

    // When: batch filtering
    const { readable, denied } = policy2.filterReadableEvidence(evidenceList, ctx);

    // Then: public readable, private denied
    expect(readable).toHaveLength(2);
    expect(readable.map(e => e.id)).toEqual(['ev-001', 'ev-003']);
    expect(denied).toEqual(['ev-002']);
  });

  // ── 写操作保护 ──

  it('write action: denies non-initiator from writing', () => {
    // Given: a non-initiator trying to write
    const req = makeRequest({
      resource: 'evidence:knowledge_sharing',
      context: makeContext({ isInitiator: false }),
      action: 'write',
    });

    // When: checking
    const result = policy.check(req);

    // Then: denied — write requires INITIATOR_ONLY
    expect(result.allowed).toBe(false);
  });

  it('write action: allows initiator to write', () => {
    // Given: the initiator trying to write
    const req = makeRequest({
      resource: 'evidence:knowledge_sharing',
      context: makeContext({ isInitiator: true }),
      action: 'write',
    });

    // When: checking
    const result = policy.check(req);

    // Then: allowed
    expect(result.allowed).toBe(true);
  });
});

// ====================================================================
// RecordingPermissionStore — 测试 Spy 模式
// ====================================================================

describe('RecordingPermissionStore', () => {
  it('records all permission checks for later assertion', () => {
    // Given: a recording store
    const store = new RecordingPermissionStore();

    // When: performing 3 checks
    store.check({ resource: 'a', context: makeContext(), action: 'read' });
    store.check({ resource: 'b', context: makeContext(), action: 'read' });
    store.check({ resource: 'c', context: makeContext(), action: 'write' });

    // Then: all 3 recorded
    expect(store.seen).toHaveLength(3);
    expect(store.seen[0].resource).toBe('a');
    expect(store.seen[2].action).toBe('write');
  });

  it('lastRequest returns the most recent check', () => {
    // Given: a recording store with 2 checks
    const store = new RecordingPermissionStore();
    store.check({ resource: 'first', context: makeContext(), action: 'read' });
    store.check({ resource: 'last', context: makeContext(), action: 'read' });

    // When: asking for last request
    const last = store.lastRequest();

    // Then: returns the most recent
    expect(last?.resource).toBe('last');
  });

  it('requestsFor filters by resource name', () => {
    // Given: a recording store with mixed resources
    const store = new RecordingPermissionStore();
    store.check({ resource: 'alpha', context: makeContext(), action: 'read' });
    store.check({ resource: 'beta', context: makeContext(), action: 'read' });
    store.check({ resource: 'alpha', context: makeContext(), action: 'write' });

    // When: filtering for 'alpha'
    const alphaReqs = store.requestsFor('alpha');

    // Then: only 'alpha' requests returned
    expect(alphaReqs).toHaveLength(2);
    expect(alphaReqs[0].resource).toBe('alpha');
    expect(alphaReqs[1].resource).toBe('alpha');
  });

  it('reset clears all recorded requests', () => {
    // Given: a recording store with checks
    const store = new RecordingPermissionStore();
    store.check({ resource: 'x', context: makeContext(), action: 'read' });

    // When: resetting
    store.reset();

    // Then: empty
    expect(store.seen).toHaveLength(0);
  });
});

// ====================================================================
// PermissionPolicy — Builder 模式
// ====================================================================

describe('PermissionPolicy builder', () => {
  it('withRule returns this for chaining', () => {
    // Given: a new policy
    const policy = new PermissionPolicy();

    // When: chaining withRule calls
    const result = policy
      .withRule({ name: 'r1', resourcePattern: 'a', action: 'allow', minLevel: DiagnosisPermissionLevel.EVERYONE, priority: 1 })
      .withRule({ name: 'r2', resourcePattern: 'b', action: 'deny', minLevel: DiagnosisPermissionLevel.ADMIN_ONLY, priority: 2 });

    // Then: returns the same instance
    expect(result).toBe(policy);
  });

  it('withoutRule removes a previously added rule', () => {
    // Given: a policy with 2 rules
    const policy = new PermissionPolicy()
      .withRule({ name: 'keep', resourcePattern: 'a', action: 'allow', minLevel: DiagnosisPermissionLevel.EVERYONE, priority: 1 })
      .withRule({ name: 'remove', resourcePattern: 'b', action: 'deny', minLevel: DiagnosisPermissionLevel.ADMIN_ONLY, priority: 2 });

    // When: removing one rule
    policy.withoutRule('remove');

    // Then: only the 'keep' rule matches
    // (verify by checking that 'b' no longer has a specific rule)
    const req: PermissionRequest = { resource: 'b', context: makeContext(), action: 'read' };
    const result = policy.check(req);
    // Falls back to default ORG_MEMBER level — same team member passes
    expect(result.allowed).toBe(true);
  });
});
