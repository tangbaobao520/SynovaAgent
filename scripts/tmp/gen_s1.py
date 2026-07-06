import sys
sys.stdout.reconfigure(encoding="utf-8")

outpath = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\RESEARCH-ODC-LastStand-20260704.html"

body = """<h1>ODC &amp; Last Stand Decision Model</h1>
<p class="muted">2026-07-04 &middot; Research Paradigm: Quantitative Modeling + Business Case Simulation &middot; Agent: Delta</p>

<div class="highlight">
<h3 style="margin-top:0;">Core Research Questions</h3>
<p><strong>Q1.</strong> When a Non-Consensus Opportunity (NCO) is identified, does the organization have the capacity to digest it?<br>
<strong>Q2.</strong> When an enterprise is near death, how to determine whether to switch to a Last Stand framework and bet on the only visible non-consensus path?</p>
</div>

<h2>I. Research Methodology</h2>

<h3>1.1 Research Paradigm</h3>
<table>
<tr><th style="width:150px;">Method</th><th>Description</th></tr>
<tr><td><strong>Quantitative Modeling</strong></td><td>Decompose organizational digestive capacity into measurable dimensions and construct a computable ODC formula. Each dimension is defined on a 0-1 continuous scale with proxy variables, ensuring the model is operationalizable rather than conceptual.</td></tr>
<tr><td><strong>Business Case Simulation</strong></td><td>Select three classic Last Stand cases (Netflix 2007 / Apple 1997 / ByteDance 2016), reverse-extract decision parameters, and verify the model&#39;s ability to reproduce historical decisions.</td></tr>
<tr><td><strong>Adversarial Boundary Verification</strong></td><td>Construct four extreme scenarios (cannot digest / barely digestible / near-death + true NCO / near-death + pseudo-NCO) to test whether the model outputs correct recommendations in each case.</td></tr>
<tr><td><strong>Ablation Verification</strong></td><td>Remove the &quot;digestive capacity pre-check&quot; module to observe whether the system produces catastrophic erroneous recommendations, proving that this module is necessary rather than redundant.</td></tr>
</table>

<h3>1.2 Core Theoretical Literature</h3>
<table>
<tr><th style="width:160px;">Literature</th><th>Core Contribution</th><th>Support for the Model</th></tr>
<tr>
  <td><strong>Knight (1921)</strong><br><span class="ref"><em>Risk, Uncertainty, and Profit</em></span></td>
  <td>Distinguishes risk (computable probability distributions) from uncertainty (non-computable). <strong>The essential function of the entrepreneur is to exercise judgment and bear consequences under uncertainty</strong>, not to manage known risks.</td>
  <td>Theoretical foundation of the Last Stand framework: when the return distribution of an NCO cannot be fitted with historical data (Knightian uncertainty), traditional ROI models are invalid and must switch to an asymmetric payoff framework. The system <strong>does not make decisions for the founder</strong>&mdash;because judgment and consequence-bearing are irreplaceable entrepreneurial functions.</td>
</tr>
<tr>
  <td><strong>Taleb (2012)</strong><br><span class="ref"><em>Antifragile: Things That Gain from Disorder</em></span></td>
  <td>Convex payoff: bets with limited downside + unlimited upside potential are rational even when the probability of success is low. Antifragile systems benefit from volatility.</td>
  <td>Design of the &quot;asymmetric return ratio&quot; in the Last Stand trigger: when downside is fixed (death) and upside can reverse survival probability, betting is rational&mdash;even at low probability. Taleb&#39;s barbell strategy maps to the &quot;untouchable reserve&quot; mechanism in Last Stand.</td>
</tr>
<tr>
  <td><strong>Cohen &amp; Levinthal (1990)</strong><br><span class="ref"><em>Absorptive Capacity</em>, ASQ 35(1):128-152</span></td>
  <td>Organizational absorptive capacity = ability to recognize the value of external knowledge + assimilate + commercialize. Path-dependent: more prior related knowledge leads to stronger absorptive capacity. Absorptive capacity is <strong>cumulative and domain-specific</strong>.</td>
  <td>Direct theoretical precursor of the ODC formula. Maps the three stages (recognize &rarr; assimilate &rarr; apply) to four dimensions: E_m (execution speed), S_r (slack reserve), D_t (talent density), R_d (data readiness). Cohen &amp; Levinthal&#39;s &quot;domain specificity&quot; is preserved&mdash;ODC is computed <strong>for a specific NCO</strong>, not as an inherent organizational attribute.</td>
</tr>
</table>

<h2>II. ODC Organizational Digestive Capacity Formula</h2>

<div class="highlight">
<h3 style="margin-top:0;">ODC Master Formula</h3>
<div class="formula">ODC(NCO) = f(E_m, S_r, D_t, R_d) = 0.30&middot;E_m + 0.25&middot;S_r + 0.25&middot;D_t + 0.20&middot;R_d</div>
<p>Weights based on Cohen &amp; Levinthal&#39;s absorptive capacity path-dependency theory: <strong>assimilation and application weights (D_t + R_d = 0.45) exceed recognition (S_r = 0.25)</strong>, with execution momentum (E_m = 0.30) as a composite multiplier. Each dimension normalized to [0,1]; ODC output range [0,1].</p>
</div>

<h3>2.1 Four-Dimensional Definitions and Proxy Variables</h3>

<table>
<tr><th style="width:60px;">Dim</th><th style="width:90px;">Name</th><th>Definition</th><th>Proxy Variables (Operationalizable Measurement)</th></tr>
<tr>
  <td><strong>E_m</strong></td>
  <td>Execution Momentum</td>
  <td>Speed and quality with which the organization moves ideas from decision to measurable output. Answers: <em>&quot;How fast and how well can we get things done?&quot;</em></td>
  <td>
    (1) Average decision-to-delivery cycle of last 3 strategic pivots (days, inverse-normalized)<br>
    (2) Core team historical project completion rate (completed/committed)<br>
    (3) Dedicated engineering/product lead (0=none / 0.5=shared / 1=dedicated)<br>
    (4) Cross-functional coordination friction (monthly meetings &times; avg participants, inverse-normalized)
  </td>
</tr>
<tr>
  <td><strong>S_r</strong></td>
  <td>Slack Reserve</td>
  <td>How much time and resources the organization has for experimentation without threatening core business survival. Answers: <em>&quot;How many shots on goal do we have?&quot;</em></td>
  <td>
    (1) Cash runway = cash balance / avg monthly net burn (months, normalized to 0-36)<br>
    (2) Core business revenue stability (past 6-month revenue CV, inverted)<br>
    (3) Key position talent redundancy (backup availability)<br>
    (4) Customer concentration risk (Top 3 customer revenue share, inverse-normalized)
  </td>
</tr>
<tr>
  <td><strong>D_t</strong></td>
  <td>Talent Density</td>
  <td>Concentration of talent <strong>directly matched to this NCO</strong>. Not generic &quot;team quality&quot; but &quot;in this specific domain, do we have at least two people who can start building immediately?&quot;</td>
  <td>
    (1) NCO-relevant skill-matched headcount / total headcount (domain-specific)<br>
    (2) Core personnel relevant domain experience years (normalized 0-10yr &rarr; 0-1)<br>
    (3) Learning speed proxy: avg time to learn new tech stack / new market (inverse)<br>
    (4) Key talent attrition risk (past 12-month core personnel departure rate, inverted)
  </td>
</tr>
<tr>
  <td><strong>R_d</strong></td>
  <td>Data Readiness</td>
  <td>Whether the organization can collect, understand, and use data related to the NCO to guide decisions. Answers: <em>&quot;Can we judge this direction based on data rather than intuition?&quot;</em></td>
  <td>
    (1) NCO-related user/customer data accumulation (0=none / 0.5=indirect / 1=direct)<br>
    (2) Data analysis capability: dedicated analyst or toolchain<br>
    (3) Data infrastructure maturity (warehouse / tracking / reporting, 0-1 score)<br>
    (4) Decision datafication: share of data-driven decisions in past 6 months
  </td>
</tr>
</table>

<h3>2.2 ODC Output Ranges and Action Recommendations</h3>

<table>
<tr><th>ODC Range</th><th>Label</th><th>Action Recommendation</th><th>Rationale</th></tr>
<tr>
  <td class="red">[0, 0.25)</td>
  <td class="red"><strong>Cannot Digest</strong></td>
  <td><strong>Strategic wait-and-see</strong> or <strong>outsource / partner</strong>. The organization lacks the basic conditions to digest this NCO; forced investment = guaranteed resource waste.</td>
  <td>All four dimensions significantly low. Even if the direction is correct, there is no execution vehicle. Classic case: traditional furniture factory advised to build AI large models.</td>
</tr>
<tr>
  <td class="yellow">[0.25, 0.50)</td>
  <td class="yellow"><strong>Barely Digestible</strong></td>
  <td><strong>Small-scale validation</strong> (PoC / pilot / single customer). Minimize upfront investment to obtain directional signals.</td>
  <td>At least one dimension is a fatal weakness (e.g., S_r=0.1), requiring extreme reduction of upfront costs. Replace planning with signal.</td>
</tr>
<tr>
  <td class="green">[0.50, 0.75)</td>
  <td class="green"><strong>Generally Digestible</strong></td>
  <td><strong>Measured commitment</strong>. Set clear milestones + Gate Reviews; allocate core resources.</td>
  <td>Most dimensions acceptable; weaknesses non-fatal. What is needed is execution discipline, not capability building.</td>
</tr>
<tr>
  <td class="green">[0.75, 1.00]</td>
  <td class="green"><strong>High Digestive Capacity</strong></td>
  <td><strong>Full speed ahead</strong>. The organization has the complete capability chain to convert the NCO into competitive advantage.</td>
  <td>All four dimensions healthy; the only risk is whether the strategic direction itself is correct.</td>
</tr>
</table>

<h3>2.3 ODC Topology Matrix: Four-Quadrant Strategies</h3>

<table>
<tr><th>E_m (Execution)</th><th>S_r (Slack)</th><th>Strategy</th><th>Historical Case Mapping</th></tr>
<tr>
  <td class="green">High &ge;0.7</td>
  <td class="green">High &ge;0.7</td>
  <td><strong>All-in</strong></td>
  <td><span class="case-tag case-bytedance">ByteDance 2016</span> Mature algo team + ample cash &rarr; parallel product incubation</td>
</tr>
<tr>
  <td class="green">High &ge;0.7</td>
  <td class="red">Low &lt;0.3</td>
  <td><strong>Fast iteration validation</strong>: speed advantage compensates for resource scarcity</td>
  <td><span class="case-tag case-netflix">Netflix 2007</span> Strong engineering + limited DVD profits &rarr; MVP streaming from existing user data</td>
</tr>
<tr>
  <td class="red">Low &lt;0.3</td>
  <td class="green">High &ge;0.7</td>
  <td><strong>Acquire / partner externally</strong>: trade slack for capability</td>
  <td>Traditional enterprise establishes CVC arm; invest rather than build</td>
</tr>
<tr>
  <td class="red">Low &lt;0.3</td>
  <td class="red">Low &lt;0.3</td>
  <td><strong>Strategic wait-and-see</strong>: do not invest any resources</td>
  <td>Traditional furniture factory + AI LLM (ODC&lt;0.2)</td>
</tr>
</table>
"""

with open(outpath, "a", encoding="utf-8") as f:
    f.write(body)

print(f"Section 1 appended: {len(body)} chars")
