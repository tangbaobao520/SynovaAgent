# SynovaAgent -- D17 Agent Proactive Push Implementation v1.0

> 2026-07-20 | Auth Doc #5: Agent Proactive Interaction Blueprint -- Module 1
> **First user-visible proactive capability: sentinel P0 alerts auto-push to notification channels.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent proactive interaction system -- Module 1 proactive push. When a sentinel detects a P0 alert, auto-push to configured channels (Feishu/email/webhook).

### Q1: ??
- ??: PagerDuty alert routing, Datadog monitor -> Slack, Sentry error -> email
- Memory lessons: D05 push pipeline exists but only used for boss mailbox (weekly digest). Iron Law 5 -- backend capability != user-visible feature. Push must confirm delivery.

### Q2: ??
- Minimal: P0 sentinel finding -> auto-push via D05 pipeline
- NOT doing: Feishu interactive cards (D18), email template customization (D19), P1/P2 push (too noisy)

### Q3: ??
- ??: SentinelRunner ??? P0 finding -> ?? push
- Interaction: push arrives at configured channel (Feishu/email) -> user receives message
- Result: Push record written to notification_log (D05)

### Q4: Contract and Test
- @input: SentinelFinding (critical severity)
- @output: PushResult { channel, messageId, deliveredAt }
- @degraded: push failure -> log.warn + retry 3x (10s, 30s, 90s) -> final abandon + write audit
- Tests: push success, push fail (network), push fail (3 retries exhausted), P1/P2 filtered, >=3 expect each

---

## Execution Constraints (Loop Engineering V4.4.5 Mandatory)

```
=== Per-Commit ===
G1: as any = 0
G2: empty catch -> log.warn
G4: new src/ files -> paired test files
G5: new export -> caller in src/

=== Post-Code Self-Check ===
1. [WIRING] Who triggers the push? (grep in sentinel-runner.ts)
2. [EXCEPTION] Push failures: retry + log + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Push succeed/fail/retry/filter?
5. [DEAD CODE] None
```

---

## Current State

- D05: Push notification pipeline exists (boss mailbox -> Feishu webhook)
- D06: Push notification wiring DONE
- SentinelRunner: watches sentinel findings, but does NOT trigger push for P0
- Notification channels: Feishu only (D05), no email/webhook yet
- Auth Doc #5 Module 1: "P0 sentinel finding -> auto push to configured channels"

---

## What We Build

### 1. src/agent/proactive-push.ts -- ProactivePush Service (New)

```
class ProactivePush {
  constructor(channels: PushChannel[], auditStore: AuditStore)
  onP0Finding(finding: SentinelFinding): Promise<PushResult>
  pushToChannel(channel: PushChannel, finding: SentinelFinding): Promise<PushResult>
  retryFailed(findingId: string, maxRetries: number): Promise<PushResult>
}
```

Push flow:
1. SentinelRunner detects P0 finding -> calls proactivePush.onP0Finding(finding)
2. Push to all configured channels in parallel (Promise.allSettled)
3. Each channel: format message -> send -> wait for delivery confirmation
4. Retry failed channels: 3x exponential backoff (10s, 30s, 90s)
5. After max retries: write failed push to audit-store, log.warn
6. P1/P2 findings: filtered, not pushed (too noisy for MVP)

### 2. Push message format

```
[Synova P0 Alert] {sentinelName}: {finding.title}
Severity: CRITICAL
Description: {finding.description}
Suggestion: {finding.suggestion}
Detected: {finding.detectedAt}
View: {dashboardUrl}/alerts/{finding.id}
```

### 3. Wiring into SentinelRunner (Modify src/sentinel/runner.ts)

After sentinel check completes:
```typescript
if (finding.severity === 'critical') {
  const push = this.ctx.get('proactivePush') as ProactivePush;
  if (push) {
    push.onP0Finding(finding).catch(err => log.warn({err}, 'P0 push failed'));
  }
}
```

### 4. tests/agent/proactive-push.test.ts (New, >=9 tests)

```
[ ] onP0Finding: push to single channel -> success
[ ] onP0Finding: push to multiple channels -> all succeed
[ ] onP0Finding: one channel fails -> others still succeed (Promise.allSettled)
[ ] retryFailed: retry 1 succeeds -> status=delivered
[ ] retryFailed: retry 3 fails -> status=failed + audit written
[ ] onP0Finding: P1 finding -> filtered, no push
[ ] onP0Finding: P2 finding -> filtered, no push
[ ] pushToChannel: network error -> retry triggered
[ ] pushToChannel: message format contains all required fields
```

---

## What We Don't Do

- Don't build interactive card replies (D18)
- Don't build email template customization (D19)
- Don't push P1/P2 findings (too noisy for MVP)
- Don't modify D05 push pipeline (reuse only)
- Don't add new notification channels (webhook/email) -- Feishu only for MVP

---

## Architecture Layer

L2 (src/agent/proactive-push.ts) + L3 (SentinelRunner wiring)

---

## Completion Standard (verifiable by pre-commit + grep)

```
[ ] ProactivePush class: onP0Finding + pushToChannel + retryFailed
[ ] SentinelRunner wiring: P0 finding -> proactivePush.onP0Finding()
[ ] Retry logic: 3x exponential backoff (10s, 30s, 90s)
[ ] P1/P2 filtered, not pushed
[ ] Push message format: sentinel name + title + description + suggestion + timestamp + link
[ ] Audit: failed pushes (after 3 retries) written to audit-store
[ ] Degrade: push channel unavailable -> log.warn + retry, does NOT crash SentinelRunner
[ ] Zero as any (Iron Law 38)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] Every new export has caller in src/ (Iron Law 4)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: push success (2) + push multi-channel (2) + retry (2) + filter (2) + format (1)
```

---

## Auth Doc References

- Auth Doc #5: Agent Proactive Interaction Blueprint -- Module 1: Proactive Push
- D05: Push Notification Pipeline (boss mailbox)
- D93: Feedback Collector (middle manager feedback pipeline)
