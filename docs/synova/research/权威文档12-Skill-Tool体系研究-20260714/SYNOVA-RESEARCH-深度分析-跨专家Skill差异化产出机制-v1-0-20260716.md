# 深度分析：跨专家Skill差异化产出机制

> "利润率下降根因分析"这个Skill，财务专家产出"固定成本刚性"，战略专家产出"竞争位势衰减"——同一个流程，不同视角。

---

## Q1: Skill是"流程定义"还是"视角绑定"？

**答案：Skill是流程定义，不绑定视角。**

理由：
1. 绑定视角→160个Skill变体(8专家×20场景)，不可维护
2. 根因常跨领域——成本结构+竞争位势+协作效率同时恶化，单视角无法覆盖
3. Claude Code code-review的high/medium/low模式验证了"流程相同、深度不同"的可行性

## Q2: 方案A(上下文注入) vs 方案B(多Variant)

**推荐方案A**：同一个Skill，主Agent在执行前注入不同的analytical_context。

```yaml
steps:
  - step: 2
    tool: "tool_trace_lineage"
    params:
      dimension: "{{analytical_context.primary_dimension}}"
      # 财务专家→"cost_structure"，战略专家→"competitive_position"
```

优点：单一真相源，新增专家只需增加context规则。缺点：模板可读性需靠命名规范保证。
不选方案B的理由：160个文件的管理成本和一致性风险不可接受。

## Q3: Playbook中专家间状态传递

**选择性传递**：前序步骤产出按relevance过滤后传给下一个专家。

```typescript
interface StepContextPass {
  findings: Array<{ id: string; summary: string; evidenceRefs: string[]; confidence: number; relevanceToNext: "high"|"medium"|"low" }>;
}
```
high→完整finding+原始参数；medium→摘要+confidence；low→仅摘要。

## Q4: IDENTITY.md的analytical_lens增强

```yaml
# expert/finance/IDENTITY.md 新增
analytical_lens:
  default_dimension: "cost_structure"
  primary_edges: [E-23, E-13, E-34, E-37]
  root_cause_framing: "WHAT broke in the financial structure?"
  blind_spots:
    - "不评估竞争对手行为（战略专家领域）"
    - "不评估组织协作效率（组织专家领域）"

# expert/strategy/IDENTITY.md 新增
analytical_lens:
  default_dimension: "competitive_position"
  primary_edges: [E-36, E-30, E-33, E-32]
  root_cause_framing: "WHO is squeezing our margins?"
  blind_spots:
    - "不评估固定成本结构（财务专家领域）"
```

## Q5: 实现示例

**同一个Playbook finance-profitability-root-cause，财务专家执行**：
- analytical_context.primary_dimension = "cost_structure"
- Step 2追溯E-23 → Step 3计算DOL → Step 4跳过 → Step 5跳过
- 产出："固定成本刚性指数0.73，经营杠杆3.2"

**同一个Playbook，战略专家执行**：
- analytical_context.primary_dimension = "competitive_position"
- Step 2追溯E-36 → Step 3跳过 → Step 4博弈论分析 → Step 5触发财务专家交叉验证
- 产出："竞争对手降价15%，切换成本仅0.42，HHI 2800"

**差异化由analytical_context驱动，而非Skill本身。** 主Agent在启动Playbook前根据当前专家加载对应的context。
