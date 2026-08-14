# SynovaAgent -- D18 Interactive Card Replies Implementation v1.0

> 2026-07-20 | Auth Doc #5: Agent Proactive Interaction -- Module 2
> **D17 pushes P0 alerts. D18 lets users reply -- confirm, dismiss, request details.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent proactive interaction system. D18 adds interactive card replies to D17 push notifications. When a user receives a P0 alert, they can tap a button to confirm (acknowledge), dismiss (mark as false alarm, feeds D93), or request more details.

### Q1: Research
- Industry: PagerDuty incident acknowledge, Datadog monitor mute, Sentry issue resolve
- Memory lessons: Iron Law 5 -- backend capability != user-visible feature. The reply action must have a visible confirmation that the user's action was received. Iron Law 11 -- silent degradation forbidden. Failed reply must show error to user.

### Q2: Scope
- Minimal: Feishu interactive card with 3 buttons (Confirm/Dismiss/Details). Actions write to D93 feedback collector.
- NOT doing: Email card replies (D19), multi-step conversation flows (D20), GA escalation workflows (D21)

### Q3: Acceptance
- Entry: User receives Feishu push message from D17 with interactive buttons
- Interaction: User taps "Dismiss" -> card updates to "Dismissed" -> feedback written to D93
- Result: D93 AggregatedSignal count increments. If >=3 dismissals on same sentinel -> triggers D92 threshold adjust

### Q4: Contract and Test
- @input: PushMessage from D17 + callback URL for card actions
- @output: CardActionResult { findingId, action, userId, timestamp }
- @degraded: card action fails -> show error text on card + log.warn
- Tests: Confirm action writes to audit, Dismiss writes to D93 feedback, Details returns finding info, network error shows card error, >=3 expect each

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates (8 groups, <10s) ===
G1: as any = 0
G2: empty catch has log.warn
G3: secrets scan
G4: every new src/ file paired with test file
G5: every new export has caller in src/
G6: new compute functions have JSDoc + tests
G7: new sentinel aggregate.ts has integration test

=== Post-Code Agent Self-Check (5 questions) ===
1. [WIRING] New export: who calls it? (grep)
2. [EXCEPTION] Every catch: log.warn + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Normal/degrade/boundary?
5. [DEAD CODE] None?

=== verify-incremental.sh (L1->L4) ===
L1: oxlint -> L2: tsc --incremental -> L3: vitest --changed -> L4: wiring audit
```

---

## Current State (2026-07-20, verified by grep)

- D17: ProactivePush service DONE (onP0Finding, pushToChannel, retryFailed)
- D05: Push pipeline (Feishu webhook) DONE
- D93: FeedbackCollector DONE (collectFeedback writes to SQLite feedback_log)
- D92: MiddleEvolutionEngine DONE (processes AggregatedSignals including threshold_adjust)
- Interactive card handlers: ZERO existence
- Card action callback endpoint: ZERO existence
- Auth Doc #5 Module 2: "Conversational causal exploration -- interactive card replies"

---

## What We Build

### 1. src/agent/interactive-card.ts -- InteractiveCardHandler (New, ~180 lines)

```
class InteractiveCardHandler {
  buildCardMessage(finding: SentinelFinding): CardMessage
  handleAction(action: CardAction): Promise<CardActionResult>
}
```

Card buttons:
- [Confirm] -- acknowledge alert. Writes to audit log. Card updates to green checkmark.
- [Dismiss] -- mark as false alarm. Writes to D93 feedbackCollector with decision:'reject'. Card updates to grey "Dismissed".
- [Details] -- returns full finding text (description + suggestion + evidence). Card expands with inline detail section.

### 2. Card action callback endpoint (New route or extend existing)

POST /api/sentinel/alerts/:id/action
Body: { action: 'confirm' | 'dismiss' | 'details', userId: string }
Response: { ok: boolean, cardUpdate: CardUpdate }

### 3. Wire into ProactivePush (Modify src/agent/proactive-push.ts)

Replace plain push message with interactive card:
```
// Before (D17): formatPushMessage() -> PushMessage with plain text
// After (D18): interactiveCard.buildCardMessage() -> CardMessage with buttons
```

### 4. D93 Feedback Integration

On Dismiss action:
```
feedbackCollector.collectFeedback({
  enterpriseId, actorId: userId,
  decision: 'reject', targetType: 'sentinel_alert',
  targetId: findingId, reason: 'User dismissed via card',
  actorRole: 'manager'
});
```

### 5. tests/agent/interactive-card.test.ts (New, >=9 tests)

```
[ ] buildCard: card has 3 buttons (Confirm/Dismiss/Details)
[ ] handleAction Confirm: writes audit log, returns cardUpdate with green checkmark
[ ] handleAction Dismiss: writes to feedbackCollector, returns cardUpdate with "Dismissed"
[ ] handleAction Details: returns full finding text
[ ] handleAction invalid: returns error card message
[ ] handleAction network error: card shows error + retry hint
[ ] D93 integration: dismiss -> feedbackCollector.collectFeedback called with decision:'reject'
[ ] card message format: matches Feishu interactive card JSON schema
[ ] ProactivePush wire: onP0Finding calls buildCardMessage instead of formatPushMessage
```

---

## What We Don't Do

- Don't build email interactive cards (D19)
- Don't build multi-step conversation flows (D20)
- Don't build GA escalation decision cards (D21)
- Don't modify D05 push pipeline internals

---

## Architecture Layer

L2 (src/agent/interactive-card.ts) + L1 (card action endpoint)

---

## Completion Standard

```
[ ] InteractiveCardHandler: buildCardMessage + handleAction
[ ] Card buttons: Confirm (audit) + Dismiss (D93 feedback) + Details (inline expand)
[ ] Card action endpoint: POST /api/sentinel/alerts/:id/action
[ ] ProactivePush wired: onP0Finding uses interactive cards instead of plain text
[ ] D93 integration: Dismiss action -> feedbackCollector.collectFeedback(decision:'reject')
[ ] Card error handling: network error -> error message on card + retry
[ ] Zero as any (Iron Law 38)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] Every new export has caller in src/ (Iron Law 4)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: buildCard (2) + Confirm (1) + Dismiss (2) + Details (1) + error (1) + wire (1) + format (1)
```

---

## Auth Doc References

- Auth Doc #5: Agent Proactive Interaction -- Module 2: Conversational Causal Exploration
- D17: ProactivePush service
- D93: FeedbackCollector (middle manager feedback pipeline)
- D05: Push notification pipeline (Feishu webhook)
