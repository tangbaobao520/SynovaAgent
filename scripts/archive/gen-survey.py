import os

OUT = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\industry-lifecycle-survey-20260624.md"

content = r"""
# Industry Lifecycle Theory, Techno-Economic Paradigms & Structural Opportunity Windows
## Literature Survey for SynovaAgent Diagnosis Framework

> Compiled: 2026-06-24 | 14 papers | Grounding for the diagnosis engine measurement layer
> Core question: Where is this enterprise in its structural lifecycle, and what does that mean for growth?

---

## Paper 1: Gort & Klepper (1982) — Time Paths in the Diffusion of Product Innovations

**Full citation:** Gort, M., & Klepper, S. (1982). Time Paths in the Diffusion of Product Innovations. *The Economic Journal*, 92(367), 630-653.

**Core argument.** This is the paper that first empirically established the industry lifecycle as a systematic, measurable phenomenon. Gort and Klepper studied 46 major product innovations (from phonographs to semiconductors to penicillin) using a new dataset of producer counts over time. They found a robust, repeating pattern: the number of producers rises sharply after a major innovation, peaks, then declines sharply, eventually stabilizing at a much lower level. This "shakeout" pattern was not predicted by standard microeconomic theory. Their explanation: early on, knowledge is external to firms (new entrants bring it in), but as the product standardizes, key knowledge becomes internal to incumbent firms (process R&D, production experience), creating barriers that drive exit.

**Five-Stage Lifecycle:**
- Stage 1 (Introduction): Few producers, low output, high product innovation
- Stage 2 (Growth): Rapid net entry, many producers, product variety explodes
- Stage 3 (Shakeout): Net exit begins, number of producers falls sharply
- Stage 4 (Maturity): Slow net exit, stabilizing producer count
- Stage 5 (Decline): Further exit or replacement by new innovation

**Measurable variables:** Number of producers over time (primary metric), rate of net entry/exit per year, product innovation count, output volume growth rate.

**Synova applicability:** Direct. Measure competitor count trajectory over 5 years, new firm formation rate in the NAICS code. Output: "You are in late Stage 2 — consolidation is coming."

---

## Paper 2: Klepper (1996) — Entry, Exit, Growth, and Innovation over the Product Life Cycle

**Full citation:** Klepper, S. (1996). Entry, Exit, Growth, and Innovation over the Product Life Cycle. *The American Economic Review*, 86(3), 562-583.

**Core argument.** Klepper's solo 1996 paper provides the theoretical microfoundation for *why* the 1982 empirical pattern occurs. He builds a formal model where firms differ in stochastic R&D productivity ("innovative capabilities"). Early on, when product innovation dominates, any firm can enter with a new variant — hence the entry wave. Over time, firms successful at product innovation grow larger. These larger firms find it more profitable to invest in *process* R&D because returns scale with output. This creates a feedback loop: successful innovators grow, invest in process R&D, lower costs, drive out smaller firms, industry concentrates. The shakeout timing is predictable: it happens when process R&D returns overtake product R&D returns for the largest firms.

**Three core equations:**
1. Cost function: c_i(t) = c_bar - lambda * r_i(t), where r_i(t) is cumulative process R&D spending
2. Innovation success probability: P(innovation | R&D spending s) = s * g(r_i), where g(r_i) is firm-specific and persistent
3. Entry condition: enter if expected discounted profits > entry cost, which becomes harder as incumbents accumulate process R&D advantages

**Measurable predictions:** (a) Firm count follows inverted-U shape, (b) peak occurs earlier in high-process-R&D industries, (c) exiting firms during shakeout are the smallest ones, (d) surviving firms have higher process R&D intensity pre-shakeout.

**Synova applicability:** Build a "shakeout risk index" by measuring: industry R&D composition (product vs. process patent ratio), firm size distribution (skewing toward large firms?), whether largest firms are increasing process R&D. These predict consolidation pressure.

---

## Paper 3: Carlota Perez (2002) — Technological Revolutions and Financial Capital

**Full citation:** Perez, C. (2002). *Technological Revolutions and Financial Capital: The Dynamics of Bubbles and Golden Ages*. Edward Elgar Publishing.

**Core argument.** Perez's magnum opus argues that technological change occurs in 50-60 year "great surges of development" (Kondratiev waves), each driven by a cluster of interrelated technologies forming a "techno-economic paradigm." Each surge follows the sequence: Irruption, Frenzy, Turning Point (crash), Synergy, Maturity. The key insight: *financial capital and production capital decouple and recouple* through each surge. In the Frenzy phase, financial capital runs ahead of the real economy (speculation, bubbles, infrastructure overbuilding). The crash forces institutional re-regulation. Then comes the "Golden Age" (Synergy) when the paradigm is fully deployed across the whole economy. Critically, at any point the economy experiences *overlapping* surges at different phases — the ICT surge is in Synergy/Maturity while the AI/green surge is in Irruption.

**The Great Surge Sequence:**
- Irruption (Big Bang): New technology cluster emerges, venture capital floods in
- Frenzy (Bubble): Financial capital decouples from production, speculation, infrastructure mania
- Turning Point (Crash): Bubble bursts, institutional re-regulation forced
- Synergy (Golden Age): Production capital catches up, paradigm deployed economy-wide, broad growth
- Maturity (Decline): Paradigm exhausted, diminishing returns, search for the next big thing

**Five historical paradigms identified:**
1. 1771 — Industrial Revolution (machines, factories, canals)
2. 1829 — Age of Steam and Railways
3. 1875 — Age of Steel, Electricity, Heavy Engineering
4. 1908 — Age of Oil, Automobile, Mass Production
5. 1971 — Age of Information and Telecommunications (ICT)

**Key concept — "Structural opportunity windows":** During Turning Point and early Synergy, old institutions are broken, new ones not set. Latecomer countries/firms can leapfrog because they are not burdened by legacy investment in the old paradigm. Korea's semiconductor leap is the canonical example.

**Synova applicability:** Locate an enterprise in the Perez sequence by measuring: (a) which paradigm phase its core technology is in, (b) ratio of financial capital flows to production capital deployment in its sector, (c) whether the institutional/regulatory framework is settled or in flux. A firm in Synergy has different imperatives than one in Frenzy.

---

## Paper 4: Tushman & Anderson (1986) — Technological Discontinuities and Organizational Environments

**Full citation:** Tushman, M. L., & Anderson, P. (1986). Technological Discontinuities and Organizational Environments. *Administrative Science Quarterly*, 31(3), 439-465.

**Core argument.** This paper introduced the foundational distinction between *competence-enhancing* and *competence-destroying* technological discontinuities. Studying minicomputers, cement, and airlines, they showed that breakthroughs are not all alike. A competence-enhancing discontinuity (jet engine replacing piston engines — still an airplane, still needs aeronautical engineers) reinforces existing firm capabilities; incumbents survive and thrive. A competence-destroying discontinuity (transistor replacing vacuum tubes — entirely different physics and manufacturing) renders existing capabilities obsolete; new entrants dominate. After any discontinuity, an "era of ferment" with many competing designs occurs, followed by emergence of a "dominant design" that triggers incremental, competence-enhancing innovation favoring large incumbents.

**The Technology Cycle:**
Discontinuity -> Era of Ferment (design competition, many entrants) -> Dominant Design emerges -> Era of Incremental Change (process innovation, scale, incumbents dominate) -> Next Discontinuity

**Key distinction table:**

| | Competence-Enhancing | Competence-Destroying |
|---|---|---|
| Incumbent survival rate | High | Low |
| New entrant success rate | Low | High |
| Example | Jet engine vs. piston | Transistor vs. vacuum tube |
| Required response | Invest, scale | Acquire, partner, radical restructure |

**Measurable variables:** Patent citation patterns (does new tech cite old tech's patent classes?), founder origin of new entrants (within industry vs. outside), incumbent survival rate 5 years post-discontinuity.

**Synova applicability:** Diagnose whether a client faces competence-enhancing or destroying shift by analyzing: percentage of new tech patents citing old tech patent classes; whether new entrants come from within or outside the industry. Competence-destroying shift means accumulated organizational capabilities may be a liability.

---

## Paper 5: Christensen (1997) — The Innovator's Dilemma

**Full citation:** Christensen, C. M. (1997). *The Innovator's Dilemma: When New Technologies Cause Great Firms to Fail*. Harvard Business School Press.

**Core argument.** Christensen's central puzzle: why do well-managed, customer-focused, profitable companies get destroyed by seemingly inferior technologies? His answer: because good management — listening to your best customers, pursuing higher margins, investing in sustaining innovations — systematically blinds you to *disruptive* innovations. A disruptive innovation starts in a low-end or new-market foothold unattractive to an incumbent's customers and cost structure. The incumbent rationally cedes that market and moves upmarket. But the disruptor improves along the trajectory mainstream customers value, eventually intersecting the incumbent's performance trajectory — at which point the incumbent's customers switch, and it is too late to catch up. This is not a management failure; it is a failure *created by* good management in the incumbent's value network.

**The RPV Theory (why incumbents cannot respond):**
- Resources (people, cash) are flexible — incumbents *could* allocate them
- Processes (how work gets done) are inflexible — optimized for existing business model
- Values (cost structure and margin requirements) are the deepest barrier — a 40%-margin business literally cannot prioritize a 20%-margin market

**Three tests for disruption:**
1. Is the innovation targeting non-consumers or low-end customers incumbents are happy to shed?
2. Is it improving along a trajectory that will eventually satisfy mainstream customers?
3. Can the incumbent respond? (If yes, it is sustaining, not disruptive.)

**Synova applicability:** The disruption diagnosis: (a) Is there a lower-cost, "worse" alternative emerging in the client's market? (b) What is its performance improvement rate? (c) At what date will it intersect the client's customers' performance threshold? (d) Can the client's cost structure compete at the disruptor's price point? All quantifiable.

---

## Paper 6: Solow (1956) — A Contribution to the Theory of Economic Growth

**Full citation:** Solow, R. M. (1956). A Contribution to the Theory of Economic Growth. *The Quarterly Journal of Economics*, 70(1), 65-94.

**Core argument.** Solow built the foundational neoclassical growth model. The key insight: in the long run, economic growth is driven by *technological progress*, not capital accumulation. Capital accumulation alone hits diminishing returns — each additional unit of capital produces less output. Without technological progress, the economy converges to a steady state where growth stops. The model shows: saving adds to capital, depreciation subtracts, population growth dilutes. The steady-state capital-labor ratio is where these forces balance. Sustained growth in output per worker requires sustained technological progress — capital accumulation drives only temporary growth toward the steady state.

**The Solow-Swan Equation (Cobb-Douglas production function):**
Y(t) = K(t)^alpha * (A(t) * L(t))^(1-alpha)

where Y = output, K = capital, L = labor, A = technology (labor-augmenting), alpha = capital share (~0.33)

**The fundamental dynamic equation:**
k_dot = s*f(k) - (n + delta)*k

where k = capital per effective worker (K/(AL)), s = savings rate, n = population growth, delta = depreciation. At steady state: s*f(k*) = (n+delta)*k*.

**Key result:** In steady state, output per worker grows at rate g (rate of technological progress), *regardless* of savings rate. Savings determines the *level* of output, not growth rate.

**Synova applicability:** Decompose a client firm's growth into: capital deepening (s*MPK), labor growth (n), and the residual (Total Factor Productivity growth). If residual is zero/negative, the firm is on a path to steady state — a growth ceiling. This distinguishes investment problems (fixable with capital) from productivity/innovation problems (requiring structural change).

---

## Paper 7: Solow (1957) — Technical Change and the Aggregate Production Function

**Full citation:** Solow, R. M. (1957). Technical Change and the Aggregate Production Function. *The Review of Economics and Statistics*, 39(3), 312-320.

**Core argument.** The empirical companion to the 1956 theory paper. Solow asked: how much of US economic growth (1909-1949) can be explained by capital and labor growth, and how much is left unexplained? His method — now called "growth accounting" or the "Solow residual" — was to compute output growth, subtract input growth (weighted by income shares), and attribute the remainder to "technical change." His result was startling: *87.5% of the growth in output per worker over 1909-1949 was attributable to technical change*, not capital deepening. This single finding reshaped economics — establishing productivity growth, not factor accumulation, as the engine of long-run prosperity.

**The growth accounting decomposition:**
dY/Y = dA/A + alpha*(dK/K) + (1-alpha)*(dL/L)

Rearranged to isolate technical change:
dA/A = dY/Y - alpha*(dK/K) - (1-alpha)*(dL/L)

**Empirical approach (replicable):**
1. Measure real output (Y), capital stock (K), labor hours (L) annually
2. Estimate alpha from capital income share in national accounts
3. Compute annual dA/A as the residual
4. Cumulate to get A(t) index over time

**Synova applicability:** Directly replicable at firm level. Compute a "firm-level Solow residual": measure revenue growth, subtract portion explainable by capital investment growth and headcount growth. Declining/negative residual = growing only by adding inputs, no productivity improvement. Positive residual = genuine efficiency gains. This is one of the most powerful single-number diagnostics for whether growth is healthy or input-driven.

---

## Paper 8: Abernathy & Utterback (1978) — Patterns of Industrial Innovation

**Full citation:** Abernathy, W. J., & Utterback, J. M. (1978). Patterns of Industrial Innovation. *Technology Review*, 80(7), 40-47. Extended in: Utterback, J. M., & Abernathy, W. J. (1975). A Dynamic Model of Process and Product Innovation. *Omega*, 3(6), 639-656.

**Core argument.** Abernathy and Utterback observed that the *type* of innovation shifts systematically as an industry matures. Early in a product's life, innovation is predominantly *product* innovation — firms compete on features, performance, design variety. Then a "dominant design" emerges (Model T for automobiles, DC-3 for aircraft, IBM PC for personal computers). After this, product innovation drops dramatically, and *process* innovation surges — firms compete on cost, quality, efficiency. This shift from "fluid" to "specific" phases changes everything: the R&D type that matters, the organizational structure that works best, the nature of competitive advantage, and who survives.

**The A-U Model:**

| Phase | Fluid | Transitional | Specific |
|---|---|---|---|
| Innovation | Product-dominant | Process catches up | Process-dominant |
| Competition | Functional performance | Product variety | Cost & quality |
| Organization | Organic, informal | Project teams | Hierarchical, formal |
| R&D focus | Radical product | Major process | Incremental both |
| Entry/Exit | High entry | Shakeout begins | Low entry, consolidation |

**Key measurable patterns:** Ratio of product patents to process patents (shifts from >3:1 to <1:1), number of competing product designs (converges toward 1), R&D spending composition (% product vs. % process), manufacturing cost reduction rate.

**Synova applicability:** One of the most operational frameworks. Build a sensor measuring: product-to-process patent ratio for client's NAICS code, diversity of product designs in market, whether client's R&D mix matches lifecycle stage. Common pathology: firm in Transitional still spending 80% on product R&D while competitors shifted to process R&D — cost-killed even with better product.

---

## Paper 9: Henderson & Clark (1990) — Architectural Innovation

**Full citation:** Henderson, R. M., & Clark, K. B. (1990). Architectural Innovation: The Reconfiguration of Existing Product Technologies and the Failure of Established Firms. *Administrative Science Quarterly*, 35(1), 9-30.

**Core argument.** Henderson and Clark add a crucial category missed by Tushman-Anderson and Abernathy-Utterback: *architectural* innovation. Their 2x2 matrix crosses "core concepts" (reinforced vs. overturned) with "linkages between concepts" (unchanged vs. changed), creating four types: Incremental, Modular, Architectural, and Radical. The key insight: architectural innovation is devastating to incumbents precisely because it *looks* incremental — components are familiar, so the threat is invisible, but the way components interact has changed. The incumbent's communication channels, information filters, and problem-solving strategies are optimized for the old architecture and become a trap. Canonical example: moving a small fan from the back to the front of a room air conditioner — every component is the same, but the architectural change requires rethinking thermal dynamics, noise, and the entire design process.

**The 2x2 Innovation Matrix:**

| | Core Concepts Reinforced | Core Concepts Overturned |
|---|---|---|
| Linkages Unchanged | Incremental Innovation | Modular Innovation |
| Linkages Changed | Architectural Innovation | Radical Innovation |

**Why architectural innovation kills incumbents:**
1. Communication channels embody architectural knowledge — become misinformation when architecture changes
2. Information filters screen out signals that do not match old architecture
3. Problem-solving strategies are architecture-specific and hard to unlearn
4. Threat is not recognized because components are familiar

**Synova applicability:** Detect architectural shifts via: changes in which firms file integration/system-level patents vs. component-level patents, new product architectures from unexpected entrants, client organization's response latency to design changes. Longer latency suggests architectural competence trap.

---

## Paper 10: Dosi (1982) — Technological Paradigms and Technological Trajectories

**Full citation:** Dosi, G. (1982). Technological Paradigms and Technological Trajectories: A Suggested Interpretation of the Determinants and Directions of Technical Change. *Research Policy*, 11(3), 147-162.

**Core argument.** Dosi imported Kuhn's "scientific paradigms" into technology studies. A *technological paradigm* is a "pattern of solution of selected techno-economic problems based on highly selected principles derived from natural sciences." It defines what problems are worth solving, what counts as a solution, and what improvement trajectory is "natural." Once established, innovation proceeds along a *technological trajectory* — a directed path of incremental improvement (e.g., "more transistors per chip" for semiconductors). Trajectories have strong *exclusion effects* — they make certain directions seem obvious and others invisible. This explains why firms get blindsided by paradigm shifts: the new paradigm defines problems and solutions differently, and the old trajectory does not lead there. Paradigms are shaped not just by science but by economic forces, institutions, and the "technological community."

**Key concepts:**
- Technological Paradigm: The "grammar" of a technology — what it does, how it works, what principles are relevant
- Technological Trajectory: The "normal" direction of progress — trade-offs accepted as given
- Paradigm Shift: Triggered by trajectory exhaustion, new scientific discoveries, or radical shifts in input costs

**Synova applicability:** Diagnose paradigm position: (a) Is the core performance metric on an S-curve (diminishing returns)? (b) Are new scientific papers in adjacent fields being cited in industry patents? (c) Are "maverick" firms pursuing solutions outside the accepted trajectory? Near end of trajectory demands different strategy than mid-trajectory.

---

## Paper 11: Freeman & Perez (1988) — Structural Crises of Adjustment

**Full citation:** Freeman, C., & Perez, C. (1988). Structural Crises of Adjustment: Business Cycles and Investment Behaviour. In G. Dosi, C. Freeman, R. Nelson, G. Silverberg, & L. Soete (Eds.), *Technical Change and Economic Theory* (pp. 38-66). Pinter Publishers.

**Core argument.** This paper introduced "mismatch" between techno-economic paradigm and socio-institutional framework. Major economic crises (1930s Depression, 1970s stagflation, 2008 financial crisis) are not financial accidents — they are structural adjustments. When a new techno-economic paradigm emerges, it creates mismatch: the *technological system* has changed (enabling new production forms, organization, competition), but the *socio-institutional framework* (regulation, education, labor relations, finance, corporate governance) is still optimized for the old paradigm. The crisis is the painful re-alignment process. Five dimensions of mismatch: (1) labor force skill profile, (2) firm management structure, (3) regulatory framework, (4) financial system allocation mechanisms, (5) national/international governance.

**Five dimensions of structural mismatch:**
1. New skills needed vs. education/training for old skills
2. Network/flat org structure vs. hierarchical/siloed management
3. New competition forms vs. regulation for old industry structure
4. New investment patterns vs. financial system for old sectors
5. Global/network governance vs. national/territorial governance

**Synova applicability:** Framework behind Synova's "structural window" concept. Measure mismatch across five dimensions. High mismatch = structural window where old rules break and new rules are not solidified — opportunity or threat window.

---

## Paper 12: Agarwal & Gort (1996) — The Evolution of Markets and Entry, Exit, and Survival of Firms

**Full citation:** Agarwal, R., & Gort, M. (1996). The Evolution of Markets and Entry, Exit, and Survival of Firms. *The Review of Economics and Statistics*, 78(3), 489-498.

**Core argument.** Quantitative test of the Gort-Klepper lifecycle on 33 products spanning nearly a century. Confirms the inverted-U firm count pattern in 31 of 33 products. Crucial addition: *survival rate* of new entrants varies dramatically by lifecycle stage. Early-stage entrants have significantly higher survival rates than mature-stage entrants, even controlling for firm characteristics. *When* you enter matters as much as *who* you are. Early entrants accumulate "intangible capital" (brand recognition, customer relationships, tacit production knowledge) that later entrants cannot replicate. Shakeout is not random. The survival advantage of early entrants persists for decades.

**Key findings:**
- Firm count follows inverted-U in 31/33 products
- Hazard rate (exit probability): early-stage entrants' hazard declines steeply with tenure; late-stage entrants' hazard remains persistently high
- Survival advantage of early entrants persists for decades

**Synova applicability:** For a client that is a relatively new entrant: what lifecycle stage is their industry? Are they early-stage or late-stage entrant? Based on Agarwal-Gort hazard rates, what is their 5-year survival probability? Feeds directly into a "growth risk" score.

---

## Paper 13: TAM Estimation Methodology — An Applied Synthesis

**Key references:**
- Barnett, F. W. (1988). Four Steps to Forecast Total Market Demand. *Harvard Business Review*, 66(4), 28-34.
- Cooper, R. G. (1993). *Winning at New Products: Accelerating the Process from Idea to Launch*. Addison-Wesley. (Chapter 3: Market Assessment.)
- Blank, S., & Dorf, B. (2012). *The Startup Owner's Manual*. K&S Ranch. (Market sizing methodology.)

**Three TAM estimation approaches:**

1. Top-down: TAM = (Total population of potential users) x (Average revenue per user). Starts from macro data, segments, applies penetration assumptions. Weakness: assumptions compound, typically overestimates.

2. Bottom-up (preferred): TAM = Sum of (segment_i customers x segment_i price x segment_i purchase frequency). Builds from micro units. More accurate but harder.

3. Value-theory: TAM = (Total spending on the problem the product solves) x (Percentage capturable by this solution type). Based on Slywotzky's Demand framework — measure total market spend on the job-to-be-done, not the product category.

**Key principle — TAM is a range, not a point estimate:**
- Pessimistic TAM (worst defensible case)
- Realistic TAM (best estimate)
- Optimistic TAM (best defensible case)

Range width is itself diagnostic: wide range = high uncertainty, test assumptions first.

**Synova applicability:** Essential for growth ceiling diagnosis: (a) Client's current TAM and market share? (b) TAM growing, flat, or shrinking? (c) SAM/TAM ratio? (d) At current growth rates, when will they hit the TAM ceiling? Reveals whether growth limits come from market size (TAM ceiling), access (SAM gap), or share (competitive position).

---

## Paper 14: Jovanovic (1982) — Selection and the Evolution of Industry

**Full citation:** Jovanovic, B. (1982). Selection and the Evolution of Industry. *Econometrica*, 50(3), 649-670.

**Core argument.** Jovanovic developed the "noisy selection" model — a complementary theory to the Gort-Klepper innovation-driven lifecycle. In his model, firms do not know their true cost efficiency when they enter; they learn it over time through experience. Efficient firms discover they are efficient — grow and survive. Inefficient firms discover they are inefficient — shrink and exit. The model generates the same empirical predictions (entry/exit, shakeout, concentration) but through a different mechanism: *passive learning* rather than *active innovation*. Both mechanisms operate simultaneously in real industries. This matters for diagnosis because a shakeout can happen even without technological change — it can be pure information revelation.

**Key equation — The survival decision rule:**
Firm survives if: E[theta_i | experience] > theta_threshold
where theta_i is the firm's true (but initially unknown) efficiency parameter. Each period's profit signal updates the estimate. Firms receiving negative signals over time eventually hit the exit threshold.

**Implication:** Variance of firm growth rates should decline with firm age, because older firms have more precise efficiency estimates and make fewer mistakes. Confirmed on US manufacturing data.

**Synova applicability:** Two-pillar shakeout diagnosis: (a) Innovation-driven (Klepper mechanism: process R&D by large firms)? Or (b) Selection-driven (Jovanovic mechanism: efficiency information revelation)? Measure: firm size variance over time (declining = selection), process R&D intensity at large firms (rising = innovation-driven). Different causes require different strategic responses.

---

## Integrated Diagnostic Framework for Synova

The 14 papers above can be integrated into a four-layer measurement architecture:

**LAYER 1: Where is the industry in its lifecycle?**
Sources: Gort-Klepper stages (Papers 1, 2, 12), A-U model (Paper 8)
Metrics: Producer count trajectory, product/process patent ratio, dominant design emergence

**LAYER 2: What kind of innovation pressure is the firm facing?**
Sources: Tushman-Anderson (Paper 4), Christensen (Paper 5), Henderson-Clark (Paper 9), Dosi (Paper 10)
Metrics: Patent citation patterns, entrant origin analysis, performance trajectory intersection dates, architectural change signals

**LAYER 3: What is the structural growth ceiling?**
Sources: Solow 1956/1957 (Papers 6, 7), TAM methodology (Paper 13), Jovanovic (Paper 14)
Metrics: Firm-level Solow residual, TAM/SAM headroom, capital vs. TFP growth decomposition, selection pressure indicators

**LAYER 4: What is the macro-paradigm context?**
Sources: Perez (Paper 3), Freeman-Perez (Paper 11)
Metrics: Paradigm phase location, financial/production capital ratio, institutional mismatch across 5 dimensions, structural opportunity window openness

---

## Quick-Reference Table

| # | Paper | Year | Core Contribution | Measurable? |
|---|-------|------|-------------------|-------------|
| 1 | Gort & Klepper | 1982 | Industry lifecycle stages (empirical) | Yes — producer count trajectory |
| 2 | Klepper | 1996 | Lifecycle microfoundation (theoretical) | Yes — product/process R&D ratio |
| 3 | Perez | 2002 | Techno-economic paradigms, structural windows | Yes — paradigm phase location |
| 4 | Tushman & Anderson | 1986 | Competence-enhancing vs. destroying discontinuities | Yes — patent citation patterns |
| 5 | Christensen | 1997 | Disruptive innovation, RPV theory | Yes — performance trajectory intersection |
| 6 | Solow | 1956 | Neoclassical growth model, steady state | Yes — growth accounting |
| 7 | Solow | 1957 | Growth accounting, Solow residual (87.5% TFP) | Yes — firm-level Solow residual |
| 8 | Abernathy & Utterback | 1978 | Product-process innovation shift, dominant design | Yes — product/process patent ratio |
| 9 | Henderson & Clark | 1990 | Architectural innovation, 2x2 matrix | Yes — integration vs. component patents |
| 10 | Dosi | 1982 | Technological paradigms and trajectories | Partially — S-curve, field citation analysis |
| 11 | Freeman & Perez | 1988 | Structural crises, 5-dimension mismatch | Yes — institutional mismatch index |
| 12 | Agarwal & Gort | 1996 | Entry timing and survival rates | Yes — hazard rates by entry stage |
| 13 | TAM Methodology | Various | Market headroom estimation | Yes — bottom-up TAM/SAM/penetration |
| 14 | Jovanovic | 1982 | Noisy selection model of industry evolution | Yes — firm size variance trajectory |

---

> Next steps: Operationalize the four-layer measurement architecture in Synova's measurement engine (packages/engine-core/src/pipeline/). Priority metrics for Phase 1: (1) Producer count trajectory, (2) Product/process patent ratio, (3) Firm-level Solow residual, (4) TAM/SAM headroom ratio.
""".strip()

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"Written {len(content)} chars to {OUT}")
print("Done.")
