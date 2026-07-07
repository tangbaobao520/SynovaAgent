import os

PATH = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\RESEARCH-FirstPrincipleCost-NonConsensusTaxonomy-20260704.html"
with open(PATH, "r", encoding="utf-8") as f:
    contents = f.read()

marker = chr(10) + "</body>"
idx = contents.index(marker)
prefix = contents[:idx]
suffix = contents[idx:]

body = """

<!-- ============================================================ -->
<!-- SECTION 7: Appendix -- LLM Determination Prompt Templates -->
<!-- ============================================================ -->
<h2 id="sec-appendix">Section 7: Appendix -- Comprehensive LLM Determination Prompt Templates</h2>

<h3>7.1 Master Router Prompt (Orchestrates Type I/II/III classification)</h3>

<div class="prompt">
SYSTEM: You are the SynovaAgent Non-Consensus Signal Classifier (Beta). Your job is to classify a business direction into exactly ONE of four categories based on observable structural evidence. You must provide quantitative justification, not opinion.

DIRECTION TO ANALYZE:
Company: {company_name}
Industry: {industry}
Year of Assessment: {year}
Description: {direction_description}
Incumbent Reference: {incumbent_name}
Available Historical Data: {has_historical_data} ({years_of_data} years)

--- CLASSIFICATION PROTOCOL ---

STEP 1: COST FRACTURE CHECK (Type I)
Apply the Cost Fracture checklist:
[ ] Identify incumbent's top 5 cost categories by % of revenue
[ ] For each, determine if entrant ELIMINATES (not reduces) the category
[ ] Verify: would incumbent's revenue model be DESTROYED if they adopted this?
[ ] Verify: is the elimination rooted in physical/informational law exploit (not wage/regulatory arbitrage)?
If >= 1 category passes ALL three checks -> Type I (Cost Fracture). Output CFI for that category.

STEP 2: BUSINESS MODEL REWRITE CHECK (Type II)
Apply the Business Model Rewrite checklist:
[ ] Does the PAYING entity differ from the primary value recipient? (who pays vs. who benefits)
[ ] Does the VALUE UNIT differ fundamentally from the incumbent? (per-use vs. license, outcome vs. input, etc.)
[ ] Is there at least one revenue stream UNRELATED to direct product payment? (data, float, marketplace, etc.)
If >= 2 of the above are true -> Type II (Business Model Rewrite). Output the number of Business Model Canvas blocks that differ.

STEP 3: ASSET MISPRICING CHECK (Type III)
Apply the Asset Mispricing checklist:
[ ] Does the incumbent classify a specific asset as: waste / byproduct / cost center / below-threshold / liability?
[ ] Is the entrant's value proposition DEPENDENT on this asset being abundant/cheap? (>50% dependency?)
[ ] Would the incumbent need to ABANDON their classification framework to see this value? (framework incompatibility)
If ALL three are true -> Type III (Asset Mispricing). Output the INVERSION_RATIO.

STEP 4: DISCRIMINATION (If multiple types match)
Priority: Type I > Type II > Type III (rationale: cost fractures are the strongest non-consensus signal, least likely to be false positives)
Output the PRIMARY classification + list any SECONDARY signals detected.

STEP 5: FIRST-PRINCIPLES CFI COMPUTATION
If Type I detected OR if {has_historical_data} is FALSE:
- Identify the industry cost template: {industry_template}
- Look up physical constraints: {physical_constraints}
- Compute: C_min = {formula}
- Compute: CFI = {incumbent_cost} / C_min
- Compute: NCI_cost = min(1.0, log10(CFI) / 3)
- If {has_historical_data} is TRUE and Pettitt detects a change-point with p < 0.05, multiply NCI_cost by 1.5 (rate acceleration bonus).

OUTPUT FORMAT (JSON):
{
  "primary_type": "cost_fracture | business_model_rewrite | asset_mispricing | none",
  "secondary_types": ["..."] or [],
  "cost_fracture": {
    "detected": true|false,
    "eliminated_categories": ["category_name"],
    "cfi": number or null,
    "nci_cost": 0.0 to 1.0,
    "physical_root": "description of the physical/informational law",
    "confidence": "HIGH|MEDIUM|LOW"
  },
  "business_model_rewrite": {
    "detected": true|false,
    "canvas_blocks_changed": 0-9,
    "payer_shift": "description",
    "value_unit_shift": "description",
    "confidence": "HIGH|MEDIUM|LOW"
  },
  "asset_mispricing": {
    "detected": true|false,
    "asset_name": "description",
    "incumbent_classification": "waste|byproduct|cost_center|below_threshold|liability",
    "inversion_ratio": number or null,
    "framework_incompatibility": "HIGH|MEDIUM|LOW",
    "confidence": "HIGH|MEDIUM|LOW"
  },
  "reliability_flags": ["INSTITUTIONAL_CONSTRAINT", "BEHAVIORAL_CONSTRAINT", "PRE_SCALE", "REGULATORY_UNCERTAINTY"] or [],
  "overall_confidence": "HIGH|MEDIUM|LOW"
}
</div>

<hr>

<h3>7.2 Pettitt Change-Point Detection Prompt (for Historical Data Analysis)</h3>

<div class="prompt">
SYSTEM: You are a statistical analyst. Perform a Pettitt change-point test on the following cost time series to detect learning rate mutations.

INPUT DATA:
Direction: {direction_name}
Cost metric: {cost_metric_name}
Time series (annual): {json_cost_time_series}  // [{"year": 2015, "cost": 100}, {"year": 2016, "cost": 95}, ...]

INSTRUCTIONS:
1. Compute year-over-year learning rate: rate[t] = (cost[t-1] - cost[t]) / cost[t-1]
2. For each potential change-point year k:
   - Compute U_k = SUM over all pairs (i <= k, j > k) of sign(rate[i] - rate[j])
3. Identify K = argmax |U_k| (the most likely change-point)
4. Estimate p-value using the asymptotic distribution: p = 2 * exp(-6 * K^2 / (T^3 + T^2))
   Where T = number of years in the series
5. If p < 0.05 and post-change-point mean rate > 2 * pre-change-point mean rate:
   OUTPUT: change_point_detected = TRUE
   OUTPUT: pre_change_mean_rate, post_change_mean_rate
   OUTPUT: acceleration_factor = post_rate / pre_rate
6. If p >= 0.05 or acceleration < 2x:
   OUTPUT: change_point_detected = FALSE
   OUTPUT: linear_fit_r_squared (R-squared of log(cost) ~ year regression)

OUTPUT FORMAT (JSON):
{
  "change_point_detected": true|false,
  "change_point_year": 2015 or null,
  "p_value": 0.001 or null,
  "pre_change_mean_rate": 0.06,
  "post_change_mean_rate": 0.18,
  "acceleration_factor": 3.0,
  "linear_fit_r_squared": 0.45,
  "interpretation": "Significant learning rate acceleration detected at {year}. Pre-change: {x}%/yr -> Post-change: {y}%/yr."
}
</div>

<hr>

<h3>7.3 Industry Cost Template Selector Prompt</h3>

<div class="prompt">
SYSTEM: You are an industry cost structure analyst. Given a company description, select the most appropriate theoretical minimum cost template and instantiate it with available data.

INPUT:
Company: {company_name}
Industry: {industry}  // one of: consumer_goods, manufacturing, saas, logistics, finance, agriculture, energy, healthcare
Description: {direction_description}
Available Data: {available_data_fields}

INSTRUCTIONS:
1. Select the matching industry template from the 8 templates below.
2. For each variable in the template, determine:
   - Can it be computed from available data? (COMPUTABLE / NOT_COMPUTABLE / NEEDS_ESTIMATE)
   - If COMPUTABLE: provide the value and data source
   - If NOT_COMPUTABLE: provide the best-estimate range based on industry benchmarks
3. Compute C_min using the formula.
4. Compute CFI = known_incumbent_cost / C_min.
5. Assign reliability flags based on data completeness.

TEMPLATES:
{all_8_industry_templates}  // Inject the 8 formulas from Section 2

OUTPUT FORMAT (JSON):
{
  "selected_template": "consumer_goods",
  "template_formula": "C_min = C_goods + C_fulfillment + max(C_social_share, C_min_brand)",
  "variables": {
    "C_goods": {"value": 12.50, "unit": "USD/unit", "source": "commodity_market_LME", "confidence": "HIGH"},
    "C_fulfillment": {"value": 2.80, "unit": "USD/unit", "source": "industry_report_2024", "confidence": "MEDIUM"},
    "C_social_share": {"value": 0.05, "unit": "USD/user", "source": "computed_from_MAU_and_K_factor", "confidence": "MEDIUM"},
    "C_min_brand": {"value": 0.50, "unit": "USD/user", "source": "estimated_from_subsidy_data", "confidence": "LOW"}
  },
  "C_min": 15.85,
  "incumbent_cost": 150.00,
  "CFI": 9.46,
  "NCI_cost": 0.32,
  "reliability_flags": ["BEHAVIORAL_CONSTRAINT: C_min_brand is estimated"],
  "overall_confidence": "MEDIUM"
}
</div>

<hr>

<h3>7.4 References</h3>
<ol style="margin:8px 0 8px 28px; font-size:0.88rem;">
  <li>Christensen, C.M. (1997). <em>The Innovator's Dilemma: When New Technologies Cause Great Firms to Fail</em>. Harvard Business School Press.</li>
  <li>Christensen, C.M. &amp; Raynor, M.E. (2003). <em>The Innovator's Solution: Creating and Sustaining Successful Growth</em>. Harvard Business School Press.</li>
  <li>Osterwalder, A. &amp; Pigneur, Y. (2010). <em>Business Model Generation</em>. Wiley.</li>
  <li>Wright, T.P. (1936). "Factors Affecting the Cost of Airplanes." <em>Journal of the Aeronautical Sciences</em>, 3(4), 122-128.</li>
  <li>Pettitt, A.N. (1979). "A Non-Parametric Approach to the Change-Point Problem." <em>Journal of the Royal Statistical Society: Series C</em>, 28(2), 126-135.</li>
  <li>Shannon, C.E. (1948). "A Mathematical Theory of Communication." <em>Bell System Technical Journal</em>, 27(3), 379-423.</li>
  <li>Arrow, K.J. (1962). "The Economic Implications of Learning by Doing." <em>The Review of Economic Studies</em>, 29(3), 155-173.</li>
  <li>Metcalfe, B. (2013). "Metcalfe's Law after 40 Years of Ethernet." <em>IEEE Computer</em>, 46(12), 26-31.</li>
  <li>Swanson, R.M. (2006). "A Vision for Crystalline Silicon Photovoltaics." <em>Progress in Photovoltaics</em>, 14(5), 443-453.</li>
  <li>Rogers, E.M. (2003). <em>Diffusion of Innovations</em> (5th ed.). Free Press.</li>
</ol>

<hr>

<p style="text-align:center; color:var(--text2); font-size:0.85rem; margin-top:48px;">
  Beta Research &middot; SynovaAgent Growth Diagnostics &middot; 2026-07-04<br>
  Method: Cross-Industry Case Induction + First-Principles Deduction<br>
  Anchor: Christensen (1997) The Innovator's Dilemma
</p>

"""
with open(PATH, "w", encoding="utf-8") as f:
    f.write(prefix + body + suffix)
print("Section 7 appended, total:", os.path.getsize(PATH))
