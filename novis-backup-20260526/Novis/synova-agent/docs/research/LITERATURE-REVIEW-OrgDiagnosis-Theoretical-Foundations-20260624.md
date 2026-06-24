<!--
  SynovaAgent Literature Scout Report
  Generated: 2026-06-24
  Purpose: Academic anchors + computable indicators for 25-measurer, 7-dimension diagnosis framework
  Three Pillars: Information Theory (Org) / Transaction Cost Economics / Behavioral Economics (Business Decisions)
-->

# Organizational Diagnosis Theoretical Foundations — Literature Scout & Measurable Indicator Mapping

> Core question: Where is this organization's growth stuck? What should it do now?
> This doc provides academic anchors for SynovaAgent's automated diagnosis engine, with computable indicators per paper.

---

## Pillar 1: Information Theory Applied to Organizations

### 1. Shannon (1948) — A Mathematical Theory of Communication

- **Full citation**: Shannon, C.E. (1948). "A Mathematical Theory of Communication." *Bell System Technical Journal*, 27(3): 379-423; 27(4): 623-656.
- **Core argument**: The fundamental problem of communication is "reproducing at one point either exactly or approximately a message selected at another point." Defines information entropy H = -Sum p(x) log2 p(x) as a measure of uncertainty, channel capacity C as the upper bound of reliable transmission, and the source/channel coding theorems.
- **Why it matters for org diagnosis**: Organizations are information-processing systems. Information loss, distortion, and delay are all quantifiable through Shannon's framework.

**Measurable Indicators (directly instrumentable)**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 1.1 | **Decision Entropy (H_decision)** | H = -Sum p(i) log2 p(i), where p(i) = frequency of decision option i being discussed | Meeting notes, email, Slack message option counts | `collaboration` |
| 1.2 | **Channel Capacity Utilization** | rho = R_actual / C_channel; R_actual = actual info rate (bits/s); C_channel = max rate given reporting structure depth | Reporting chain depth, message frequency | `strategy` |
| 1.3 | **Information Redundancy** | R_redundancy = 1 - H_actual / H_max; measures duplicate communication share | Message topic clustering, cross-channel duplicate detection | `data-quality` |
| 1.4 | **Organizational SNR** | SNR = I(T;R) / H(T), where T = transmitted intent, R = received understanding; measured via post-hoc alignment surveys | Project retrospectives: "I thought..." statement frequency | `collaboration` |
| 1.5 | **Coding Efficiency** | eta = H(source) / L_avg; L_avg = average message length (token count) | Internal doc token count vs. decision count ratio | `capability` |

**Diagnostic formula**:
```
Information Bottleneck Index = (H_total - I_through) / H_total
Where H_total = -Sum p(task_i) * log2 p(task_i)     (task distribution entropy)
I_through = Sum I(role_j; task_i)                    (role-task mutual information)
When Bottleneck Index > 0.6 => severe info asymmetry => trigger "info-bottleneck" alert
```

---

### 2. Arrow (1974) — The Limits of Organization

- **Full citation**: Arrow, K.J. (1974). *The Limits of Organization*. New York: W.W. Norton & Company.
- **Core argument**: Organizations exist because markets can't handle uncertainty. But organizations themselves have information-processing limits. Arrow identifies two core constraints: (1) **unreliability of information channels** — information inevitably decays when transmitted through hierarchies; (2) **authority-information tension** — those with information lack decision rights, those with decision rights lack information. Optimal org size = balance of information costs vs. coordination costs.
- **Key concept**: "Serial unreliability of information transmission." If each layer transmits with fidelity p, then after n layers fidelity = p^n.

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 2.1 | **Layer Decay Coefficient** | alpha_layer = p^n, where p = per-layer info fidelity (estimated from instruction trace accuracy), n = hierarchy depth | Org chart reporting chain depth | `strategy` |
| 2.2 | **Decision-Right / Information Distance** | D_di = |rank(decision_role) - rank(info_holder)| / max_depth | Decision logs + information source tracing | `strategy` |
| 2.3 | **Arrow Info-Cost Ratio** | C_info / C_coordination; C_info = internal communication time cost; C_coordination = alignment cost | Calendar analysis (meeting hours vs. focus time) | `strategy` |
| 2.4 | **Serial Unreliability Index** | S_unreliable = 1 - Product(i=1..n) accuracy_i; accuracy_i = instruction transmission accuracy per layer | Requirement-to-delivery deviation measurement | `risk` |

**Diagnostic formula**:
```
Arrow Organization Limit Index = min(1, C_info / B_org)
Where C_info = layer_count * avg_info_processing_hours
B_org = total org information processing budget (person-hours)
When Arrow Index > 0.7 => org approaching info-processing ceiling => recommend flattening or decentralization
```

---

### 3. Galbraith (1974) — Organization Design: An Information Processing View

- **Full citation**: Galbraith, J.R. (1974). "Organization Design: An Information Processing View." *Interfaces*, 4(3): 28-36. Also: Galbraith, J.R. (1977). *Organization Design*. Reading, MA: Addison-Wesley.
- **Core argument**: The core task of organization design is **matching information processing requirements to information processing capacity**. Higher uncertainty => higher processing needs. Galbraith proposes seven strategies (simple to complex) for handling overload: (1) Rules & Programs, (2) Hierarchical Referral, (3) Goal Setting, (4) Vertical Info Systems, (5) Lateral Relations, (6) Slack Resources, (7) Self-contained Tasks.

**Measurable Indicators (Galbraith 7-Level Maturity Model)**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 3.1 | **Information Processing Requirement (IPR)** | IPR = Sum(exception_count_i * complexity_i) / time_period | Ticketing system: non-standard requests, exception approvals | `strategy` |
| 3.2 | **Information Processing Capacity (IPC)** | IPC = Sum(role_j exception-handling bandwidth) / time_period | Role definitions: decision authority + actual handling records | `capability` |
| 3.3 | **Galbraith IPR/IPC Match** | G_match = IPC / IPR; >1.0 = excess capacity; <0.5 = overload | (same as above) | `strategy` |
| 3.4 | **Slack Resource Ratio** | Slack% = buffer_budget / total_operating_budget | Financial buffers, staffing redundancy, inventory safety stock | `risk` |
| 3.5 | **Lateral Coordination Density** | Lateral_density = cross_dept_projects / total_projects | Project staffing matrix | `collaboration` |
| 3.6 | **Exception Rate** | Exception% = nonstandard_requests / total_requests | Ticketing/approval system exception tags | `evolution` |

**Diagnostic formula**:
```
Galbraith Overload Alert = (IPR - IPC) / IPC
Normal: < 0.2 (capacity slightly exceeds demand)
Warning: 0.2-0.5 (sustained overload => increase lateral coordination or IS investment)
Critical: > 0.5 (severe overload => consider self-contained task restructuring or slack increase)
```

---

## Pillar 2: Transaction Cost Economics

### 4. Coase (1937) — The Nature of the Firm

- **Full citation**: Coase, R.H. (1937). "The Nature of the Firm." *Economica*, 4(16): 386-405.
- **Core argument**: Firms exist because **using the price mechanism (market) has costs**. These include: discovering relevant prices, negotiating and concluding contracts. Firms internalize transactions to save these costs. The firm's boundary is where **marginal transaction cost = marginal organization cost**. Internal organization costs (diminishing returns to management) rise with scale. **1991 Nobel Prize.**

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 4.1 | **Internalization vs. Market Ratio** | R_im = C_internal / C_market; C_internal = production + management cost; C_market = external price + search + contracting cost | Procurement / outsourcing decision records | `strategy` |
| 4.2 | **Search Cost Index** | S_cost = avg_supplier_screening_hours * hourly_labor_cost * screening_rounds / contract_value | Procurement process data | `risk` |
| 4.3 | **Coase Boundary Signal** | When R_im > 1.0 persists 2+ quarters => signal: "firm exceeds optimal boundary" | Make-vs-buy analyses | `evolution` |
| 4.4 | **Managerial Diminishing Returns Rate** | dMR/dN = delta(management_efficiency) / delta(team_size); alert when dMR/dN < 0 | Output-per-person vs. team-size curve | `capability` |

**Diagnostic formula**:
```
Coase Boundary Health = 1 - |C_internal_per_unit - C_market_per_unit| / max(C_internal_per_unit, C_market_per_unit)
Range [0,1]; approaching 0 => make-vs-buy costs severely misaligned => recommend boundary adjustment
```

---

### 5. Williamson (1975, 1985) — Markets and Hierarchies / Economic Institutions of Capitalism

- **Full citation**:
  - Williamson, O.E. (1975). *Markets and Hierarchies: Analysis and Antitrust Implications*. New York: Free Press.
  - Williamson, O.E. (1985). *The Economic Institutions of Capitalism: Firms, Markets, Relational Contracting*. New York: Free Press.
- **Core argument**: Building on Coase, Williamson uses three dimensions to explain why some transactions are internalized:
  1. **Asset Specificity** — investments specialized to a transaction have low value outside it. Higher specificity => more internalization.
  2. **Uncertainty** — more environmental uncertainty => contracts more incomplete => more hierarchy.
  3. **Frequency** — frequent transactions amortize governance cost => more internalization.
  **Discriminating Alignment Hypothesis**: transactions should be matched to governance structures (market / hybrid / hierarchy) based on their attributes.

**Measurable Indicators (Williamson 3-Dimensional)**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 5.1 | **Asset Specificity Index (ASI)** | ASI = Sum(specialized_investment_i - next_best_use_value_i) / Sum(specialized_investment_i); range [0,1] | Fixed asset registry + use-case analysis | `risk` |
| 5.2 | **Environmental Uncertainty Index (EUI)** | EUI = sigma_demand / mu_demand + sigma_supply / mu_supply (coefficient of variation) | Sales and procurement volatility data | `risk` |
| 5.3 | **Transaction Frequency Index (TFI)** | TFI = similar_transaction_count / time_period | Contract / order records | `strategy` |
| 5.4 | **Governance Structure Match (Williamson)** | W_match = actual_governance == predicted_optimal_governance match rate | Governance structure audit for key transactions | `compliance` |
| 5.5 | **Contract Incompleteness Index** | CI = uncovered_dispute_scenarios / total_dispute_scenarios | Contract review + legal dispute records | `risk` |

**Diagnostic formula**:
```
Williamson Governance Match = Sum(isOptimal(tx_i)) / N_transactions
Where isOptimal(tx) =
  ASI > 0.6 AND EUI > 0.5 => predicts: hierarchy => check if internalized
  ASI < 0.3 AND EUI < 0.3 => predicts: market => check if outsourced
  Otherwise => predicts: hybrid (joint venture / long-term contract)
When Governance Match < 0.6 => trigger "governance structure mismatch" alert
```

---

### 6. Grossman & Hart (1986) — The Costs and Benefits of Ownership

- **Full citation**: Grossman, S.J. & Hart, O.D. (1986). "The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration." *Journal of Political Economy*, 94(4): 691-719.
- **Core argument**: Firm boundaries are determined by the allocation of **residual control rights** — the right to decide on matters not specified in the contract. Ownership = residual control rights. When one party's ex-ante investment matters more for total surplus, that party should own the asset (integration should go to the party with the more important investment). Core insight: **ownership allocation affects investment incentives** — the owner has stronger incentives but the non-owner's incentives are weakened. **2016 Nobel Prize (Hart).**

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 6.1 | **Residual Control Concentration** | RCC = key_decisions_concentrated_in_top_3_roles / total_key_decisions | Delegation matrix (RACI), approval workflow logs | `strategy` |
| 6.2 | **Investment Incentive Asymmetry** | IIA = |I_owner - I_nonowner| / (I_owner + I_nonowner); I = each party's investment growth rate in the relationship | Department budget allocation, staffing changes | `risk` |
| 6.3 | **Ownership-Investment Alignment** | GHM_match = correlation(ownership_share, specific_investment_ratio); high correlation = good match | Equity structure + departmental capex | `strategy` |
| 6.4 | **Incomplete Contract Exposure** | contractually_uncovered_critical_scenarios / total_critical_scenarios | Legal review + business continuity plans | `compliance` |

**Diagnostic formula**:
```
GHM Incentive Alignment = Sum w_i * (ownership_i * specificity_i) / Sum w_i
Where ownership_i = dept i decision autonomy score; specificity_i = dept i asset specificity
When Alignment < 0.5 => signal: "residual control rights distorted — high-specificity investors lack decision rights"
```

---

## Pillar 3: Behavioral Economics in Business Decision-Making

### 7. Kahneman & Tversky (1979) — Prospect Theory: An Analysis of Decision under Risk

- **Full citation**: Kahneman, D. & Tversky, A. (1979). "Prospect Theory: An Analysis of Decision under Risk." *Econometrica*, 47(2): 263-291.
- **Core argument**: People systematically deviate from expected utility theory when making decisions under risk. Three core insights:
  1. **Reference Dependence** — outcomes are coded as gains/losses relative to a reference point, not absolute wealth.
  2. **Loss Aversion** — losses hurt ~2.25x more than equivalent gains feel good (lambda approx. 2.25).
  3. **Probability Weighting** — small probabilities are overweighted, medium-high probabilities are underweighted.
  - **Value function**: v(x) = x^alpha (for x >= 0), v(x) = -lambda * (-x)^beta (for x < 0), where alpha ~ beta ~ 0.88, lambda ~ 2.25.
  - **Foundational paper of behavioral economics. 2002 Nobel Prize.**

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 7.1 | **Organizational Loss Aversion Coefficient (lambda_org)** | lambda_org = org reaction intensity to negative events / reaction intensity to equivalent positive events; measured via speed of "stop-loss" vs. "take-profit" in decision logs | Decision logs, project termination/continuation records | `strategy` |
| 7.2 | **Sunk Cost Trap Index** | continued_investment_in_failing_projects / new_project_investment ratio | Project budget allocation + project success rates | `risk` |
| 7.3 | **Reference Point Shift Detection** | Compare org risk appetite in "above last year" vs. "below last year" contexts | Budget adjustment patterns, investment decision records | `strategy` |
| 7.4 | **Probability Weighting Bias** | w(p)_observed - p (implied probability weight from org behavior vs. objective probability) | Risk assessment docs vs. actual outcome statistics | `risk` |
| 7.5 | **Status Quo Bias Index** | status_quo_preserving_decisions / (preserving + changing) total decisions, compared to baseline | Strategic decision meeting records | `evolution` |

**Diagnostic formula**:
```
Prospect Theory Org Bias Index = 0.4 * (lambda_org - 2.25)/2.25 + 0.3 * sunk_cost_bias + 0.3 * status_quo_bias
Normal: < 0.3 (normal human bias range)
Warning: 0.3-0.6 (organizational decision biases)
Critical: > 0.6 (systematic irrationality => decision process intervention needed)
```

---

### 8. Thaler (1980) — Toward a Positive Theory of Consumer Choice

- **Full citation**: Thaler, R. (1980). "Toward a Positive Theory of Consumer Choice." *Journal of Economic Behavior & Organization*, 1(1): 39-60.
- **Core argument**: Introduces the precursor to **Mental Accounting** theory. People do not globally optimize as standard economics assumes; they use a set of mental accounts to organize, evaluate, and track financial activities. Key concepts:
  1. **Transaction Utility** — beyond acquisition utility, people derive utility from whether "the deal itself is good."
  2. **Sunk Cost Effect** — already-incurred costs influence subsequent consumption decisions (standard economics says they shouldn't).
  3. **Opportunity Cost Underweighting** — people systematically ignore opportunity costs, focusing on out-of-pocket (explicit) expenses.
  - **2017 Nobel Prize.**

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 8.1 | **Mental Account Fragmentation** | MA_frag = independent_budget_pools / optimal_global_pools; high = excessive fragmentation | Budget structure analysis | `strategy` |
| 8.2 | **Sunk Cost Continuation Ratio** | SC_ratio = projects_with_sunk_cost_above_expected_return_yet_continuing / total_active_projects | Project ROI analysis + project status logs | `risk` |
| 8.3 | **Explicit Cost Bias** | opportunity_cost_considered_in_decisions / explicit_cost_considered (typically << 1) | Procurement decision docs: cost-type mention frequency | `strategy` |
| 8.4 | **Transaction Utility-Driven Ratio** | unplanned_purchases_driven_by_deal/promotion / total_purchases | Procurement records + budget deviation analysis | `risk` |
| 8.5 | **Endowment Effect Coefficient** | WTA (willingness to accept sell price) / WTP (willingness to pay buy price); typically > 2.0 | Asset disposal vs. acquisition price anchoring | `strategy` |

**Diagnostic formula**:
```
Thaler Psychological Bias Index = 0.35 * SC_ratio + 0.25 * MA_frag + 0.25 * transaction_utility_driven + 0.15 * endowment_effect
Warning: > 0.5 (behavioral biases significantly affecting resource allocation)
```

---

### 9. Uotila et al. (2009) — Exploration, Exploitation, and Financial Performance

- **Full citation**: Uotila, J., Maula, M., Keil, T., & Zahra, S.A. (2009). "Exploration, Exploitation, and Financial Performance: Analysis of S&P 500 Corporations." *Strategic Management Journal*, 30(2): 221-231.
- **Core argument**: While March (1991) established the exploration-exploitation tension as central to organization theory, Uotila et al. were the first to provide an **operationalizable quantification method**. They used Computer-Aided Text Analysis (CATA) on 20 years of S&P 500 annual reports, counting keywords to measure the relative balance of exploration vs. exploitation. Key finding: the **relative balance** (not absolute level) of exploration-exploitation has an **inverted U-shaped relationship** with financial performance. The optimal balance point varies by industry environment.

**Measurable Indicators (directly instrumentable)**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 9.1 | **Uotila E/E Relative Balance** | Balance = |exploration_keyword_freq - exploitation_keyword_freq| / (exploration + exploitation); range [0,1]; 0 = perfect balance | Internal communication text (email/Slack/docs) keyword counting | `evolution` |
| 9.2 | **Exploration Keyword Frequency** | exploration% = count(discover, experiment, research, innovate, new, novel, risk, variation, flexible, play, search) / total_words | NLP text analysis | `evolution` |
| 9.3 | **Exploitation Keyword Frequency** | exploitation% = count(refine, efficient, implement, execute, standardize, optimize, control, discipline, routine, improve, production) / total_words | NLP text analysis | `evolution` |
| 9.4 | **E/E Balance-Performance Correlation** | Compute correlation(E/E Balance, revenue_growth_rate / profit_margin) historically | Financial data + text analysis (quarterly / annually) | `evolution` |
| 9.5 | **Industry Optimal Balance Deviation** | |current_balance - industry_leader_balance| | Industry benchmark data | `strategy` |

**Diagnostic formula**:
```
Uotila E/E Balance Index = 1 - |exploration% - exploitation%| / (exploration% + exploitation%)
Optimal: 0.45-0.65 (moderate exploitation bias — most industries)
Under-exploring: < 0.3 (excessive exploitation — short-term optimized but innovation-starved)
Under-exploiting: > 0.8 (excessive exploration — idea-rich but execution-weak)
```

---

### 10. Kahneman, Lovallo & Sibony (2011) — Before You Make That Big Decision...

- **Full citation**: Kahneman, D., Lovallo, D., & Sibony, O. (2011). "Before You Make That Big Decision..." *Harvard Business Review*, 89(6): 50-60.
- **Core argument**: Identifies **systematic cognitive biases** in business decisions and proposes concrete debiasing methods. Six core biases:
  1. **Inside View** — forecasting based on project-specific features, ignoring base rates from similar projects
  2. **Planning Fallacy** — systematically underestimating time/cost and overestimating benefits
  3. **Overoptimism** — believing one will do better even when seeing historical data
  4. **Confirmation Bias** — seeking evidence that supports pre-existing conclusions
  5. **Anchoring** — over-relying on initially acquired information
  6. **Groupthink** — suppressing dissent to maintain harmony
  **Antidote: Outside View / Reference Class Forecasting** — first look at actual outcome distributions of similar projects, then position the current project within that distribution.

**Measurable Indicators**:

| # | Indicator | Formula / Algorithm | Data Source | Sentinel Category |
|---|-----------|---------------------|-------------|-------------------|
| 10.1 | **Planning Bias Index (PBI)** | PBI = (Sum actual_duration_i - Sum estimated_duration_i) / Sum estimated_duration_i; positive = systematic underestimation | Project management tools (Jira/Asana) | `risk` |
| 10.2 | **Benefit Overestimation Index** | ROI_overestimate = (estimated_ROI - actual_ROI) / estimated_ROI; aggregated by project category | Project post-mortem data | `risk` |
| 10.3 | **Outside View Adoption Rate** | outside_view% = decisions_with_base_rate_or_reference_class_data / total_decisions | Proposal / business case document audit | `strategy` |
| 10.4 | **Confirmation Bias Signal Strength** | CB_strength = pro_conclusion_evidence_citations / (pro + con) total evidence citations; >0.7 indicates confirmation bias | Decision memo: pro/con evidence counts | `strategy` |
| 10.5 | **Groupthink Index** | GT_index = dissent_expressions_in_meetings / total_utterances; abnormally low (<0.05) indicates suppression | Meeting transcripts: dissent detection | `collaboration` |
| 10.6 | **Anchoring Bias Detection** | Is first-round_estimate_vs_actual deviation significantly larger than subsequent adjustments? | Multi-round budget/schedule iteration records | `risk` |

**Diagnostic formula**:
```
KLS Decision Quality Index = 1 - (0.3 * PBI_normalized + 0.25 * ROI_overestimate_normalized + 0.2 * CB_strength + 0.15 * (1 - outside_view%) + 0.1 * GT_index_risk)
Excellent: > 0.8 (biases under control)
Fair: 0.5-0.8 (identifiable biases present)
Poor: < 0.5 (systemic issues => recommend external review / red team)
```

---

## Integrated Diagnostic Framework: Three Pillars -> 7 Dimensions Mapping

### Information Theory Pillar -> Diagnosis Dimensions

| Theory | Maps to Dimension | Key Indicators |
|--------|-------------------|----------------|
| Shannon Information Theory | D3 Info Flow, D5 Communication Efficiency | H_decision, SNR_org, Info Bottleneck Index |
| Arrow Org Limits | D1 Strategy Architecture, D4 People Structure | Layer Decay Coefficient, Decision-Right/Info Distance |
| Galbraith Info Processing | D2 Org Capability, D6 Process Maturity | IPR/IPC Match, Lateral Coordination Density |

### Transaction Cost Economics Pillar -> Diagnosis Dimensions

| Theory | Maps to Dimension | Key Indicators |
|--------|-------------------|----------------|
| Coase Firm Boundary | D1 Strategy Architecture, D7 Financial Health | R_im Internalization Ratio, Managerial Diminishing Returns |
| Williamson Governance | D1 Strategy Architecture, D6 Process Maturity | Asset Specificity Index, Governance Structure Match |
| Grossman-Hart Property Rights | D1 Strategy Architecture, D4 People Structure | Residual Control Concentration, Investment Incentive Asymmetry |

### Behavioral Economics Pillar -> Diagnosis Dimensions

| Theory | Maps to Dimension | Key Indicators |
|--------|-------------------|----------------|
| Prospect Theory | D1 Strategy Architecture, D7 Financial Health | lambda_org, Sunk Cost Trap, Probability Weighting Bias |
| Thaler Mental Accounting | D7 Financial Health, D1 Strategy Architecture | SC_ratio, Mental Account Fragmentation, Endowment Effect |
| Uotila E/E Balance | D2 Org Capability, D6 Process Maturity | E/E Balance, Exploration/Exploitation Keyword Frequency |
| KLS Decision Biases | D1 Strategy Architecture, D3 Info Flow | Planning Bias, Confirmation Bias, Outside View Adoption Rate |

---

## Implementation Roadmap: New Sentinel Adapter Priority

Based on existing SynovaAgent measurer coverage and instrumentability of the academic literature:

**P0 — Build Immediately (data available, algorithm clear)**:
1. `sentinel-info-entropy` — Shannon entropy + SNR_org
2. `sentinel-ee-balance` — Uotila E/E Balance (NLP keyword counting)
3. `sentinel-planning-bias` — KLS Planning Bias Index (Jira/PM data)

**P1 — Needs partial data supplementation**:
4. `sentinel-layer-decay` — Arrow Layer Decay Coefficient
5. `sentinel-governance-match` — Williamson Governance Structure Match
6. `sentinel-decision-quality` — KLS Decision Quality Index (confirmation bias + outside view)

**P2 — Needs comprehensive data or LLM assistance**:
7. `sentinel-asset-specificity` — Asset Specificity Index
8. `sentinel-loss-aversion` — Prospect Theory Org Bias
9. `sentinel-mental-accounting` — Thaler Mental Accounting Bias
10. `sentinel-residual-control` — GHM Residual Control Alignment

---

## References (Complete List)

1. Shannon, C.E. (1948). "A Mathematical Theory of Communication." *Bell System Technical Journal*, 27(3): 379-423; 27(4): 623-656.
2. Arrow, K.J. (1974). *The Limits of Organization*. New York: W.W. Norton & Company.
3. Galbraith, J.R. (1974). "Organization Design: An Information Processing View." *Interfaces*, 4(3): 28-36.
4. Coase, R.H. (1937). "The Nature of the Firm." *Economica*, 4(16): 386-405.
5. Williamson, O.E. (1975). *Markets and Hierarchies: Analysis and Antitrust Implications*. New York: Free Press.
6. Williamson, O.E. (1985). *The Economic Institutions of Capitalism: Firms, Markets, Relational Contracting*. New York: Free Press.
7. Grossman, S.J. & Hart, O.D. (1986). "The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration." *Journal of Political Economy*, 94(4): 691-719.
8. Kahneman, D. & Tversky, A. (1979). "Prospect Theory: An Analysis of Decision under Risk." *Econometrica*, 47(2): 263-291.
9. Thaler, R. (1980). "Toward a Positive Theory of Consumer Choice." *Journal of Economic Behavior & Organization*, 1(1): 39-60.
10. Uotila, J., Maula, M., Keil, T., & Zahra, S.A. (2009). "Exploration, Exploitation, and Financial Performance: Analysis of S&P 500 Corporations." *Strategic Management Journal*, 30(2): 221-231.
11. Kahneman, D., Lovallo, D., & Sibony, O. (2011). "Before You Make That Big Decision..." *Harvard Business Review*, 89(6): 50-60.

### Supplementary Reading (Upstream / Downstream)

- March, J.G. (1991). "Exploration and Exploitation in Organizational Learning." *Organization Science*, 2(1): 71-87. — Precursor theory for Uotila.
- Hart, O. & Moore, J. (1990). "Property Rights and the Nature of the Firm." *Journal of Political Economy*, 98(6): 1119-1158. — GHM model extension.
- Tversky, A. & Kahneman, D. (1974). "Judgment under Uncertainty: Heuristics and Biases." *Science*, 185(4157): 1124-1131. — Cognitive foundations of prospect theory.
- Kahneman, D. & Tversky, A. (1984). "Choices, Values, and Frames." *American Psychologist*, 39(4): 341-350. — Framing effects.
- Simon, H.A. (1947). *Administrative Behavior*. New York: Macmillan. — Bounded Rationality, the premise for all behavioral economics and information-processing theory.
- Daft, R.L. & Lengel, R.H. (1986). "Organizational Information Requirements, Media Richness and Structural Design." *Management Science*, 32(5): 554-571. — Information richness theory, natural extension of Galbraith.

---

*Literature scout complete. Next step: implement the 3 P0-priority Sentinel adapters.*
