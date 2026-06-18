---
name: swot-analysis
version: "1.0.0"
description: "Perform a detailed SWOT analysis — strengths, weaknesses, opportunities, and threats with actionable recommendations. Use when doing strategic assessment, competitive analysis, or evaluating a product or business position."
triggers: ['SWOT', 'strategic assessment', 'competitive analysis', '优势', '劣势']
required_tools: ['query_graph']
depends_on: []
output_format: "markdown"
confidence: "medium"
source: "phuryn/pm-skills (MIT) — adapted for Synova"
---
# SWOT Analysis

## Metadata
- **Name**: swot-analysis
- **Description**: Perform a detailed SWOT analysis for a product. Identifies strengths, weaknesses, opportunities, and threats with actionable recommendations.
- **Triggers**: SWOT analysis, strengths weaknesses, SWOT matrix, strategic assessment

## Instructions

You are a strategic analyst conducting a SWOT analysis for $ARGUMENTS.

Your task is to thoroughly evaluate the internal and external factors that will impact product success and competitive positioning.

## Input Requirements
- Product description and current state
- Competitive landscape and market context
- Company capabilities, resources, and constraints
- Market trends and industry dynamics
- Customer feedback or usage data (optional)

## SWOT Analysis Framework

### 1. Strengths (Internal, Positive)
What internal capabilities and advantages do we have?

- Unique capabilities or expertise
- Brand recognition or reputation
- Customer relationships and loyalty
- Technology or IP advantages
- Cost advantages or operational efficiency
- Team talent and experience
- Existing customer base or distribution

### 2. Weaknesses (Internal, Negative)
What internal limitations or gaps do we have?

- Resource constraints (budget, team size, skills)
- Technology or infrastructure limitations
- Lack of brand awareness or market presence
- Weak customer relationships or high churn
- High cost structure relative to competitors
- Outdated processes or legacy systems
- Dependence on key people or partners

### 3. Opportunities (External, Positive)
What external trends or market dynamics could we leverage?

- Growing market segments or customer needs
- Technological advances enabling new solutions
- Regulatory changes favoring our approach
- Competitor weaknesses or market gaps
- Partnership or acquisition opportunities
- Expansion into adjacent markets or segments
- Shifting customer preferences or behaviors

### 4. Threats (External, Negative)
What external factors could negatively impact us?

- Emerging or stronger competitors
- Changing customer preferences or needs
- Technological disruption or obsolescence
- Regulatory changes or compliance risks
- Economic downturns or market contraction
- Supply chain disruptions
- Supplier or partner consolidation

## Output Process
1. Identify 5-7 strengths (be honest about competitive advantages)
2. List 5-7 weaknesses (avoid minimizing; focus on addressable gaps)
3. Map 5-7 opportunities (prioritize by market size and alignment)
4. Flag 5-7 threats (assess probability and impact)
5. Cross-reference analysis for strategic insights:
   - How do we leverage strengths to capture opportunities?
   - How do we shore up weaknesses to mitigate threats?
   - Which opportunities can overcome weaknesses?
   - Which threats could exploit weaknesses?
6. Develop 3-5 strategic recommendations
7. Prioritize actions and owners
8. Identify metrics to track progress

## Strategic Applications
- **Build**: Double down on strengths + opportunities
- **Defend**: Fortify weaknesses + mitigate threats
- **Pivot**: Explore opportunities that change the competitive dynamic
- **Exit**: If too many threats and weak competitive position

## Notes
- SWOT is internal to external assessment
- Context matters: compare against competitors and industry standards
- Update SWOT quarterly or when market conditions change
- Use SWOT to inform product roadmap, partnerships, and resource allocation
- Opportunities and threats should consider both current and emerging dynamics

## 反面案例

> ⚠️ 此 Skill 来自 [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT License)，已适配 Synova SKILL-SPEC 格式。
> 反面案例待 Synova 诊断实践积累后补充。

## 边界
- **适用**: 见触发条件
- **来源**: pm-skills (MIT) — 社区维护的通用商业分析 Skill
