import sys
sys.stdout.reconfigure(encoding="utf-8")

outpath = r"D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\RESEARCH-ODC-LastStand-20260704.html"

body = """<h2>III. Last Stand Decision Model</h2>

<div class="crit-box">
<h3 style="margin-top:0;">Design Philosophy</h3>
<p>When an enterprise is near death, conventional &quot;ROI analysis&quot; no longer applies&mdash;because the baseline case (doing nothing) already has an ROI of <strong>negative infinity</strong> (certain death). The system <strong>does not output &quot;recommend investing X%&quot;</strong>&mdash;it outputs a binary choice: <strong>probability of death vs. asymmetric return ratio</strong>. It does not make the decision for the enterprise&mdash;it returns the choice to the founder. This is Knight (1921)&#39;s normative requirement: judgment and consequence-bearing are irreplaceable entrepreneurial functions.</p>
</div>

<h3>3.1 Trigger Conditions (Triple Gate, AND Logic)</h3>

<div class="formula">LastStand_Trigger = (Runway &lt; 6 months) AND (NCI &ge; 70) AND (T3_Best_ROI &lt; 1.0)</div>

<table>
<tr><th style="width:120px;">Gate</th><th>Condition</th><th>Judgment Logic</th></tr>
<tr>
  <td><strong>Gate 1: Death Threshold</strong></td>
  <td class="red">Cash runway &lt; 6 months</td>
  <td>The enterprise is at the edge of life and death. Not &quot;slowing growth&quot; but &quot;if nothing changes, operations cease within 6 months.&quot; <strong>Purely financial-fact judgment</strong>, independent of any subjective assessment. Cash runway = liquid cash / (avg monthly fixed costs - avg monthly variable revenue).</td>
</tr>
<tr>
  <td><strong>Gate 2: Non-Consensus Confidence</strong></td>
  <td class="yellow">NCI &ge; 70</td>
  <td>Non-Consensus Confidence Index. A composite score of the NCO&#39;s deviation from mainstream consensus + evidence strength + theoretical coherence. NCI&lt;70 means &quot;this is not a true non-consensus bet; it&#39;s merely a higher-risk conventional opportunity.&quot; When NCI&lt;70, Last Stand is NOT triggered even if the enterprise is near death&mdash;other survival paths should be sought.</td>
</tr>
<tr>
  <td><strong>Gate 3: Conventional Paths Exhausted</strong></td>
  <td class="red">T3 best strategic archetype ROI &lt; 1</td>
  <td>If the system, through conventional three-stage reasoning (status quo analysis &rarr; analogy matching &rarr; strategy recommendation), finds that all strategic archetypes have expected ROI below 1&mdash;i.e., all &quot;respectable&quot; exits are eliminated&mdash;only the non-consensus path remains. This is a <strong>conclusion reached after exhausting alternatives</strong>, not skipping conventional analysis.</td>
</tr>
</table>

<h3>3.2 NCI: Non-Consensus Confidence Index</h3>

<div class="formula">NCI = 0.35&middot;D_consensus + 0.30&middot;S_evidence + 0.20&middot;C_theory + 0.15&middot;F_falsifiable</div>

<table>
<tr><th>Sub-Dimension</th><th style="width:60px;">Weight</th><th>Measurement</th></tr>
<tr>
  <td><strong>D_consensus</strong> Consensus Distance</td><td>0.35</td>
  <td>Proportion of industry participants who endorse or discuss this direction (inverted). 90% think it&#39;s wrong &rarr; D=0.9. Note: <strong>high consensus distance alone does not create value</strong>&mdash;it must be supported by evidence and theory.</td>
</tr>
<tr>
  <td><strong>S_evidence</strong> Evidence Strength</td><td>0.30</td>
  <td>Verifiable hard signals: user behavior data, technology breakthrough S-curves, regulatory changes, structural cost declines. Not &quot;I feel&quot; but &quot;data shows.&quot;</td>
</tr>
<tr>
  <td><strong>C_theory</strong> Theory Coherence</td><td>0.20</td>
  <td>Whether the causal chain is clearly articulable. Under Knightian uncertainty, &quot;predictable&quot; is not required, but &quot;understandable&quot; is&mdash;the mechanism by which this direction could work must be statable.</td>
</tr>
<tr>
  <td><strong>F_falsifiable</strong> Falsifiability</td><td>0.15</td>
  <td>Can a clear yes/no signal be obtained within limited time and resources? Unfalsifiable = no decision boundary = potential infinite resource drain. Popperian standard: scientific propositions must be falsifiable.</td>
</tr>
</table>

<h3>3.3 Last Stand Mode Output Format (Binary Decision Framework)</h3>

<div class="crit-box">
<p>When Last Stand mode is triggered, the system is <strong>prohibited</strong> from outputting any text containing &quot;recommend,&quot; &quot;suggest,&quot; or &quot;should.&quot; The system outputs the following <strong>pure information presentation</strong>:</p>
</div>

<table>
<tr><th style="width:50%;">Plan A: Maintain Status Quo</th><th style="width:50%;">Plan B: Last Stand</th></tr>
<tr>
  <td>
    <strong>Death probability</strong> P<sub>death</sub>(A): <span class="red">&asymp;1.0</span><br>
    <strong>Rationale</strong>: Runway &lt; 6 months, all conventional strategic archetypes ROI &lt; 1<br><br>
    <strong>Remaining time</strong>: <span class="red">N months</span> (precisely computable)<br><br>
    <strong>Controllability</strong>: High<br>
    (Layoffs, cost compression can extend runway but cannot change endpoint)<br><br>
    <strong>Last-resort options</strong>:<br>
    Orderly liquidation / asset sale / acquisition search
  </td>
  <td>
    <strong>Death probability</strong> P<sub>death</sub>(B): <span class="yellow">X%</span> (estimated range)<br>
    <strong>Asymmetric return ratio</strong>: <span class="green">Y : 1</span> (upside / downside)<br><br>
    <strong>Key assumptions</strong> (minimum 3):<br>
    [H1] Assumption 1<br>
    [H2] Assumption 2<br>
    [H3] Assumption 3<br><br>
    <strong>Minimum verification cycle</strong>: <span class="yellow">Z weeks</span> (falsifiable window)<br>
    <strong>Untouchable reserve</strong>: X% of remaining resources<br><br>
    <strong>Controllability</strong>: Low<br>
    (Outcome primarily determined by external factors + whether assumptions hold)
  </td>
</tr>
</table>

<p><strong>Key principle</strong>: The system presents the death probabilities and asymmetric return ratios of both Plans; the founder makes the choice. Knight (1921)&#39;s core insight: <strong>the entrepreneur&#39;s essence is bearing uncertainty; this responsibility cannot be delegated to an algorithm</strong>. The system&#39;s only job is to make the information sufficiently clear and the choice sufficiently honest.</p>

<h3>3.4 Pseudo-NCO Detection and Warning</h3>

<p>When Last Stand mode is triggered but the NCO is detected as <strong>pseudo-non-consensus</strong>, the system must append the following warning:</p>

<div class="warn-box">
<h4 style="margin-top:0; color:var(--warn);">&#9888; Pseudo-Non-Consensus Signals Detected</h4>
<table>
<tr><th style="width:220px;">Detection Criterion</th><th>Judgment</th></tr>
<tr><td>D_consensus &lt; 0.3</td><td>This direction is already widely discussed in the industry; it is not genuinely non-consensus&mdash;likely trend-chasing rather than insight. When others are also attempting (but not yet succeeding), explain &quot;why we are different.&quot;</td></tr>
<tr><td>S_evidence &lt; 0.2</td><td>No verifiable signals; decisions are more intuition- or wish-driven. &quot;Believing&quot; is not evidence.</td></tr>
<tr><td>F_falsifiable &lt; 0.3</td><td>No clear &quot;dead end&quot; signal exists, potentially enabling unlimited resource commitment. &quot;Just a little more&quot; is dangerous without a falsifiability boundary.</td></tr>
<tr><td>C_theory &lt; 0.4</td><td>The causal chain is unclear. &quot;Because others aren&#39;t doing it, we should&quot; is not itself an anti-consensus logic&mdash;an independent causal argument is needed.</td></tr>
</table>
<p style="margin-top:12px;"><strong>System conclusion</strong>: This direction has an extremely high failure probability (P<sub>death</sub>(B) &gt; 0.9). If the founder still chooses to bet, it is recommended to set <strong>70%</strong>+ of remaining resources as &quot;untouchable reserve&quot;&mdash;core reserves that cannot be consumed within the minimum verification cycle. Taleb (2012) barbell strategy mapping: 90% extreme conservatism + 10% extreme aggression.</p>
</div>

<h2>IV. Business Case Simulations</h2>

<h3>4.1 <span class="case-tag case-netflix">Netflix 2007</span> DVD Rental &rarr; Streaming Pivot</h3>

<table>
<tr><th>Parameter</th><th>Historical Facts</th><th>Model Retrospective</th></tr>
<tr>
  <td>Cash Runway</td>
  <td>Adequate. DVD-by-mail business healthy and profitable, ~24+ months</td>
  <td class="green">Gate 1 NOT met: Last Stand not triggered</td>
</tr>
<tr>
  <td>ODC</td>
  <td>E_m=0.90 (world-class engineering team, recommendation algorithm already built), S_r=0.80 (profitable business), D_t=0.75 (streaming tech talent), R_d=0.85 (tens of millions of user ratings + viewing behavior data)</td>
  <td class="green">ODC &asymp; 0.83 &rarr; High digestive capacity &rarr; Full speed ahead</td>
</tr>
<tr>
  <td>NCI</td>
  <td>In 2007, streaming was widely doubted: insufficient bandwidth, complex licensing, user habits unformed. But YouTube (2005) had proven users would watch video online. Netflix had a data advantage&mdash;knew what users actually wanted to watch.</td>
  <td class="yellow">NCI &asymp; 75 (high consensus distance + evidence exists + theory coherent)</td>
</tr>
<tr>
  <td>Asymmetric Return</td>
  <td>Downside: DVD continues profitable but ceiling visible. Upside: global streaming dominance (Netflix market cap grew from ~$2B in 2007 to ~$300B in 2021).</td>
  <td class="green">Asymmetric ratio extremely high</td>
</tr>
<tr>
  <td colspan="3"><strong>Model judgment</strong>: Adequate ODC + death threshold not met &rarr; <strong>conventional strategic decision</strong>. Netflix&#39;s choice (operate DVD + streaming simultaneously, use DVD cash flow to fund streaming, gradually migrate users) is textbook strategic execution under high digestive capacity&mdash;not a Last Stand, but &quot;right direction + right capability + right cadence.&quot;</td>
</tr>
</table>

<h3>4.2 <span class="case-tag case-apple">Apple 1997</span> Cut 70% of Product Lines, Bet on iMac</h3>

<table>
<tr><th>Parameter</th><th>Historical Facts</th><th>Model Retrospective</th></tr>
<tr>
  <td>Cash Runway</td>
  <td class="red">~3 months</td>
  <td class="red">Gate 1 met: Runway &lt; 6 months</td>
</tr>
<tr>
  <td>ODC</td>
  <td>E_m=0.70 (Jobs&#39; return qualitatively transformed execution), S_r=0.10 (cash extremely tight; Microsoft $150M investment provided breathing room), D_t=0.85 (Jony Ive industrial design team + world-class engineers), R_d=0.40 (limited market research; Jobs famously did not rely on surveys)</td>
  <td class="yellow">ODC &asymp; 0.51 &rarr; Just crosses the critical threshold</td>
</tr>
<tr>
  <td>NCI</td>
  <td>In 1997, &quot;design-driven consumer computing&quot; was highly non-consensus. All competitors (Dell/Compaq/Gateway) were in a Beige Box price war; no one considered aesthetics and UX as differentiators. But Jobs had deep theoretical coherence on consumer electronics aesthetics&mdash;his argument was not &quot;because others don&#39;t,&quot; but &quot;because consumers deserve better.&quot;</td>
  <td class="green">NCI &asymp; 82 (highly non-consensus + founder deep theoretical coherence)</td>
</tr>
<tr>
  <td>Conventional Paths</td>
  <td class="red">All conventional strategic archetypes ROI&lt;1: continue multi-product line &rarr; death; price war &rarr; no cost advantage; sell company &rarr; no premium buyer (Apple&#39;s 1997 market cap ~$3B, less than 1/1000 of today).</td>
  <td class="red">Gate 3 met</td>
</tr>
<tr>
  <td>Asymmetric Return</td>
  <td>Downside: bankruptcy in 3 months. Upside: redefine the personal computer (Apple&#39;s market cap today ~$3T). Microsoft&#39;s $150M investment essentially lowered the downside&mdash;from &quot;immediate death&quot; to &quot;one more year to live.&quot; This is the ultimate expression of Taleb&#39;s barbell strategy.</td>
  <td class="green">Asymmetric ratio extremely high</td>
</tr>
<tr>
  <td colspan="3"><strong>Model judgment</strong>: All three gates met &rarr; <strong>Last Stand mode activated</strong>. The critical ODC (0.51) is key&mdash;it means &quot;just barely executable,&quot; not &quot;comfortably executable.&quot; Jobs chose Plan B. The model does not make the decision for the founder, but clearly presents the binary choice, and the critical ODC judgment is precise&mdash;if ODC&lt;0.25 (cannot digest), even a correct NCO would be the wrong bet.</td>
</tr>
</table>

<h3>4.3 <span class="case-tag case-bytedance">ByteDance 2016</span> Betting on Algorithmic Distribution Under BAT&#39;s Shadow</h3>

<table>
<tr><th>Parameter</th><th>Historical Facts</th><th>Model Retrospective</th></tr>
<tr>
  <td>Cash Runway</td>
  <td class="green">Adequate. Toutiao already profitable, ~36+ months</td>
  <td class="green">Gate 1 NOT met: Last Stand not triggered</td>
</tr>
<tr>
  <td>ODC</td>
  <td>E_m=0.95 (extreme execution culture, &quot;overwhelming force&quot;), S_r=0.85 (multiple profitable product lines), D_t=0.90 (China&#39;s top recommendation algorithm team), R_d=0.90 (massive user behavior data + industry&#39;s strongest A/B testing infrastructure)</td>
  <td class="green">ODC &asymp; 0.90 &rarr; Extremely high digestive capacity</td>
</tr>
<tr>
  <td>NCI</td>
  <td>By 2016, &quot;short video + recommendation algorithms&quot; was no longer purely non-consensus&mdash;Kuaishou had already proven the model viable. ByteDance&#39;s differentiation was globalization + more aggressive algorithms + decentralized content distribution (Douyin vs. Kuaishou&#39;s community-based approach). &quot;Algorithmic vs. social distribution&quot; had partial consensus and partial divergence.</td>
  <td class="yellow">NCI &asymp; 55 (direction partially consensus, but execution path controversial)</td>
</tr>
<tr>
  <td colspan="3"><strong>Model judgment</strong>: Extremely high ODC + NCI&lt;70 + non-death state &rarr; <strong>conventional strategic decision</strong>. This is NOT a Last Stand&mdash;this is a high-digestive-capacity organization executing with overwhelming force in a high-potential direction. The model correctly distinguishes &quot;non-consensus bet&quot; from &quot;right direction + extreme execution.&quot; ByteDance in 2016 did the latter&mdash;the direction was not anti-consensus (Kuaishou had validated it), but the execution level was extremely differentiated.</td>
</tr>
</table>
"""

with open(outpath, "a", encoding="utf-8") as f:
    f.write(body)

print(f"Section 2 appended: {len(body)} chars")
