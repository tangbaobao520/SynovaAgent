#!/usr/bin/env python3
"""Write the industry lifecycle literature survey."""
import os

OUT = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\industry-lifecycle-survey-20260624.md"

content = """# Industry Lifecycle Theory, Techno-Economic Paradigms & Structural Opportunity Windows — Literature Survey

> Compiled: 2026-06-24 | For: SynovaAgent Diagnosis Framework
> Purpose: Ground the Synova diagnosis engine's "structural window" and "growth ceiling" measurement in the foundational academic literature.

---

## Paper 1: Gort & Klepper (1982) — Time Paths in the Diffusion of Product Innovations

**Full citation:** Gort, M., & Klepper, S. (1982). Time Paths in the Diffusion of Product Innovations. *The Economic Journal*, 92(367), 630-653.

**Core argument.** This is the paper that first empirically established the industry lifecycle as a systematic, measurable phenomenon — not just a metaphor. Gort and Klepper studied 46 major product innovations (from phonographs to semiconductors to penicillin) using a new dataset of producer counts over time. They found a robust, repeating pattern: the number of producers rises sharply after a major innovation, peaks, then declines sharply, eventually stabilizing at a much lower level. This "shakeout" pattern — net entry giving way to net exit — was not predicted by standard microeconomic theory of the time, which assumed equilibrium. They proposed that the pattern is driven by the changing nature of knowledge: early on, knowledge is external to firms (new entrants bring it in), but as the product standardizes, the key knowledge becomes internal to incumbent firms (process R&D, production experience), creating barriers that drive exit.

**Key framework — Five-Stage Lifecycle:**
```
Stage 1 (Introduction):     Few producers, low output, high product innovation
Stage 2 (Growth):           Rapid net entry, many producers, product variety explodes
Stage 3 (Shakeout):         Net exit begins, number of producers falls sharply
Stage 4 (Maturity):         Slow net exit, stabilizing producer count
Stage 5 (Decline):          Further exit or replacement by new innovation
```

**Key measurable variables they used:**
- Number of producers over time (the primary metric)
- Rate of net entry / net exit per year
- Product innovation count (patents classified by type)
- Output volume growth rate

**Measurement applicability for Synova:** Directly applicable. The producer-count trajectory is observable market data. For a Synova client enterprise, you can locate their industry on this curve by measuring: (a) number of competitors over past 5 years, (b) whether the count is still rising, peaking, or falling, (c) rate of new firm formation in their NAICS/industry code. This gives a structural diagnosis: "You are in late Stage 2 approaching shakeout — consolidation is coming, and your strategic options are different from someone in Stage 1."

---
"""

# Write first section to verify it works
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Written {len(content)} chars to {OUT}")
