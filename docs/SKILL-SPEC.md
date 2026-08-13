# Synova SKILL.md 规范 v1.0

> 基于 Claude Code / Hermes / OpenClaw 三个项目的 Skill 格式分析，形成 Synova 的 Skill 标准。

---

## 一、格式来源

| 特性 | 来源 |
|------|------|
| YAML front matter (name + description) | Claude Code 标准（agentskills.io） |
| `triggers` 触发词数组 | Hermes |
| `depends_on` 依赖链 | Synova 现有 skills/ 实践 |
| `required_tools` 工具依赖 | Synova 现有 skills/ 实践 |
| 反面案例章节 | OpenClaw SKILL-SPEC.md |
| 执行流程（可 grep/read/bash 的步骤） | OpenClaw SKILL-SPEC.md |

---

## 二、文件位置

```
skills/{expert-category}/{skill-name}.md
```

- `{expert-category}` = 专家名或能力域（如 `strategy`, `org`, `finance`, `cross_validate`）
- `{skill-name}` = kebab-case 技能标识符

---

## 三、YAML Front Matter

### 必填字段

```yaml
---
name: kebab-case-identifier       # 唯一标识符，max 64 chars
description: >-                    # 一句话描述，用于判断是否触发，max 200 chars
  When the expert needs to [trigger condition], 
  this skill provides [what it does].
---
```

### 可选字段

```yaml
version: "1.0.0"                  # semver
triggers:                         # 自然语言触发条件
  - "触发短语1"
  - "触发短语2"
required_tools:                   # 依赖的 Synova 工具
  - tool_name
depends_on:                       # 依赖的其他 skill
  - other-skill-name
output_format: "json" | "markdown" | "report"  # 输出格式
confidence: "high" | "medium" | "low"         # 该 skill 产出的置信度
---
```

---

## 四、正文结构

```markdown
# <Human-readable 技能名称>

## 触发条件
<!-- 2-5 条具体的触发信号。不写"当需要诊断时"，写"当检测到毛利率连续3个季度下降" -->
- [具体触发信号 1]
- [具体触发信号 2]

## 前置依赖
<!-- 这个 skill 运行之前必须有什么数据/工具/其他 skill 的输出 -->
- [依赖项 1]

## 执行流程
<!-- 3-7 个可操作的步骤。每个步骤是专家 Agent 可以执行的思考+工具调用 -->
1. [步骤 1: 做什么 + 用什么工具]
2. [步骤 2]
...

## 输出规范
<!-- 产出什么、格式要求、质量标准 -->
- 格式: [json / markdown / 结构化报告]
- 必须包含: [字段列表]
- 质量标准: [判断产出合格的标准]

## 反面案例
<!-- 1-3 个历史上因为没正确执行这个 skill 导致的问题 -->
### 案例 1: [标题]
- **错误**: [做了什么]
- **后果**: [导致了什么]
- **正确做法**: [应该怎么做]

## 边界
<!-- 这个 skill 能做什么、不能做什么 -->
- **适用**: [适用范围]
- **不适用**: [什么时候不该用这个 skill]
```

---

## 五、渐进式加载机制

Skill 的加载分两级：

**Level 1 — Stub 注入（始终在线）**：
Expert 的 system prompt 中只注入 `name + description + triggers`（~100 chars per skill）。专家知道"我有这个能力"，但不占满 context window。

**Level 2 — 完整加载（按需触发）**：
当对话中匹配到 `triggers` 中的条件，或专家主动调用该 skill 时，`SkillLazyLoader` 加载完整的 SKILL.md 内容。

```
Stub 列表（注入专家 prompt）        完整内容（按需加载）
┌─────────────────────┐           ┌──────────────────────┐
│ 可用技能:            │           │ # 7 Powers 量化引擎   │
│ • seven-powers      │  ──触发──→ │ ## 执行流程           │
│   7 Powers 竞争壁垒  │           │ 1. 适用性判定...       │
│   量化评分引擎        │           │ 2. 逐力量评分...       │
│ • market-gravity    │           │ ...                   │
│   市场引力分析       │           └──────────────────────┘
│ ...                 │
└─────────────────────┘
```

---

## 六、完整示例

```yaml
---
name: seven-powers
version: "1.0.0"
description: >-
  Quantify competitive moat strength using Helmer's 7 Powers framework.
  Determine which powers apply, score each, and compute weighted moat strength.
triggers:
  - "竞争壁垒"
  - "护城河"
  - "凭什么赢"
  - "优势是结构性的还是运营性的"
required_tools:
  - seven_powers
  - query_graph
depends_on:
  - market-gravity
output_format: "structured_report"
confidence: "medium"
---

# 7 Powers 量化引擎

## 触发条件
- market-gravity 技能完成
- 检测到竞争相关数据（市场份额、定价能力、客户流失率）
- 客户有明显的竞争优势（高于行业平均利润率、持续市场份额增长）

## 前置依赖
- `market-gravity` skill 的输出（行业利润池 + 竞争环境）
- `seven_powers` measurer 已注册

## 执行流程
1. **适用性判定**: 对7种力量逐项检查适用条件。
   - 规模经济: 固定成本占比 > 40% ∧ 行业份额前三 → 适用，否则跳过
   - 网络效应: 用户间存在可测量交互 ∧ n↑ → 产品价值↑ → 适用
   - 反定位: 存在更优模式 ∧ 巨头采纳会自毁核心收入 → 适用
   - 转换成本: 客户年流失率 < 行业平均 → 适用
   - 品牌: 可测量到价格溢价（同功能贵且客户接受）→ 适用
   - 独占资源: 五要素全满足 → 适用
   - 流程优势: 运营效率持续优于行业基准 → 适用
2. **逐力量评分**: 调用 `seven_powers` measurer，对适用力量评分（0-10）。
   - 不适用的力量不评分、不显示、不参与加权
3. **加权计算**: `MoatStrength = Σ(S_i × W_i) / Σ(W_i)`，仅对适用力量求和。
   - 权重: 反定位×1.4, 规模经济+网络效应×1.2, 独占资源+流程优势×1.0, 转换成本+品牌×0.8
4. **S 曲线定位**: 结合 market-gravity 输出判断企业在 S 曲线的位置（引入期/增长期/成熟期/衰退期）
5. **异常检测**: 增长期企业品牌评分 > 6 可能异常——品牌需时间积累，标记为需人工复核

## 输出规范
- 格式: 结构化 Markdown
- 必须包含:
  - 适用力量列表 + 评分矩阵（每项 0-10）
  - 加权总分 + 判据（≥7强/4-6中等/<4薄弱）
  - S 曲线位置 + 异常标记
- 质量标准: 不适用的力量不出现在评分输出中。如果七种力量全部不适用，输出"暂无适用竞争力量"

## 反面案例

### 案例 1: 对所有力量评分
- **错误**: strategy 专家对所有 7 种力量都给了评分，包括不适用的小企业网络效应
- **后果**: 综合护城河评分虚高，让客户误以为自己有壁垒
- **正确做法**: 不适用条件不满足 → 不评分。小企业通常只有 1-2 种适用力量

### 案例 2: 品牌评分过高
- **错误**: 给一家成立 2 年、正在烧钱换增长的公司打了品牌 7/10
- **后果**: 品牌力量被高估——增长期企业品牌评分 > 6 几乎不可能
- **正确做法**: 增长期企业品牌评分通常在 2-4。> 6 标记为需人工复核

## 边界
- **适用**: 已有市场数据、客户数据、竞争数据的组织
- **不适用**: 从未盈利且无任何竞争壁垒的企业——此时输出"暂无适用竞争力量"
- **不适用**: 纯定性判断——必须有数据支撑每个力量的评分
```
