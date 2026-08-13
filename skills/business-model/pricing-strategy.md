---
name: pricing-strategy
version: "1.0.0"
description: "Analyze and design pricing strategies including pricing models, competitive pricing analysis, willingness-to-pay estimation, and price elasticity. Use when setting prices, evaluating pricing models, preparing for a pricing change, or comparing freemium vs paid approaches."
triggers: ['pricing', 'pricing model', '定价', '价格策略', 'freemium']
required_tools: ['query_graph', 'cross_validate']
depends_on: []
output_format: "markdown"
confidence: "medium"
source: "phuryn/pm-skills (MIT) — adapted for Synova"
---

## Pricing Strategy

Design a pricing strategy grounded in value delivery, competitive positioning, and willingness to pay.

### Context

You are developing a pricing strategy for **$ARGUMENTS**.

If the user provides files (competitor pricing, survey data, financial models, or usage data), read them first. Use web search to research competitor pricing if needed.

### Instructions

1. **Understand the value delivered**:
   - What is the core value proposition?
   - What is the customer's alternative (and its cost)?
   - What quantifiable outcomes does the product deliver? (time saved, revenue gained, cost reduced)
   - What is the customer's willingness to pay based on that value?

2. **Evaluate pricing models** — recommend the best fit:

   | Model | Best For | Example |
   |---|---|---|
   | **Flat-rate** | Simple products, predictable costs | Basecamp ($99/mo flat) |
   | **Per-seat** | Collaboration tools, team products | Slack, Figma |
   | **Usage-based** | Infrastructure, API products | AWS, Twilio |
   | **Tiered** | Products with distinct user segments | Most SaaS (Free/Pro/Enterprise) |
   | **Freemium** | Products with viral/network effects | Spotify, Notion |
   | **Freemium + usage** | Platform products | Vercel, OpenAI API |
   | **Value-based** | High-impact enterprise tools | Salesforce, Palantir |

3. **Analyze competitive pricing**:
   - Map competitor pricing tiers and what's included
   - Identify where your product sits (premium, mid-market, budget)
   - Find pricing gaps or opportunities
   - Note any industry pricing conventions

4. **Design the pricing structure**:
   - **Tiers**: Define 2-4 tiers with clear differentiation
   - **Feature gating**: Which features go in which tier? (Use value metrics, not arbitrary limits)
   - **Value metric**: What unit do you charge on? (users, events, storage, API calls)
   - **Anchor pricing**: Set the most popular tier to feel like the obvious choice
   - **Annual discount**: Typically 15-20% off monthly pricing

5. **Estimate price sensitivity**:
   - Van Westendorp Price Sensitivity Meter (if survey data available):
     - Too cheap → quality concerns
     - Cheap → good value
     - Expensive → starting to hesitate
     - Too expensive → won't buy
   - Alternatively, estimate based on competitor pricing and value delivered

6. **Plan pricing experiments**:
   - A/B test pricing pages (different price points, tier names, feature bundles)
   - Founder-led sales conversations to test willingness to pay
   - Landing page tests with different price anchors
   - Cohort analysis of conversion rates by price point

7. **Output a pricing recommendation**:
   ```
   Recommended Model: [Model type]
   Value Metric: [What you charge on]

   | Tier | Price | Target Segment | Key Features | Positioning |
   |---|---|---|---|---|

   Key Assumptions:
   - [Assumption] → [How to test]

   Risks:
   - [Risk] → [Mitigation]
   ```

Think step by step. Save as markdown. Flag any assumptions that need validation before launch.

---

### Further Reading

- [Product Pricing Strategies 101](https://www.productcompass.pm/p/product-pricing-strategies-101)
- [The AI Product Pricing Masterclass: OpenAI Product Lead on Why SaaS Pricing Fails in AI (and How to Fix It)](https://www.productcompass.pm/p/ai-product-pricing) (video course)

## 反面案例

> ⚠️ 此 Skill 来自 [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT License)，已适配 Synova SKILL-SPEC 格式。
> 反面案例待 Synova 诊断实践积累后补充。

## 边界
- **适用**: 见触发条件
- **来源**: pm-skills (MIT) — 社区维护的通用商业分析 Skill
