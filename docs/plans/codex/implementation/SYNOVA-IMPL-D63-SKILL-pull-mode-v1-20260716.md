# SynovaAgent -- D63 4 SKILL Pull Mode Implementation v1.0

> 2026-07-16 | Auth Doc #11 Managerial Economics Ch4 S4.1-S4.2
> Standard: Anthropic Engineering ? Iron Law 0-2 ? 5-Layer Architecture
> **This doc is the sole execution basis for claude code.**

---

## Execution Constraints

```
1. Wiring Check: New export called? (grep)
2. Exception Handling: catch + log + degraded? (Iron Law 24+31)
3. Type Safety: as any = 0? (Iron Law 38)
4. Test Coverage: expect()? Normal/degrade/boundary? (Iron Law 48)
5. Dead Code: none?
```

---

## Current State

- D59+D60+D61: 27 ME computes DONE
- D62: 9 ME sentinels DONE
- D65+D66: Skill registry + 41 built-in skills DONE
- KnowledgeStore: exists (D76 knowledge-feedback.ts writes to it)
- tool_query_knowledge: NOT YET EXISTS -- needs creation
- D63: 4 ME SKILL entries for KnowledgeStore with pull-mode triggers

---

## What We Build

### 1. 4 SKILL Knowledge Entries (pull-mode)

Each SKILL = KnowledgeStore entry with trigger conditions. Expert calls tool_query_knowledge(skill_name) dynamically.

| # | SKILL name | Trigger | Content | Target Expert | Priority |
|---|-----------|---------|---------|---------------|----------|
| 1 | me_pricing_strategy | computeOptimalPrice OR computePriceElasticity invoked | Pricing strategy decision tree (uniform/tiered/bundled) + when to use each | strategy | P0 |
| 2 | me_cost_structure | computeBreakEven OR computeDOL invoked | Fixed vs variable cost decomposition + operating leverage interpretation thresholds | finance | P0 |
| 3 | me_market_power | computeHHI OR computeLernerIndex invoked | Market structure quadrants + HHI thresholds + pricing power indicators | strategy | P0 |
| 4 | me_investment_decision | computeNPV OR computeIRR invoked | NPV decision rules + IRR vs WACC comparison + payback period interpretation | finance | P0 |

### 2. tool_query_knowledge tool registration

Create Tool manifest entry for knowledge retrieval:
- Tool: tool_query_knowledge(skill_name: string) -> KnowledgeFragment[]
- Registered in extensions/tools/manifest.json
- Consumes KnowledgeStore.getBySkill(skill_name)

### 3. KnowledgeStore.getBySkill() method

Add method to KnowledgeStore (or knowledge-feedback.ts) that queries by skill name.

---

## What We Don't Do

- Don't modify expert prompt templates (D58)
- Don't modify compute functions (D59/D60/D61)
- Don't create sentinels (D62 done)
- Don't create static knowledge files (D64 handles that)

---

## Architecture Layer

L3 (KnowledgeStore + tool_query_knowledge) + L4 (SKILL knowledge entries)

---

## Completion Standard

```
[ ] 4 SKILL knowledge entries created in KnowledgeStore
[ ] Each entry: name + trigger_conditions + content + target_expert + priority
[ ] tool_query_knowledge function: input skill_name -> output KnowledgeFragment[]
[ ] tool_query_knowledge registered in extensions/tools/manifest.json
[ ] KnowledgeStore.getBySkill(query) method implemented
[ ] Degrade: KnowledgeStore unavailable -> return empty + log.warn
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests: 4 skill retrieval + 2 tool registration + 2 degrade
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch4 S4.1-S4.2 -- SKILL pull mode + 4 SKILL definitions
