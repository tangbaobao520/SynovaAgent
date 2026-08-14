# SynovaAgent -- D19 GA Human-AI Collaboration Implementation v1.0

> 2026-07-22 | Auth Doc #5: Agent Proactive Interaction -- Module 3
> **D18 lets GA receive interactive cards. D19 lets GA act on them -- correct, flag, re-diagnose.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent GA collaboration feedback loop. D19 closes the loop: GA sees a diagnosis result, marks corrections directly from the interactive card (D18), and triggers a lightweight re-diagnosis (D75) when the original diagnosis appears wrong.

### Q1: Research
- Industry: GitHub code review inline comments, Figma design review pins, Linear issue triage
- Memory lessons: Iron Law 5 -- backend capability != user-visible feature. The GA correction must have visible confirmation AND the system must show what changed because of the correction.

### Q2: Scope
- Minimal: GAFeedbackHandler class (onCorrect -> write correction, onFlag -> trigger re-diagnosis, onDismiss -> log)
- NOT doing: full GA workbench (D108), multi-enterprise GA dashboards (D109), GA report annotations
- MVP: three GA actions from D18 interactive card: Confirm (done), Flag (new), Re-diagnose (new)

### Q3: Acceptance
- Entry: GA taps "Flag as Incorrect" on D18 interactive card
- Interaction: System creates GA correction record -> triggers D75 lightweight re-diagnosis
- Result: Re-diagnosis report generated, GA receives updated card with before/after comparison

### Q4: Contract and Test
- @input: GAFeedbackAction { findingId, action: 'correct' | 'flag' | 'rediagnose', correction?, gaUserId }
- @output: GAFeedbackResult { action, status, reDiagnosisId?, correctionId? }
- @degraded: re-diagnosis fails -> return error + log.warn, original report unchanged
- Tests: correct finding, flag for re-diagnosis, re-diagnosis trigger, dismiss, re-diagnosis fail -> degrade

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: new src/ files -> paired tests
G5: new exports -> callers

=== Post-Code Agent Self-Check ===
1. [WIRING] Who calls GAFeedbackHandler? (D18 interactive-card handleAction)
2. [EXCEPTION] catch + log.warn + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Normal/degrade/boundary?
5. [DEAD CODE] None?
```

---

## Current State (2026-07-22, verified by grep)

- D18: InteractiveCardHandler DONE (handleAction processes Confirm/Dismiss/Details)
- D75: Lightweight Re-Diagnosis DONE (lightweight-diagnosis.ts)
- D93: FeedbackCollector DONE (middle manager feedback pipeline)
- D92: MiddleEvolutionEngine DONE (processes AggregatedSignals)
- GA feedback handler: ZERO existence
- GA correction workflow: ZERO existence
- Auth Doc #5 Module 3: "GA Human-AI Collaboration & Feedback Closed Loop"

---

## What We Build

### 1. src/l3/ga-collaboration.ts -- GAFeedbackHandler (New, ~200 lines)

```
class GAFeedbackHandler {
  processFeedback(action: GAFeedbackAction): Promise<GAFeedbackResult>
  triggerReDiagnosis(findingId: string, gaUserId: string): Promise<string> // -> reDiagnosisId
  recordCorrection(findingId: string, correction: string, gaUserId: string): Promise<string> // -> correctionId
}
```

GA action flow:
1. GA receives D18 interactive card with diagnosis result
2. GA taps "Flag as Incorrect" or "Correct" button (new buttons added to D18 card)
3. System creates GAFeedbackAction
4. For 'flag': trigger D75 lightweightReDiagnosis(findingId) -> return new diagnosis ID
5. For 'correct': write correction to D93 feedbackCollector with decision:'ga_correction'
6. For 'rediagnose': trigger D75 + write audit log
7. Return GAFeedbackResult with updated card content (before/after comparison)

### 2. Extend D18 InteractiveCardHandler (Modify src/agent/interactive-card.ts)

Add two new button types to CardMessage for GA users:
```
// If user.role === 'ga', add [Flag] and [Correct] buttons
[Flag as Incorrect] -> action:'flag'
[Correct] -> action:'correct'
[Re-diagnose] -> action:'rediagnose'
```

### 3. Extend D18 card action endpoint (Modify src/routes/sentinel.ts)

Add handling for 'flag', 'correct', 'rediagnose' action types in the existing POST /api/sentinel/alerts/:id/action endpoint.

### 4. Wire into InteractiveCardHandler.handleAction()

```
case 'flag':
case 'rediagnose': {
  const gaHandler = new GAFeedbackHandler();
  const result = await gaHandler.processFeedback({...});
  return result.cardUpdate;
}
```

### 5. tests/l3/ga-collaboration.test.ts (New, >=8 tests)

```
[ ] processFeedback: flag -> triggers re-diagnosis + returns reDiagnosisId
[ ] processFeedback: correct -> writes to D93 feedbackCollector
[ ] processFeedback: rediagnose -> triggers D75 + audit
[ ] processFeedback: unknown action -> degrade + error
[ ] reconnect: re-diagnosis D75 call succeeds
[ ] reconnect: re-diagnosis fails -> degrade + original report unchanged
[ ] card update: GA sees before/after comparison
[ ] integration: D18 handleAction routes to GAFeedbackHandler for ga role
```

---

## What We Don't Do

- Don't build full GA workbench UI (D108)
- Don't implement multi-enterprise GA dashboards (D109)
- Don't implement GA report annotation system
- Don't modify D75 lightweight-diagnosis logic

---

## Architecture Layer

L3 (src/l3/ga-collaboration.ts) + L1 (sentinel routes modification)

---

## Completion Standard

```
[ ] GAFeedbackHandler: processFeedback + triggerReDiagnosis + recordCorrection
[ ] D18 card: GA users see [Flag] + [Correct] + [Re-diagnose] buttons
[ ] D18 card action: POST /api/sentinel/alerts/:id/action handles flag/correct/rediagnose
[ ] Re-diagnosis: D75 lightweightReDiagnosis triggered on 'flag' or 'rediagnose'
[ ] Correction: D93 feedbackCollector.collectFeedback on 'correct' with decision:'ga_correction'
[ ] Card update: after GA action, card shows before/after comparison
[ ] Degrade: re-diagnosis fails -> original report unchanged + error message
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests
```

---

## Auth Doc References

- Auth Doc #5: Agent Proactive Interaction -- Module 3: GA Human-AI Collaboration
- D18: InteractiveCardHandler (extends with GA actions)
- D75: Lightweight Re-Diagnosis (triggered on GA flag)
- D93: FeedbackCollector (GA corrections written as feedback)
