# SPEC: 专家领域 SKILL.md — Phase 2 任务规格

> 给另一个 Claude Code 实例。纯内容任务，不写代码。
> 版本: v1.0 — 2026-06-17
> 分支: `feat/prompt-architecture`
> 前置: 已读 CLAUDE.md + docs/DECISION-文件优先设计范式转型-20260615.md

---

## 背景

SynovaAgent 已实现"文件即Agent"范式。8 位专家各有 5 个知识文件（IDENTITY/SOUL/TOOLS/RULES/KNOWLEDGE.md），位于 `expert/<name>/`。

现在需要第二步：**每个专家配上领域 SKILL.md 文件**。技能文件是"怎么做"的操作指南——专家在诊断过程中按需加载，指导具体分析步骤。

对标: Anthropic Claude Fable 5 的 SKILL.md 体系——"Reading the relevant SKILL.md is a required first step before writing any code."

---

## 通用约束

### 你需要知道的上下文

- **项目**: SynovaAgent = AI 组织诊断系统。8 位专家(strategy/org/finance/tech/marketing/action/business_model/knowledge)并行诊断企业，输出综合诊断报告。
- **架构**: L1交互→L2编排→L3洞察→L4本体→L5存储。技能文件是 L3 层的知识资产。
- **文件位置**: 所有技能文件创建在 `skills/<expert-name>/` 目录下。
- **已有参考**: 每个专家的知识文件在 `expert/<name>/SOUL.md`（方法论）和 `expert/<name>/RULES.md`（规则），创建 SKILL.md 时参考这些文件的内容。

### 格式要求

每个 SKILL.md 必须使用以下 YAML frontmatter + Markdown 格式：

```markdown
---
name: skill-slug
version: 1.0
description: 一句话描述（≤200字）
when_to_use: 什么情况下激活这个技能
required_tools: [工具1, 工具2]
depends_on: [依赖的其他skill]
---

# 技能名称

## 适用场景
<!-- 什么信号触发这个技能？什么情况下不适用？ -->

## 方法步骤
<!-- 具体操作步骤，每步可执行 -->
1. 第一步...
2. 第二步...

## 输出格式
<!-- 技能执行完成后输出什么？格式要求？ -->

## 判断标准
<!-- 怎么判断技能执行正确？可量化指标？ -->

## 常见陷阱
<!-- 执行这个技能时最容易犯的错 -->
```

### 内容质量要求

- **每个 SKILL.md 300-600 字**（不含 frontmatter）
- **步骤具体可执行**——不是"分析现金流"，是"1.取最近3个月经营现金流数据 2.对比同期收入 3.计算经营现金流/总收入比值"
- **判断标准可量化**——不是"评估风险"，是"Bus Factor ≤ 2 → 高风险标注"
- **从已有 expert 文件获取方法论**——不凭空编造

---

## 12 个 SKILL.md 任务清单

### 战略专家（2 个）

#### S1: `skills/strategy/market-gravity.md`

- **描述**: 市场引力分析——波特五力量化 + PEST+CC + 利润池迁移
- **触发**: 系统检测到客户所在行业数据 ≥ 3条，或 FDE 手动触发"市场分析"
- **工具**: market_gravity, query_graph
- **参考**: `expert/strategy/SOUL.md` 第一层"市场引力"部分, `expert/strategy/KNOWLEDGE.md`

#### S2: `skills/strategy/seven-powers.md`

- **描述**: 7 Powers 量化引擎——适用性判定→评分→S曲线位置
- **触发**: market-gravity 技能完成，或检测到竞争相关数据
- **工具**: seven_powers, query_graph
- **参考**: `expert/strategy/SOUL.md` 第二层"竞争力量"部分, `expert/strategy/RULES.md` 7 Powers 适用性判定规则

### 财务专家（2 个）

#### S3: `skills/finance/cashflow-analysis.md`

- **描述**: 现金流三分法健康分析——经营/投资/融资流独立评分解读
- **触发**: 系统获取到现金流数据
- **工具**: cashflow_health, query_graph
- **参考**: `expert/finance/SOUL.md` 核心框架第1项, `expert/finance/RULES.md` 现金流健康评分表

#### S4: `skills/finance/unit-economics.md`

- **描述**: 单位经济学分析——LTV/CAC、毛利率、边际贡献的计算和解读
- **触发**: 系统获取到收入和客户数据
- **工具**: unit_economics, query_graph
- **参考**: `expert/finance/SOUL.md` 核心框架第2项, `expert/finance/RULES.md` 单位经济学基准

### 营销专家（2 个）

#### S5: `skills/marketing/aarrr-funnel.md`

- **描述**: AARRR 增长漏斗逐环分析——获客→激活→留存→收入→转介绍
- **触发**: 系统检测到用户行为数据或转化率数据
- **工具**: growth_funnel, query_graph
- **参考**: `expert/marketing/SOUL.md` 第三层"AARRR增长漏斗", `expert/marketing/RULES.md` AARRR漏斗评分表

#### S6: `skills/marketing/jtbd-interview.md`

- **描述**: JTBD 客户需求访谈框架——识别客户"雇佣"产品的真实任务
- **触发**: FDE 手动触发"客户需求分析"，或检测到客户反馈数据
- **工具**: behavioral_economics, query_graph
- **参考**: `expert/marketing/SOUL.md` 第一层"JTBD+需求理论", `expert/marketing/KNOWLEDGE.md`

### 组织专家（2 个）

#### S7: `skills/org/bus-factor.md`

- **描述**: 关键人依赖量化分析——Bus Factor 计算 + 风险评估
- **触发**: 系统检测到关键人依赖信号（某人的工作无备份/无文档）
- **工具**: key_person_risk, query_graph
- **参考**: `expert/org/SOUL.md` 传统诊断"关键人依赖"部分, `expert/org/RULES.md` Bus Factor评分表

#### S8: `skills/org/agent-readiness.md`

- **描述**: Agent化机会识别矩阵——流程×维度评估：可替代/可增强/暂不可Agent化
- **触发**: 传统组织诊断完成后自动触发
- **工具**: agent_readiness, collaboration_health
- **参考**: `expert/org/SOUL.md` 核心框架二"Agent化机会识别", `expert/org/RULES.md` Agent化可行性评分表

### 技术专家（2 个）

#### S9: `skills/tech/software-ecosystem-scan.md`

- **描述**: 软件生态扫描方法论——识别客户全部在用软件，输出生态地图
- **触发**: 技术专家被激活时首先运行
- **工具**: software_ecosystem_scan, query_graph
- **参考**: `expert/tech/SOUL.md` 核心能力第1项, `expert/tech/RULES.md` Agent就绪度评分

#### S10: `skills/tech/connector-blueprint.md`

- **描述**: 连接器 PRD 模板——API桥接/MCP Server/RPA适配的方案设计指南
- **触发**: software-ecosystem-scan 发现"桥接适配"的软件
- **工具**: connector_blueprint, query_graph
- **参考**: `expert/tech/SOUL.md` 核心能力第3项"自建连接器"

### 商业模式专家（1 个）

#### S11: `skills/business-model/canvas-nine.md`

- **描述**: 画布九要素诊断检查清单——逐要素检查、标注数据来源、自洽性验证
- **触发**: 商业模式专家被激活时自动运行
- **工具**: business_model_canvas, value_price_audit, query_graph
- **参考**: `expert/business_model/SOUL.md` 九要素方法论, `expert/business_model/RULES.md` 五大信号评分

### 行动专家（1 个）

#### S12: `skills/action/priority-matrix.md`

- **描述**: 四维优先级排序方法——紧急性×重要性×努力程度×依赖关系
- **触发**: 所有其他专家完成诊断后自动运行
- **工具**: priority_matrix, action_generator, dependency_graph
- **参考**: `expert/action/SOUL.md` 核心框架第2项"优先级排序", `expert/action/RULES.md` 优先级评分表

---

## 不能碰的文件

- `src/**` — 不写任何代码
- `expert/**` — 不改动已有的专家知识文件
- `skills/` 下已有的 6 个通用技能文件 — 不动（cross_validate, trace_evidence, match_pattern, verify_closed_loop, detect_contradiction, human_calibration）
- `package.json` — 不动
- `tsconfig.json` — 不动

---

## 验收清单

- [ ] 12 个 SKILL.md 文件全部创建在 `skills/<expert-name>/` 下
- [ ] 每个文件含完整的 YAML frontmatter（name/version/description/when_to_use/required_tools）
- [ ] 每个文件 300-600 字（不含 frontmatter）
- [ ] 每个文件的步骤具体可执行（不是抽象描述）
- [ ] 每个文件的判断标准可量化
- [ ] 每个文件的"常见陷阱"至少列出 2 条
- [ ] 内容与对应 `expert/<name>/SOUL.md` 和 `expert/<name>/RULES.md` 一致
- [ ] 不涉及任何代码改动

---

## 参考：已有的通用技能文件格式

查看 `skills/cross_validate/SKILL.md` 了解现有格式。通用技能文件已有 6 个，你创建的 12 个是**领域特定技能**，放在 `skills/<expert-name>/` 子目录下。

## 参考：专家知识文件

每个专家的方法论和规则在此，创建 SKILL.md 时务必先阅读：
- `expert/strategy/SOUL.md` + `expert/strategy/RULES.md`
- `expert/finance/SOUL.md` + `expert/finance/RULES.md`
- `expert/marketing/SOUL.md` + `expert/marketing/RULES.md`
- `expert/org/SOUL.md` + `expert/org/RULES.md`
- `expert/tech/SOUL.md` + `expert/tech/RULES.md`
- `expert/business_model/SOUL.md` + `expert/business_model/RULES.md`
- `expert/action/SOUL.md` + `expert/action/RULES.md`
